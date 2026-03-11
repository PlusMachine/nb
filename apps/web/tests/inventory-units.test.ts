import { describe, expect, it } from "vitest";

import { normalizeInventoryMeasurement } from "../features/inventory/units";

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
    expect(normalizeInventoryMeasurement("misc", 1.5, "l")).toMatchObject({
      normalizedQuantity: 1500,
      normalizedUnit: "ml",
      unitDimension: "volume"
    });
  });

  it("rejects incompatible units for ingredient type", () => {
    expect(() => normalizeInventoryMeasurement("hop", 1, "pack")).toThrowError("INCOMPATIBLE_UNIT");
  });
});
