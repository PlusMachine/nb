import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug, type ScalarCalculatorField } from "../features/calculators/definitions";

// beer-color: смена шкалы цвета (EBC ↔ °L) раньше не пересчитывала введённый цвет солода —
// modeHint честно предупреждал об этом. Теперь colorUnit несёт transformOnChange (по образцу
// gravityScaleField) — эти тесты проверяют сам пересчёт строк засыпи.
describe("beer-color: пересчёт цвета солода при смене шкалы", () => {
  const definition = calculatorDefinitionBySlug["beer-color"];
  const colorUnitField = definition.fields.find(
    (field): field is ScalarCalculatorField => field.kind !== "array" && field.name === "colorUnit"
  );

  it("определяет transformOnChange на поле colorUnit", () => {
    expect(colorUnitField?.transformOnChange).toBeTypeOf("function");
  });

  it("EBC → °L конвертирует цвет во всех строках засыпи", () => {
    const state = {
      colorUnit: "EBC",
      fermentables: [
        { weightKg: 4.5, colorLovibond: "3.8" },
        { weightKg: 0.3, colorLovibond: "105.2" }
      ]
    };

    const [[name, value]] = colorUnitField!.transformOnChange!("Lovibond", state);

    expect(name).toBe("fermentables");
    const rows = value as Array<{ weightKg: number; colorLovibond: string }>;
    // EBC↔Lovibond идёт через SRM (см. convertBrewingUnitGroup в @nb/brewing-core):
    // SRM = EBC / 1.97, Lovibond = (SRM + 0.76) / 1.3546.
    expect(Number(rows[0].colorLovibond)).toBeCloseTo(2.05, 1);
    expect(Number(rows[1].colorLovibond)).toBeCloseTo(40, 0);
    // Вес — не поле цвета, не должен трогаться трансформером.
    expect(rows[0].weightKg).toBe(4.5);
    expect(rows[1].weightKg).toBe(0.3);
  });

  it("°L → EBC — обратная конверсия", () => {
    const state = {
      colorUnit: "Lovibond",
      fermentables: [{ weightKg: 4.5, colorLovibond: "2.1" }]
    };

    const [[, value]] = colorUnitField!.transformOnChange!("EBC", state);
    const rows = value as Array<{ colorLovibond: string }>;
    expect(Number(rows[0].colorLovibond)).toBeCloseTo(3.9, 0);
  });

  it("не трогает шкалу, если она не изменилась", () => {
    const state = {
      colorUnit: "EBC",
      fermentables: [{ weightKg: 4.5, colorLovibond: "3.8" }]
    };

    expect(colorUnitField!.transformOnChange!("EBC", state)).toEqual([]);
  });

  it("пустые и нераспаршенные значения остаются как есть", () => {
    const state = {
      colorUnit: "EBC",
      fermentables: [
        { weightKg: 4.5, colorLovibond: "" },
        { weightKg: 0.3, colorLovibond: "не число" }
      ]
    };

    const [[, value]] = colorUnitField!.transformOnChange!("Lovibond", state);
    const rows = value as Array<{ colorLovibond: string }>;
    expect(rows[0].colorLovibond).toBe("");
    expect(rows[1].colorLovibond).toBe("не число");
  });

  it("modeHint больше не предупреждает, что цвет не пересчитывается (property убрана)", () => {
    expect(definition.modeHint).toBeUndefined();
  });
});
