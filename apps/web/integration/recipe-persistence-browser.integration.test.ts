import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { chromium, expect as rawExpect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { db, pool, users, recipes, eq, inArray } from "@nb/db";
import { completeEmailSignIn, createSession } from "@nb/auth";
import { createRecipe, getRecipeById } from "../features/recipes/service";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const expect = rawExpect.configure({ timeout: 15000 });
const artifactDir = process.env.QA_ARTIFACT_DIR ?? fileURLToPath(new URL("../../../notes/qa-recipe-persistence-2026-11-03/screenshots/", import.meta.url));
const owners: string[] = [];
let browser: Browser, context: BrowserContext, page: Page;
let owner: string, recipeId: string;
const titleInput = (tab: Page) => tab.getByPlaceholder("Например, NEIPA с тропическим ароматом");
const current = () => getRecipeById(owner, recipeId);
const cookies = (token: string) => [
  { name: "nb_session", value: token, url: base },
  { name: "nb_cookie_consent", value: "1:necessary", url: base },
  { name: "nb_age_ok", value: "1", url: base }
];
const hydrated = async (tab: Page) => {
  await tab.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "Сварить" && Object.keys(button).some(key => key.startsWith("__reactProps$"))));
  // Production streaming can briefly retain a hidden tree during reload.
  await expect(titleInput(tab)).toHaveCount(1);
};
const gotoEditor = async (tab: Page = page) => {
  await tab.goto(base + "/app/recipes/" + recipeId + "/edit", { waitUntil: "domcontentloaded" });
  await hydrated(tab);
  await tab.waitForLoadState("networkidle");
  await expect(tab.getByText("Сохранено", { exact: true })).toBeVisible();
};
const screenshot = async (name: string, tab: Page = page) => {
  await tab.screenshot({ path: artifactDir + name + ".png", scale: "css", animations: "disabled" });
};
beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  mkdirSync(artifactDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  owner = (await completeEmailSignIn({ email: "qa.persist.browser." + randomUUID() + "@localhost" })).id; owners.push(owner);
  const session = await createSession({ userId: owner, userAgent: "QA persistence browser" });
  recipeId = (await createRecipe(owner, { title: "QA original title", publicationState: "private", batchSizeEnteredQuantity: 30,
    batchSizeEnteredUnit: "l", efficiency: 70, boilTimeMinutes: 60,
    ingredients: [{ persistentKey: randomUUID(), ingredientCatalogItemId: "us-cascade-beervingem-standard", type: "hop",
      amountEnteredQuantity: 20, amountEnteredUnit: "g", stage: "boil", timeOffset: 60 }] })).id;
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
  await context.addCookies(cookies(session.rawToken)); page = await context.newPage();
  page.on("dialog", dialog => { void dialog.accept(); });
});
afterEach(async () => { await context?.close(); });
afterAll(async () => { await browser?.close(); if (owners.length) await db.delete(users).where(inArray(users.id, owners)); await pool.end(); });

