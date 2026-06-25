import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("@nb/db", () => ({
  db: { query: { recipes: { findMany: vi.fn() }, ingredients: { findMany: vi.fn() } } },
  ingredients: {},
  recipeIngredients: {},
  recipes: {},
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn()
}));
vi.mock("../features/recipes/service", () => ({ getRecipeById: vi.fn() }));
vi.mock("../features/inventory/service", () => ({ listInventoryForUser: vi.fn() }));
vi.mock("../features/equipment-profiles/service", () => ({ listEquipmentProfiles: vi.fn() }));

import {
  computeRecipeMatch,
  indexInventoryEntries,
  matchLineAgainstInventory,
  summarizeMatch,
  type InventoryMatchEntry,
  type MatchLineInput
} from "../features/recipes/match-service";
import { resolveIngredientMatchKey, type IngredientMatchProfile } from "../features/ingredients/match-group";
import { getRecipeById } from "../features/recipes/service";
import { listInventoryForUser } from "../features/inventory/service";
import { listEquipmentProfiles } from "../features/equipment-profiles/service";

const pilsnerProfile = (catalogItemId: string): IngredientMatchProfile => ({
  category: "fermentable",
  type: "malt",
  name: "Pilsner",
  nameEn: "Pilsner",
  technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
  catalogItemId,
  dimension: "weight"
});

const yeastProfile = (catalogItemId: string): IngredientMatchProfile => ({
  category: "yeast",
  type: "yeast",
  name: "US-05",
  catalogItemId,
  dimension: "count",
  technicalData: { type: "yeast", yeastFamily: "US-05", form: "dry" }
});

const entry = (
  itemId: string,
  profile: IngredientMatchProfile,
  available: number,
  normalizedUnit: InventoryMatchEntry["normalizedUnit"]
): InventoryMatchEntry => ({
  itemId,
  key: resolveIngredientMatchKey(profile),
  available,
  normalizedUnit
});

const line = (
  profile: IngredientMatchProfile,
  required: number,
  normalizedUnit: MatchLineInput["normalizedUnit"]
): MatchLineInput => ({
  id: "line-1",
  persistentKey: "line-1-pk",
  displayOrder: 0,
  displayName: profile.name ?? null,
  profile,
  requiredNormalizedQuantity: required,
  normalizedUnit
});

describe("matchLineAgainstInventory — core semantics", () => {
  it("aggregates multiple bags of the exact product and scales the requirement", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("kursk--pilsner"), 6000, "g"),
      entry("bag-2", pilsnerProfile("kursk--pilsner"), 5000, "g")
    ]);

    // recipe needs 5000g at the authored volume; matching at 2x batch → 10000g
    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 5000, "g"), index, 2);

    expect(result.requiredQuantityNormalized).toBe(10000);
    expect(result.availableQuantityNormalized).toBe(11000);
    expect(result.status).toBe("covered");
    expect(result.coveragePercent).toBe(100);
    expect(result.viaSubstitute).toBe(false);
  });

  it("covers via a different brand of the same pilsner (substitute tier)", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("soufflet--pilsner"), 12000, "g")
    ]);

    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 5000, "g"), index, 1);

    expect(result.status).toBe("substitute");
    expect(result.viaSubstitute).toBe(true);
    expect(result.coveragePercent).toBe(100);
  });

  it("reports a partial cover with shortfall", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("kursk--pilsner"), 4000, "g")
    ]);

    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 10000, "g"), index, 1);

    expect(result.status).toBe("partial");
    expect(result.coveragePercent).toBe(40);
    expect(result.shortfallNormalized).toBe(6000);
  });

  it("returns missing when nothing matches", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("kursk--pilsner"), 4000, "g")
    ]);

    const munich: IngredientMatchProfile = {
      ...pilsnerProfile("any--munich"),
      name: "Munich",
      nameEn: "Munich",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 14, colorEbcMax: 18 }
    };
    const result = matchLineAgainstInventory(line(munich, 1000, "g"), index, 1);

    expect(result.status).toBe("missing");
    expect(result.coveragePercent).toBe(0);
  });

  it("does not match across measurement dimensions", () => {
    // same group key, but inventory is tracked by count while the line needs weight
    const countEntry = entry("c-1", { ...pilsnerProfile("kursk--pilsner"), dimension: "count" }, 5, "pack");
    const index = indexInventoryEntries([countEntry]);

    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 1000, "g"), index, 1);

    expect(result.status).toBe("missing");
  });

  it("treats yeast as exact-only (no cross-strain substitution)", () => {
    const index = indexInventoryEntries([
      entry("y-1", yeastProfile("fermentis--us-05"), 5, "pack")
    ]);

    // different catalog id, same family — must NOT substitute for yeast
    const result = matchLineAgainstInventory(line(yeastProfile("lallemand--us-05-clone"), 2, "pack"), index, 1);

    expect(result.status).toBe("missing");
  });
});

