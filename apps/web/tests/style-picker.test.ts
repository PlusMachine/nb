import { describe, expect, it } from "vitest";

import { defaultActiveIndex, nextComboboxIndex, resolveStyleSelection } from "../components/recipes/recipe-designer/style-picker";

// Radix Popover рендерится через Portal — в vitest-окружении "node" содержимое
// не появляется (см. tests/consume-preview-dialog.test.tsx), поэтому клавиатурную
// combobox-логику StylePicker тестируем на вынесенных чистых функциях, а не через рендер.
describe("StylePicker — combobox-навигация (чистая логика)", () => {
  it("ArrowDown двигает индекс вперёд с clamp по длине списка", () => {
    expect(nextComboboxIndex(0, "ArrowDown", 5)).toBe(1);
    expect(nextComboboxIndex(4, "ArrowDown", 5)).toBe(4); // упёрлись в конец
  });

  it("ArrowUp двигает индекс назад с clamp по нулю", () => {
    expect(nextComboboxIndex(2, "ArrowUp", 5)).toBe(1);
    expect(nextComboboxIndex(0, "ArrowUp", 5)).toBe(0); // упёрлись в начало
  });

  it("пустой список — индекс всегда 0", () => {
    expect(nextComboboxIndex(0, "ArrowDown", 0)).toBe(0);
  });

  it("Enter на индексе 0 выбирает «вне BJCP стиля» (null)", () => {
    expect(resolveStyleSelection(0, ["style-a", "style-b", "style-c"])).toBeNull();
  });

  it("Enter на индексе N выбирает N-й найденный стиль (второй результат = индекс 2)", () => {
    const styleIds = ["style-a", "style-b", "style-c"];
    expect(resolveStyleSelection(1, styleIds)).toBe("style-a");
    expect(resolveStyleSelection(2, styleIds)).toBe("style-b");
  });

  it("индекс за пределами списка — undefined (не выбираем ничего)", () => {
    expect(resolveStyleSelection(4, ["style-a", "style-b", "style-c"])).toBeUndefined();
  });

  it("Enter сразу после ввода непустого запроса выбирает первый найденный стиль, а не «вне стиля»", () => {
    // Пользователь напечатал «Imperial Stout» и жмёт Enter, не трогая стрелки:
    // дефолтный активный индекс должен указывать на первый результат (1), не на 0.
    expect(defaultActiveIndex("Imperial Stout", 3)).toBe(1);
    expect(resolveStyleSelection(defaultActiveIndex("Imperial Stout", 3), ["style-a", "style-b", "style-c"])).toBe(
      "style-a"
    );
  });

  it("при пустом запросе дефолтный активный индекс — «вне BJCP стиля» (0)", () => {
    expect(defaultActiveIndex("", 5)).toBe(0);
  });

  it("непустой запрос без результатов — дефолт тоже 0 (нечего выбирать первым)", () => {
    expect(defaultActiveIndex("zzzнесуществующий", 0)).toBe(0);
  });
});
