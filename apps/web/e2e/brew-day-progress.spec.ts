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

test("offline marks survive a new document and sync after reconnect", async ({ page, context }) => {
  await page.route("http://brew-progress.test/**", route => route.fulfill({ body: "<div></div>", contentType: "text/html" }));
  await page.goto("http://brew-progress.test/");
  await mountBrewDayProgress(page, "owner");
  await context.setOffline(true);
  await page.getByRole("button", { name: "a", exact: true }).click();
  await expect.poll(() => state(page)).toMatchObject({ a: { done: true } });
  await expect(page.getByTestId("queued")).toHaveText("1");
  await page.reload();
  await mountBrewDayProgress(page, "owner");
  await expect.poll(() => state(page)).toMatchObject({ a: { done: true } });
  expect(await page.evaluate(() => (window as any).progressHarness.calls.length)).toBe(0);
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => (window as any).progressHarness.calls.length)).toBe(1);
  await settle(page, 0, { a: done });
  await expect(page.getByTestId("queued")).toHaveText("0");
});

test("an offline queue belongs to its account and is not replayed for another owner", async ({ page, context }) => {
  await page.route("http://brew-progress.test/**", route => route.fulfill({ body: "<div></div>", contentType: "text/html" }));
  await page.goto("http://brew-progress.test/");
  await mountBrewDayProgress(page, "first");
  await context.setOffline(true);
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.evaluate(() => (window as any).progressHarness.switchOwner("second"));
  await expect.poll(() => state(page)).toEqual({});
  await context.setOffline(false);
  expect(await page.evaluate(() => (window as any).progressHarness.calls.length)).toBe(0);
  await page.evaluate(() => (window as any).progressHarness.switchOwner("first"));
  await expect.poll(() => state(page)).toMatchObject({ a: { done: true } });
  await expect.poll(() => page.evaluate(() => (window as any).progressHarness.calls.length)).toBe(1);
  await settle(page, 0, { a: done });
});

test("a rejected queued change remains recoverable and an explicit retry clears the error", async ({ page }) => {
  await page.route("http://brew-progress.test/**", route => route.fulfill({ body: "<div></div>", contentType: "text/html" }));
  await page.goto("http://brew-progress.test/");
  await mountBrewDayProgress(page, "owner");
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.evaluate(() => (window as any).progressHarness.settle(0, { ok: false, message: "Повторите отправку" }));
  await expect(page.getByRole("alert")).toHaveText("Повторите отправку");
  await expect(page.getByTestId("queued")).toHaveText("1");
  await page.evaluate(() => { void (window as any).progressHarness.current.retry(); });
  await expect.poll(() => page.evaluate(() => (window as any).progressHarness.calls.length)).toBe(2);
  await settle(page, 1, { a: done });
  await expect(page.getByTestId("queued")).toHaveText("0");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a temporary server failure retries automatically with the original event time", async ({ page }) => {
  await page.clock.install();
  await page.route("http://brew-progress.test/**", route => route.fulfill({ body: "<div></div>", contentType: "text/html" }));
  await page.goto("http://brew-progress.test/");
  await mountBrewDayProgress(page, "owner");
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.evaluate(() => (window as any).progressHarness.settle(0, { ok: false, message: "Сервер недоступен", retryable: true }));
  await expect(page.getByTestId("queued")).toHaveText("1");
  await page.clock.fastForward(15000);
  await expect.poll(() => page.evaluate(() => (window as any).progressHarness.calls.length)).toBe(2);
  const calls = await page.evaluate(() => (window as any).progressHarness.calls);
  expect(calls[1].patch.completedAt).toBe(calls[0].patch.completedAt);
  await settle(page, 1, { a: done });
  await expect(page.getByTestId("queued")).toHaveText("0");
  await expect(page.getByRole("alert")).toHaveCount(0);
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
