import { sgToPlato } from "@nb/brewing-core";
import { describe, expect, it } from "vitest";

import { axisTimeLabels, gravityBounds, MIN_SPAN_SG } from "./chart-scale";

// =============================================================================
//  Юнит-тесты chart-scale — автоскейл оси плотности + дедуп подписей оси X
//  (§П2). Без БД, чистое ядро.
// =============================================================================

describe("gravityBounds", () => {
  it("одна точка около 1.0075 SG — домен узкий, нижняя граница не даёт отрицательных °P", () => {
    const bounds = gravityBounds([1.0075], { min: 0.99, max: 1.06 });
    expect(bounds.max - bounds.min).toBeLessThan(0.02);
    expect(bounds.min).toBeGreaterThanOrEqual(1.0);
    expect(sgToPlato(bounds.min)).toBeGreaterThanOrEqual(0);
  });

  it("две близкие точки — домен расширяется до MIN_SPAN_SG, не схлопывается", () => {
    const bounds = gravityBounds([1.0102, 1.0104], { min: 0.99, max: 1.06 });
    expect(bounds.max - bounds.min).toBeGreaterThanOrEqual(MIN_SPAN_SG);
    expect(bounds.min).toBeLessThanOrEqual(1.0102);
    expect(bounds.max).toBeGreaterThanOrEqual(1.0104);
  });

  it("длинная серия (span >= MIN_SPAN_SG) — результат идентичен старой формуле (регресс-гарантия)", () => {
    const values = [1.06, 1.05, 1.03, 1.012, 1.0];
    const bounds = gravityBounds(values, { min: 0.99, max: 1.06 });
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.1;
    expect(bounds).toEqual({ min: min - pad, max: max + pad });
  });

  it("точка ниже 1.000 SG (сильно выброженное пиво) остаётся внутри домена", () => {
    const bounds = gravityBounds([0.998], { min: 0.99, max: 1.06 });
    expect(bounds.min).toBeLessThanOrEqual(0.998);
    expect(bounds.max).toBeGreaterThanOrEqual(0.998);
  });

  it("нет значений — фолбэк как есть", () => {
    expect(gravityBounds([], { min: 0.99, max: 1.06 })).toEqual({ min: 0.99, max: 1.06 });
  });
});

describe("axisTimeLabels", () => {
  it("одинаковые подписи краёв — одна центрированная подпись", () => {
    expect(axisTimeLabels("14:05", "14:05")).toEqual({ mode: "single", label: "14:05" });
  });

  it("разные подписи краёв — обе подписи по краям", () => {
    expect(axisTimeLabels("10.07", "14.07")).toEqual({ mode: "range", start: "10.07", end: "14.07" });
  });
});
