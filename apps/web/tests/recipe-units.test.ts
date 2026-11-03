import { describe, expect, it } from "vitest";
import { normalizeRecipeBatchSize, normalizeRecipeIngredientAmount } from "../features/recipes/units";
import { createRecipePayloadSchema, updateRecipePayloadSchema } from "../features/recipes/contracts";

describe("recipe persistence boundaries", () => {
  it.each([[40, "mg"], [0.04, "g"], [0.00004, "kg"]] as const)("keeps 40 mg entered as %s %s", (quantity, unit) => {
    expect(normalizeRecipeIngredientAmount("hop", quantity, unit)).toMatchObject({
      enteredQuantity: quantity, enteredUnit: unit, normalizedQuantity: 0.04, normalizedUnit: "g"
    });
  });
  it.each([[1, "mg"], [0.001, "g"], [0.000001, "kg"]] as const)("keeps the supported 1 mg boundary in %s %s", (quantity, unit) => {
    expect(normalizeRecipeIngredientAmount("hop", quantity, unit).normalizedQuantity).toBe(0.001);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid explicit volume %s", value => {
    expect(updateRecipePayloadSchema.safeParse({ batchSizeEnteredQuantity: value }).success).toBe(false);
  });
  it("rejects a positive volume that would be rounded to zero", () => {
    expect(() => normalizeRecipeBatchSize(0.0004, "l")).toThrow("INVALID_BATCH_SIZE_PRECISION");
    expect(normalizeRecipeBatchSize(0.001, "l").normalizedQuantity).toBe(1);
    expect(() => normalizeRecipeBatchSize(1e308, "l")).toThrow();
  });
  it("rejects duplicate existing line keys on create and update, allowing generated keys", () => {
    const line = { persistentKey: "00000000-0000-4000-8000-000000000001", ingredientCatalogItemId: "hop",
      type: "hop", amountEnteredQuantity: 20, amountEnteredUnit: "g", stage: "boil" };
    expect(updateRecipePayloadSchema.safeParse({ ingredients: [line, line] }).success).toBe(false);
    expect(createRecipePayloadSchema.safeParse({ title: "QA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", ingredients: [line, line] }).success).toBe(false);
    expect(updateRecipePayloadSchema.safeParse({ ingredients: [{ ...line, persistentKey: null }, { ...line, persistentKey: null }] }).success).toBe(true);
  });
});
