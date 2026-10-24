import { expect, test, type Page } from "@playwright/test";

const recipeId = process.env.MOBILE_QA_RECIPE_ID;

async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("main").first()).toBeVisible();
  // Wait for Next to attach the client router before exercising server-rendered controls.
  await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
}

async function expectDocumentFits(page: Page) {
  const width = page.viewportSize()!.width;
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.client).toBe(width);
  expect(size.scroll).toBeLessThanOrEqual(width + 1);
}

async function expectControlFits(page: Page, control: ReturnType<Page["getByRole"]>) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
    { name: "nb_age_ok", value: "1", url: baseURL! }
  ]);
});

test("M01: label preview leaves data fields clickable in every format", async ({ page }) => {
  await open(page, "/labels");
  await page.getByRole("button", { name: "Крафт", exact: true }).click();
  for (const format of ["43×25 мм", "58×40 мм", "75×120 мм", "120×75 мм", "Лист A4"]) {
    await page.getByRole("button", { name: format, exact: true }).first().click();
    const preview = page.getByRole("img", { name: /Предпросмотр этикетки/ });
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    for (const field of ["Название", "Стиль", "Автор"]) {
      const input = page.getByRole("textbox", { name: field, exact: true });
      // fill() alone can focus a field covered by a sticky sibling: require a real click.
      await input.click();
      await input.fill(`QA ${field} ${format}`);
      await expect(input).toBeFocused();
    }
    await expectDocumentFits(page);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  for (const text of ["Крепость, % об.", "Горечь, IBU", "Цвет, EBC", "Начальная плотность", "Конечная плотность"]) {
    const label = page.getByText(text, { exact: true });
    await expect(label).toBeVisible();
    expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await expectDocumentFits(page);
});

test("M02: public navigation and sign-in fit, including tablet breakpoint", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "nb_dev_guest", value: "1", url: baseURL! }]);
  await open(page, "/calculators/abv-attenuation");
  await expectDocumentFits(page);
  await expectControlFits(page, page.getByRole("banner").getByRole("link", { name: "Войти", exact: true }));
  if (page.viewportSize()!.width >= 1280) await page.setViewportSize({ width: 834, height: 1112 });
  await expectControlFits(page, page.getByRole("button", { name: "Открыть меню", exact: true }));
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Разделы сайта" }).last()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("button", { name: "Закрыть меню", exact: true })).toBeHidden();
  await expectDocumentFits(page);
  await expectControlFits(page, page.getByRole("banner").getByRole("link", { name: "Войти", exact: true }));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  await page.getByRole("button", { name: "Тема оформления", exact: true }).last().click();
  const theme = page.getByRole("radio", { name: "Тёмная тема", exact: true }).last();
  await theme.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("M03/M06: admin navigation and table do not widen document", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "nb_dev_account", value: "qa.admin@localhost", url: baseURL! }]);
  await open(page, "/admin/recipes");
  await expectDocumentFits(page);
  if (page.viewportSize()!.width < 1024) {
    const menu = page.getByRole("button", { name: "Открыть меню", exact: true });
    await expectControlFits(page, menu);
    await menu.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (page.viewportSize()!.width < 640) {
      await page.getByRole("dialog").getByRole("button", { name: "Тема оформления", exact: true }).click();
      const theme = page.getByRole("radio", { name: "Тёмная тема", exact: true });
      await theme.click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    }
    await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "Действия", exact: true })).toBeAttached();
    const scroller = table.locator("..");
    const hasOverflow = await scroller.evaluate(el => el.scrollWidth > el.clientWidth);
    // Mobile WebKit has no mouse wheel. Reaching the last column through an
    // actual action also verifies that the clipped table controls remain usable.
    await table.getByRole("button", { name: /^Действия с/ }).first().click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    if (hasOverflow) {
      await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    } else {
      await expectControlFits(page, table.getByRole("button", { name: /^Действия с/ }).first());
    }
    await expectDocumentFits(page);
  }
});

test("M04: filled recipe has compact metrics and working actions", async ({ page }) => {
  test.skip(!recipeId, "Set MOBILE_QA_RECIPE_ID to a saved QA recipe with calculated OG/FG and BJCP style");
  await open(page, `/app/recipes/${recipeId}/edit`);
  const toolbar = page.getByTestId("recipe-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 30_000 });
  await expectDocumentFits(page);
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(130);
  if (page.viewportSize()!.width < 640) {
    expect((await toolbar.locator("dl").boundingBox())!.height).toBeLessThanOrEqual(24);
  }
  for (let cycle = 0; cycle < 2; cycle++) {
    if (page.viewportSize()!.width < 768) {
      await toolbar.getByRole("button", { name: "Действия с рецептом", exact: true }).click();
      await page.getByRole("menuitem", { name: "Импорт / экспорт", exact: true }).click();
    } else {
      await toolbar.getByRole("button", { name: "Импорт / экспорт", exact: true }).click();
    }
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  await toolbar.getByRole("button", { name: "Сварить", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Сварить рецепт", exact: true })).toBeVisible({ timeout: 30_000 });
});

test("M05: every dilution operation fits on the narrow screen", async ({ page }) => {
  await open(page, "/calculators/dilution-boiloff");
  const operations = page.getByRole("group", { name: "Что делаем", exact: true });
  for (const operation of ["Разбавить", "Уварить", "Добавить"]) {
    const operationButton = operations.getByRole("button", { name: operation, exact: true });
    await operationButton.click();
    await expect(operationButton).toHaveAttribute("aria-pressed", "true");
    const choices = page.getByRole("group", { name: "Что рассчитать", exact: true }).getByRole("button");
    for (let index = 0; index < await choices.count(); index++) {
      await choices.nth(index).click();
      await expect(choices.nth(index)).toHaveAttribute("aria-pressed", "true");
      await expectDocumentFits(page);
      for (const input of await page.locator("main input:visible").all()) {
        await expectControlFits(page, input);
      }
    }
    await expectDocumentFits(page);
  }
});