describe("summarizeMatch — weighted percentage", () => {
  it("weights a missing base malt / yeast more than a covered pinch of salt", () => {
    const fermentableCovered = matchLineAgainstInventory(
      line(pilsnerProfile("kursk--pilsner"), 5000, "g"),
      indexInventoryEntries([entry("bag", pilsnerProfile("kursk--pilsner"), 9000, "g")]),
      1
    );
    const yeastMissing = matchLineAgainstInventory(
      { ...line(yeastProfile("fermentis--us-05"), 2, "pack"), id: "line-2", displayOrder: 1 },
      indexInventoryEntries([]),
      1
    );

    const summary = summarizeMatch("r-1", [fermentableCovered, yeastMissing], {
      targetBatchVolumeL: 20,
      recipeBatchVolumeL: 20
    });

    // fermentable weight 5 (covered) + yeast weight 4 (missing) => 5 / 9 ≈ 56%
    expect(summary.matchPercent).toBe(56);
    expect(summary.coveredLines).toBe(1);
    expect(summary.missingCount).toBe(1);
    expect(summary.label).toBe("partial");
    expect(summary.scaledToInventory).toBe(false);
  });
});

describe("computeRecipeMatch — wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads recipe + inventory, scales to the default equipment volume, and matches", async () => {
    (getRecipeById as Mock).mockResolvedValue({
      id: "recipe-1",
      batchSizeNormalizedQuantity: 20000,
      batchSizeNormalizedUnit: "ml",
      ingredients: [
        {
          id: "ri-1",
          persistentKey: "ri-1-pk",
          displayOrder: 0,
          ingredientDisplayName: "Pilsner",
          ingredientDisplayNameSnapshot: "Pilsner",
          ingredientDisplayNameEn: "Pilsner",
          ingredientCategory: "fermentable",
          ingredientSubtype: "malt",
          type: "malt",
          ingredientTechnicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
          ingredientCatalogItemId: "kursk--pilsner",
          userCustomIngredientId: null,
          amountNormalizedQuantity: 5000,
          amountNormalizedUnit: "g"
        }
      ]
    });
    (listInventoryForUser as Mock).mockResolvedValue([
      {
        id: "inv-1",
        normalizedQuantity: 12000,
        normalizedUnit: "g",
        unitDimension: "weight",
        archivedAt: null,
        ingredientCatalogItemId: "soufflet--pilsner",
        userCustomIngredientId: null,
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        ingredientDisplayNameSnapshot: "Pilsner Soufflet",
        source: {
          category: "fermentable",
          type: "malt",
          displayName: "Pilsner",
          nameRu: "Пилснер",
          nameEn: "Pilsner",
          subtype: "malt",
          technicalData: { type: "malt", maltType: "base", colorEbcMin: 3, colorEbcMax: 4 }
        }
      }
    ]);
    (listEquipmentProfiles as Mock).mockResolvedValue([{ targetBatchVolumeL: 40 }]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" });

    expect(result.recipeBatchVolumeL).toBe(20);
    expect(result.targetBatchVolumeL).toBe(40);
    expect(result.scaledToInventory).toBe(true);
    expect(result.lines).toHaveLength(1);
    // 5000g * 2 = 10000g required; 12000g of a different brand pilsner available
    expect(result.lines[0].requiredQuantityNormalized).toBe(10000);
    expect(result.lines[0].status).toBe("substitute");
    expect(result.matchPercent).toBe(100);
  });
});
