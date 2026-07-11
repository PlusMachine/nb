import { describe, expect, it } from "vitest";

import { computeAbvView } from "../features/calculators/definitions";

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

  it("пустой OG в шкале Плато — фолбэк 12.4 °P, а не 1.05 «как °P»", () => {
    const view = computeAbvView({ og: "", fg: 3.1, gravityUnit: "Plato" });

    expect(view.ogSg).toBeCloseTo(1.05, 3);
    expect(view.fgAboveOg).toBe(false);
    expect(view.ogTooLow).toBe(false);
  });

  it("пустые поля в SG — прежние фолбэки 1.050/1.012", () => {
    const view = computeAbvView({ gravityUnit: "SG" });

    expect(view.ogSg).toBeCloseTo(1.05, 3);
    expect(view.fgSg).toBeCloseTo(1.012, 3);
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
