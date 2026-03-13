import { describe, expect, it } from "vitest";

import {
  normalizeInventoryMeasurement,
  normalizeInventoryMeasurementForProfile,
  resolveHumanFacingInventoryUnitProfile,
  resolveInventoryUnitProfile
} from "../features/inventory/units";
import { buildInventoryCostDisplay, formatInventoryQuantityForDisplay } from "../features/inventory/display";
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

  it("normalizes liters to milliliters", () => {
    expect(normalizeInventoryMeasurementForProfile(
      resolveInventoryUnitProfile({ category: "water_prep", subtype: "acid" }),
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
    expect(resolveInventoryUnitProfile({ category: "water_prep", subtype: "acid" }).defaultUnit).toBe("ml");
    expect(resolveInventoryUnitProfile({ category: "misc", defaultDisplayUnit: "item" }).defaultUnit).toBe("item");
  });

  it("uses pack for yeast only when package context is known", () => {
    expect(resolveInventoryUnitProfile({
      category: "yeast",
      defaultDisplayUnit: "pack",
      allowedUnits: ["pack", "g"],
      technicalData: {
        category: "yeast",
        subtype: "ale",
        form: "dry",
        attenuationPct: 78,
        tempMinC: null,
        tempMaxC: null,
        flocculation: null,
        alcoholTolerancePct: null,
        packageSize: 11.5,
        packageUnit: "g",
        phenolic: null,
        diastaticus: null
      }
    }).defaultUnit).toBe("pack");

    expect(resolveInventoryUnitProfile({
      category: "yeast",
      defaultDisplayUnit: "pack",
      allowedUnits: ["pack", "g"],
      technicalData: {
        category: "yeast",
        subtype: "ale",
        form: "dry",
        attenuationPct: 78,
        tempMinC: null,
        tempMaxC: null,
        flocculation: null,
        alcoholTolerancePct: null,
        packageSize: null,
        packageUnit: null,
        phenolic: null,
        diastaticus: null
      }
    }).defaultUnit).toBe("g");

    expect(resolveInventoryUnitProfile({
      category: "yeast",
      defaultDisplayUnit: "pack",
      allowedUnits: ["pack", "ml"],
      technicalData: {
        category: "yeast",
        subtype: "ale",
        form: "liquid",
        attenuationPct: 78,
        tempMinC: null,
        tempMaxC: null,
        flocculation: null,
        alcoholTolerancePct: null,
        packageSize: null,
        packageUnit: null,
        phenolic: null,
        diastaticus: null
      }
    }).defaultUnit).toBe("ml");
  });

  it("formats fermentable quantities in kilograms for human display", () => {
    expect(formatInventoryQuantityForDisplay({
      enteredQuantity: 500,
      enteredUnit: "g",
      normalizedQuantity: 500,
      normalizedUnit: "g",
      category: "fermentable",
      defaultDisplayUnit: "kg"
    })).toBe("0.5 kg");
  });

  it("forces human-facing fermentable defaults to kilograms even when legacy source default is grams", () => {
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
    expect(unitPrice).toContain("/ kg");
  });
});
