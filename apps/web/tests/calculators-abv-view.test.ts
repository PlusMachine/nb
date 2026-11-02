import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug, computeAbvView } from "../features/calculators/definitions";
import { buildCalculatorResultOgView } from "../features/og/calculator";

describe("ABV: плотности в результате и превью остаются в выбранной шкале", () => {
  const definition = calculatorDefinitionBySlug["abv-attenuation"];

  it("по умолчанию OG/FG выводятся в °P, включая превью ссылки", () => {
    const result = definition.calculate(definition.defaults);
    const card = buildCalculatorResultOgView(definition.catalog, result, { domain: "local.test", wordmark: "NB" });
    expect(result.stats.find(stat => stat.label === "OG / FG")?.value).toBe("12.4 / 3.1 °P");
    expect(card.stats?.find(stat => stat.label === "OG / FG")?.value).toBe("12.4 / 3.1 °P");
  });

  it("явно выбранный SG не переопределяется", () => {
    const result = definition.calculate({ ...definition.defaults, gravityUnit: "SG", og: 1.05, fg: 1.012 });
    expect(result.stats.find(stat => stat.label === "OG / FG")?.value).toBe("1.050 / 1.012 SG");
  });

  it("пустое значение сохраняет шкалу оставшегося замера", () => {
    const result = definition.calculate({ ...definition.defaults, og: "" });
    expect(result.stats.find(stat => stat.label === "OG / FG")?.value).toBe("— / 3.1 °P");
  });

  it("граница в предупреждении по умолчанию тоже начинается с °P", () => {
    const result = definition.calculate({ ...definition.defaults, og: 0, fg: 0 });
    expect(result.warnings).toContain("Начальная плотность должна быть выше 0.0 °P (1.000 SG) — проверьте замер.");
  });
});

// Граничные случаи панели ABV (аудит 2026-07-10): OG ≤ 1.000 давал NaN/Infinity
// в сбраживании и отрицательные калории, а фолбэки пустых полей были захардкожены
// в SG (1.05, прочитанное как °P, — почти вода → ложное «FG выше OG»).
describe("computeAbvView: граничные случаи", () => {
  it("OG = 1.000 (SG) — флаг ogTooLow, нули вместо NaN/Infinity", () => {
    const view = computeAbvView({ og: 1.0, fg: 1.0, gravityUnit: "SG" });

    expect(view.ogTooLow).toBe(true);
    expect(view.attenuation).toBe(0);
    expect(view.attenuationBand).toBeNull();
    expect(view.abv).toBe(0);
    expect(view.calories).toBe(0);
  });

  it("OG = 0 °P — тот же гвард в шкале Плато", () => {
    const view = computeAbvView({ og: 0, fg: 0, gravityUnit: "Plato" });

    expect(view.ogTooLow).toBe(true);
    expect(Number.isFinite(view.attenuation)).toBe(true);
  });

  it.each(["SG", "Plato"])("пустая НП в %s останавливает расчёт без подстановки примера", (gravityUnit) => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    const state = { ...definition.defaults, og: "", fg: gravityUnit === "SG" ? 1.012 : 3.1, gravityUnit };
    const view = computeAbvView(state);
    const result = definition.calculate(state);

    expect(view.missingOg).toBe(true);
    expect(view.inputError).toBe("Укажите начальную плотность (OG).");
    expect(view.attenuationBand).toBeNull();
    expect(result.primary.value).toBe("—");
    expect(result.stats[0].value).toBe("—");
    expect(result.stats[1].value).toBe("—");
    expect(result.stats[2].value).toMatch(/^— \/ /);
    expect(result.warnings).toContain(view.inputError);
  });

  it("отсутствующие поля и пустая КП не дают расчёт от значений примера", () => {
    const view = computeAbvView({ gravityUnit: "SG" });
    expect(view.missingOg).toBe(true);
    expect(view.missingFg).toBe(true);
    expect(view.inputError).not.toBeNull();

    const noFg = computeAbvView({ og: 1.05, fg: " ", gravityUnit: "SG" });
    expect(noFg.missingFg).toBe(true);
    expect(noFg.inputError).toBe("Укажите конечную плотность (FG).");
  });

  it.each([
    { gravityUnit: "Plato", og: "13,0", fg: "3,1", dotOg: "13.0", dotFg: "3.1" },
    { gravityUnit: "SG", og: "1,053", fg: "1,012", dotOg: "1.053", dotFg: "1.012" }
  ])("запятая сразу учитывается в НП и КП: $gravityUnit", ({ gravityUnit, og, fg, dotOg, dotFg }) => {
    const comma = computeAbvView({ og, fg, gravityUnit });
    const dot = computeAbvView({ og: dotOg, fg: dotFg, gravityUnit });
    expect(comma).toEqual(dot);
    expect(comma.inputError).toBeNull();
    expect(comma.abv).toBeGreaterThan(5);
  });

  it("заполненные значения примера продолжают давать прежний результат", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    const view = computeAbvView(definition.defaults);
    expect(view.inputError).toBeNull();
    expect(view.abv).toBeCloseTo(5, 1);
  });

  it("нечисловая НП не подменяется примером", () => {
    const definition = calculatorDefinitionBySlug["abv-attenuation"];
    expect(definition.calculate({ ...definition.defaults, og: "abc" }).primary.value).toBe("—");
  });

  it("FG ниже 1.000 (сухое крепкое) считается корректно", () => {
    const view = computeAbvView({ og: 1.06, fg: 0.998, gravityUnit: "SG" });

    expect(view.ogTooLow).toBe(false);
    expect(view.fgAboveOg).toBe(false);
    expect(view.abv).toBeCloseTo(8.14, 1);
    expect(view.attenuation).toBeGreaterThan(100);
    expect(view.attenuationBand).toBe("high");
  });

  it("FG > OG — предупреждение, полосы сбраживания нет", () => {
    const view = computeAbvView({ og: 1.01, fg: 1.05, gravityUnit: "SG" });

    expect(view.fgAboveOg).toBe(true);
    expect(view.attenuationBand).toBeNull();
  });
});
