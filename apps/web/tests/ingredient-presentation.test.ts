import { describe, expect, it } from "vitest";

import {
  buildIngredientTypedSummary,
  resolveIngredientDisplayNames,
  resolveIngredientFamilyDisplayName
} from "../features/ingredients/presentation";

describe("ingredient presentation", () => {
  it("prefers explicit family labels when available", () => {
    expect(resolveIngredientFamilyDisplayName({
      familyCanonicalName: "Citra",
      familyDisplayNameEn: "Citra",
      familyDisplayNameRu: "Цитра"
    })).toBe("Citra");
  });

  it("builds localized-first labels from canonical names", () => {
    expect(resolveIngredientDisplayNames({
      type: "water_treatment",
      nameRu: "Молочная кислота",
      nameEn: "Lactic Acid",
      displayModeRu: "localized_first"
    })).toEqual({
      primaryName: "Молочная кислота",
      secondaryName: "Lactic Acid"
    });
  });

  it("builds source-first labels from canonical names", () => {
    expect(resolveIngredientDisplayNames({
      type: "hop",
      nameRu: "Каскад",
      nameEn: "Cascade",
      displayModeRu: "source_first"
    })).toEqual({
      primaryName: "Cascade",
      secondaryName: "Каскад"
    });
  });

  it("applies display overrides and hide-secondary flag", () => {
    expect(resolveIngredientDisplayNames({
      type: "yeast",
      nameRu: "BF16 Лагер",
      nameEn: "BF16 Lager",
      displayModeRu: "source_first",
      displayNameOverrideRu: "BF16 Lager Dry"
    })).toEqual({
      primaryName: "BF16 Lager Dry",
      secondaryName: "BF16 Лагер"
    });

    expect(resolveIngredientDisplayNames({
      type: "yeast",
      nameRu: "US-05",
      nameEn: "SafAle US-05",
      displayModeRu: "source_first",
      secondaryNameOverrideRu: "Американские сухие дрожжи",
      hideSecondaryNameRu: true
    })).toEqual({
      primaryName: "SafAle US-05",
      secondaryName: undefined
    });
  });

  it("suppresses redundant secondary labels after normalization", () => {
    expect(resolveIngredientDisplayNames({
      type: "hop",
      nameRu: "Сааз",
      nameEn: "сааз",
      displayModeRu: "localized_first"
    })).toEqual({
      primaryName: "Сааз",
      secondaryName: undefined
    });
  });

  it("builds hop summaries from typed attributes", () => {
    expect(buildIngredientTypedSummary({
      category: "hop",
      subtype: "hop",
      technicalData: {
        type: "hop",
        alphaAcidPctTypical: 12.5,
        hopForm: "pellet"
      }
    })).toBe("12.5% AA • pellet");
  });
});
