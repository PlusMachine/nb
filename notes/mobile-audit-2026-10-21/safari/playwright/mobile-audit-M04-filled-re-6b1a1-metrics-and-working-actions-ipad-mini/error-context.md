# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-audit.spec.ts >> M04: filled recipe has compact metrics and working actions
- Location: e2e/mobile-audit.spec.ts:99:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('recipe-toolbar')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('recipe-toolbar')

```

```yaml
- banner:
  - link "NB":
    - /url: /app
  - radiogroup "Тема оформления":
    - radio "Светлая тема":
      - img
    - radio "Тёмная тема":
      - img
    - radio "Как в системе" [checked]:
      - img
  - 'button "Скин «Хмель»: выключен"':
    - img
  - button "Открыть меню":
    - img
- main:
  - main
- navigation "Быстрая навигация":
  - link "Обзор":
    - /url: /app
    - img
    - text: Обзор
  - link "Рецепты":
    - /url: /app/recipes
    - img
    - text: Рецепты
  - link "Склад":
    - /url: /app/ingredients
    - img
    - text: Склад
  - link "Партии":
    - /url: /app/brew-batches
    - img
    - text: Партии
  - button "Ещё":
    - img
    - text: Ещё
- button "Обратная связь"
- region "Уведомления (F8)":
  - list
