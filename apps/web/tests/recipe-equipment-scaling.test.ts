import { describe, expect, it } from "vitest";

import { scaleRecipeEditorToEquipment } from "../features/recipes/equipment-scaling";

describe("recipe equipment scaling", () => {
  it("scales fermentables by volume and efficiency while hops follow g/L", () => {
    const scaled = scaleRecipeEditorToEquipment({
      currentBatchVolumeL: 20,
      targetBatchVolumeL: 25,
      currentEfficiencyPct: 75,
      targetEfficiencyPct: 80,
      ingredients: [
        { category: "fermentable", amountEnteredQuantity: "4" },
        { category: "hop", amountEnteredQuantity: "50" },
        { category: "yeast", amountEnteredQuantity: "1" }
      ]
    });

    expect(scaled.batchSizeQuantityL).toBe("25");
    expect(scaled.efficiencyPct).toBe("80");
    expect(scaled.volumeRatio).toBe(1.25);
    expect(scaled.fermentableFactor).toBe(1.1719);
    expect(scaled.ingredients).toEqual([
      { category: "fermentable", amountEnteredQuantity: "4.688" },
      { category: "hop", amountEnteredQuantity: "62.5" },
      { category: "yeast", amountEnteredQuantity: "1" }
    ]);
    expect(scaled.warnings).toContain("equipment_scaling_practical_approximation");
  });

  it("does not mutate ingredients when current batch volume is invalid", () => {
    const ingredients = [{ category: "hop", amountEnteredQuantity: "50" }];
    const scaled = scaleRecipeEditorToEquipment({
      currentBatchVolumeL: 0,
      targetBatchVolumeL: 25,
      currentEfficiencyPct: 75,
      targetEfficiencyPct: 75,
      ingredients
    });

    expect(scaled.ingredients).toBe(ingredients);
    expect(scaled.warnings).toContain("invalid_batch_volume_for_equipment_scaling");
  });
});
