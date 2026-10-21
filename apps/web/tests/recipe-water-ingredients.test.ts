import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicRecipeWaterSection } from "../components/recipes/public-recipe-water-section";
import { createEmptyIngredient, getFermentablesForWaterPlan, getFermentableWeightTotalKg, type DesignerIngredient } from "../components/recipes/recipe-designer/helpers";
import { buildBrewPlanSnapshot } from "../features/brew-batches/brew-plan";
import { starterEquipmentProfileDefaults } from "../features/equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "../features/equipment-profiles/volume-plan";
import { defaultRecipeProcessMeta, recipeWaterPlanMetaSchema, type RecipeDetailDto, type RecipeIngredientDto } from "../features/recipes/contracts";
import { buildRecipeWaterPlanResult } from "../features/recipes/water-plan";
import { buildRecipeWaterPlanFermentables } from "../features/recipes/water-plan-ingredients";

const grain = (overrides: Partial<DesignerIngredient> = {}): DesignerIngredient => ({
  ...createEmptyIngredient("fermentable", "boil", "malt"),
  selectedName: "Pale malt", amountEnteredQuantity: "5", amountEnteredUnit: "kg",
  stage: "mash", stepMeta: { use: "mash" },
  technicalData: { type: "malt", maltType: "base", colorEbcMin: 3, colorEbcMax: 5 },
  ...overrides
});

const sugar = grain({
  selectedName: "Dextrose", type: "fermentable", subtype: "fermentable",
  amountEnteredQuantity: "1", stage: "boil", stepMeta: { use: "boil" },
  technicalData: { type: "fermentable", productFamily: "sugar" }
});
const hops: DesignerIngredient = { ...createEmptyIngredient("hop"), selectedName: "Citra", amountEnteredQuantity: "500", amountEnteredUnit: "g" };

const toRecipeIngredient = (item: DesignerIngredient): RecipeIngredientDto => ({
  id: item.localId, persistentKey: item.persistentKey,
  type: item.type, ingredientCategory: item.category, ingredientSubtype: item.subtype,
  ingredientDisplayName: item.selectedName, ingredientTechnicalData: item.technicalData,
  amountEnteredQuantity: Number(item.amountEnteredQuantity), amountEnteredUnit: item.amountEnteredUnit,
  amountNormalizedQuantity: item.amountEnteredUnit === "kg" ? Number(item.amountEnteredQuantity) * 1000 : Number(item.amountEnteredQuantity),
  amountNormalizedUnit: item.amountEnteredUnit === "kg" ? "g" : item.amountEnteredUnit,
  stage: item.stage, stepMeta: item.stepMeta, timeOffset: null
} as RecipeIngredientDto);

const recipe = (items: DesignerIngredient[]): RecipeDetailDto => ({
  id: "water-test", title: "Water regression", versionNumber: 1,
  batchSizeNormalizedQuantity: 20000, batchSizeNormalizedUnit: "ml", boilTimeMinutes: 60,
  efficiency: 70, color: 5, processMeta: defaultRecipeProcessMeta,
  equipmentProfileSnapshot: {
    ...starterEquipmentProfileDefaults, id: null, snapshotAt: "2026-10-18T00:00:00.000Z"
  },
  waterPlanMeta: recipeWaterPlanMetaSchema.parse({
    setupEnabled: true, targetProfileMode: "manual", targetProfileName: "Pale Ale",
    sourceProfile: { ca: 10, mg: 2, na: 5, cl: 10, so4: 10, hco3: 20, ph: 7 },
    targetProfile: { ca: 80, mg: 10, na: 15, cl: 90, so4: 150, hco3: 70, ph: null }
  }),
  ingredients: items.map(toRecipeIngredient)
} as RecipeDetailDto);

