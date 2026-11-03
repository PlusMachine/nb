import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect as unitExpect, it } from "vitest";
import { chromium, expect as rawExpect, type Browser } from "@playwright/test";
import { db, pool, users, inArray, productActivityDaily, eq } from "@nb/db";
import { createSession } from "@nb/auth";
import { analyticsDay, shiftDay } from "../features/product-analytics/contracts";

// Dev routes may compile on first navigation; keep assertions bounded but allow that startup.
const expect = rawExpect.configure({ timeout: 15000 });

// QA inventory: date presets/custom range/audience; expandable daily table;
// report download; all segment links; list filters/reset/sort/export; profile;
// desktop/mobile fit and screenshots; consent on/off/revocation; role gates.
// Off-path: no consent must mean no write; non-admin must not export contacts.
let browser: Browser;
const ids: string[] = [], base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const output = resolve(process.cwd(), "../../.local-artifacts/product-analytics");
const account = async (role: "admin" | "user") => {
  const id = randomUUID(); ids.push(id);
  await db.insert(users).values({ id, email: `qa.analytics.browser.${id}@localhost`, displayName: `QA аналитики ${role}`, role });
  return { id, ...(await createSession({ userId: id, userAgent: "Product analytics browser QA" })) };
};
beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  browser = await chromium.launch({ headless: true }); await mkdir(output, { recursive: true });
});
afterAll(async () => { await browser?.close(); if (ids.length) await db.delete(users).where(inArray(users.id, ids)); await pool.end(); });

