import { describe, expect, it } from "vitest";
import { gravityToSg } from "@nb/brewing-core";

import { calculatorDefinitionBySlug, computeAbvView, computeHydrometerView, computeRefractometerView, initialCalculatorStateFromQuery, serializeCalculatorStateToQuery } from "@/features/calculators/definitions";
import { switchCalculatorGravityUnit, updateCalculatorInput } from "@/features/calculators/gravity-inputs";

const abv = calculatorDefinitionBySlug["abv-attenuation"];
const measurement = () => ({ ...abv.defaults, gravityUnit: "Plato", og: "13,0", fg: "3,1" });

describe("исходные измерения и отображение плотности", () => {
  it("многократная смена °P/SG сохраняет ABV, калории, сбраживание и исходный ввод", () => {
    let state = measurement();
    const before = computeAbvView(state);
    for (let i = 0; i < 20; i++) {
      state = switchCalculatorGravityUnit("abv-attenuation", state, "SG") as typeof state;
      expect(state.og).toBe("1.053");
      expect(computeAbvView(state)).toEqual(before);
      state = switchCalculatorGravityUnit("abv-attenuation", state, "Plato") as typeof state;
      expect(state.og).toBe("13,0");
      expect(state.fg).toBe("3,1");
      expect(computeAbvView(state)).toEqual(before);
    }
  });

  it("редактирование FG в SG сохраняет исходную OG в °P", () => {
    let state = switchCalculatorGravityUnit("abv-attenuation", measurement(), "SG");
    state = updateCalculatorInput("abv-attenuation", state, "fg", "1.010");
    const result = computeAbvView(state);
    expect(result.ogSg).toBe(gravityToSg(13, "Plato"));
    expect(result.fgSg).toBe(1.01);
    state = switchCalculatorGravityUnit("abv-attenuation", state, "Plato");
    expect(computeAbvView(state)).toEqual(result);
  });

  it("нормализация поля при blur не превращает округлённое отображение в новый замер", () => {
    const initial = measurement();
    let state = switchCalculatorGravityUnit("abv-attenuation", initial, "SG");
    state = updateCalculatorInput("abv-attenuation", state, "fg", "1.012");
    expect(computeAbvView(state)).toEqual(computeAbvView(initial));
    state = updateCalculatorInput("abv-attenuation", state, "og", "");
    expect(computeAbvView(state).missingOg).toBe(true);
  });

  it("сохранение и ссылка на расчёт сохраняют точный результат в выбранной шкале", () => {
    const state = switchCalculatorGravityUnit("abv-attenuation", measurement(), "SG");
    const expected = computeAbvView(state);
    const stored = JSON.parse(JSON.stringify(state));
    expect(computeAbvView(initialCalculatorStateFromQuery(abv, {}, stored))).toEqual(expected);
    const query = Object.fromEntries(serializeCalculatorStateToQuery(abv, state));
    const restored = initialCalculatorStateFromQuery(abv, query);
    expect(restored.gravityUnit).toBe("SG");
    expect(computeAbvView(restored)).toEqual(expected);
  });

  it("обычная новая ссылка заменяет старые сохранённые источники, битые метаданные игнорируются", () => {
    const stored = switchCalculatorGravityUnit("abv-attenuation", measurement(), "SG");
    const state = initialCalculatorStateFromQuery(abv, { og: "1.060", fg: "1.010", gravityUnit: "SG", _gravity: "broken" }, stored);
    expect(computeAbvView(state).ogSg).toBe(1.06);
    expect(computeAbvView(state).fgSg).toBe(1.01);
  });

  it("частичная ссылка заменяет только явно переданный замер", () => {
    const original = measurement();
    const stored = switchCalculatorGravityUnit("abv-attenuation", original, "SG");
    const changedServing = initialCalculatorStateFromQuery(abv, { servingSizeMl: "500" }, stored);
    expect(computeAbvView(changedServing).ogSg).toBe(computeAbvView(original).ogSg);
    const changedFg = initialCalculatorStateFromQuery(abv, { fg: "1.010" }, stored);
    expect(computeAbvView(changedFg).ogSg).toBe(computeAbvView(original).ogSg);
    expect(computeAbvView(changedFg).fgSg).toBe(1.01);
  });

  it("старые состояния без метаданных получают источник при первом переключении", () => {
    const legacy = abv.migrateStoredState!({ og: 1.053, fg: 1.012 });
    const state = { ...abv.defaults, ...legacy };
    expect(computeAbvView(switchCalculatorGravityUnit("abv-attenuation", state, "Plato"))).toEqual(computeAbvView(state));
  });

  it("сырые °Bx рефрактометра сохраняются вместе со смыслом WCF при смене шкалы", () => {
    const definition = calculatorDefinitionBySlug["refractometer-correction"];
    let state = { ...definition.defaults, originalUnit: "Brix", originalValue: "13.0", wortCorrectionFactor: "1.04" };
    const before = computeRefractometerView(state);
    for (const unit of ["SG", "Plato", "Brix"] as const) {
      state = switchCalculatorGravityUnit("refractometer-correction", state, unit) as typeof state;
      const next = computeRefractometerView(state);
      expect(next.estimatedABV).toBe(before.estimatedABV);
      expect(next.ogSg).toBe(before.ogSg);
      expect(next.corrected).toEqual(before.corrected);
    }
    state = switchCalculatorGravityUnit("refractometer-correction", state, "SG") as typeof state;
    state = updateCalculatorInput("refractometer-correction", state, "wortCorrectionFactor", "1.10") as typeof state;
    expect(computeRefractometerView(state).ogSg).toBe(computeRefractometerView({ ...definition.defaults, originalUnit: "Brix", originalValue: "13.0", wortCorrectionFactor: "1.10" }).ogSg);
  });

  it("показание ареометра и поправка прибора не округляются при смене шкалы", () => {
    const definition = calculatorDefinitionBySlug["hydrometer-correction"];
    let state = { ...definition.defaults, readingUnit: "Plato", reading: "13.0", offset: "0.51" };
    const expected = computeHydrometerView(state).correctedSg;
    for (const unit of ["SG", "Plato", "Brix"] as const) {
      state = switchCalculatorGravityUnit("hydrometer-correction", state, unit) as typeof state;
      expect(computeHydrometerView(state).correctedSg).toBe(expected);
    }
  });
});
