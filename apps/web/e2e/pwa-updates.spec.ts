import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { db, users, recipes, eq } from "@nb/db";
import { completeEmailSignIn, createSession } from "@nb/auth";
const enabled = process.env.PWA_UPDATE_QA === "1";
test.skip(!enabled, "Requires two running production builds and the local QA proxy");
const artifacts = fileURLToPath(new URL("../../../notes/qa-pwa-2026-11-04/", import.meta.url));
const base = process.env.PWA_BASE_URL ?? "http://127.0.0.1:3011";
let owner: string, recipeId: string;
const port = (value: number) => writeFileSync(artifacts + "tools/upstream-port.txt", String(value));
const fault = (value: string) => writeFileSync(artifacts + "tools/fault-prefix.txt", value);
const evidence = (name: string, value: unknown) => writeFileSync(artifacts + name + ".json", JSON.stringify(value, null, 2) + "\n");
const ready = async (page: Page, url = "/") => {
  await page.context().addCookies([{ name: "nb_cookie_consent", value: "1:necessary", url: base }, { name: "nb_age_ok", value: "1", url: base }]);
  await page.goto(url);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated" && Boolean(navigator.serviceWorker.controller)), { timeout: 25000 }).toBe(true);
};
const workerBody = async (page: Page) => {
  const response = await page.request.get("/sw.js"); expect(response.status()).toBe(200);
  const body = await response.text();
  const match = body.match(/^self\.NB_BUILD_ID = ("[^"]+");/);
  if (!match) throw new Error("BUILD_SPECIFIC_WORKER_REQUIRED");
  return { id: JSON.parse(match[1]) as string, source: body.slice(match[0].length), headers: response.headers() };
};
const installEvents = async (page: Page) => page.evaluate(async () => {
  const state = window as unknown as { qaWorkerStates: string[]; qaControllerChanges: number };
  state.qaWorkerStates = []; state.qaControllerChanges = 0;
  navigator.serviceWorker.addEventListener("controllerchange", () => state.qaControllerChanges++);
  const registration = await navigator.serviceWorker.getRegistration();
  registration!.addEventListener("updatefound", () => {
    const worker = registration!.installing!;
    worker.addEventListener("statechange", () => state.qaWorkerStates.push(worker.state));
  });
});
const triggerUpdate = async (page: Page) => page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
const changes = (page: Page) => page.evaluate(() => (window as unknown as { qaControllerChanges: number }).qaControllerChanges);
const offlineHtml = (page: Page, id: string) => page.evaluate(async id => {
  const response = await (await caches.open(`nb-pwa-offline-${id}`)).match("/offline");
  return response ? response.text() : "";
}, id);

test.beforeAll(async () => {
  if (!enabled) return;
  if (new URL(process.env.DATABASE_URL!).pathname !== "/nb_qa_pwa_20261104") throw new Error("ISOLATED_PWA_DATABASE_REQUIRED");
  mkdirSync(artifacts + "screenshots", { recursive: true });
  owner = (await completeEmailSignIn({ email: `qa.pwa.update.${randomUUID()}@localhost` })).id;
  const [recipe] = await db.insert(recipes).values({ authorId: owner, recipeFamilyId: randomUUID(), slug: "qa-update-" + randomUUID(), title: "QA before deployment", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", batchSizeNormalizedQuantity: 20000, batchSizeNormalizedUnit: "ml" }).returning();
  recipeId = recipe.id;
});
test.beforeEach(() => { port(3013); fault(""); writeFileSync(artifacts + "tools/fault-hits.txt", ""); });
test.afterEach(() => { fault(""); port(3014); });
test.afterAll(async () => { if (owner) await db.delete(users).where(eq(users.id, owner)); });

test("Chromium accepts the production app manifest and service-worker delivery headers", async ({ page, context }) => {
  await ready(page);
  const session = await context.newCDPSession(page);
  const manifest = await session.send("Page.getAppManifest");
  const installability = await session.send("Page.getInstallabilityErrors");
  evidence("installability", { manifestUrl: manifest.url, manifestErrors: manifest.errors, installability });
  expect(manifest.errors).toEqual([]);
  expect(installability.installabilityErrors).toEqual([]);
  const worker = await workerBody(page);
  expect(worker.headers["cache-control"]).toBe("no-store");
  expect(worker.headers["service-worker-allowed"]).toBe("/");
  expect(worker.headers["content-type"]).toContain("application/javascript");
});

test("a new build updates the offline shell and an already open recipe can still save", async ({ page }) => {
  const session = await createSession({ userId: owner, userAgent: "QA PWA update" });
  await page.context().addCookies([{ name: "nb_session", value: session.rawToken, url: base }]);
  await ready(page, `/app/recipes/${recipeId}/edit`);
  const input = page.getByPlaceholder("Например, NEIPA с тропическим ароматом");
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  const before = await workerBody(page);
  await page.evaluate(async () => { await caches.open("nb-v1"); });
  await installEvents(page);
  const documentToken = randomUUID();
  await page.evaluate(token => { (window as unknown as { qaDocumentToken: string }).qaDocumentToken = token; }, documentToken);
  const title = "QA saved after production update";
  await input.fill(title);
  port(3014);
  const after = await workerBody(page);
  expect(before.id).not.toBe(after.id); expect(before.source).toBe(after.source);
  await triggerUpdate(page);
  await expect.poll(() => changes(page), { timeout: 25000 }).toBe(1);
  expect(await offlineHtml(page, after.id)).toContain(after.id);
  await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 10000 }).not.toContain("nb-v1");
  await expect(input).toHaveValue(title);
  expect(await page.evaluate(() => (window as unknown as { qaDocumentToken: string }).qaDocumentToken)).toBe(documentToken);
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible({ timeout: 15000 });
  expect((await db.query.recipes.findFirst({ where: eq(recipes.id, recipeId) }))?.title).toBe(title);
  evidence("build-update", { before: before.id, after: after.id, sameWorkerSource: before.source === after.source, openEditorSaved: true });
});

test("a failed required chunk keeps the old worker usable and recovery installs the next release", async ({ page, context }) => {
  await ready(page);
  const before = await workerBody(page); await installEvents(page);
  fault("/_next/static/"); port(3014); const after = await workerBody(page);
  await triggerUpdate(page);
  evidence("failed-update-start", await page.evaluate(async () => ({ states: (window as unknown as { qaWorkerStates: string[] }).qaWorkerStates, keys: await caches.keys(), active: (await navigator.serviceWorker.getRegistration())?.active?.state })));
  await expect.poll(() => readFileSync(artifacts + "tools/fault-hits.txt", "utf8").trim(), { timeout: 10000 }).not.toBe("");
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing == null), { timeout: 15000 }).toBe(true);
  expect(await changes(page)).toBe(0);
  expect(await page.evaluate(() => caches.keys())).not.toContain(`nb-pwa-offline-${after.id}`);
  await (await context.newCDPSession(page)).send("Network.clearBrowserCache");
  await context.setOffline(true); await page.goto("/calculators");
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
  expect(await offlineHtml(page, before.id)).toContain(before.id);
  await installEvents(page); fault(""); await context.setOffline(false); await triggerUpdate(page);
  await expect.poll(() => changes(page), { timeout: 25000 }).toBeGreaterThan(0);
  expect(await offlineHtml(page, after.id)).toContain(after.id);
  await context.setOffline(true); await page.goto("/calculators");
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
  evidence("failed-update-recovery", { old: before.id, next: after.id, failedInstallPreservedOld: true, recovered: true });
});