describe("recipe water grain selection", () => {
  it("keeps 5 kg of grain when 1 kg of boil sugar and 500 g of hops are added", () => {
    const ingredients = [grain(), sugar, hops];
    const fermentables = getFermentablesForWaterPlan(ingredients);
    expect(fermentables).toEqual(getFermentablesForWaterPlan([ingredients[0]]));
    const grainKg = fermentables.reduce((sum, item) => sum + item.weightKg, 0);
    expect(grainKg).toBe(5);
    // The ingredient-section total still includes sugar, but never hops.
    expect(getFermentableWeightTotalKg(ingredients)).toBe(6);
    const equipment = recipe(ingredients).equipmentProfileSnapshot!;
    const volumePlan = calculateEquipmentVolumePlan(equipment, grainKg, 60);
    expect(volumePlan.grainAbsorptionLossL).toBe(4);
    expect(volumePlan.mashWaterL).toBe(15);
  });

  it.each([
    ["mash sugar", { ...sugar, stage: "mash", stepMeta: { use: "mash" } }],
    ["extract", { ...sugar, stage: "mash", stepMeta: { use: "mash" }, technicalData: { type: "fermentable", productFamily: "malt_extract" } }],
    ["yeast", { ...createEmptyIngredient("yeast"), amountEnteredQuantity: "11", amountEnteredUnit: "g" }],
    ["salts", { ...createEmptyIngredient("water_treatment"), amountEnteredQuantity: "10", amountEnteredUnit: "g" }],
    ["spice", { ...createEmptyIngredient("consumable"), amountEnteredQuantity: "100", amountEnteredUnit: "g" }],
    ["late malt", grain({ stage: "boil", stepMeta: { use: "boil" } })],
    ["invalid weight", grain({ amountEnteredQuantity: "NaN" })],
    ["volume unit", grain({ amountEnteredUnit: "l" })]
  ])("excludes %s from both water demand and the mash pH grain bill", (_name, extra) => {
    expect(getFermentablesForWaterPlan([grain(), extra as DesignerIngredient])).toEqual(getFermentablesForWaterPlan([grain()]));
  });

  it("preserves unmalted grain adjuncts and steeped grain, including legacy malt without technical data", () => {
    const items = [
      grain({ selectedName: "Oats", type: "fermentable", subtype: "fermentable", amountEnteredQuantity: "500", amountEnteredUnit: "g", technicalData: { type: "fermentable", productFamily: "adjunct_grain" } }),
      grain({ selectedName: "Crystal", amountEnteredQuantity: "1", stepMeta: { use: "steep" } }),
      grain({ selectedName: "Imported malt", amountEnteredQuantity: "2", technicalData: null, stepMeta: {} })
    ];
    expect(getFermentablesForWaterPlan(items).map((item) => item.weightKg)).toEqual([0.5, 1, 2]);
  });

  it("produces the same water input, public result and brew schedule with non-grain additions", () => {
    const base = recipe([grain()]);
    const mixed = recipe([grain(), sugar, hops]);
    const editorInput = getFermentablesForWaterPlan([grain(), sugar, hops]);
    expect(buildRecipeWaterPlanFermentables(mixed.ingredients)).toEqual(editorInput);
    const calculate = (input: RecipeDetailDto) => {
      const fermentables = buildRecipeWaterPlanFermentables(input.ingredients);
      const grainKg = fermentables.reduce((sum, item) => sum + item.weightKg, 0);
      return buildRecipeWaterPlanResult({
        waterPlanMeta: input.waterPlanMeta!, fallbackBatchVolumeL: 20, grainKg, fermentables,
        equipmentVolumePlan: calculateEquipmentVolumePlan(input.equipmentProfileSnapshot!, grainKg, 60)
      });
    };
    expect(calculate(mixed)).toEqual(calculate(base));
    const baseHtml = renderToStaticMarkup(React.createElement(PublicRecipeWaterSection, { recipe: base }));
    expect(baseHtml).not.toBe("");
    expect(renderToStaticMarkup(React.createElement(PublicRecipeWaterSection, { recipe: mixed }))).toBe(baseHtml);
    const baseSchedule = buildBrewPlanSnapshot(base).waterSchedule;
    expect(baseSchedule).not.toBeNull();
    expect(buildBrewPlanSnapshot(mixed).waterSchedule).toEqual(baseSchedule);
  });
});
