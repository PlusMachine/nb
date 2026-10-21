import { expect, test, type Page } from "@playwright/test";
import { mountBrewDayProgress } from "./fixtures/brew-day-progress-harness";

const state = (page: Page) => page.getByTestId("state").textContent().then(value => JSON.parse(value!));
const settle = (page: Page, index: number, steps: Record<string, unknown>, time = 1) => page.evaluate(({ index, steps, time }) => {
  (window as any).progressHarness.settle(index, { ok: true, progress: { steps, updatedAt: `2026-10-20T10:00:00.00${time}Z` } });
}, { index, steps, time });
const done = { done: true, timerStartedAt: null };

test("a saved step preserves another step's pending optimistic mark", async ({ page }) => {
  await mountBrewDayProgress(page);
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.getByRole("button", { name: "b", exact: true }).click();
  await settle(page, 0, { a: done });
  await expect.poll(() => state(page)).toMatchObject({ a: { done: true }, b: { done: true } });
  await settle(page, 1, { a: done, b: done }, 2);
});

test("a network failure rolls back only its step, preserving another pending mark", async ({ page }) => {
  await mountBrewDayProgress(page);
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.getByRole("button", { name: "b", exact: true }).click();
  await page.evaluate(() => (window as any).progressHarness.fail(0));
  await expect(page.getByRole("alert")).toBeVisible();
  await expect.poll(() => state(page)).toMatchObject({ b: { done: true } });
  await settle(page, 1, { b: done }, 2);
});

test("two clicks on one pending step send only one request", async ({ page }) => {
  await mountBrewDayProgress(page);
  await page.getByRole("button", { name: "a", exact: true }).dblclick();
  expect(await page.evaluate(() => (window as any).progressHarness.calls.length)).toBe(1);
  await settle(page, 0, { a: done });
});

for (const timestamp of [1, 2]) test(`an older response does not erase a newer confirmed step (timestamp ${timestamp})`, async ({ page }) => {
  await mountBrewDayProgress(page);
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.getByRole("button", { name: "b", exact: true }).click();
  await settle(page, 1, { a: done, b: done }, 2);
  await settle(page, 0, { a: done }, timestamp);
  await expect.poll(() => state(page)).toMatchObject({ a: { done: true }, b: { done: true } });
});

test("validation failure rolls back its own step without erasing a pending neighbour", async ({ page }) => {
  await mountBrewDayProgress(page);
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.getByRole("button", { name: "b", exact: true }).click();
  await page.evaluate(() => (window as any).progressHarness.settle(0, { ok: false, message: 'Сохранение отклонено' }));
  await expect(page.getByRole("alert")).toHaveText("Сохранение отклонено");
  await expect.poll(() => state(page)).toMatchObject({ b: { done: true } });
  await settle(page, 1, { b: done }, 2);
});

test("a response from the previous batch does not change the current batch", async ({ page }) => {
  await mountBrewDayProgress(page);
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.evaluate(() => (window as any).progressHarness.switchBatch('second'));
  await expect.poll(() => state(page)).toEqual({});
  await settle(page, 0, { a: done });
  await page.getByRole("button", { name: "b", exact: true }).click();
  await settle(page, 1, { b: done }, 2);
  await expect.poll(() => state(page)).toEqual({ b: done });
});
