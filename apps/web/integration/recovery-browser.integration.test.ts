import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { chromium, expect as baseExpect, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { db, pool, users, userIngredients, eq, inArray } from "@nb/db";
import { completeEmailSignIn, createSession } from "@nb/auth";
import { createRecipe } from "../features/recipes/service";
import { addCatalogIngredientToInventory } from "../features/inventory/service";
import { createBrewBatchFromRecipe } from "../features/brew-batches/service";
import { createEquipmentProfile } from "../features/equipment-profiles/service";
import { buildStarterEquipmentProfileDefaults } from "../features/equipment/defaults";

const base = "http://127.0.0.1:3000";
const expect = baseExpect.configure({ timeout: 15000 });
const accountIds: string[] = [];
let browser: Browser, context: BrowserContext, page: Page;
let userId: string, recipeId: string, batchId: string;
let lotIds: string[];
const gotoRecipe = async () => {
  await page.goto(`${base}/app/recipes/${recipeId}/edit`);
  await page.getByRole("button", { name: "Сварить", exact: true }).waitFor();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "Сварить" && Object.keys(button).some(key => key.startsWith("__reactProps$"))));
};
const abortVolume = async (route: Route) => {
  const request = route.request();
  if (request.headers()["next-action"] && request.postData() === JSON.stringify([recipeId])) await route.abort("failed");
  else await route.continue();
};

beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  const user = await completeEmailSignIn({ email: `qa.browser.${randomUUID()}@localhost` });
  userId = user.id;
  accountIds.push(userId);
  const session = await createSession({ userId, userAgent: "QA recovery integration" });
  await createEquipmentProfile(userId, { ...buildStarterEquipmentProfileDefaults(), name: "QA Recovery 10L", targetBatchVolumeL: 10, brewhouseEfficiencyPct: 65 });
  const recipe = await createRecipe(userId, {
    title: "QA Recovery recipe", publicationState: "private", batchSizeEnteredQuantity: 30, batchSizeEnteredUnit: "l", efficiency: 65, boilTimeMinutes: 60,
    ingredients: [{ persistentKey: randomUUID(), ingredientCatalogItemId: "us-cascade-beervingem-standard", type: "hop", amountEnteredQuantity: 20, amountEnteredUnit: "g", stage: "boil", timeOffset: 60 }]
  });
  recipeId = recipe.id;
  batchId = (await createBrewBatchFromRecipe(userId, recipeId)).id;
  lotIds = [];
  for (const quantity of [12, 10]) lotIds.push((await addCatalogIngredientToInventory(userId, { ingredientCatalogItemId: "us-cascade-beervingem-standard", enteredQuantity: quantity, enteredUnit: "g" })).id);
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
  await context.addCookies([{ name: "nb_session", value: session.rawToken, url: base }]);
  page = await context.newPage();
  page.setDefaultTimeout(20000);
});
afterEach(async () => { await context?.close(); });
afterAll(async () => {
  await browser?.close();
  if (accountIds.length) await db.delete(users).where(inArray(users.id, accountIds));
  await pool.end();
});

