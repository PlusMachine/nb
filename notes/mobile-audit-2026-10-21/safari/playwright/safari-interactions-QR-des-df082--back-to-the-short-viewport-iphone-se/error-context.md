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
  - group: Описание пива
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
  10  | test.beforeEach(async ({ context, baseURL }) => {
  11  |   await context.addCookies([
  12  |     { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
  13  |     { name: "nb_age_ok", value: "1", url: baseURL! },
  14  |     { name: "nb_dev_guest", value: "1", url: baseURL! }
  15  |   ]);
  16  | });
  17  | 
  18  | test("QR description remains readable and collapses back to the short viewport", async ({ page }) => {
  19  |   await openBeer(page);
  20  |   const description = page.getByText(/Оригинальный чешский пилснер:/).filter({ visible: true });
  21  |   const disclosure = page.locator("details").filter({ hasText: "Описание пива" });
  22  |   if (page.viewportSize()!.height <= 700) {
  23  |     const summary = disclosure.locator("summary");
  24  |     await expect(summary).toBeVisible();
  25  |     await expect(description).toHaveCount(0);
  26  |     await summary.tap();
  27  |     await expect(disclosure).toHaveAttribute("open", "");
  28  |     await expect(description).toBeVisible();
  29  |     await summary.tap();
  30  |     await expect(disclosure).not.toHaveAttribute("open", "");
  31  |     expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(page.viewportSize()!.height + 2);
  32  |   } else {
  33  |     await expect(disclosure).toBeHidden();
  34  |     await expect(description).toBeVisible();
  35  |   }
  36  |   const originalViewport = page.viewportSize()!;
  37  |   await page.setViewportSize({ width: 375, height: 715 });
  38  |   await expect(disclosure.locator("summary")).toBeVisible();
  39  |   expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(717);
  40  |   await page.setViewportSize(originalViewport);
  41  |   await page.getByRole("link", { name: "Рецепт этого пива", exact: true }).tap();
> 42  |   await expect(page).toHaveURL(/\/recipes\/pilsner-urquell$/);
      |                      ^ Error: expect(page).toHaveURL(expected) failed
  43  | });
  44  | 
  45  | test("QR feedback leaves recipe actions uncovered and can be opened twice", async ({ page }) => {
  46  |   await openBeer(page);
  47  |   const feedback = page.getByRole("button", { name: "Обратная связь", exact: true });
  48  |   const recipe = page.getByRole("link", { name: "Рецепт этого пива", exact: true });
  49  |   const [fab, link] = await Promise.all([feedback.boundingBox(), recipe.boundingBox()]);
  50  |   expect(fab).not.toBeNull();
  51  |   expect(link).not.toBeNull();
  52  |   const overlap = Math.max(0, Math.min(fab!.x + fab!.width, link!.x + link!.width) - Math.max(fab!.x, link!.x))
  53  |     * Math.max(0, Math.min(fab!.y + fab!.height, link!.y + link!.height) - Math.max(fab!.y, link!.y));
  54  |   expect(overlap).toBe(0);
  55  |   expect(fab!.width).toBeGreaterThanOrEqual(44);
  56  |   expect(fab!.height).toBeGreaterThanOrEqual(44);
  57  |   const submissions: string[] = [];
  58  |   page.on("request", request => {
  59  |     if (request.method() === "POST" && new URL(request.url()).pathname === "/api/feedback") submissions.push(request.url());
  60  |   });
  61  |   for (let cycle = 0; cycle < 2; cycle++) {
  62  |     await feedback.tap();
  63  |     const dialog = page.getByRole("dialog", { name: "Обратная связь", exact: true });
  64  |     await expect(dialog).toBeVisible();
  65  |     await dialog.getByRole("textbox", { name: "Сообщение", exact: true }).fill("ab");
  66  |     await dialog.getByRole("button", { name: "Отправить", exact: true }).tap();
  67  |     await expect(dialog.getByRole("alert")).toContainText("минимум 5 символов");
  68  |     await dialog.getByRole("button", { name: "Отмена", exact: true }).tap();
  69  |     await expect(dialog).toBeHidden();
  70  |   }
  71  |   expect(submissions).toEqual([]);
  72  | });
  73  | 
  74  | test("label date and description remain editable with readable touch fields", async ({ page }) => {
  75  |   await page.goto("/labels");
  76  |   await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  77  |   await page.addStyleTag({ content: "body > div.fixed:has(.bg-warning-subtle) { display: none !important; }" });
  78  |   await page.getByRole("button", { name: "75×120 мм", exact: true }).tap();
  79  |   const date = page.getByLabel("Дата розлива", { exact: true });
  80  |   await date.tap();
  81  |   await date.fill("2026-02-28");
  82  |   await date.press("Tab");
  83  |   await expect(date).toHaveValue("2026-02-28");
  84  |   const description = page.getByRole("textbox", { name: "Описание", exact: true });
  85  |   await description.tap();
  86  |   await description.fill("Проверка описания в WebKit");
  87  |   await description.press("Tab");
  88  |   await expect(page.getByRole("link", { name: "Скачать PNG", exact: true })).toHaveAttribute("href", /bottlingDate=2026-02-28/);
  89  |   const smallFields = await page.locator("input:visible:not([type=checkbox]),textarea:visible").evaluateAll(elements =>
  90  |     elements.filter(element => parseFloat(getComputedStyle(element).fontSize) < 16).map(element => element.id)
  91  |   );
  92  |   expect(smallFields).toEqual([]);
  93  |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  94  | });
  95  | 
  96  | test("BJCP waits for its handlers before accepting the first query", async ({ page }) => {
  97  |   let releaseScripts!: () => void;
  98  |   const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  99  |   await page.route("**/_next/static/**/*.js*", async route => {
  100 |     await scriptsReady;
  101 |     await route.continue();
  102 |   });
  103 |   try {
  104 |     await page.goto("/bjcp", { waitUntil: "commit" });
  105 |     const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  106 |     await expect(search).toBeVisible();
  107 |     await expect(search).toBeDisabled();
  108 |     releaseScripts();
  109 |     await expect(search).toBeEnabled({ timeout: 20_000 });
  110 |     await search.tap();
  111 |     await search.pressSequentially("IPA");
  112 |     await expect(search).toHaveValue("IPA");
  113 |     await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  114 |   } finally {
  115 |     releaseScripts();
  116 |   }
  117 | });
  118 | 
  119 | test("BJCP suggestions fit the viewport and keyboard selection scrolls inside", async ({ page }) => {
  120 |   await page.goto("/bjcp");
  121 |   const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  122 |   await search.fill("IPA");
  123 |   const list = page.getByRole("listbox", { name: "Подсказки BJCP", exact: true });
  124 |   await expect(list).toBeVisible();
  125 |   const viewport = page.viewportSize()!;
  126 |   await expect.poll(async () => {
  127 |     const box = await list.boundingBox();
  128 |     return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  129 |   }).toBe(true);
  130 |   expect((await list.boundingBox())!.height).toBeLessThanOrEqual(320);
  131 |   const options = list.getByRole("option");
  132 |   for (let index = 1; index < await options.count(); index++) await search.press("ArrowDown");
  133 |   await expect(options.last()).toHaveAttribute("aria-selected", "true");
  134 |   await expect(options.last()).toBeInViewport({ ratio: 0.95 });
  135 |   await search.press("Escape");
  136 |   await expect(list).toBeHidden();
  137 |   await expect(search).toBeFocused();
  138 |   await search.press("ArrowDown");
  139 |   await expect(list).toBeVisible();
  140 |   await list.getByRole("option", { name: /^IPA, APA и хмелевые стили/ }).tap();
  141 |   await expect(list).toBeHidden();
  142 |   await expect.poll(() => new URL(page.url()).searchParams.get("family")).not.toBeNull();
```