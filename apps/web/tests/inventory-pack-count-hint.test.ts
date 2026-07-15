import { describe, expect, it } from "vitest";

import {
  formatPackCountHintSuffix,
  formatQuantityWithPackCountHint,
  formatQuantityWithPackHintFromTechnicalData
} from "../features/inventory/display";
import type { IngredientTechnicalData } from "../features/ingredients/contracts";

// Ф9 «граммы как факт»: N = ceil(количество / граммовка) — обратное направление
// к формату склада «1 пачка (11 г)» (formatInventoryQuantityForDisplay, не
// меняется). Здесь факт — уже посчитанный вес/объём, скобка — ориентир "сколько
// пачек открыть".

describe("formatQuantityWithPackCountHint — «X г (N пачек)»", () => {
  it("с известной граммовкой добавляет подсказку", () => {
    expect(formatQuantityWithPackCountHint(8.1, "g", { normalizedUnit: "g", normalizedQuantity: 11 }))
      .toBe("8.1 г (1 пачка)");
  });

  it("без граммовки (packEquivalent = null) — голое количество", () => {
    expect(formatQuantityWithPackCountHint(8.1, "g", null)).toBe("8.1 г");
  });

  it("единица не совпадает с packEquivalent.normalizedUnit — подсказки нет", () => {
    expect(formatQuantityWithPackCountHint(35, "ml", { normalizedUnit: "g", normalizedQuantity: 11 }))
      .toBe("35 мл");
  });

  it("округляет число пачек ВВЕРХ (не превращает в дробь)", () => {
    // 8.1 г при пачке 11 г — неполная пачка, но взять придётся целую.
    expect(formatQuantityWithPackCountHint(8.1, "g", { normalizedUnit: "g", normalizedQuantity: 11 }))
      .toBe("8.1 г (1 пачка)");
    // 22 г при пачке 11 г — ровно 2 пачки.
    expect(formatQuantityWithPackCountHint(22, "g", { normalizedUnit: "g", normalizedQuantity: 11 }))
      .toBe("22 г (2 пачки)");
  });

  it("склонение: 1 пачка / 2 пачки / 5 пачек", () => {
    const packOf11g = { normalizedUnit: "g" as const, normalizedQuantity: 11 };
    expect(formatQuantityWithPackCountHint(11, "g", packOf11g)).toBe("11 г (1 пачка)");
    expect(formatQuantityWithPackCountHint(22, "g", packOf11g)).toBe("22 г (2 пачки)");
    expect(formatQuantityWithPackCountHint(55, "g", packOf11g)).toBe("55 г (5 пачек)");
  });

  it("никогда не показывает 0 пачек — минимум 1", () => {
    expect(formatQuantityWithPackCountHint(0.5, "g", { normalizedUnit: "g", normalizedQuantity: 11 }))
      .toBe("0.5 г (1 пачка)");
  });
});

describe("formatPackCountHintSuffix — только суффикс", () => {
  it("возвращает null без известной граммовки", () => {
    expect(formatPackCountHintSuffix(8.1, "g", null)).toBeNull();
  });

  it("возвращает «N пачка/-и/-ок» с известной граммовкой", () => {
    expect(formatPackCountHintSuffix(8.1, "g", { normalizedUnit: "g", normalizedQuantity: 11 })).toBe("1 пачка");
  });
});

describe("formatQuantityWithPackHintFromTechnicalData — обёртка над technicalData", () => {
  const dryYeast: IngredientTechnicalData = { type: "yeast", form: "dry" };
  const liquidYeastNoPackaging: IngredientTechnicalData = { type: "yeast", form: "liquid" };

  it("сухие дрожжи без явной граммовки — фолбэк 11 г", () => {
    expect(formatQuantityWithPackHintFromTechnicalData(8.1, "g", dryYeast)).toBe("8.1 г (1 пачка)");
  });

  it("жидкие дрожжи без фасовки — эквивалента нет, голое количество", () => {
    expect(formatQuantityWithPackHintFromTechnicalData(20, "ml", liquidYeastNoPackaging)).toBe("20 мл");
  });

  it("без technicalData — голое количество", () => {
    expect(formatQuantityWithPackHintFromTechnicalData(8.1, "g", null)).toBe("8.1 г");
  });
});
