import { expect, test, type Page } from "@playwright/test";
import { mountRecipeAutosave } from "./fixtures/recipe-autosave-harness";

const calls = (page: Page) => page.evaluate(() => window.autosaveHarness.calls);
const state = (page: Page) => page.evaluate(() => window.autosaveHarness.current);
const edit = (page: Page, title: string) => page.getByRole("textbox", { name: "Recipe title" }).fill(title);
const debounce = (page: Page) => page.clock.runFor(1600);

test("saves the latest edit after a slow request without another keystroke", async ({ page }) => {
  await mountRecipeAutosave(page);
  await edit(page, "B");
  await debounce(page);
  await expect.poll(() => calls(page)).toEqual([{ kind: "update", id: "recipe-1", title: "B" }]);
  await edit(page, "C");
  await debounce(page); // Old implementation dropped C here while B was in flight.
  await edit(page, "D");
  await debounce(page);
  expect(await calls(page)).toHaveLength(1);
  await page.evaluate(() => window.autosaveHarness.settle(0));
  await expect.poll(() => state(page)).toMatchObject({ pending: false, dirty: true });
  await debounce(page);
  await expect.poll(() => calls(page)).toEqual([
    { kind: "update", id: "recipe-1", title: "B" },
    { kind: "update", id: "recipe-1", title: "D" }
  ]);
  await page.evaluate(() => window.autosaveHarness.settle(1));
  await expect.poll(() => state(page)).toMatchObject({ title: "D", status: "saved", dirty: false, pending: false });
});

test("queues edits during initial creation as an update, without a second recipe", async ({ page }) => {
  await mountRecipeAutosave(page, "create");
  await edit(page, "B");
  await debounce(page);
  await expect.poll(() => calls(page)).toHaveLength(1);
  await edit(page, "C");
  await debounce(page);
  await page.evaluate(() => window.autosaveHarness.settle(0));
  await expect.poll(() => state(page)).toMatchObject({ id: "recipe-1", pending: false });
  await debounce(page);
  await expect.poll(() => calls(page)).toEqual([
    { kind: "create", id: null, title: "B" },
    { kind: "update", id: "recipe-1", title: "C" }
  ]);
  await page.evaluate(() => window.autosaveHarness.settle(1));
  await expect.poll(() => state(page)).toMatchObject({ status: "saved", dirty: false });
});

test("serializes two explicit saves in the same event turn", async ({ page }) => {
  await mountRecipeAutosave(page);
  await page.evaluate(() => { void window.autosaveHarness.save(); void window.autosaveHarness.save(); });
  expect(await calls(page)).toHaveLength(1);
});

for (const outcome of ["network", "validation"] as const) {
  test(`${outcome} failure stays actionable without an automatic retry loop`, async ({ page }) => {
    await mountRecipeAutosave(page);
    await edit(page, "B");
    await debounce(page);
    await expect.poll(() => calls(page)).toHaveLength(1);
    await page.evaluate(outcome => window.autosaveHarness.settle(0, outcome), outcome);
    await expect.poll(() => state(page)).toMatchObject({ status: "error", pending: false, dirty: true });
    await page.clock.runFor(10000);
    expect(await calls(page)).toHaveLength(1);
    await edit(page, "C");
    await debounce(page);
    await expect.poll(() => calls(page)).toHaveLength(2);
    await page.evaluate(() => window.autosaveHarness.settle(1));
    await expect.poll(() => state(page)).toMatchObject({ status: "saved", dirty: false });
  });
}

test("a failed older request does not block a newer valid edit", async ({ page }) => {
  await mountRecipeAutosave(page);
  await edit(page, "B");
  await debounce(page);
  await expect.poll(() => calls(page)).toHaveLength(1);
  await edit(page, "C");
  await debounce(page);
  await page.evaluate(() => window.autosaveHarness.settle(0, "network"));
  await expect.poll(() => state(page)).toMatchObject({ pending: false });
  await debounce(page);
  await expect.poll(() => calls(page)).toHaveLength(2);
  expect((await calls(page))[1].title).toBe("C");
});

test("deletion cancels the queued edit after the in-flight save completes", async ({ page }) => {
  await mountRecipeAutosave(page);
  await edit(page, "B");
  await debounce(page);
  await expect.poll(() => calls(page)).toHaveLength(1);
  await edit(page, "C");
  await page.evaluate(() => { window.autosaveHarness.markDeleted(); window.autosaveHarness.settle(0); });
  await page.clock.runFor(5000);
  expect(await calls(page)).toHaveLength(1);
});

test("unmount cancels a scheduled save", async ({ page }) => {
  await mountRecipeAutosave(page);
  await edit(page, "B");
  await page.evaluate(() => window.autosaveHarness.unmount());
  await page.clock.runFor(5000);
  expect(await calls(page)).toHaveLength(0);
});
