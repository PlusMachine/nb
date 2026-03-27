import { describe, expect, it } from "vitest";

import {
  buildIngredientTypedSummary,
  resolveIngredientFamilyDisplayName
} from "../features/ingredients/presentation";

describe("ingredient presentation", () => {
  it("prefers russian family display names when both locales are available", () => {
    expect(resolveIngredientFamilyDisplayName({
      displayName: "Цитра (Yakima Chief)",
      familyCanonicalName: "Citra",
      familyDisplayNameEn: "Citra",
      familyDisplayNameRu: "Цитра"
    })).toBe("Цитра");
  });

  it("omits the synthetic standard hop form from summaries", () => {
    expect(buildIngredientTypedSummary({
      category: "hop",
      subtype: "standard",
      displayName: "Цитра",
      harvestYear: 2025,
      technicalData: {
        category: "hop",
        subtype: "standard",
        alphaAcidPct: 12.5,
        betaAcidPct: null,
        totalOilMlPer100g: null,
        notes: null,
        harvestYear: 2025
      }
    })).toBe("12.5% AA • 2025");
  });
});
