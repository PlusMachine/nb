import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(app)/app/brew-batches/[id]/actions", () => ({}));

import { buildBrewEquipmentPlan } from "../features/brew-batches/equipment-plan";
import { buildBrewPlanSnapshot } from "../features/brew-batches/brew-plan";
import { buildBrewDaySteps } from "../features/brew-batches/brew-day";
import { estimateConsumption } from "../features/brew-batches/components/consume-preview-dialog";
import type { BrewBatchConsumePlanLine } from "../features/brew-batches/contracts";
import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";
import { scaleRecipeDetailForBrew } from "../features/recipes/scale";
import { buildStarterEquipmentProfileDefaults } from "../features/equipment/defaults";
import { formatInventoryQuantityForDisplay } from "../features/inventory/display";
import { findSubstituteCandidatesForLine, indexInventoryEntries } from "../features/recipes/match-service";

const recipe = (): RecipeDetailDto => ({
  id: "recipe", title: "Pale Ale", authorId: "brewer", versionNumber: 1,
  batchSizeEnteredQuantity: 10, batchSizeEnteredUnit: "l", batchSizeNormalizedQuantity: 10000, batchSizeNormalizedUnit: "ml",
  boilTimeMinutes: 90, efficiency: 65, color: 5,
  processMeta: { ...defaultRecipeProcessMeta, mashProfile: { ...defaultRecipeProcessMeta.mashProfile, steps: [{ id: "mash-1", name: "Осахаривание", temperatureC: 66, durationMinutes: 60 }] } },
  equipmentProfileSnapshot: { ...buildStarterEquipmentProfileDefaults(), id: null, snapshotAt: new Date().toISOString(), targetBatchVolumeL: 10 },
  ingredients: [{ id: "malt", persistentKey: "malt", type: "malt", ingredientCategory: "fermentable", stage: "mash", amountNormalizedQuantity: 2660, amountNormalizedUnit: "g", amountEnteredQuantity: 2.66, amountEnteredUnit: "kg", stepMeta: null }]
} as RecipeDetailDto);

describe("warehouse to brew regressions", () => {
  it("recognizes Russian hop names in legacy snapshots without reading a live catalog", () => {
    const index = indexInventoryEntries([{ itemId: "yakima", key: { exactKey: "catalog:yakima-cascade", groupKey: "hop:cascade", category: "hop", dimension: "weight", matchPolicy: "family_compatible" }, groupAliases: ["hop:каскад"], available: 200, normalizedUnit: "g" }]);
    const matches = findSubstituteCandidatesForLine({ category: "hop", type: "hop", name: "Каскад", catalogItemId: "beervingem-cascade", dimension: "weight" }, "g", index);
    expect(matches.map((match) => match.itemId)).toEqual(["yakima"]);
  });

  it("puts basic water litres into the guide without enabling chemical water treatment", () => {
    const source = recipe();
    source.waterPlanMeta = null;
    const groups = buildBrewDaySteps(buildBrewPlanSnapshot(source));
    expect(groups.flatMap((group) => group.steps).find((step) => step.id === "mash:strike")?.detail).toMatch(/8.*л/);
    expect(groups.flatMap((group) => group.steps).find((step) => step.id === "mash:lauter")?.detail).toContain("10.11 л");
    expect(source.waterPlanMeta).toBeNull();
  });

  it("computes water and capacity against this batch's volume rather than the typical profile volume", () => {
    const source = recipe();
    source.equipmentProfileSnapshot!.maxGrainKg = 2.5;
    source.equipmentProfileSnapshot!.maxMashVolumeL = 12;
    const scaled = scaleRecipeDetailForBrew(source, { targetLitres: 60 });
    const plan = buildBrewEquipmentPlan(scaled);
    expect(plan.fermenterTargetColdL).toBe(60);
    expect(plan.totalWaterL).toBeGreaterThan(60);
    expect(plan.warnings.join(" ")).toContain("максимум оборудования 2.5 кг");
    expect(buildBrewPlanSnapshot(scaled).equipmentWarnings).toEqual(plan.warnings);
  });

  it("shows the weight left in an opened yeast package rather than zero or two rounded packs", () => {
    const input = { enteredQuantity: 1.583, enteredUnit: "pack" as const, normalizedQuantity: 17.417, normalizedUnit: "g" as const, type: "yeast" as const, technicalData: { type: "yeast" as const, form: "dry" as const, packageSize: 11, packageUnit: "g" as const } };
    expect(formatInventoryQuantityForDisplay(input)).toBe("17.4 г");
    expect(formatInventoryQuantityForDisplay({ ...input, normalizedQuantity: 3.7 })).toBe("3.7 г");
    expect(formatInventoryQuantityForDisplay({ ...input, normalizedQuantity: 22, enteredQuantity: 2 })).toBe("2 пачки (22 г)");
  });

  it("distributes a short hop lot once across multiple additions and keeps other ingredients available", () => {
    const lines = [2, 4, 6, 6, 8].map((amount, index) => ({ recipeIngredientId: String(index), requiredQuantityNormalized: amount, exact: { inventoryItemId: "hop", availableQuantity: 7.5 }, substitutes: [] } as unknown as BrewBatchConsumePlanLine));
    lines.push({ recipeIngredientId: "yeast", requiredQuantityNormalized: 3.7, exact: { inventoryItemId: "yeast", availableQuantity: 22 }, substitutes: [] } as unknown as BrewBatchConsumePlanLine);
    expect([...estimateConsumption(lines, {}).values()]).toEqual([2, 4, 1.5, 0, 0, 3.7]);
  });
});
