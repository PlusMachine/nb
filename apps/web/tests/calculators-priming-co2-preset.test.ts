import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug, type ScalarCalculatorField } from "../features/calculators/definitions";

// Ф2-2 (ревью волны 2 калькуляторов): co2StylePreset (чипсы стиля над "Целевой CO₂" в
// праймере) развязан с targetCo2Volumes — тап подставляет середину диапазона, поле остаётся
// редактируемым, чипс остаётся подсвеченным и после ручной правки. Повторный тап по УЖЕ
// активному чипсу раньше снова прогонял transformOnChange и молча возвращал targetCo2Volumes
// к середине диапазона, затирая ручную правку. Гейт — по равенству nextValue текущему
// state.co2StylePreset (state — снимок ДО применения выбора, см. FieldsBlock в
// calculator-page-client.tsx: onChange(field.name, nextValue) идёт первым, transformOnChange
// вызывается со СТАРЫМ state).
describe("Ф2-2: повторный тап по активному CO₂-чипсу не затирает ручную правку", () => {
  const definition = calculatorDefinitionBySlug["priming-sugar"];
  const co2StyleField = definition.fields.find((field) => field.name === "co2StylePreset") as ScalarCalculatorField;

  it("повторный тап по уже активному чипсу — пустой патч, ручное значение не трогается", () => {
    const state = { ...definition.defaults, co2StylePreset: "lager-pilsner", targetCo2Volumes: 3.1 };

    expect(co2StyleField.transformOnChange!("lager-pilsner", state)).toEqual([]);
  });

  it("тап по другому стилю по-прежнему подставляет его середину диапазона", () => {
    const state = { ...definition.defaults, co2StylePreset: "lager-pilsner", targetCo2Volumes: 3.1 };

    // Хефевайцен: 3.5–4.5 об., середина 4.0.
    expect(co2StyleField.transformOnChange!("hefeweizen", state)).toEqual([["targetCo2Volumes", 4]]);
  });

  it("первый тап (нет ещё активного пресета) подставляет середину диапазона", () => {
    const state = { ...definition.defaults, targetCo2Volumes: 2.4 };

    // Портер/стаут: 1.8–2.3 об., середина 2.05.
    expect(co2StyleField.transformOnChange!("porter-stout", state)).toEqual([["targetCo2Volumes", 2.05]]);
  });
});
