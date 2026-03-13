import { describe, expect, it } from "vitest";

import { buildIngredientFamilyBackfill } from "../features/ingredients/family-backfill";

describe("ingredient family backfill", () => {
  it("maps legacy top-level types into the new category/subtype taxonomy", () => {
    const result = buildIngredientFamilyBackfill([
      {
        id: "sugar-1",
        type: "sugar",
        displayName: "Dextrose",
        normalizedName: "dextrose",
        defaultUnit: "g"
      },
      {
        id: "water-1",
        type: "misc",
        displayName: "Calcium Chloride",
        normalizedName: "calcium chloride",
        defaultUnit: "g",
        properties: { stage: "water-treatment", compound: "calcium_chloride" }
      },
      {
        id: "fining-1",
        type: "fining",
        displayName: "Irish Moss",
        normalizedName: "irish moss",
        defaultUnit: "g"
      }
    ]);

    expect(result.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemId: "sugar-1",
        category: "fermentable",
        subtype: "sugar",
        familyKey: "fermentable:dextrose"
      }),
      expect.objectContaining({
        itemId: "water-1",
        category: "water_prep",
        subtype: "salt",
        familyKey: "water_prep:calcium chloride"
      }),
      expect.objectContaining({
        itemId: "fining-1",
        category: "misc",
        subtype: "fining",
        familyKey: "misc:irish moss"
      })
    ]));
  });

  it("groups existing variants into one family per category + normalized name", () => {
    const result = buildIngredientFamilyBackfill([
      {
        id: "hop-1",
        type: "hop",
        displayName: "Cascade",
        normalizedName: "cascade",
        defaultUnit: "g",
        hopAlphaAcidPct: 5.8,
        hopForm: "pellet"
      },
      {
        id: "hop-2",
        type: "hop",
        displayName: "Cascade",
        normalizedName: "cascade",
        defaultUnit: "g",
        hopAlphaAcidPct: 6.1,
        hopForm: "whole_cone"
      }
    ]);

    expect(result.families).toHaveLength(1);
    expect(result.families[0]).toMatchObject({
      category: "hop",
      canonicalFamilyName: "Cascade",
      normalizedCanonicalName: "cascade",
      familyKey: "hop:cascade"
    });
    expect(result.assignments.map((item) => item.familyKey)).toEqual(["hop:cascade", "hop:cascade"]);
  });
});
