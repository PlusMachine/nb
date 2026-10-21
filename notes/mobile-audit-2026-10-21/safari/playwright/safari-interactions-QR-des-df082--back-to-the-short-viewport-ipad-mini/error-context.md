# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: safari-interactions.spec.ts >> QR description remains readable and collapses back to the short viewport
- Location: e2e/safari-interactions.spec.ts:18:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/recipes\/pilsner-urquell$/
Received string:  "http://127.0.0.1:3100/beer/pilsner-urquell"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × unexpected value "http://127.0.0.1:3100/beer/pilsner-urquell"

```

```yaml
- article:
  - link "NB":
    - /url: /
  - paragraph: 3B · Чешский премиальный светлый лагер
  - heading "Pilsner Urquell" [level=1]
  - term: Крепость
  - definition: 4,4 %
  - term: Горечь
  - definition: 40 IBU
  - definition: ощутимая
  - term: Цвет
  - definition: Золотистый
  - paragraph: "Оригинальный чешский пилснер: мягкая вода, по традиции — затирание с тремя отварками, насыщенно-солодовая база с лёгкой диацетильной округлостью и пряно-травянистой горечью Saaz. В клоне отварочное затирание упрощено."
  - text: Пивовар admin
  - link "Рецепт этого пива":
    - /url: /recipes/pilsner-urquell
  - link "О стиле":
    - /url: /bjcp/bjcp-3b-czech-premium-pale-lager
  - paragraph:
    - text: Сделано в
    - link "NB":
      - /url: /
    - text: — сервисе для домашних пивоваров.
- button "Обратная связь"
- region "Уведомления (F8)":
  - list
