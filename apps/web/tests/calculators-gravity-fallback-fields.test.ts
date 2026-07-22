import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug, computeDilutionView } from "../features/calculators/definitions";

// К1 (аудит калькуляторов 2026-07-17): один класс бага в 4 местах — фолбэк пустого поля
// плотности был литералом SG (1.05/1.06 и т.п.), и при шкале °P читался буквально как °P
// (почти вода). Образец фикса — computeAbvView (см. calculators-abv-view.test.ts). Эти тесты
// закрывают оставшиеся три калькулятора: разбавление/уваривание, IBU, эффективность варки.
describe("К1: unit-aware фолбэки пустых полей плотности в шкале Плато", () => {
  it("разбавление/уваривание: пустые currentGravity/targetGravity в шкале Плато — фолбэки 14.7/12.4 °P (не 1.06/1.05 «как °P»)", () => {
    const withEmptyFields = computeDilutionView({
      mode: "dilute_to_gravity",
      gravityUnit: "Plato",
      currentGravity: "",
      targetGravity: ""
    });
    const withExplicitPlatoDefaults = computeDilutionView({
      mode: "dilute_to_gravity",
      gravityUnit: "Plato",
      currentGravity: 14.7,
      targetGravity: 12.4
    });

    // Целевая плотность (по факту разбавления) выходит около 1.05 SG — а не ~1.004,
    // как было бы при буквальном чтении литерала 1.05 в шкале °P.
    expect(withEmptyFields.resultingGravitySg).toBeCloseTo(1.05, 2);
    expect(withEmptyFields.resultingGravitySg).toBeCloseTo(withExplicitPlatoDefaults.resultingGravitySg, 4);
    expect(withEmptyFields.waterToAddL).toBeCloseTo(withExplicitPlatoDefaults.waterToAddL, 3);
  });

  it("IBU: пустая wortGravity в шкале Плато — фолбэк 12.4 °P, не завышает IBU через 1.05 «как °P»", () => {
    const definition = calculatorDefinitionBySlug.ibu;

    const withEmptyGravity = definition.calculate({ ...definition.defaults, gravityUnit: "Plato", wortGravity: "" });
    const withExplicitPlatoDefault = definition.calculate({ ...definition.defaults, gravityUnit: "Plato", wortGravity: 12.4 });

    expect(withEmptyGravity.primary.value).toBe(withExplicitPlatoDefault.primary.value);
  });

  it("эффективность варки: пустая measuredOg в шкале Плато — фолбэк 12.4 °P, не «~0%» через 1.05 «как °P»", () => {
    const definition = calculatorDefinitionBySlug["brewhouse-efficiency"];

    const withEmptyGravity = definition.calculate({ ...definition.defaults, mode: "measure", gravityUnit: "Plato", measuredOg: "" });
    const withExplicitPlatoDefault = definition.calculate({ ...definition.defaults, mode: "measure", gravityUnit: "Plato", measuredOg: 12.4 });

    expect(withEmptyGravity.primary.value).toBe(withExplicitPlatoDefault.primary.value);
    // Ложное «invalidEfficiency» (result.primary.value === "—") подставлялось из-за
    // measuredOg ≈ 1.004 SG (НП ниже потенциала засыпи — эффективность уходит в 0/отрицательную).
    expect(withEmptyGravity.primary.value).not.toBe("—");
  });

  // Ф-1 (фикс-раунд волны 1): фолбэк пустой "Плотности сусла" был литералом 1.05 (SG), а
  // дефолтная шкала калькулятора — Plato: 1.05, прочитанный как °P, давал почти воду и раздувал
  // добавку сусла до ~19.71 л на 20 л вместо ~1.6 л.
  it("шпайзе/краузен: пустая speiseGravity в шкале Плато — фолбэк 12.4 °P, добавка сусла в разумных пределах", () => {
    const definition = calculatorDefinitionBySlug["speise-krausen"];

    const withEmptyGravity = definition.calculate({ ...definition.defaults, gravityUnit: "Plato", speiseGravity: "" });
    const withExplicitPlatoDefault = definition.calculate({ ...definition.defaults, gravityUnit: "Plato", speiseGravity: 12.4 });

    expect(withEmptyGravity.primary.value).toBe(withExplicitPlatoDefault.primary.value);
    const addedLiters = Number.parseFloat(withEmptyGravity.primary.value);
    expect(addedLiters).toBeGreaterThan(1);
    expect(addedLiters).toBeLessThan(3);
  });

  // Ф-2 (фикс-раунд волны 1): тот же класс бага в yeast-starter — пустая gravity в шкале Плато
  // читалась как 1.05 SG (буквально ~1 SG «как °P»), занижая требуемое число клеток вчетверо.
  it("стартер дрожжей: пустая gravity в шкале Плато — фолбэк 12.4 °P, требуемые клетки ~186 млрд на 20 л, не «Перебор»", () => {
    const definition = calculatorDefinitionBySlug["yeast-starter"];

    const withEmptyGravity = definition.calculate({ ...definition.defaults, gravityUnit: "Plato", gravity: "" });
    const withExplicitPlatoDefault = definition.calculate({ ...definition.defaults, gravityUnit: "Plato", gravity: 12.4 });

    expect(withEmptyGravity.primary.value).toBe(withExplicitPlatoDefault.primary.value);
    const requiredCells = withEmptyGravity.stats.find((stat) => stat.label === "Нужно клеток");
    expect(requiredCells).toBeDefined();
    expect(Number.parseFloat(requiredCells!.value)).toBeCloseTo(186, -1);
    expect(withEmptyGravity.primary.value).not.toBe("Перебор");
  });
});