it("uses report controls, segments, exports and profiles on desktop and mobile", async () => {
  const admin = await account("admin"), target = await account("user");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
  await context.addCookies([{ name: "nb_session", value: admin.rawToken, url: base }, { name: "nb_cookie_consent", value: "1:necessary", url: base }]);
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/admin/analytics`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Продуктовая аналитика", exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(output, "desktop-overview.png"), animations: "disabled" });
    for (const days of [7,90,30]) {
      await page.getByRole("link", { name: `${days} дн.`, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`days=${days}`));
      await expect(page.getByRole("heading", { name: "Продуктовая аналитика", exact: true })).toBeVisible();
      const today = analyticsDay(new Date());
      await expect(page.getByLabel("С", { exact: true })).toHaveValue(shiftDay(today, 1-days));
      await expect(page.getByLabel("По", { exact: true })).toHaveValue(today);
    }
    await page.getByLabel("Аудитория", { exact: true }).selectOption("all");
    await page.getByLabel("С", { exact: true }).fill("2026-10-25");
    await page.getByLabel("По", { exact: true }).fill("2026-10-30");
    await page.getByRole("button", { name: "Применить", exact: true }).click();
    await expect(page).toHaveURL(/audience=all/);
    await expect(page.getByLabel("С", { exact: true })).toHaveValue("2026-10-25");
    await page.getByText("Данные по дням", { exact: true }).click();
    await expect(page.getByRole("columnheader", { name: "Регистрации", exact: true })).toBeVisible();
    await page.getByText("Данные по дням", { exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Скачать отчёт CSV", exact: true }).click();
    const download = await downloadPromise;
    unitExpect(download.suggestedFilename()).toContain("analytics-2026-10-25-2026-10-30.csv");
    await download.saveAs(resolve(output, "report.csv"));
    await page.getByRole("heading", { name: "Путь к первой варке", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, "desktop-funnel-retention.png"), animations: "disabled" });
    await page.getByRole("heading", { name: "Недельные когорты", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, "desktop-cohorts.png"), animations: "disabled" });
    await page.getByRole("heading", { name: "Источники переходов", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, "desktop-distributions.png"), animations: "disabled" });
    for (const segment of ["new", "active", "dormant", "unactivated", "no_batches", "brewers"]) {
      await page.locator(`a[href^="/admin/users?segment=${segment}"]`).click();
      await expect(page.getByLabel("Сегмент", { exact: true })).toHaveValue(segment);
      await page.goBack();
      await expect(page.getByRole("heading", { name: "Продуктовая аналитика", exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "30 дн.", exact: true }).click();
    await expect(page.getByLabel("По", { exact: true })).toHaveValue(analyticsDay(new Date()));
    await page.getByLabel("Аудитория", { exact: true }).selectOption("customers");
    await page.getByRole("button", { name: "Применить", exact: true }).click();
    await expect(page.getByLabel("Аудитория", { exact: true })).toHaveValue("customers");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("heading", { name: "Продуктовая аналитика", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, "mobile-overview.png"), animations: "disabled" });
    unitExpect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("heading", { name: "Обратная связь", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, "mobile-feedback.png"), animations: "disabled" });
    await page.goto(`${base}/admin/users?segment=new&role=user`);
    await page.getByLabel("Поиск", { exact: true }).fill("qa.analytics.browser.");
    await expect(page).toHaveURL(/q=qa.analytics.browser/);
    await page.getByLabel("Сортировка", { exact: true }).selectOption("last_seen");
    await expect(page).toHaveURL(/sort=last_seen/);
    await expect(page.getByLabel("Сегмент", { exact: true })).toHaveValue("new");
    const usersDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "Скачать CSV", exact: true }).click();
    await (await usersDownload).saveAs(resolve(output, "users.csv"));
    await page.screenshot({ path: resolve(output, "mobile-users.png"), animations: "disabled" });
    await page.getByRole("link", { name: "QA аналитики user", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(target.id));
    await expect(page.getByRole("heading", { name: "Использование продукта", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "К пользователям", exact: true }).click();
    await page.getByLabel("Статус", { exact: true }).selectOption("blocked");
    await expect(page.getByText("Пользователи не найдены.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Сбросить", exact: true }).click();
    await expect(page.getByLabel("Статус", { exact: true })).toHaveValue("all");
    await page.getByLabel("Роль", { exact: true }).selectOption("admin");
    await expect(page.getByLabel("Роль", { exact: true })).toHaveValue("admin");
    unitExpect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: resolve(output, "failed-admin.png"), fullPage: true }).catch(() => {});
    await writeFile(resolve(output, "failed-admin.txt"), `${page.url()}\n${errors.join("\n")}\n${await page.locator("body").innerText()}`);
    throw error;
  } finally { await context.close(); }
}, 180000);

it("collects only after opt-in, stops on withdrawal and blocks non-admin exports", async () => {
  const user = await account("user");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: "nb_session", value: user.rawToken, url: base }]);
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const stored = async () => db.select().from(productActivityDaily).where(eq(productActivityDaily.userId, user.id));
  try {
    await page.goto(`${base}/app`);
    await page.getByRole("button", { name: "Только необходимые", exact: true }).click();
    await page.goto(`${base}/app/recipes`);
    unitExpect(await stored()).toEqual([]);
    await page.goto(`${base}/legal/cookies`);
    await page.getByRole("button", { name: "Изменить настройки cookie", exact: true }).click();
    await page.getByRole("button", { name: "Принять все", exact: true }).click();
    await page.goto(`${base}/app/recipes`);
    await expect.poll(async () => (await stored()).reduce((total, r) => total + r.views, 0), { timeout: 15000 }).toBe(1);
    await page.goto(`${base}/app/recipes?kiosk=1`);
    unitExpect((await stored()).reduce((total, r) => total + r.views, 0)).toBe(1);
    await page.goto(`${base}/app/recipes`);
    await expect.poll(async () => (await stored()).reduce((total, r) => total + r.views, 0), { timeout: 15000 }).toBe(2);
    await page.getByRole("link", { name: "Склад", exact: true }).first().click();
    await expect(page).toHaveURL(/\/app\/ingredients$/);
    await expect.poll(async () => (await stored()).reduce((total, r) => total + r.views, 0), { timeout: 15000 }).toBe(3);
    await page.goto(`${base}/legal/cookies`);
    await page.getByRole("button", { name: "Изменить настройки cookie", exact: true }).click();
    await page.getByRole("button", { name: "Только необходимые", exact: true }).click();
    await page.goto(`${base}/app/recipes`);
    unitExpect((await stored()).reduce((total, r) => total + r.views, 0)).toBe(3);
    unitExpect((await context.request.get(`${base}/api/admin/users/export`)).status()).toBe(403);
    unitExpect((await context.request.get(`${base}/api/admin/analytics/export`)).status()).toBe(403);
    await page.goto(`${base}/admin/analytics`);
    await expect(page).toHaveURL(/\/app$/);
  } catch (error) {
    await page.screenshot({ path: resolve(output, "failed-consent.png"), fullPage: true }).catch(() => {});
    await writeFile(resolve(output, "failed-consent.txt"), `${page.url()}\n${errors.join("\n")}\n${await page.locator("body").innerText()}`);
    throw error;
  } finally { await context.close(); }
}, 120000);
