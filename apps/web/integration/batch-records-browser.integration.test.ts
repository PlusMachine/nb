import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect as unitExpect, it } from "vitest";
import { chromium, expect, type Browser } from "@playwright/test";
import { db, pool, users, inArray } from "@nb/db";
import { completeEmailSignIn, createSession } from "@nb/auth";
import { createRecipe } from "../features/recipes/service";
import { createBrewBatchFromRecipe, updateBrewBatchStatus, setBrewDayStepState, getBrewBatchDetail } from "../features/brew-batches/service";
import { buildBrewDaySteps } from "../features/brew-batches/brew-day";
import { createEquipmentProfile } from "../features/equipment-profiles/service";
import { starterEquipmentProfileDefaults } from "../features/equipment-profiles/contracts";
import { listBatchTasks, saveBatchVolumes } from "../features/brew-batches/records-service";

let browser: Browser;
const owned: string[] = [], base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.QA_ARTIFACT_DIR ?? resolve(process.cwd(), "../../.local-artifacts/batch-improvements");
beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  browser = await chromium.launch({ headless: true }); await mkdir(output, { recursive: true });
});
afterAll(async () => { await browser?.close(); if (owned.length) await db.delete(users).where(inArray(users.id, owned)); await pool.end(); });

it("records volumes, reviews equipment settings, manages tasks, compares through both entrances and fits mobile", async () => {
  const user = await completeEmailSignIn({ email: `qa.batch-browser.${randomUUID()}@localhost` }); owned.push(user.id);
  const session = await createSession({ userId: user.id, userAgent: "Batch improvements QA" });
  const profile = await createEquipmentProfile(user.id, { ...starterEquipmentProfileDefaults, name: "Котёл 40 л" });
  const recipe = await createRecipe(user.id, { title: "Сосновый берег", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", efficiency: 70, boilTimeMinutes: 60, ingredients: [] });
  const batch = await createBrewBatchFromRecipe(user.id, recipe.id, { equipmentProfileId: profile.id });
  await createBrewBatchFromRecipe(user.id, recipe.id, { equipmentProfileId: profile.id });
  await updateBrewBatchStatus(user.id, batch.id, "brewing");
  for (const group of buildBrewDaySteps(batch.brewPlanSnapshot)) if (["mash", "boil", "whirlpool", "chill"].includes(group.stage)) for (const step of group.steps) await setBrewDayStepState(user.id, batch.id, step.id, { done: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
  await context.addCookies([
    { name: "nb_session", value: session.rawToken, url: base },
    { name: "nb_cookie_consent", value: "1:necessary", url: base },
    { name: "nb_age_ok", value: "1", url: base }
  ]);
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.setDefaultTimeout(20000);
  try {
    await page.goto(`${base}/app/brew-batches/${batch.id}`);
    const consent = page.getByRole("button", { name: "Только необходимые", exact: true });
    if (await consent.isVisible()) await consent.click();
    // Manual brewing now keeps records in the Measure dialog. Complete the
    // transfer through the current UI before reviewing equipment calibration.
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "Сохранить и продолжить" && Object.keys(button).some(key => key.startsWith("__reactProps$"))));
    await page.getByRole("textbox", { name: "Начальная плотность, °P", exact: true }).fill("13,8");
    await page.getByRole("textbox", { name: "Объём в ферментере, л", exact: true }).fill("20");
    await page.getByRole("button", { name: "Сохранить и продолжить", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Внесите дрожжи", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Замер", exact: true }).click();
    const volumes = page.locator("#batch-volumes").filter({ visible: true });
    await volumes.getByLabel("До кипячения, л", { exact: true }).fill("26,76");
    await volumes.getByLabel("После кипячения, л", { exact: true }).fill("21");
    await volumes.getByLabel("В ферментере, л", { exact: true }).fill("20");
    await volumes.getByRole("button", { name: "Сохранить объёмы" }).click();
    await expect(volumes.getByText("Сохранено", { exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.getByRole("button", { name: "Обновить настройки пивоварни", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Сохранить настройки" })).toBeDisabled();
    await dialog.getByLabel("Время кипячения, мин").fill("90"); await dialog.getByLabel("Объёмы приведены к 20 °C").check();
    await expect(dialog.getByRole("button", { name: "Сохранить настройки" })).toBeEnabled();
    await page.screenshot({ path: resolve(output, "equipment-review.png"), fullPage: true, animations: "disabled" });
    await dialog.getByRole("button", { name: "Сохранить настройки" }).click(); await expect(dialog).not.toBeVisible();
    const tasks = page.locator("#batch-tasks").filter({ visible: true });
    await tasks.getByRole("button", { name: "Добавить задачу" }).click();
    await tasks.getByLabel("Что сделать").fill("Измерить плотность");
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
    await tasks.getByLabel("Дата", { exact: true }).fill(today);
    await tasks.getByLabel("Время", { exact: true }).fill("18:00");
    await tasks.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(tasks.getByText("Измерить плотность", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Замер", exact: true }).click();
    await expect(volumes.getByLabel("До кипячения, л", { exact: true })).toHaveValue("26,76");
    await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(tasks.getByText("Измерить плотность", { exact: true })).toBeVisible();
    await page.goto(`${base}/app`);
    await expect(page.locator("#today-tasks").getByRole("link", { name: "Измерить плотность" })).toBeVisible();
    await page.locator("#today-tasks").getByRole("checkbox").check();
    await expect(page.locator("#today-tasks").getByRole("checkbox")).toBeChecked();
    await expect.poll(async () => Boolean((await listBatchTasks(user.id, batch.id))[0]?.completedAt)).toBe(true);
    await page.locator("#today-tasks").getByRole("checkbox").uncheck();
    await expect.poll(async () => Boolean((await listBatchTasks(user.id, batch.id))[0]?.completedAt)).toBe(false);
    await expect(page.locator("#today-tasks").getByRole("checkbox")).not.toBeChecked();
    await page.locator("#today-tasks").getByRole("link", { name: "Измерить плотность" }).click();
    await expect(tasks).toBeVisible();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("#batch-tasks button")).some(button => Object.keys(button).some(key => key.startsWith("__reactProps$"))));
    await tasks.getByRole("button", { name: "Изменить: Измерить плотность" }).click();
    await tasks.getByLabel("Что сделать").fill("Проверить плотность");
    await tasks.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(tasks.getByText("Проверить плотность", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await tasks.scrollIntoViewIfNeeded();
    if (await consent.isVisible()) { await consent.click(); await expect(consent).not.toBeVisible(); }
    await tasks.screenshot({ path: resolve(output, "mobile-tasks-block.png"), animations: "disabled" });
    await page.screenshot({ path: resolve(output, "mobile-tasks.png"), fullPage: true, animations: "disabled" });
    unitExpect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto(`${base}/app/brew-batches`);
    const checks = page.getByRole("checkbox", { name: /^Сравнить:/ }); await checks.nth(0).check(); await checks.nth(1).check();
    await page.getByRole("button", { name: "Сравнить", exact: true }).click(); await expect(dialog.getByText("Начальная плотность", { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(output, "mobile-comparison.png"), fullPage: true, animations: "disabled" });
    unitExpect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 320, height: 720 });
    unitExpect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).last().click(); await expect(checks.nth(0)).toBeChecked();
    await page.goto(`${base}/app/brew-batches/${batch.id}`);
    await page.getByRole("button", { name: "Действия с партией", exact: true }).click();
    await page.getByRole("menuitem", { name: "Сравнить с другой партией…" }).click();
    await dialog.getByRole("button", { name: "Сравнить", exact: true }).click(); await expect(dialog.getByText("Начальная плотность", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).last().click();
    await updateBrewBatchStatus(user.id, batch.id, "fermenting"); await page.reload();
    await volumes.getByLabel("Разлито, л", { exact: true }).fill("18,5"); await volumes.getByRole("button", { name: "Сохранить объёмы" }).click(); await expect(volumes.getByText("Сохранено", { exact: true })).toBeVisible();
    await updateBrewBatchStatus(user.id, batch.id, "completed"); await page.reload();
    await page.getByText("Отклонения от расчёта", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Итоги партии" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: resolve(output, "completed.png"), fullPage: true, animations: "disabled" });
    unitExpect((await getBrewBatchDetail(user.id, batch.id))?.batch.volumeMeasurements?.bottledL).toBe(18.5);
    unitExpect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: resolve(output, "failed-batch-records.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}, 180000);

async function volumeFixture() {
  const user = await completeEmailSignIn({ email: "qa.volume-browser." + randomUUID() + "@localhost" }); owned.push(user.id);
  const session = await createSession({ userId: user.id, userAgent: "Volume form concurrency QA" });
  const recipe = await createRecipe(user.id, { title: "Volume concurrency", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", ingredients: [] });
  const batch = await createBrewBatchFromRecipe(user.id, recipe.id);
  await updateBrewBatchStatus(user.id, batch.id, "fermenting");
  await saveBatchVolumes(user.id, batch.id, { preBoilL: 24 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
  await context.addCookies([
    { name: "nb_session", value: session.rawToken, url: base },
    { name: "nb_cookie_consent", value: "1:necessary", url: base },
    { name: "nb_age_ok", value: "1", url: base }
  ]);
  const page = await context.newPage();
  await page.goto(base + "/app/brew-batches/" + batch.id);
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#batch-volumes button")).some(button => Object.keys(button).some(key => key.startsWith("__reactProps$"))));
  return { user, batch, context, page, volumes: page.locator("#batch-volumes").filter({ visible: true }) };
}

it("keeps dirty volume input when an independent record refreshes server values", async () => {
  const { user, batch, context, page, volumes } = await volumeFixture();
  try {
    await volumes.getByLabel("Разлито, л", { exact: true }).fill("18");
    await saveBatchVolumes(user.id, batch.id, { preBoilL: 26 });
    const tasks = page.locator("#batch-tasks").filter({ visible: true });
    await tasks.getByRole("button", { name: "Добавить задачу", exact: true }).click();
    await tasks.getByLabel("Что сделать").fill("Refresh independent record");
    await tasks.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(tasks.getByText("Refresh independent record", { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(output, "volume-form-after-task-refresh.png"), fullPage: true });
    await expect(volumes).toHaveCount(1);
    await volumes.getByText("Замеры при варке", { exact: true }).filter({ visible: true }).click();
    await expect(volumes.getByLabel("До кипячения, л", { exact: true })).toHaveValue("26");
    await page.screenshot({ path: resolve(output, "volume-input-after-refresh.png"), fullPage: true });
    await expect(volumes.getByLabel("Разлито, л", { exact: true })).toHaveValue("18");
  } finally { await context.close(); }
});

it("saves one edited volume without overwriting a separate volume changed in another tab", async () => {
  const { user, batch, context, page, volumes } = await volumeFixture();
  try {
    await volumes.getByLabel("Разлито, л", { exact: true }).fill("18");
    await saveBatchVolumes(user.id, batch.id, { preBoilL: 28 });
    await volumes.getByRole("button", { name: "Сохранить объёмы", exact: true }).click();
    await expect(volumes.getByText("Сохранено", { exact: true })).toBeVisible();
    const saved = (await getBrewBatchDetail(user.id, batch.id))!.batch.volumeMeasurements;
    await page.screenshot({ path: resolve(output, "volume-concurrent-save.png"), fullPage: true });
    unitExpect(saved).toMatchObject({ bottledL: 18, preBoilL: 28 });
  } finally { await context.close(); }
});
