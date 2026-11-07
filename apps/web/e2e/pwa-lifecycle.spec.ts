import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { db, users, recipes, brewDevices, eq, inArray } from "@nb/db";
import { completeEmailSignIn, createSession, createPasswordSession, hashPassword, revokeSession } from "@nb/auth";

const enabled = process.env.PWA_PRODUCTION_QA === "1";
test.skip(!enabled, "Requires an isolated production PWA stand");
const base = process.env.PWA_BASE_URL ?? "http://127.0.0.1:3011";
const artifacts = fileURLToPath(new URL("../../../notes/qa-pwa-2026-11-04/", import.meta.url));
const password = "Pwa-QA-20261104-Only!";
let owner: string, stranger: string, ownerRecipe: string, strangerRecipe: string, deviceId: string, strangerEmail: string;
const accountIds: string[] = [];
const secretTitle = "QA private recipe account A";
const privateDeviceName = "QA private brewery account A";
const prepare = async (page: Page) => {
  await page.context().addCookies([{ name: "nb_cookie_consent", value: "1:necessary", url: base }, { name: "nb_age_ok", value: "1", url: base }]);
};
const authenticate = async (page: Page, userId = owner) => {
  await prepare(page);
  const session = await createSession({ userId, userAgent: "QA production PWA" });
  await page.context().addCookies([{ name: "nb_session", value: session.rawToken, url: base }]);
  return session.rawToken;
};
const controlled = async (page: Page, path = "/") => {
  await page.goto(path);
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === "activated" && navigator.serviceWorker.controller != null;
  }), { timeout: 25000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/offline"))), { timeout: 15000 }).toBe(true);
};
const hydratedLogout = async (page: Page) => page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "Выйти из аккаунта" && Object.keys(button).some(key => key.startsWith("__reactProps$"))));
const evidence = (name: string, value: unknown) => writeFileSync(artifacts + name + ".json", JSON.stringify(value, null, 2) + "\n");

test.beforeAll(async () => {
  if (!enabled) return;
  if (new URL(process.env.DATABASE_URL!).pathname !== "/nb_qa_pwa_20261104") throw new Error("ISOLATED_PWA_DATABASE_REQUIRED");
  mkdirSync(artifacts + "screenshots", { recursive: true });
  const hashed = await hashPassword(password);
  for (const label of ["a", "b"]) {
    const email = `qa.pwa.${label}.${randomUUID()}@yandex.ru`;
    const user = await completeEmailSignIn({ email }); accountIds.push(user.id);
    await db.update(users).set({ displayName: `QA PWA account ${label.toUpperCase()}`, role: label === "a" ? "admin" : "user", passwordHash: hashed }).where(eq(users.id, user.id));
    const [recipe] = await db.insert(recipes).values({ authorId: user.id, recipeFamilyId: randomUUID(), slug: "qa-pwa-" + randomUUID(), title: label === "a" ? secretTitle : "QA private recipe account B", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", batchSizeNormalizedQuantity: 20000, batchSizeNormalizedUnit: "ml" }).returning();
    if (label === "a") { owner = user.id; ownerRecipe = recipe.id; }
    else { stranger = user.id; strangerRecipe = recipe.id; strangerEmail = email; }
  }
  const [device] = await db.insert(brewDevices).values({ userId: owner, name: privateDeviceName, hardwareId: "demo-" + owner, providerId: "brewforge-demo", localUrl: "http://192.168.44.52", status: "online", capabilities: ["telemetry"] }).returning(); deviceId = device.id;
});
test.afterAll(async () => { if (accountIds.length) await db.delete(users).where(inArray(users.id, accountIds)); });

test("offline assets survive static cache eviction", async ({ page, context }) => {
  await prepare(page); await controlled(page);
  await page.evaluate(async () => {
    localStorage.setItem("nb_device_local_urls", JSON.stringify([{ id: "qa-lru", name: "QA local console", url: "http://192.168.44.55" }]));
    for (let start = 0; start < 210; start += 10) await Promise.all(Array.from({ length: 10 }, (_, i) => fetch(`/icon.svg?qa-lru=${start + i}`)));
  });
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/icon.svg?qa-lru=209")))).toBe(true);
  evidence("lru-cache", await page.evaluate(async () => Promise.all((await caches.keys()).map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname) })))));
  await (await context.newCDPSession(page)).send("Network.clearBrowserCache");
  await context.setOffline(true);
  await page.goto("/calculators");
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
  await expect(page.getByRole("link", { name: "QA local console", exact: true })).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: artifacts + "screenshots/offline-after-lru.png", fullPage: true });
});