test("offline controls fit mobile and desktop in light and dark themes", async ({ page, context }) => {
  port(3014);
  await ready(page);
  await page.evaluate(() => localStorage.setItem("nb_device_local_urls", JSON.stringify([{ id: "qa-visual", name: "Пивоварня на кухне", url: "http://192.168.44.52" }])));
  await context.setOffline(true);
  for (const width of [390, 1280]) for (const colorScheme of ["light", "dark"] as const) {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
    await page.goto(`/calculators?qa-theme=${colorScheme}`);
    await expect(page.getByRole("link", { name: "Пивоварня на кухне", exact: true })).toBeVisible();
    await expect(page.locator(".offline-icon svg")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator(".offline-page")).toHaveCSS("background-color", colorScheme === "dark" ? "rgb(9, 9, 11)" : "rgb(244, 244, 246)");
    await page.screenshot({ path: artifacts + `screenshots/offline-${width}-${colorScheme}.png`, fullPage: true });
  }
});


for (const preference of ["dark", "light"] as const) test(`offline shell respects saved ${preference} theme over the system theme`, async ({ page, context }) => {
  port(3014);
  await ready(page);
  await context.addCookies([{ name: "nb_theme", value: preference, url: base }]);
  await page.emulateMedia({ colorScheme: preference === "dark" ? "light" : "dark" });
  await context.setOffline(true); await page.goto("/calculators");
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
  await expect(page.locator(".offline-page")).toHaveCSS("background-color", preference === "dark" ? "rgb(9, 9, 11)" : "rgb(244, 244, 246)");
  expect(await page.locator('meta[name="theme-color"]').evaluateAll(tags => tags.map(tag => tag.getAttribute("content")))).toEqual([preference === "dark" ? "#09090b" : "#f4f4f6", preference === "dark" ? "#09090b" : "#f4f4f6"]);
});
