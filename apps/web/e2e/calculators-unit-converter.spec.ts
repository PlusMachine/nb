import { expect, test } from "@playwright/test";

// Регресс на «конвертер занимает только половину экрана на широких разрешениях,
// вкладки без пиктограмм» — audit 2026-07-01. Разрешения см. в playwright.config.ts.
const GROUPS = ["Плотность", "Цвет", "Объём", "Вес", "Температура", "Давление", "Концентрация"];

test.describe("Конвертер единиц пивовара", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calculators/unit-converter");
  });

  test("не выходит за ширину вьюпорта (нет horizontal overflow)", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("переключение вкладки группы меняет активную карточку без дублей", async ({ page }) => {
    for (const group of GROUPS) {
      await page.getByRole("tab", { name: group }).click();
      await expect(page.getByRole("tab", { name: group })).toHaveAttribute("aria-selected", "true");

      // Среди всех h2 на странице (есть ещё заголовок блока "Дальше") ровно один
      // совпадает с именем группы — предыдущая группа не должна оставаться отрендеренной рядом.
      const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
      const matchingGroupHeadings = headings.filter((text) => GROUPS.includes(text));
      expect(matchingGroupHeadings).toEqual([group]);
    }
  });

  test("каждая единица группы — рабочее поле ввода со своим значением", async ({ page }) => {
    await page.getByRole("tab", { name: "Объём" }).click();
    const card = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Объём" }) });

    await expect(card.getByLabel("мл", { exact: true })).toHaveValue("20000");
    await expect(card.getByLabel("л", { exact: true })).toHaveValue("20");

    await card.getByLabel("л", { exact: true }).fill("10");
    await expect(card.getByLabel("мл", { exact: true })).toHaveValue("10000");
  });

  test("на lg+ экранах конвертер использует доступную ширину контейнера, а не половину", async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width < 1024, "Проверка актуальна только для sidebar-раскладки (lg+)");

    // PublicShell рендерит свой <main>, а CalculatorPageClient — свой вложенный: нужен внутренний.
    const containerBox = await page.locator("main").last().boundingBox();
    expect(containerBox).not.toBeNull();

    const blockBox = await page.getByTestId("unit-converter").boundingBox();
    expect(blockBox).not.toBeNull();

    // До фикса блок был жёстко ограничен max-w-2xl (~672px) независимо от ширины контейнера —
    // здесь фиксируем, что он занимает большую часть доступной ширины `<main>`.
    expect(blockBox!.width).toBeGreaterThan(containerBox!.width * 0.85);
  });

  test("на узких экранах вкладки идут горизонтальным рядом, а не боковой колонкой", async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 1024, "Проверка актуальна для мобильной/планшетной раскладки");

    const firstTabBox = await page.getByRole("tab", { name: "Плотность" }).boundingBox();
    const secondTabBox = await page.getByRole("tab", { name: "Цвет" }).boundingBox();
    expect(firstTabBox).not.toBeNull();
    expect(secondTabBox).not.toBeNull();

    // В горизонтальном ряду соседние вкладки лежат примерно на одной высоте.
    expect(Math.abs(firstTabBox!.y - secondTabBox!.y)).toBeLessThan(firstTabBox!.height);
  });

  test("у каждой вкладки группы есть иконка", async ({ page }) => {
    for (const group of GROUPS) {
      const tab = page.getByRole("tab", { name: group });
      const iconCount = await tab.locator("svg").count();
      expect(iconCount).toBeGreaterThan(0);
    }
  });
});
