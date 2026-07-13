import { describe, expect, it } from "vitest";

import type { LabelSlots } from "../features/labels/contracts";
import {
  labelFieldsFromSlots,
  mergeRecipeFields,
  recipeFieldsFromSlots,
  type LabelRecipeFields
} from "../features/labels/recipe-fields";
import { buildCustomLabelSlots } from "../features/labels/slots";

const recipeSlots = (overrides: Partial<LabelSlots> = {}): LabelSlots => ({
  title: "Мой APA",
  styleName: "American Pale Ale",
  abvText: "~5.2%",
  ibu: 38,
  ebc: 12,
  ogText: "12.8",
  fgText: "2.6",
  gravityUnitText: "°P",
  hops: ["Citra", "Mosaic"],
  malts: ["Pale Ale 80%", "Munich 20%"],
  yeast: "US-05",
  volumeText: null,
  batchText: null,
  authorName: "Артём",
  bottlingDateText: null,
  qrUrl: "https://nb.example/beer/moy-apa",
  description: "Хмелевой и питкий.",
  showLogo: true,
  showIbuScale: true,
  brandText: "BREWED WITH NB",
  ...overrides
});

/** Заготовка ручного режима — то, с чего форма /labels начинается. */
const manualDefaults = labelFieldsFromSlots(buildCustomLabelSlots({ gravityUnit: "plato" }));

describe("данные рецепта → поля студии", () => {
  it("списки склеиваются разделителем формы, числа становятся строками", () => {
    const fields = recipeFieldsFromSlots(recipeSlots());
    expect(fields.title).toBe("Мой APA");
    expect(fields.malts).toBe("Pale Ale 80%, Munich 20%");
    expect(fields.hops).toBe("Citra, Mosaic");
    expect(fields.ibu).toBe("38");
    expect(fields.og).toBe("12.8");
  });

  it("рецепт не приносит объём тары, номер партии и марку: их знает только пивовар", () => {
    const fields = recipeFieldsFromSlots(recipeSlots());
    expect(fields).not.toHaveProperty("volume");
    expect(fields).not.toHaveProperty("batch");
    expect(fields).not.toHaveProperty("brand");
  });
});

describe("заполнение полей из рецепта поверх набранного руками", () => {
  const incoming: LabelRecipeFields = recipeFieldsFromSlots(recipeSlots());

  it("«заменить всё»: поля рецепта вытесняют ручной ввод", () => {
    const current = { ...manualDefaults, title: "Гаражный портер", ibu: "70", volume: "0,5 л" };
    const merged = mergeRecipeFields({ current, incoming, defaults: manualDefaults, mode: "replace" });
    expect(merged.title).toBe("Мой APA");
    expect(merged.ibu).toBe("38");
    // Объём тары рецепт не знает — ручное значение остаётся на месте.
    expect(merged.volume).toBe("0,5 л");
  });

  it("«заменить всё»: пустое поле рецепта очищает поле формы (блок не печатается)", () => {
    const current = { ...manualDefaults, style: "Портер" };
    const noStyle = recipeFieldsFromSlots(recipeSlots({ styleName: null }));
    const merged = mergeRecipeFields({ current, incoming: noStyle, defaults: manualDefaults, mode: "replace" });
    expect(merged.style).toBe("");
  });

  it("«только пустые»: ручной ввод неприкосновенен, пустые — заполняются", () => {
    const current = { ...manualDefaults, ibu: "70", yeast: "Свои дрожжи из осадка" };
    const merged = mergeRecipeFields({ current, incoming, defaults: manualDefaults, mode: "keep-mine" });
    // Человек знает лучше автомата: его числа и тексты не трогаем.
    expect(merged.ibu).toBe("70");
    expect(merged.yeast).toBe("Свои дрожжи из осадка");
    // А пустые поля — заполняем.
    expect(merged.hops).toBe("Citra, Mosaic");
    expect(merged.abv).toBe("~5.2%");
  });

  it("«только пустые»: заготовка студии считается нетронутой, а не ручным вводом", () => {
    // Ловушка: название в ручном режиме предзаполнено («Моё пиво»). Считать его
    // введённым вручную значило бы напечатать «Моё пиво» вместо имени рецепта.
    expect(manualDefaults.title).not.toBe("");
    const merged = mergeRecipeFields({
      current: { ...manualDefaults },
      incoming,
      defaults: manualDefaults,
      mode: "keep-mine"
    });
    expect(merged.title).toBe("Мой APA");
  });

  it("«только пустые»: пустое поле рецепта не стирает то, что набрал человек", () => {
    const current = { ...manualDefaults, description: "Варил на даче" };
    const noDescription = recipeFieldsFromSlots(recipeSlots({ description: null }));
    const merged = mergeRecipeFields({
      current,
      incoming: noDescription,
      defaults: manualDefaults,
      mode: "keep-mine"
    });
    expect(merged.description).toBe("Варил на даче");
  });
});
