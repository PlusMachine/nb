import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AdminIngredientForm,
  getAdminIngredientFieldVisibility,
  getAdminIngredientSubtypeOptions,
  getNextAdminIngredientTaxonomyState
} from "../components/ingredients/admin-ingredient-form";

describe("admin ingredient form", () => {
  it("exposes subtype options from the new taxonomy source of truth", () => {
    expect(getAdminIngredientSubtypeOptions("fermentable")).toContain("base_malt");
    expect(getAdminIngredientSubtypeOptions("water_prep")).toContain("acid");
    expect(getAdminIngredientSubtypeOptions("misc")).toContain("fining");
  });

  it("returns category-aware field visibility", () => {
    expect(getAdminIngredientFieldVisibility("hop", "pellet")).toEqual({
      primary: ["hopAlphaAcidPct", "harvestYear"],
      advanced: ["hopBetaAcidPct", "hopTotalOilMlPer100g", "hopNotes"]
    });

    expect(getAdminIngredientFieldVisibility("water_prep", "acid").primary).toContain("waterPrepAcidType");
    expect(getAdminIngredientFieldVisibility("water_prep", "acid").primary).not.toContain("waterPrepCompound");
  });

  it("resets incompatible subtype when category changes", () => {
    expect(getNextAdminIngredientTaxonomyState({
      category: "fermentable",
      subtype: "base_malt"
    }, {
      category: "hop"
    })).toEqual({
      category: "hop",
      subtype: "pellet"
    });
  });

  it("renders only hop-relevant technical inputs for hop items", () => {
    const html = renderToStaticMarkup(React.createElement(AdminIngredientForm, {
      initial: {
        id: "hop-1",
        type: "hop",
        category: "hop",
        subtype: "pellet",
        familyId: "fam-1",
        displayName: "Citra",
        aliases: [],
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        measurementDimension: "weight",
        allowedUnits: ["g", "kg", "oz", "lb"],
        completenessLevel: "recommended",
        status: "active",
        visibility: "public",
        properties: {},
        hopAlphaAcidPct: 12,
        harvestYear: 2024
      }
    }));

    expect(html).toContain('name="hopAlphaAcidPct"');
    expect(html).toContain('name="harvestYear"');
    expect(html).not.toContain('name="fermentableExtractYieldPct"');
    expect(html).not.toContain('name="yeastAttenuationPct"');
  });

  it("renders subtype-specific water preparation fields", () => {
    const html = renderToStaticMarkup(React.createElement(AdminIngredientForm, {
      initial: {
        id: "water-1",
        type: "misc",
        category: "water_prep",
        subtype: "acid",
        familyId: "fam-2",
        displayName: "Lactic Acid 88%",
        aliases: [],
        defaultUnit: "ml",
        defaultDisplayUnit: "ml",
        measurementDimension: "volume",
        allowedUnits: ["ml", "l", "gal"],
        completenessLevel: "recommended",
        status: "active",
        visibility: "public",
        properties: { acidType: "lactic", physicalForm: "liquid", strength: 88 },
        waterPrepAcidType: "lactic",
        waterPrepPhysicalForm: "liquid",
        waterPrepStrengthPct: 88
      }
    }));

    expect(html).toContain('name="waterPrepAcidType"');
    expect(html).toContain('name="waterPrepStrengthPct"');
    expect(html).not.toContain('name="waterPrepCompound"');
  });
});