test("logout and a valid password session isolate the next account's local PWA data", async ({ page, context }) => {
  await authenticate(page); await controlled(page, `/app/devices/${deviceId}`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nb_device_local_urls"))).toContain(privateDeviceName);
  await page.goto("/profile"); await hydratedLogout(page);
  await page.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click();
  await expect(page).toHaveURL(base + "/");
  const session = await createPasswordSession({ email: strangerEmail, password, userAgent: "QA PWA password session" });
  await context.addCookies([{ name: "nb_session", value: session.rawToken, url: base }]);
  await page.goto(`/app/recipes/${strangerRecipe}/edit`);
  await expect(page.getByPlaceholder("Например, NEIPA с тропическим ароматом")).toHaveCount(1);
  await expect(page.getByPlaceholder("Например, NEIPA с тропическим ароматом")).toHaveValue("QA private recipe account B");
  evidence("account-local-storage", await page.evaluate(() => ({ legacyDeviceUrls: localStorage.getItem("nb_device_local_urls") })));
  await context.setOffline(true); await page.goto("/calculators");
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
  await expect(page.getByRole("link", { name: privateDeviceName, exact: true })).toHaveCount(0);
});

test("other tabs stop displaying private data after a confirmed logout", async ({ page, context }) => {
  await authenticate(page); await controlled(page, `/app/recipes/${ownerRecipe}/edit`);
  const other = await context.newPage(); await other.goto("/profile"); await hydratedLogout(other);
  await other.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click();
  await expect(other).toHaveURL(base + "/");
  await expect(page.getByPlaceholder("Например, NEIPA с тропическим ароматом")).toHaveCount(0, { timeout: 10000 });
  await page.reload(); await expect(page.getByPlaceholder("Например, NEIPA с тропическим ароматом")).toHaveCount(0);
});

test("a failed logout keeps the current screen, shows an error and allows retry", async ({ page }) => {
  await authenticate(page); await controlled(page, "/profile"); await hydratedLogout(page);
  await page.route("**/api/auth/logout", route => route.abort("failed"));
  await page.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click();
  await expect(page.getByText(/Не удалось выйти/)).toBeVisible();
  await expect(page).toHaveURL(base + "/profile");
  await page.unroute("**/api/auth/logout");
  await page.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click();
  await expect(page).toHaveURL(base + "/");
});

test("private SSR, API and Flight responses stay out of service worker caches", async ({ page }) => {
  await authenticate(page); await controlled(page, `/app/recipes/${ownerRecipe}/edit`);
  expect((await page.request.get(`/app/recipes/${ownerRecipe}/edit`, { headers: { RSC: "1" } })).status()).toBe(200);
  await page.evaluate(async () => fetch("/api/devices"));
  const audit = await page.evaluate(async () => {
    const records = [];
    for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) {
      const url = new URL(request.url);
      const body = url.pathname === "/offline" ? await (await (await caches.open(key)).match(request))!.text() : "";
      records.push({ key, pathname: url.pathname, body });
    }
    return records;
  });
  expect(audit.length).toBeGreaterThan(0);
  for (const record of audit) { expect(record.pathname).toMatch(/^\/(offline$|_next\/static\/|images\/pwa\/|icon\.svg$)/); expect(record.body).not.toContain(secretTitle); expect(record.body).not.toContain(owner); }
  evidence("private-cache-audit", audit.map(({ body, ...record }) => ({ ...record, hasOfflineHtml: Boolean(body) })));
});