describe("live recipe saving and isolation", () => {
  it("saves the latest queued edit after a delayed older request", async () => {
    await gotoEditor();
    let release!: () => void, held = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/app/recipes/**", async route => {
      if (!held && route.request().headers()["next-action"] && route.request().postData()?.startsWith(JSON.stringify([recipeId]).slice(0, -1) + ",") && route.request().postData()?.includes("QA slow B")) { held = true; await gate; }
      await route.continue();
    });
    try {
      await titleInput(page).fill("QA slow B"); await expect.poll(() => held).toBe(true);
      await titleInput(page).fill("QA latest C"); release();
      await expect.poll(async () => (await current()).title).toBe("QA latest C");
      await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
      await screenshot("P01-retest-latest-saved");
    } finally { release(); await page.unroute("**/app/recipes/**"); }
  });
  it("preserves input after a network error, retries and survives reload", async () => {
    await gotoEditor();
    await page.route("**/app/recipes/**", async route => {
      if (route.request().headers()["next-action"] && route.request().postData()?.startsWith(JSON.stringify([recipeId]).slice(0, -1) + ",") && route.request().postData()?.includes("QA retry update")) await route.abort("failed"); else await route.continue();
    });
    await titleInput(page).fill("QA retry update");
    await expect(page.getByText(/Не удалось сохранить/).first()).toBeVisible();
    await expect(titleInput(page)).toHaveValue("QA retry update");
    await screenshot("P02-retest-input-preserved");
    await page.unroute("**/app/recipes/**");
    await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await expect.poll(async () => (await current()).title).toBe("QA retry update");
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" }); await hydrated(page);
    await expect(titleInput(page)).toHaveValue("QA retry update");
  });
  for (const newerInput of [false, true]) it("reconciles a committed update after losing its response" + (newerInput ? " with newer input" : ""), async () => {
    await gotoEditor();
    const committedTitle = "QA update response lost";
    let dropped = false;
    await page.route("**/app/recipes/**", async route => {
      const request = route.request();
      if (!dropped && request.headers()["next-action"] && request.postData()?.startsWith(JSON.stringify([recipeId]).slice(0, -1) + ",") && request.postData()?.includes(committedTitle)) {
        const response = await route.fetch();
        if ((await response.text()).includes("Рецепт обновлён.")) {
          dropped = true; await route.abort("failed"); return;
        }
        await route.fulfill({ response }); return;
      }
      await route.continue();
    });
    await titleInput(page).fill(committedTitle);
    await expect.poll(() => dropped).toBe(true);
    await expect(page.getByText(/Не удалось сохранить/).first()).toBeVisible();
    expect((await current()).title).toBe(committedTitle);
    await page.unroute("**/app/recipes/**");
    const expectedTitle = newerInput ? committedTitle + " newer local input" : committedTitle;
    if (newerInput) await titleInput(page).fill(expectedTitle);
    else await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    expect((await current()).title).toBe(expectedTitle);
    await page.reload({ waitUntil: "domcontentloaded" }); await hydrated(page);
    await expect(titleInput(page)).toHaveValue(expectedTitle);
  });
  for (const editAfterFailure of [false, true]) it("reconciles a committed recipe creation after losing its response" + (editAfterFailure ? " and preserves newer edits" : ""), async () => {
    await page.goto(base + "/app/recipes/new", { waitUntil: "domcontentloaded" });
    await hydrated(page);
    let dropped = false;
    const title = "QA creation response lost";
    const created = () => db.query.recipes.findMany({ where: eq(recipes.authorId, owner) }).then(rows => rows.filter(row => row.id !== recipeId));
    await page.route("**/app/recipes/**", async route => {
      const request = route.request();
      if (!dropped && request.headers()["next-action"] && request.postData()?.startsWith("[{") && request.postData()?.includes(title)) {
        const response = await route.fetch();
        if ((await response.text()).includes("Рецепт создан.")) {
          dropped = true;
          await route.abort("failed");
          return;
        }
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });
    await titleInput(page).fill(title);
    await expect.poll(() => dropped).toBe(true);
    await expect(page.getByText(/Не удалось сохранить/).first()).toBeVisible();
    expect(await created()).toHaveLength(1);
    await screenshot("P03-creation-committed-response-lost");
    await page.unroute("**/app/recipes/**");
    const expectedTitle = editAfterFailure ? title + " newer input" : title;
    if (editAfterFailure) await titleInput(page).fill(expectedTitle);
    else await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    const rows = await created();
    expect(rows[0].title).toBe(expectedTitle);
    await screenshot("P03-after-retry");
    expect(rows).toHaveLength(1);
    await expect(page).toHaveURL(base + "/app/recipes/new?recipeId=" + rows[0].id);
    await page.reload({ waitUntil: "domcontentloaded" }); await hydrated(page);
    await expect(titleInput(page)).toHaveValue(expectedTitle);
  });
  it("shows a stale-tab conflict without losing either saved data or local input", async () => {
    await gotoEditor(); const other = await context.newPage(); await gotoEditor(other);
    await titleInput(page).fill("QA saved in first tab");
    await expect.poll(async () => (await current()).title).toBe("QA saved in first tab");
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await other.locator("input").nth(1).fill("21"); await other.locator("input").nth(1).blur();
    await expect(other.getByText(/Рецепт изменён в другой вкладке/).first()).toBeVisible();
    await expect(other.locator("input").nth(1)).toHaveValue("21");
    expect(await current()).toMatchObject({ title: "QA saved in first tab", batchSizeEnteredQuantity: 30 });
    await screenshot("P05-retest-owner-saved"); await screenshot("P05-retest-conflict-local-input", other);
    await other.reload({ waitUntil: "domcontentloaded" }); await hydrated(other);
    await expect(titleInput(other)).toHaveValue("QA saved in first tab");
    await other.locator("input").nth(1).fill("21"); await other.locator("input").nth(1).blur();
    await expect.poll(async () => (await current()).batchSizeEnteredQuantity).toBe(21);
    expect((await current()).title).toBe("QA saved in first tab");
    await other.close();
  });
  it("blocks the private editor and a captured write under a second user's session", async () => {
    await gotoEditor();
    const stranger = (await completeEmailSignIn({ email: "qa.foreign.browser." + randomUUID() + "@localhost" })).id; owners.push(stranger);
    const session = await createSession({ userId: stranger, userAgent: "QA foreign actions" });
    const foreign = await browser.newContext(); await foreign.addCookies(cookies(session.rawToken));
    try {
      const foreignPage = await foreign.newPage();
      await foreignPage.goto(base + "/app/recipes/" + recipeId + "/edit", { waitUntil: "domcontentloaded" });
      await expect(foreignPage.locator("body")).toContainText(/не найден|недоступен|404/i);
      await expect(titleInput(foreignPage)).toHaveCount(0);
      await screenshot("A01-retest-private-editor-closed", foreignPage);
      let captured: { url: string; action: string; type: string; body: string } | undefined;
      await page.route("**/app/recipes/**", async route => {
        const request = route.request();
        if (!captured && request.headers()["next-action"] && request.postData()?.startsWith(JSON.stringify([recipeId]).slice(0, -1) + ",") && request.postData()?.includes("QA captured owner")) {
          captured = { url: request.url(), action: request.headers()["next-action"], type: request.headers()["content-type"], body: request.postData()! };
        }
        await route.continue();
      });
      await titleInput(page).fill("QA captured owner");
      await expect.poll(() => Boolean(captured)).toBe(true);
      await expect.poll(async () => (await current()).title).toBe("QA captured owner");
      const request = captured!;
      const response = await foreign.request.post(request.url, { headers: { "next-action": request.action, "content-type": request.type, origin: base }, data: request.body.replace("QA captured owner", "QA foreign overwrite") });
      expect(await response.text()).toContain("Рецепт не найден или недоступен");
      expect((await current()).title).toBe("QA captured owner");
      await page.unroute("**/app/recipes/**");
    } finally { await foreign.close(); }
  });
});
