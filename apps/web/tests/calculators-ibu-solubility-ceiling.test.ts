import { describe, expect, it } from "vitest";

import { calculatorDefinitionBySlug } from "../features/calculators/definitions";

// К19 (аудит калькуляторов 2026-07-17): выше ~100 IBU модель Тинсета продолжает линейно
// расти, а растворимость изо-альфа-кислот в реальном сусле ограничена — утилизация выходит
// на плато, и ощущаемая горечь ниже расчётной. Калькулятор должен предупреждать об этом,
// а не молча выдавать оптимистичное число.
describe("К19: предупреждение о потолке модели IBU (~100)", () => {
  const definition = calculatorDefinitionBySlug.ibu;

  it("сумма выше ~100 IBU показывает предупреждение о пределе растворимости", () => {
    const result = definition.calculate({
      ...definition.defaults,
      postBoilVolumeL: 20,
      gravityUnit: "SG",
      wortGravity: 1.06,
      additions: [
        { name: "Warrior", amountG: 80, alphaAcidPercent: 16, timeMinutes: 60, use: "boil", form: "pellet" }
      ]
    });

    expect(Number(result.primary.value)).toBeGreaterThan(100);
    const warnings = result.warnings ?? [];
    expect(warnings.some((warning) => typeof warning !== "string" && warning.text.includes("растворимость"))).toBe(true);
  });

  it("сумма не выше ~100 IBU — без предупреждения о пределе растворимости", () => {
    const result = definition.calculate({
      ...definition.defaults,
      postBoilVolumeL: 20,
      gravityUnit: "SG",
      wortGravity: 1.06,
      additions: [
        { name: "Citra", amountG: 20, alphaAcidPercent: 12, timeMinutes: 60, use: "boil", form: "pellet" }
      ]
    });

    expect(Number(result.primary.value)).toBeLessThan(100);
    const warnings = result.warnings ?? [];
    expect(warnings.some((warning) => typeof warning !== "string" && warning.text.includes("растворимость"))).toBe(false);
  });
});