- alert
```

# Test source

```ts
  3   | const recipeId = process.env.MOBILE_QA_RECIPE_ID;
  4   | 
  5   | async function open(page: Page, path: string) {
  6   |   const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  7   |   expect(response?.status()).toBe(200);
  8   |   await expect(page.locator("main").first()).toBeVisible();
  9   |   // Wait for Next to attach the client router before exercising server-rendered controls.
  10  |   await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  11  | }
  12  | 
  13  | async function expectDocumentFits(page: Page) {
  14  |   const width = page.viewportSize()!.width;
  15  |   const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  16  |   expect(size.client).toBe(width);
  17  |   expect(size.scroll).toBeLessThanOrEqual(width + 1);
  18  | }
  19  | 
  20  | async function expectControlFits(page: Page, control: ReturnType<Page["getByRole"]>) {
  21  |   const box = await control.boundingBox();
  22  |   expect(box).not.toBeNull();
  23  |   expect(box!.x).toBeGreaterThanOrEqual(0);
  24  |   expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  25  | }
  26  | 
  27  | test.beforeEach(async ({ context, baseURL }) => {
  28  |   await context.addCookies([
  29  |     { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
  30  |     { name: "nb_age_ok", value: "1", url: baseURL! }
  31  |   ]);
  32  | });
  33  | 
  34  | test("M01: label preview leaves data fields clickable in every format", async ({ page }) => {
  35  |   await open(page, "/labels");
  36  |   await page.getByRole("button", { name: "Крафт", exact: true }).click();
  37  |   for (const format of ["43×25 мм", "58×40 мм", "75×120 мм", "120×75 мм", "Лист A4"]) {
  38  |     await page.getByRole("button", { name: format, exact: true }).first().click();
  39  |     const preview = page.getByRole("img", { name: /Превью наклейки/ });
  40  |     await expect(preview).toBeVisible({ timeout: 20_000 });
  41  |     await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  42  |     for (const field of ["Название", "Стиль", "Автор"]) {
  43  |       const input = page.getByRole("textbox", { name: field, exact: true });
  44  |       // fill() alone can focus a field covered by a sticky sibling: require a real click.
  45  |       await input.click();
  46  |       await input.fill(`QA ${field} ${format}`);
  47  |       await expect(input).toBeFocused();
  48  |     }
  49  |     await expectDocumentFits(page);
  50  |   }
  51  | });
  52  | 
  53  | test("M02: public navigation and sign-in fit, including tablet breakpoint", async ({ page, context, baseURL }) => {
  54  |   await context.addCookies([{ name: "nb_dev_guest", value: "1", url: baseURL! }]);
  55  |   await open(page, "/calculators/abv-attenuation");
  56  |   await expectDocumentFits(page);
  57  |   await expectControlFits(page, page.getByRole("banner").getByRole("link", { name: "Войти", exact: true }));
  58  |   await expectControlFits(page, page.getByRole("button", { name: "Открыть меню", exact: true }));
  59  |   await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  60  |   await expect(page.getByRole("navigation", { name: "Разделы сайта" }).last()).toBeVisible();
  61  |   await page.setViewportSize({ width: 1280, height: 800 });
  62  |   await expect(page.getByRole("button", { name: "Закрыть меню", exact: true })).toBeHidden();
  63  |   await expectDocumentFits(page);
  64  |   await expectControlFits(page, page.getByRole("banner").getByRole("link", { name: "Войти", exact: true }));
  65  |   await page.setViewportSize({ width: 844, height: 390 });
  66  |   await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  67  |   const theme = page.getByRole("radio", { name: "Тёмная тема", exact: true }).last();
  68  |   await theme.click();
  69  |   await expect(theme).toHaveAttribute("aria-checked", "true");
  70  | });
  71  | 
  72  | test("M03/M06: admin navigation and table do not widen document", async ({ page, context, baseURL }) => {
  73  |   await context.addCookies([{ name: "nb_dev_account", value: "qa.admin@localhost", url: baseURL! }]);
  74  |   await open(page, "/admin/recipes");
  75  |   await expectDocumentFits(page);
  76  |   if (page.viewportSize()!.width < 1024) {
  77  |     const menu = page.getByRole("button", { name: "Открыть меню", exact: true });
  78  |     await expectControlFits(page, menu);
  79  |     await menu.click();
  80  |     await expect(page.getByRole("dialog")).toBeVisible();
  81  |     if (page.viewportSize()!.width < 640) {
  82  |       const theme = page.getByRole("dialog").getByRole("radio", { name: "Тёмная тема", exact: true });
  83  |       await theme.click();
  84  |       await expect(theme).toHaveAttribute("aria-checked", "true");
  85  |     }
  86  |     await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
  87  |     await expect(page.getByRole("dialog")).toBeHidden();
  88  |   } else {
  89  |     const table = page.getByRole("table");
  90  |     await expect(table.getByRole("columnheader", { name: "Действия", exact: true })).toBeAttached();
  91  |     const scroller = table.locator("..");
  92  |     await scroller.hover({ position: { x: 100, y: 70 } });
  93  |     await page.mouse.wheel(600, 0);
  94  |     await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  95  |     await expectDocumentFits(page);
  96  |   }
  97  | });
  98  | 
  99  | test("M04: filled recipe has compact metrics and working actions", async ({ page }) => {
  100 |   test.skip(!recipeId, "Set MOBILE_QA_RECIPE_ID to a saved QA recipe with calculated OG/FG and BJCP style");
  101 |   await open(page, `/app/recipes/${recipeId}/edit`);
  102 |   const toolbar = page.getByTestId("recipe-toolbar");
> 103 |   await expect(toolbar).toBeVisible();
      |                         ^ Error: expect(locator).toBeVisible() failed
  104 |   await expectDocumentFits(page);
  105 |   expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(130);
  106 |   if (page.viewportSize()!.width < 640) {
  107 |     expect((await toolbar.locator("dl").boundingBox())!.height).toBeLessThanOrEqual(24);
  108 |   }
  109 |   for (let cycle = 0; cycle < 2; cycle++) {
  110 |     if (page.viewportSize()!.width < 640) {
  111 |       await toolbar.getByRole("button", { name: "Действия с рецептом", exact: true }).click();
  112 |       await page.getByRole("menuitem", { name: "Импорт / экспорт", exact: true }).click();
  113 |     } else {
  114 |       await toolbar.getByRole("button", { name: "Импорт / экспорт", exact: true }).click();
  115 |     }
  116 |     await expect(page.getByRole("dialog")).toBeVisible();
  117 |     await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
  118 |     await expect(page.getByRole("dialog")).toBeHidden();
  119 |   }
  120 |   await toolbar.getByRole("button", { name: "Сварить", exact: true }).click();
  121 |   await expect(page.getByRole("dialog", { name: "Сварить рецепт", exact: true })).toBeVisible({ timeout: 30_000 });
  122 | });
  123 | 
  124 | test("M05: every dilution operation fits on the narrow screen", async ({ page }) => {
  125 |   await open(page, "/calculators/dilution-boiloff");
  126 |   const operations = page.getByRole("group", { name: "Что делаем", exact: true });
  127 |   for (const operation of ["Разбавить", "Уварить", "Добавить"]) {
  128 |     const operationButton = operations.getByRole("button", { name: operation, exact: true });
  129 |     await operationButton.click();
  130 |     await expect(operationButton).toHaveAttribute("aria-pressed", "true");
  131 |     const choices = page.getByRole("group", { name: "Что рассчитать", exact: true }).getByRole("button");
  132 |     for (let index = 0; index < await choices.count(); index++) {
  133 |       await choices.nth(index).click();
  134 |       await expect(choices.nth(index)).toHaveAttribute("aria-pressed", "true");
  135 |       await expectDocumentFits(page);
  136 |       for (const input of await page.locator("main input:visible").all()) {
  137 |         await expectControlFits(page, input);
  138 |       }
  139 |     }
  140 |     await expectDocumentFits(page);
  141 |   }
  142 | });
  143 | 
```