import { describe, expect, it } from "vitest";

import { convertBrewingUnitGroup, roundTo } from "@nb/brewing-core";

import {
  calculatorDefinitionBySlug,
  type ArrayCalculatorField,
  type ScalarCalculatorField
} from "../features/calculators/definitions";
import type { IngredientSuggestionItem } from "../features/ingredients/contracts";

// К12/К13 (доводка калькуляторов, волна 2): выбор хмеля/солода из каталога в строках
// IBU/цвета пива — переиспользует IngredientPicker-паттерн строки засыпи brewhouse-efficiency
// (см. calculators-serialize-query.test.ts). Эти тесты проверяют саму подстановку (onPick)
// и то, что calculate() и разбивка вкладов реально используют подставленные значения.

const hopItem = (technicalData: unknown, displayName = "Citra"): IngredientSuggestionItem => ({
  id: "hop-test",
  type: "hop",
  displayName,
  primaryLabelRu: displayName,
  defaultUnit: "g",
  source: "catalog",
  technicalData: technicalData as IngredientSuggestionItem["technicalData"]
});

const maltItem = (technicalData: unknown, displayName = "Пилснер"): IngredientSuggestionItem => ({
  id: "malt-test",
  type: "fermentable",
  displayName,
  primaryLabelRu: displayName,
  defaultUnit: "kg",
  source: "catalog",
  technicalData: technicalData as IngredientSuggestionItem["technicalData"]
});

describe("К12: IBU — выбор хмеля из каталога с автоподстановкой AA", () => {
  const definition = calculatorDefinitionBySlug.ibu;
  const additionsField = definition.fields.find(
    (field): field is ArrayCalculatorField => field.kind === "array" && field.name === "additions"
  );
  const nameField = additionsField?.fields.find(
    (field): field is ScalarCalculatorField => field.name === "name"
  );

  it("строка внесения рендерит IngredientPicker по категории «hop»", () => {
    expect(nameField?.kind).toBe("ingredient");
    expect(nameField?.ingredientCategory).toBe("hop");
  });

  it("onPick подставляет имя и typical AA сорта", () => {
    const updates = nameField!.onPick!(
      hopItem({ type: "hop", alphaAcidPctTypical: 12.3, alphaAcidPctMin: 10, alphaAcidPctMax: 14 }),
      definition.defaults
    );

    expect(Object.fromEntries(updates)).toEqual({ name: "Citra", alphaAcidPercent: 12.3 });
  });

  it("без typical AA — падает на середину диапазона min/max (Б2)", () => {
    const updates = nameField!.onPick!(
      hopItem({ type: "hop", alphaAcidPctMin: 10, alphaAcidPctMax: 14 }, "Mosaic"),
      definition.defaults
    );

    expect(Object.fromEntries(updates)).toEqual({ name: "Mosaic", alphaAcidPercent: 12 });
  });

  it("ручной ввод AA остаётся доступным: calculate() использует то значение, что реально лежит в строке", () => {
    // Подставленное onPick значение (12.3) — обычное значение поля, дальше редактируется
    // как угодно. calculate() не должен ничего пересчитывать из каталога сам — он просто
    // читает alphaAcidPercent строки, будь она из onPick или вписана руками.
    const baseRow = { name: "Citra", amountG: 20, timeMinutes: 60, use: "boil", form: "pellet" };
    const withPickedAa = definition.calculate({ ...definition.defaults, additions: [{ ...baseRow, alphaAcidPercent: 12.3 }] });
    const withManualAa = definition.calculate({ ...definition.defaults, additions: [{ ...baseRow, alphaAcidPercent: 6 }] });

    expect(Number.parseFloat(withPickedAa.primary.value)).toBeGreaterThan(Number.parseFloat(withManualAa.primary.value));
  });
});

describe("К13: цвет пива — выбор солода из каталога", () => {
  const definition = calculatorDefinitionBySlug["beer-color"];
  const fermentablesField = definition.fields.find(
    (field): field is ArrayCalculatorField => field.kind === "array" && field.name === "fermentables"
  );
  const nameField = fermentablesField?.fields.find(
    (field): field is ScalarCalculatorField => field.name === "name"
  );

  it("строка засыпи рендерит IngredientPicker по категории «fermentable»", () => {
    expect(nameField?.kind).toBe("ingredient");
    expect(nameField?.ingredientCategory).toBe("fermentable");
  });

  it("onPick подставляет имя и цвет в EBC, когда выбрана шкала EBC", () => {
    const updates = nameField!.onPick!(
      maltItem({ type: "malt", colorLovibond: 25 }, "Карамельный 60"),
      { ...definition.defaults, colorUnit: "EBC" }
    );
    const expectedEbc = roundTo(convertBrewingUnitGroup("color", 25, "Lovibond").EBC, 1);

    expect(Object.fromEntries(updates)).toEqual({ name: "Карамельный 60", colorLovibond: expectedEbc });
  });

  it("onPick оставляет цвет в °L, когда выбрана шкала Lovibond", () => {
    const updates = nameField!.onPick!(
      maltItem({ type: "malt", colorLovibond: 3.8 }, "Пилснер"),
      { ...definition.defaults, colorUnit: "Lovibond" }
    );

    expect(Object.fromEntries(updates)).toEqual({ name: "Пилснер", colorLovibond: 3.8 });
  });

  it("разбивка вкладов показывает имена выбранных солодов вместо «Солод N»", () => {
    const result = definition.calculate({
      ...definition.defaults,
      colorUnit: "EBC",
      fermentables: [
        { name: "Пилснер", weightKg: 4.5, colorLovibond: 7.5 },
        // Вторая строка без выбора из каталога — прежний фолбэк по номеру строки.
        { weightKg: 0.3, colorLovibond: 210 }
      ]
    });

    expect(result.stats[0]?.label).toBe("Пилснер");
    expect(result.stats[1]?.label).toBe("Солод 2");
  });
});