- alert
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | 
  3   | async function openBeer(page: Page) {
  4   |   await page.goto("/beer/pilsner-urquell");
  5   |   await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  6   |   // The account-switching badge exists only on this development stand.
  7   |   await page.addStyleTag({ content: "body > div.fixed:has(.bg-warning-subtle) { display: none !important; }" });
  8   | }
  9   | 
  10  | test.beforeEach(async ({ context, page, baseURL }) => {
  11  |   await page.addInitScript(() => {
  12  |     document.addEventListener("DOMContentLoaded", () => {
  13  |       const style = document.createElement("style");
  14  |       style.textContent = "body > div.fixed:has(.bg-warning-subtle) { display: none !important; }";
  15  |       document.head.append(style);
  16  |     });
  17  |   });
  18  |   await context.addCookies([
  19  |     { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
  20  |     { name: "nb_age_ok", value: "1", url: baseURL! },
  21  |     { name: "nb_dev_guest", value: "1", url: baseURL! }
  22  |   ]);
  23  | });
  24  | 
  25  | test("QR description remains readable and collapses back to the short viewport", async ({ page }) => {
  26  |   await openBeer(page);
  27  |   const description = page.getByText(/Оригинальный чешский пилснер:/).filter({ visible: true });
  28  |   const disclosure = page.locator("details").filter({ hasText: "Описание пива" });
  29  |   if (page.viewportSize()!.height <= 700) {
  30  |     const summary = disclosure.locator("summary");
  31  |     await expect(summary).toBeVisible();
  32  |     await expect(description).toHaveCount(0);
  33  |     await summary.tap();
  34  |     await expect(disclosure).toHaveAttribute("open", "");
  35  |     await expect(description).toBeVisible();
  36  |     await summary.tap();
  37  |     await expect(disclosure).not.toHaveAttribute("open", "");
  38  |     expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(page.viewportSize()!.height + 2);
  39  |   } else {
  40  |     await expect(disclosure).toBeHidden();
  41  |     await expect(description).toBeVisible();
> 42  |   }
      |                      ^ Error: expect(page).toHaveURL(expected) failed
  43  |   const originalViewport = page.viewportSize()!;
  44  |   await page.setViewportSize({ width: 375, height: 715 });
  45  |   await expect(disclosure.locator("summary")).toBeVisible();
  46  |   expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(717);
  47  |   await page.setViewportSize(originalViewport);
  48  |   // WebKit updates its touch coordinates after the viewport's next paint.
  49  |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  50  |   await expect(page.getByRole("link", { name: "Рецепт этого пива", exact: true })).toBeInViewport();
  51  |   await page.getByRole("link", { name: "Рецепт этого пива", exact: true }).tap();
  52  |   await expect(page).toHaveURL(/\/recipes\/pilsner-urquell$/);
  53  | });
  54  | 
  55  | test("QR feedback leaves recipe actions uncovered and can be opened twice", async ({ page }) => {
  56  |   await openBeer(page);
  57  |   const feedback = page.getByRole("button", { name: "Обратная связь", exact: true });
  58  |   const recipe = page.getByRole("link", { name: "Рецепт этого пива", exact: true });
  59  |   const [fab, link] = await Promise.all([feedback.boundingBox(), recipe.boundingBox()]);
  60  |   expect(fab).not.toBeNull();
  61  |   expect(link).not.toBeNull();
  62  |   const overlap = Math.max(0, Math.min(fab!.x + fab!.width, link!.x + link!.width) - Math.max(fab!.x, link!.x))
  63  |     * Math.max(0, Math.min(fab!.y + fab!.height, link!.y + link!.height) - Math.max(fab!.y, link!.y));
  64  |   expect(overlap).toBe(0);
  65  |   expect(fab!.width).toBeGreaterThanOrEqual(44);
  66  |   expect(fab!.height).toBeGreaterThanOrEqual(44);
  67  |   const submissions: string[] = [];
  68  |   page.on("request", request => {
  69  |     if (request.method() === "POST" && new URL(request.url()).pathname === "/api/feedback") submissions.push(request.url());
  70  |   });
  71  |   for (let cycle = 0; cycle < 2; cycle++) {
  72  |     await feedback.tap();
  73  |     const dialog = page.getByRole("dialog", { name: "Обратная связь", exact: true });
  74  |     await expect(dialog).toBeVisible();
  75  |     await dialog.getByRole("textbox", { name: "Сообщение", exact: true }).fill("ab");
  76  |     await dialog.getByRole("button", { name: "Отправить", exact: true }).tap();
  77  |     await expect(dialog.getByRole("alert")).toContainText("минимум 5 символов");
  78  |     await dialog.getByRole("button", { name: "Отмена", exact: true }).tap();
  79  |     await expect(dialog).toBeHidden();
  80  |   }
  81  |   expect(submissions).toEqual([]);
  82  | });
  83  | 
  84  | test("label date and description remain editable with readable touch fields", async ({ page }) => {
  85  |   await page.goto("/labels");
  86  |   await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  87  |   await page.addStyleTag({ content: "body > div.fixed:has(.bg-warning-subtle) { display: none !important; }" });
  88  |   await page.getByRole("button", { name: "75×120 мм", exact: true }).tap();
  89  |   const date = page.getByLabel("Дата розлива", { exact: true });
  90  |   await date.tap();
  91  |   await date.fill("2026-02-28");
  92  |   await date.press("Tab");
  93  |   await expect(date).toHaveValue("2026-02-28");
  94  |   const description = page.getByRole("textbox", { name: "Описание", exact: true });
  95  |   await description.tap();
  96  |   await description.fill("Проверка описания в WebKit");
  97  |   await description.press("Tab");
  98  |   await expect(page.getByRole("link", { name: "Скачать PNG", exact: true })).toHaveAttribute("href", /bottlingDate=2026-02-28/);
  99  |   const smallFields = await page.locator("input:visible:not([type=checkbox]),textarea:visible").evaluateAll(elements =>
  100 |     elements.filter(element => parseFloat(getComputedStyle(element).fontSize) < 16).map(element => element.id)
  101 |   );
  102 |   expect(smallFields).toEqual([]);
  103 |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  104 | });
  105 | 
  106 | test("BJCP waits for its handlers before accepting the first query", async ({ page }) => {
  107 |   let releaseScripts!: () => void;
  108 |   const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  109 |   await page.route("**/_next/static/**/*.js*", async route => {
  110 |     await scriptsReady;
  111 |     await route.continue();
  112 |   });
  113 |   try {
  114 |     await page.goto("/bjcp", { waitUntil: "commit" });
  115 |     const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  116 |     await expect(search).toBeVisible();
  117 |     await expect(search).toBeDisabled();
  118 |     releaseScripts();
  119 |     await expect(search).toBeEnabled({ timeout: 20_000 });
  120 |     await search.tap();
  121 |     await search.pressSequentially("IPA");
  122 |     await expect(search).toHaveValue("IPA");
  123 |     await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  124 |   } finally {
  125 |     releaseScripts();
  126 |   }
  127 | });
  128 | 
  129 | test("BJCP suggestions fit the viewport and keyboard selection scrolls inside", async ({ page }) => {
  130 |   await page.goto("/bjcp");
  131 |   const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  132 |   await search.fill("IPA");
  133 |   const list = page.getByRole("listbox", { name: "Подсказки BJCP", exact: true });
  134 |   await expect(list).toBeVisible();
  135 |   const viewport = page.viewportSize()!;
  136 |   await expect.poll(async () => {
  137 |     const box = await list.boundingBox();
  138 |     return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  139 |   }).toBe(true);
  140 |   expect((await list.boundingBox())!.height).toBeLessThanOrEqual(320);
  141 |   const options = list.getByRole("option");
  142 |   for (let index = 1; index < await options.count(); index++) await search.press("ArrowDown");
```