import { describe, expect, it } from "vitest";

import type { IngredientTechnicalData } from "../features/ingredients/contracts";
import {
  convertInventoryNormalizedToUnit,
  convertQuantityToInventoryNormalizedUnit,
  resolveInventoryItemPackEquivalent,
  resolveInventoryPackEquivalent
} from "../features/inventory/pack";

const dryYeast: IngredientTechnicalData = { type: "yeast", form: "dry" };
const liquidYeast: IngredientTechnicalData = { type: "yeast", form: "liquid" };

describe("эквивалент пачки складской позиции", () => {
  it("сухие дрожжи без package_size в каталоге — фолбэк 11 г", () => {
    expect(resolveInventoryPackEquivalent(dryYeast)).toEqual({ normalizedUnit: "g", normalizedQuantity: 11 });
  });

  it("package_size из каталога бьёт фолбэк", () => {
    expect(resolveInventoryPackEquivalent({ type: "yeast", form: "dry", packageSize: 15, packageUnit: "g" }))
      .toEqual({ normalizedUnit: "g", normalizedQuantity: 15 });
  });

  it("жидкие дрожжи: пачка = объём", () => {
    expect(resolveInventoryPackEquivalent({ type: "yeast", form: "liquid", packageSize: 35, packageUnit: "ml" }))
      .toEqual({ normalizedUnit: "ml", normalizedQuantity: 35 });
  });

  it("жидкие дрожжи без фасовки — эквивалента нет", () => {
    expect(resolveInventoryPackEquivalent(liquidYeast)).toBeNull();
  });

  it("не дрожжи — эквивалента нет", () => {
    expect(resolveInventoryPackEquivalent({ type: "hop", alphaAcidPct: 12 })).toBeNull();
  });

  it("вариант фасовки приоритетнее технических полей", () => {
    expect(resolveInventoryItemPackEquivalent({
      packageVariant: { stockContentAmount: 500, stockContentUnit: "g" },
      technicalData: dryYeast
    })).toEqual({ normalizedUnit: "g", normalizedQuantity: 500 });
  });

  it("вариант фасовки в 'pcs' читается как штуки", () => {
    expect(resolveInventoryItemPackEquivalent({
      packageVariant: { stockContentAmount: 6, stockContentUnit: "pcs" },
      technicalData: null
    })).toEqual({ normalizedUnit: "item", normalizedQuantity: 6 });
  });

  it("вариант без содержимого — фолбэк на технические поля", () => {
    expect(resolveInventoryItemPackEquivalent({
      packageVariant: { stockContentAmount: null, stockContentUnit: null },
      technicalData: dryYeast
    })).toEqual({ normalizedUnit: "g", normalizedQuantity: 11 });
  });

  it("ни варианта, ни техданных — null", () => {
    expect(resolveInventoryItemPackEquivalent({ packageVariant: null, technicalData: null })).toBeNull();
  });
});

describe("конверсия требования в единицу складской позиции", () => {
  const packOf11g = { normalizedUnit: "g", normalizedQuantity: 11 } as const;

  it("пачка → граммы по эквиваленту", () => {
    expect(convertQuantityToInventoryNormalizedUnit(1, "pack", "g", packOf11g)).toBe(11);
    expect(convertQuantityToInventoryNormalizedUnit(2, "pack", "g", packOf11g)).toBe(22);
  });

  it("пачка → миллилитры (жидкие дрожжи)", () => {
    expect(convertQuantityToInventoryNormalizedUnit(1, "pack", "ml", { normalizedUnit: "ml", normalizedQuantity: 35 }))
      .toBe(35);
  });

  it("пачка → штуки (расходник в пачке по 6 шт)", () => {
    expect(convertQuantityToInventoryNormalizedUnit(2, "pack", "item", { normalizedUnit: "item", normalizedQuantity: 6 }))
      .toBe(12);
  });

  it("граммы → пачки (обратное направление)", () => {
    expect(convertQuantityToInventoryNormalizedUnit(22, "g", "pack", packOf11g)).toBe(2);
  });

  it("внутри одной размерности эквивалент не нужен", () => {
    expect(convertQuantityToInventoryNormalizedUnit(1, "kg", "g")).toBe(1000);
    expect(convertQuantityToInventoryNormalizedUnit(1, "l", "ml")).toBe(1000);
    expect(convertQuantityToInventoryNormalizedUnit(3, "item", "item")).toBe(3);
  });

  it("пачка → пачка (склад не раскрыл содержимое)", () => {
    expect(convertQuantityToInventoryNormalizedUnit(2, "pack", "pack")).toBe(2);
  });

  it("пачка без эквивалента не конвертируется", () => {
    expect(convertQuantityToInventoryNormalizedUnit(1, "pack", "g")).toBeNull();
  });

  it("штуки в граммы не превращаются", () => {
    expect(convertQuantityToInventoryNormalizedUnit(1, "item", "g", packOf11g)).toBeNull();
  });

  it("вес в объём не превращается", () => {
    expect(convertQuantityToInventoryNormalizedUnit(1, "g", "ml")).toBeNull();
  });

  it("округляет до сетки склада (3 знака)", () => {
    expect(convertQuantityToInventoryNormalizedUnit(1, "g", "pack", { normalizedUnit: "g", normalizedQuantity: 3 }))
      .toBe(0.333);
  });

  it("обратный конвертер (остаток в единице показа) работает через тот же мост", () => {
    expect(convertInventoryNormalizedToUnit(33, "g", "pack", packOf11g)).toBe(3);
    expect(convertInventoryNormalizedToUnit(1500, "g", "kg")).toBe(1.5);
    expect(convertInventoryNormalizedToUnit(11, "g", "pack")).toBeNull();
  });
});
