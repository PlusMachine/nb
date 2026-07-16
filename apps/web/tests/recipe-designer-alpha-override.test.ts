import { describe, expect, it } from "vitest";

import type { IngredientSuggestionItem } from "../features/ingredients/contracts";
import type { RecipeDetailDto } from "../features/recipes/contracts";
import {
  applySelection,
  buildIngredientPayload,
  createEmptyIngredient,
  toDesignerIngredient,
  type DesignerIngredient
} from "../components/recipes/recipe-designer/helpers";

const baseHopSuggestion = (overrides: Partial<IngredientSuggestionItem> = {}): IngredientSuggestionItem => ({
  id: "hop-catalog-new",
  type: "hop",
  category: "hop",
  displayName: "Citra",
  defaultUnit: "g",
  source: "catalog",
  technicalData: { type: "hop", alphaAcidPctTypical: 5 },
  ...overrides
});

describe("recipe-designer/helpers — per-position hop alpha override", () => {
  describe("applySelection", () => {
    it("resets stepMeta.alphaAcidPct when the selection switches to a different hop", () => {
      const current: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: "hop-old",
        technicalData: { type: "hop", alphaAcidPctTypical: 5 },
        stepMeta: { ...createEmptyIngredient("hop").stepMeta, alphaAcidPct: "7.2" }
      };

      const result = applySelection(current, baseHopSuggestion({ id: "hop-new", technicalData: { type: "hop", alphaAcidPctTypical: 12 } }));

      expect(result.ingredientCatalogItemId).toBe("hop-new");
      expect(result.stepMeta.alphaAcidPct).toBe("");
    });

    it("keeps stepMeta.alphaAcidPct when the same ingredient is re-selected", () => {
      const current: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: "hop-1",
        technicalData: { type: "hop", alphaAcidPctTypical: 5 },
        stepMeta: { ...createEmptyIngredient("hop").stepMeta, alphaAcidPct: "7.2" }
      };

      const result = applySelection(current, baseHopSuggestion({ id: "hop-1", technicalData: { type: "hop", alphaAcidPctTypical: 5 } }));

      expect(result.ingredientCatalogItemId).toBe("hop-1");
      expect(result.stepMeta.alphaAcidPct).toBe("7.2");
    });

    it("carries the imported file alpha into stepMeta.alphaAcidPct when it differs from the matched catalog alpha", () => {
      const current: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: null,
        userCustomIngredientId: null,
        externalImportMeta: {
          source: "brewfather",
          importedIngredient: {
            version: 1,
            source: "brewfather",
            name: "Imported Citra",
            type: "hop",
            category: "hop",
            technicalData: { type: "hop", alphaAcidPctTypical: 8.2 }
          }
        }
      };

      const result = applySelection(current, baseHopSuggestion({ technicalData: { type: "hop", alphaAcidPctTypical: 5 } }));

      expect(result.ingredientCatalogItemId).toBe("hop-catalog-new");
      expect(result.stepMeta.alphaAcidPct).toBe("8.2");
    });

    it("does not carry the imported file alpha when it matches the matched catalog alpha", () => {
      const current: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: null,
        userCustomIngredientId: null,
        externalImportMeta: {
          source: "brewfather",
          importedIngredient: {
            version: 1,
            source: "brewfather",
            name: "Imported Citra",
            type: "hop",
            category: "hop",
            technicalData: { type: "hop", alphaAcidPctTypical: 5 }
          }
        }
      };

      const result = applySelection(current, baseHopSuggestion({ technicalData: { type: "hop", alphaAcidPctTypical: 5 } }));

      expect(result.stepMeta.alphaAcidPct).toBe("");
    });
  });

  describe("buildIngredientPayload", () => {
    it("writes a valid alphaAcidPct override that differs from the catalog value", () => {
      const ingredient: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: "hop-1",
        amountEnteredQuantity: "50",
        technicalData: { type: "hop", alphaAcidPctTypical: 5 },
        stepMeta: { ...createEmptyIngredient("hop").stepMeta, alphaAcidPct: "7.2" }
      };

      const payload = buildIngredientPayload(ingredient);

      expect(payload.stepMeta).toMatchObject({ alphaAcidPct: 7.2 });
    });

    it("omits alphaAcidPct when it equals the catalog value", () => {
      const ingredient: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: "hop-1",
        amountEnteredQuantity: "50",
        technicalData: { type: "hop", alphaAcidPctTypical: 7.2 },
        stepMeta: { ...createEmptyIngredient("hop").stepMeta, alphaAcidPct: "7.2" }
      };

      const payload = buildIngredientPayload(ingredient);

      expect(payload.stepMeta && "alphaAcidPct" in payload.stepMeta).toBe(false);
    });

    it("omits alphaAcidPct when it is out of the valid 0..30 range", () => {
      const ingredient: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: "hop-1",
        amountEnteredQuantity: "50",
        technicalData: { type: "hop", alphaAcidPctTypical: 5 },
        stepMeta: { ...createEmptyIngredient("hop").stepMeta, alphaAcidPct: "45" }
      };

      const payload = buildIngredientPayload(ingredient);

      expect(payload.stepMeta && "alphaAcidPct" in payload.stepMeta).toBe(false);
    });

    it("omits alphaAcidPct when the field is empty", () => {
      const ingredient: DesignerIngredient = {
        ...createEmptyIngredient("hop"),
        ingredientCatalogItemId: "hop-1",
        amountEnteredQuantity: "50",
        technicalData: { type: "hop", alphaAcidPctTypical: 5 },
        stepMeta: { ...createEmptyIngredient("hop").stepMeta, alphaAcidPct: "" }
      };

      const payload = buildIngredientPayload(ingredient);

      expect(payload.stepMeta && "alphaAcidPct" in payload.stepMeta).toBe(false);
    });
  });

  describe("toDesignerIngredient", () => {
    it("reads a numeric stepMeta.alphaAcidPct from the saved DTO into a string", () => {
      const dtoIngredient = {
        id: "00000000-0000-4000-8000-000000000012",
        recipeId: "00000000-0000-4000-8000-000000000001",
        persistentKey: "00000000-0000-4000-8000-000000000112",
        displayOrder: 1,
        ingredientCatalogItemId: "hop-1",
        userCustomIngredientId: null,
        type: "hop",
        ingredientCategory: "hop",
        ingredientSubtype: "hop",
        ingredientFamilyId: null,
        ingredientDisplayName: "Cascade",
        ingredientDisplayNameRu: null,
        ingredientDisplayNameEn: "Cascade",
        ingredientDisplayNameSnapshot: "Cascade",
        ingredientFamilyDisplayName: null,
        ingredientSummary: null,
        ingredientDefaultDisplayUnit: "g",
        ingredientDefaultDisplayUnitSnapshot: "g",
        ingredientAllowedUnits: ["g", "kg", "oz", "lb"],
        ingredientMeasurementDimension: "weight",
        ingredientMeasurementDimensionSnapshot: "weight",
        ingredientTechnicalData: { type: "hop", alphaAcidPctTypical: 6.5, hopForm: "pellet" },
        amountEnteredQuantity: 50,
        amountEnteredUnit: "g",
        amountNormalizedQuantity: 50,
        amountNormalizedUnit: "g",
        stage: "whirlpool",
        timeOffset: 20,
        stepMeta: { useType: "whirlpool", timeMinutes: 20, temperatureC: 85, alphaAcidPct: 7.2 },
        inventoryIntentMode: "catalog",
        inventorySelectionMeta: null,
        externalImportMeta: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      } satisfies RecipeDetailDto["ingredients"][number];

      const designerIngredient = toDesignerIngredient(dtoIngredient);

      expect(designerIngredient.stepMeta.alphaAcidPct).toBe("7.2");
    });

    it("leaves stepMeta.alphaAcidPct empty when the DTO has no override", () => {
      const dtoIngredient = {
        id: "00000000-0000-4000-8000-000000000012",
        recipeId: "00000000-0000-4000-8000-000000000001",
        persistentKey: "00000000-0000-4000-8000-000000000112",
        displayOrder: 1,
        ingredientCatalogItemId: "hop-1",
        userCustomIngredientId: null,
        type: "hop",
        ingredientCategory: "hop",
        ingredientSubtype: "hop",
        ingredientFamilyId: null,
        ingredientDisplayName: "Cascade",
        ingredientDisplayNameRu: null,
        ingredientDisplayNameEn: "Cascade",
        ingredientDisplayNameSnapshot: "Cascade",
        ingredientFamilyDisplayName: null,
        ingredientSummary: null,
        ingredientDefaultDisplayUnit: "g",
        ingredientDefaultDisplayUnitSnapshot: "g",
        ingredientAllowedUnits: ["g", "kg", "oz", "lb"],
        ingredientMeasurementDimension: "weight",
        ingredientMeasurementDimensionSnapshot: "weight",
        ingredientTechnicalData: { type: "hop", alphaAcidPctTypical: 6.5, hopForm: "pellet" },
        amountEnteredQuantity: 50,
        amountEnteredUnit: "g",
        amountNormalizedQuantity: 50,
        amountNormalizedUnit: "g",
        stage: "whirlpool",
        timeOffset: 20,
        stepMeta: { useType: "whirlpool", timeMinutes: 20, temperatureC: 85 },
        inventoryIntentMode: "catalog",
        inventorySelectionMeta: null,
        externalImportMeta: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      } satisfies RecipeDetailDto["ingredients"][number];

      const designerIngredient = toDesignerIngredient(dtoIngredient);

      expect(designerIngredient.stepMeta.alphaAcidPct).toBe("");
    });
  });
});
