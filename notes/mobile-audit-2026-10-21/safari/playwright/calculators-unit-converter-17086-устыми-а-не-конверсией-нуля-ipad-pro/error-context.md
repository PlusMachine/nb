# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calculators-unit-converter.spec.ts >> Конвертер единиц пивовара >> пустой ввод оставляет соседние ячейки пустыми, а не конверсией нуля
- Location: e2e/calculators-unit-converter.spec.ts:102:3

# Error details

```
Error: page.goto: Error receiving data: Connection reset by peer
Call log:
  - navigating to "http://127.0.0.1:3100/calculators/unit-converter", waiting until "load"

```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | 
  3   | // Регресс на «конвертер занимает только половину экрана на широких разрешениях,
  4   | // вкладки без пиктограмм» — audit 2026-07-01. Разрешения см. в playwright.config.ts.
  5   | const GROUPS = ["Плотность", "Цвет", "Объём", "Вес", "Температура", "Давление", "Концентрация"];
  6   | 
  7   | test.describe("Конвертер единиц пивовара", () => {
  8   |   test.beforeEach(async ({ page, context, baseURL }) => {
  9   |     await context.addCookies([
  10  |       { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
  11  |       { name: "nb_age_ok", value: "1", url: baseURL! }
  12  |     ]);
> 13  |     await page.goto("/calculators/unit-converter");
      |                ^ Error: page.goto: Error receiving data: Connection reset by peer
  14  |   });
  15  | 
  16  |   test("не выходит за ширину вьюпорта (нет horizontal overflow)", async ({ page }) => {
  17  |     const { scrollWidth, clientWidth } = await page.evaluate(() => ({
  18  |       scrollWidth: document.documentElement.scrollWidth,
  19  |       clientWidth: document.documentElement.clientWidth
  20  |     }));
  21  | 
  22  |     expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  23  |   });
  24  | 
  25  |   test("переключение вкладки группы меняет активную карточку без дублей", async ({ page }) => {
  26  |     for (const group of GROUPS) {
  27  |       await page.getByRole("tab", { name: group }).click();
  28  |       await expect(page.getByRole("tab", { name: group })).toHaveAttribute("aria-selected", "true");
  29  | 
  30  |       // Среди всех h2 на странице (есть ещё заголовок блока "Дальше") ровно один
  31  |       // совпадает с именем группы — предыдущая группа не должна оставаться отрендеренной рядом.
  32  |       const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  33  |       const matchingGroupHeadings = headings.filter((text) => GROUPS.includes(text));
  34  |       expect(matchingGroupHeadings).toEqual([group]);
  35  |     }
  36  |   });
  37  | 
  38  |   test("каждая единица группы — рабочее поле ввода со своим значением", async ({ page }) => {
  39  |     await page.getByRole("tab", { name: "Объём" }).click();
  40  |     const card = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Объём" }) });
  41  | 
  42  |     await expect(card.getByLabel("мл", { exact: true })).toHaveValue("20000");
  43  |     await expect(card.getByLabel("л", { exact: true })).toHaveValue("20");
  44  | 
  45  |     await card.getByLabel("л", { exact: true }).fill("10");
  46  |     await expect(card.getByLabel("мл", { exact: true })).toHaveValue("10000");
  47  |   });
  48  | 
  49  |   test("на lg+ экранах конвертер использует доступную ширину контейнера, а не половину", async ({ page }) => {
  50  |     const viewport = page.viewportSize();
  51  |     test.skip(!viewport || viewport.width < 1024, "Проверка актуальна только для sidebar-раскладки (lg+)");
  52  | 
  53  |     // PublicShell рендерит свой <main>, а CalculatorPageClient — свой вложенный: нужен внутренний.
  54  |     const containerBox = await page.locator("main").last().boundingBox();
  55  |     expect(containerBox).not.toBeNull();
  56  | 
  57  |     const blockBox = await page.getByTestId("unit-converter").boundingBox();
  58  |     expect(blockBox).not.toBeNull();
  59  | 
  60  |     // До фикса блок был жёстко ограничен max-w-2xl (~672px) независимо от ширины контейнера —
  61  |     // здесь фиксируем, что он занимает большую часть доступной ширины `<main>`.
  62  |     expect(blockBox!.width).toBeGreaterThan(containerBox!.width * 0.85);
  63  |   });
  64  | 
  65  |   test("на узких экранах вкладки идут горизонтальным рядом, а не боковой колонкой", async ({ page }) => {
  66  |     const viewport = page.viewportSize();
  67  |     test.skip(!viewport || viewport.width >= 1024, "Проверка актуальна для мобильной/планшетной раскладки");
  68  | 
  69  |     const firstTabBox = await page.getByRole("tab", { name: "Плотность" }).boundingBox();
  70  |     const secondTabBox = await page.getByRole("tab", { name: "Цвет" }).boundingBox();
  71  |     expect(firstTabBox).not.toBeNull();
  72  |     expect(secondTabBox).not.toBeNull();
  73  | 
  74  |     // В горизонтальном ряду соседние вкладки лежат примерно на одной высоте.
  75  |     expect(Math.abs(firstTabBox!.y - secondTabBox!.y)).toBeLessThan(firstTabBox!.height);
  76  |   });
  77  | 
  78  |   test("у каждой вкладки группы есть иконка", async ({ page }) => {
  79  |     for (const group of GROUPS) {
  80  |       const tab = page.getByRole("tab", { name: group });
  81  |       const iconCount = await tab.locator("svg").count();
  82  |       expect(iconCount).toBeGreaterThan(0);
  83  |     }
  84  |   });
  85  | 
  86  |   // Регрессы на находки ревью 2026-07-10: запятая как десятичный разделитель («1,05» в
  87  |   // type=number превращалась в 105 → Плато 150 млн), конверсия нуля при пустом вводе
  88  |   // (пустой SG показывал −616.9 °P / −1000 GP), телепорт «Сбросить» на первую вкладку,
  89  |   // отсутствие стрелочной навигации по вкладкам.
  90  |   test("запятая — валидный десятичный разделитель", async ({ page }) => {
  91  |     const card = page.locator('[data-testid="unit-converter"] section');
  92  |     const sg = card.locator("label").filter({ hasText: "SG" }).locator("input");
  93  |     const plato = card.locator("label").filter({ hasText: "°P" }).locator("input");
  94  | 
  95  |     await sg.click();
  96  |     await sg.press("ControlOrMeta+a");
  97  |     await sg.pressSequentially("1,05");
  98  |     await expect(sg).toHaveValue("1,05");
  99  |     await expect(plato).toHaveValue("12.4");
  100 |   });
  101 | 
  102 |   test("пустой ввод оставляет соседние ячейки пустыми, а не конверсией нуля", async ({ page }) => {
  103 |     const card = page.locator('[data-testid="unit-converter"] section');
  104 |     const plato = card.locator("label").filter({ hasText: "°P" }).locator("input");
  105 |     const points = card.locator("label").filter({ hasText: "GP" }).locator("input");
  106 | 
  107 |     // Дефолтная активная ячейка — Плато: чистим её и проверяем соседей.
  108 |     await plato.click();
  109 |     await plato.press("ControlOrMeta+a");
  110 |     await plato.press("Backspace");
  111 |     await expect(plato).toHaveValue("");
  112 |     await expect(points).toHaveValue("");
  113 |   });
```