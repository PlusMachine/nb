import { describe, expect, it } from "vitest";

import {
  formatInventoryUnitLabel,
  normalizeInventoryMeasurement,
  normalizeInventoryMeasurementForProfile,
  resolveHumanFacingInventoryUnitProfile,
  resolveInventoryUnitProfile
} from "../features/inventory/units";
import { buildInventoryCostDisplay, formatInventoryQuantityForDisplay, formatInventoryQuantityInputValue } from "../features/inventory/display";
import { defaultSystemCurrencyRates } from "../features/system/currency";

describe("inventory unit normalization", () => {
  it("keeps grams canonical for weight inventory", () => {
    const measurement = normalizeInventoryMeasurement("hop", 100, "g");

    expect(measurement).toMatchObject({
      enteredQuantity: 100,
      enteredUnit: "g",
      normalizedQuantity: 100,
      normalizedUnit: "g",
      unitDimension: "weight"
    });
  });

  it("normalizes kilograms to grams", () => {
    expect(normalizeInventoryMeasurement("fermentable", 1, "kg")).toMatchObject({
      normalizedQuantity: 1000,
      normalizedUnit: "g"
    });
  });

  it("normalizes ounces to grams", () => {
    expect(normalizeInventoryMeasurement("hop", 2, "oz")).toMatchObject({
      normalizedQuantity: 56.699,
      normalizedUnit: "g"
    });
  });

  it("normalizes pounds to grams", () => {
    expect(normalizeInventoryMeasurement("fermentable", 1, "lb")).toMatchObject({
      normalizedQuantity: 453.592,
      normalizedUnit: "g"
    });
  });

  it("normalizes liters to milliliters for water treatment acids", () => {
    expect(normalizeInventoryMeasurementForProfile(
      resolveInventoryUnitProfile({ category: "water_treatment", subtype: "acid" }),
      1.5,
      "l"
    )).toMatchObject({
      normalizedQuantity: 1500,
      normalizedUnit: "ml",
      unitDimension: "volume"
    });
  });

  it("rejects incompatible units for ingredient type", () => {
    expect(() => normalizeInventoryMeasurement("hop", 1, "pack")).toThrowError("INCOMPATIBLE_UNIT");
  });

  it("uses practical default display units by category", () => {
    expect(resolveInventoryUnitProfile({ category: "fermentable" }).defaultUnit).toBe("kg");
    expect(resolveInventoryUnitProfile({ category: "hop" }).defaultUnit).toBe("g");
    expect(resolveInventoryUnitProfile({ category: "water_treatment", subtype: "acid" }).defaultUnit).toBe("ml");
    expect(resolveInventoryUnitProfile({ category: "consumable", defaultDisplayUnit: "item" }).defaultUnit).toBe("item");
  });

  it("uses pack as the default human-facing unit for dry yeast", () => {
    expect(resolveInventoryUnitProfile({
      category: "yeast",
      technicalData: {
        type: "yeast",
        form: "dry",
        attenuationPctTypical: 78,
        fermentationTempCMin: null,
        fermentationTempCMax: null,
        flocculation: null,
        alcoholToleranceAbvTypical: null,
        packageSize: 11.5,
        packageUnit: "g"
      }
    }).defaultUnit).toBe("pack");
    expect(resolveInventoryUnitProfile({
      category: "yeast",
      technicalData: {
        type: "yeast",
        form: "dry",
        attenuationPctTypical: 78,
        fermentationTempCMin: null,
        fermentationTempCMax: null,
        flocculation: null,
        alcoholToleranceAbvTypical: null,
        packageSize: null,
        packageUnit: null
      }
    }).allowedUnits).toEqual(["pack", "g"]);
  });

  it("preserves explicit pack support for yeast without package metadata", () => {
    expect(resolveInventoryUnitProfile({
      category: "yeast",
      defaultDisplayUnit: "pack",
      allowedUnits: ["pack", "g"],
      technicalData: {
        type: "yeast",
        form: "dry",
        attenuationPctTypical: 78,
        fermentationTempCMin: null,
        fermentationTempCMax: null,
        flocculation: null,
        alcoholToleranceAbvTypical: null,
        packageSize: null,
        packageUnit: null
      }
    }).defaultUnit).toBe("pack");

    expect(resolveInventoryUnitProfile({
      category: "yeast",
      defaultDisplayUnit: "pack",
      allowedUnits: ["pack", "ml"],
      technicalData: {
        type: "yeast",
        form: "liquid",
        attenuationPctTypical: 78,
        fermentationTempCMin: null,
        fermentationTempCMax: null,
        flocculation: null,
        alcoholToleranceAbvTypical: null,
        packageSize: null,
        packageUnit: null
      }
    }).defaultUnit).toBe("pack");
  });

  it("formats dry yeast stock as packs with gram equivalent", () => {
    expect(formatInventoryQuantityForDisplay({
      enteredQuantity: 2,
      enteredUnit: "pack",
      normalizedQuantity: 22,
      normalizedUnit: "g",
      category: "yeast",
      technicalData: {
        type: "yeast",
        form: "dry",
        attenuationPctTypical: 78,
        fermentationTempCMin: null,
        fermentationTempCMax: null,
        flocculation: null,
        alcoholToleranceAbvTypical: null,
        packageSize: null,
        packageUnit: null
      }
    })).toBe("2 пачки (22 г)");
  });

  it("склоняет «пачку» по количеству", () => {
    expect(formatInventoryUnitLabel("pack", 1)).toBe("пачка");
    expect(formatInventoryUnitLabel("pack", 2)).toBe("пачки");
    expect(formatInventoryUnitLabel("pack", 4)).toBe("пачки");
    expect(formatInventoryUnitLabel("pack", 5)).toBe("пачек");
    expect(formatInventoryUnitLabel("pack", 11)).toBe("пачек");
    expect(formatInventoryUnitLabel("pack", 21)).toBe("пачка");
    expect(formatInventoryUnitLabel("pack", 1.5)).toBe("пачки");
    // Без количества — базовая форма (цена «₽/пачка»); сокращения не склоняются.
    expect(formatInventoryUnitLabel("pack")).toBe("пачка");
    expect(formatInventoryUnitLabel("item", 5)).toBe("шт.");
    expect(formatInventoryUnitLabel("g", 5)).toBe("г");
  });

  it("formats fermentable quantities in kilograms for human display", () => {
    expect(formatInventoryQuantityForDisplay({
      enteredQuantity: 500,
      enteredUnit: "g",
      normalizedQuantity: 500,
      normalizedUnit: "g",
      category: "fermentable",
      defaultDisplayUnit: "kg"
    })).toBe("0.5 кг");
  });

  it("formats inventory quantities with unit-specific precision", () => {
    expect(formatInventoryQuantityInputValue(0.925, "kg")).toBe("0.93");
    expect(formatInventoryQuantityInputValue(120.24, "g")).toBe("120.2");
    expect(formatInventoryQuantityInputValue(2.4, "pack")).toBe("2");
  });

  it("forces human-facing fermentable defaults to kilograms even when source default is grams", () => {
    expect(resolveHumanFacingInventoryUnitProfile({
      category: "fermentable",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight"
    }).defaultUnit).toBe("kg");
  });

  it("formats fermentable unit cost per kilogram instead of per gram", () => {
    const unitPrice = buildInventoryCostDisplay({
      enteredQuantity: 500,
      enteredUnit: "g",
      normalizedQuantity: 500,
      normalizedUnit: "g",
      category: "fermentable",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight",
      normalizedUnitCostMinorRub: 25,
      purchasePriceMinor: 12500,
      purchaseCurrency: "RUB",
      purchaseQuantityNormalizedUnit: "g"
    }, "RUB", defaultSystemCurrencyRates).unitPrice;

    expect(unitPrice).toContain("250");
    expect(unitPrice).toContain("/ кг");
  });
});