test("offline retry restores the original destination when the connection returns", async ({ page, context }) => {
  await prepare(page); await controlled(page);
  evidence("offline-retry-before", await page.evaluate(async () => {
    const response = await caches.match("/offline");
    return { url: location.href, controller: navigator.serviceWorker.controller?.scriptURL, htmlCached: Boolean(response), headers: response ? Object.fromEntries(response.headers) : {} };
  }));
  await context.setOffline(true); await page.goto("/calculators");
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
  const api = await page.evaluate(async () => { try { await fetch("/api/devices"); return "unexpected success"; } catch { return "network failure"; } });
  expect(api).toBe("network failure");
  await context.setOffline(false);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toHaveCount(0);
  await expect(page).toHaveURL(base + "/calculators");
});


test("offline fallback preserves this account's saved queue and local console", async ({ page, context }) => {
  await authenticate(page); await controlled(page, `/app/devices/${deviceId}`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nb_device_local_urls"))).toContain(privateDeviceName);
  const key = `nb:brew-progress:v1:${owner}:qa-offline`;
  const value = JSON.stringify({ version: 1, confirmed: { steps: {} }, queued: { mash: { done: true } } });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
  await context.setOffline(true); await page.goto("/calculators");
  await expect(page.getByRole("link", { name: privateDeviceName, exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(value);
  expect(await page.evaluate(() => localStorage.getItem("nb:session-owner"))).toBe(owner);
  await context.setOffline(false); await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Нет соединения" })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(value);
});

test("the sidebar logout also preserves input and permits retry after a network error", async ({ page }) => {
  await authenticate(page); await controlled(page, `/app/recipes/${ownerRecipe}/edit`);
  await page.route("**/api/auth/logout", route => route.abort("failed"));
  const button = page.getByRole("button", { name: "Выйти", exact: true });
  await button.click(); await expect(page.getByText(/Не удалось выйти/)).toBeVisible();
  await expect(page.getByPlaceholder("Например, NEIPA с тропическим ароматом")).toHaveValue(secretTitle);
  await page.unroute("**/api/auth/logout"); await button.click(); await expect(page).toHaveURL(base + "/");
});

test("Back cannot restore the former account's authenticated profile after logout", async ({ page }) => {
  await authenticate(page); await controlled(page, `/app/recipes/${ownerRecipe}/edit`);
  await page.goto("/profile"); await hydratedLogout(page);
  await page.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click();
  await expect(page).toHaveURL(base + "/");
  await page.goBack();
  await expect(page.locator("body")).not.toContainText("QA PWA account A");
  await page.goto(`/app/recipes/${ownerRecipe}/edit`);
  await expect(page.getByPlaceholder("Например, NEIPA с тропическим ароматом")).toHaveCount(0);
});


test("a previously offline tab hides its local console after logout in another tab", async ({ page, context }) => {
  await authenticate(page); await controlled(page, `/app/devices/${deviceId}`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nb_device_local_urls"))).toContain(privateDeviceName);
  await context.setOffline(true); await page.goto("/calculators");
  await expect(page.getByRole("link", { name: privateDeviceName, exact: true })).toBeVisible();
  await context.setOffline(false);
  const other = await context.newPage(); await other.goto("/profile"); await hydratedLogout(other);
  await other.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click();
  await expect(other).toHaveURL(base + "/");
  await expect(page.getByRole("link", { name: privateDeviceName, exact: true })).toHaveCount(0);
});


test("an expired session preserves its owner's pending queue until reauthentication or an account switch", async ({ page }) => {
  const token = await authenticate(page); await controlled(page, `/app/recipes/${ownerRecipe}/edit`);
  const key = `nb:brew-progress:v1:${owner}:qa-expired`;
  const value = JSON.stringify({ version: 1, confirmed: { steps: {} }, queued: { mash: { done: true } } });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
  await revokeSession(token); await page.goto("/login");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nb:session-owner"))).toBe("guest");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(value);
  await authenticate(page); await page.goto(`/app/recipes/${ownerRecipe}/edit`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nb:session-owner"))).toBe(owner);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(value);
  await authenticate(page, stranger); await page.goto(`/app/recipes/${strangerRecipe}/edit`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nb:session-owner"))).toBe(stranger);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
});