describe("live Chromium: recovery and consistency", () => {
  it("equipment loading failure blocks start, retry restores required choice", async () => {
    await gotoRecipe();
    const requests: Array<{ url: string; body: string | null }> = [];
    page.on("request", request => { if (request.headers()["next-action"]) requests.push({ url: request.url(), body: request.postData() }); });
    await page.route("**/app/recipes/**", abortVolume);
    await page.getByRole("button", { name: "Сварить", exact: true }).click();
    try {
      await expect(page.getByRole("dialog").getByText(/Не удалось загрузить объём и оборудование/)).toBeVisible();
    } catch (error) {
      console.error("Equipment recovery diagnostic", { url: page.url(), text: await page.locator("body").innerText(), requests });
      throw error;
    }
    await expect(page.getByRole("button", { name: "Начать варку", exact: true })).toBeDisabled();
    await page.unroute("**/app/recipes/**", abortVolume);
    await page.getByRole("button", { name: "Повторить загрузку", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Моё оборудование/ }).waitFor();
    await expect(page.getByRole("button", { name: "Начать варку", exact: true })).toBeDisabled();
    await page.getByRole("dialog").getByRole("button", { name: /Моё оборудование/ }).click();
    await expect(page.getByRole("button", { name: "Начать варку", exact: true })).toBeEnabled();
  });

  it("a late failure from a closed brew dialog does not corrupt the reopened dialog", async () => {
    await gotoRecipe();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let held = false;
    await page.route("**/app/recipes/**", async route => {
      if (!held && route.request().headers()["next-action"] && route.request().postData() === JSON.stringify([recipeId])) {
        held = true;
        await gate;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Сварить", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Сварить", exact: true }).click();
    release();
    await page.getByRole("dialog").getByRole("button", { name: /Моё оборудование/ }).waitFor();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
  });

  it("preparation calculation can fail and recover without changing chosen volume", async () => {
    await gotoRecipe();
    const abortCalculation = async (route: Route) => {
      if (route.request().headers()["next-action"] && route.request().postData()?.includes("targetBatchVolumeL")) await route.abort("failed");
      else await route.continue();
    };
    await page.route("**/app/recipes/**", abortCalculation);
    await page.getByRole("button", { name: "Сварить", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Моё оборудование/ }).click();
    await expect(page.getByRole("dialog").getByText(/Не удалось рассчитать подготовку/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Начать варку", exact: true })).toBeDisabled();
    await page.unroute("**/app/recipes/**", abortCalculation);
    await page.getByRole("button", { name: "Повторить расчёт", exact: true }).click();
    await expect(page.getByRole("button", { name: "Начать варку", exact: true })).toBeEnabled();
    await expect(page.getByRole("dialog").getByText(/пересчитаны на 10 л/)).toBeVisible();
  });

  it("consumption preview recovers after network failure and consumes both exact lots", async () => {
    await page.goto(`${base}/app/brew-batches/${batchId}`);
    const abort = async (route: Route) => route.request().headers()["next-action"] ? route.abort("failed") : route.continue();
    await page.route("**/app/brew-batches/**", abort);
    await page.getByRole("button", { name: "Списать со склада", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(/Не удалось загрузить остатки/)).toBeVisible();
    await page.unroute("**/app/brew-batches/**", abort);
    await page.getByRole("button", { name: "Повторить загрузку", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(/Запас в 2 лотах/)).toBeVisible();
    await page.getByRole("button", { name: "Списать 1 позицию", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Ингредиенты списаны со склада.", { exact: true })).toBeVisible();
    const lots = await db.query.userIngredients.findMany({ where: inArray(userIngredients.id, lotIds) });
    expect(lots.reduce((sum, lot) => sum + lot.normalizedQuantity, 0)).toBe(2);
    await page.getByRole("button", { name: "Вернуть на склад", exact: true }).click();
    await page.getByRole("button", { name: "Списать со склада", exact: true }).waitFor();
    const restored = await db.query.userIngredients.findMany({ where: inArray(userIngredients.id, lotIds) });
    expect(restored.map(lot => lot.normalizedQuantity).sort()).toEqual([10, 12]);
  });

  it("an in-flight consumption cannot be dismissed or submitted twice", async () => {
    await page.goto(`${base}/app/brew-batches/${batchId}`);
    await page.getByRole("button", { name: "Списать со склада", exact: true }).click();
    await page.getByRole("button", { name: "Списать 1 позицию", exact: true }).waitFor();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let commits = 0;
    await page.route("**/app/brew-batches/**", async route => {
      if (route.request().headers()["next-action"] && route.request().postData()?.includes("allowPartial")) { commits++; await gate; }
      await route.continue();
    });
    await page.getByRole("button", { name: "Списать 1 позицию", exact: true }).click();
    await expect.poll(() => commits).toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(commits).toBe(1);
  });

  it("guest browsing cannot read a private batch", async () => {
    await context.clearCookies();
    await context.addCookies([{ name: "nb_dev_guest", value: "1", url: base }]);
    await page.goto(`${base}/app/brew-batches/${batchId}`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "QA Recovery recipe", exact: false })).toHaveCount(0);
  });

  it("manual inventory adjustment preserves input and recovers from a network failure", async () => {
    await page.goto(`${base}/app/ingredients`);
    await page.getByRole("button", { name: "Списать или пополнить", exact: true }).first().click();
    await page.getByRole("dialog").getByLabel("Количество использованного", { exact: true }).fill("1");
    const abort = async (route: Route) => route.request().headers()["next-action"] ? route.abort("failed") : route.continue();
    await page.route("**/app/ingredients**", abort);
    await page.getByRole("dialog").getByRole("button", { name: "Списать", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(/Не удалось сохранить количество/)).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Количество использованного", { exact: true })).toHaveValue("1");
    await page.unroute("**/app/ingredients**", abort);
    await page.getByRole("dialog").getByRole("button", { name: "Списать", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const lots = await db.query.userIngredients.findMany({ where: inArray(userIngredients.id, lotIds) });
    expect(lots.reduce((sum, lot) => sum + lot.normalizedQuantity, 0)).toBe(21);
  });
});
