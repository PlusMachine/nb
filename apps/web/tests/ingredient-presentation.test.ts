import { describe, expect, it } from "vitest";

import {
  buildIngredientTypedSummary,
  resolveIngredientCountry,
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

  it("treats local malt in auto mode as localized-first", () => {
    expect(resolveIngredientDisplayNames({
      type: "malt",
      countryCode: "RU",
      nameRu: "Пилснер",
      nameEn: "Pilsner",
      displayModeRu: "auto"
    })).toEqual({
      primaryName: "Пилснер",
      secondaryName: "Pilsner"
    });
  });

  it("treats foreign malt in auto mode as source-first", () => {
    expect(resolveIngredientDisplayNames({
      type: "malt",
      countryCode: "BE",
      nameRu: "Пильсен 2-рядный яровой",
      nameEn: "Pilsen 2RS",
      displayModeRu: "auto"
    })).toEqual({
      primaryName: "Pilsen 2RS",
      secondaryName: "Пильсен 2-рядный яровой"
    });
  });

  it("treats local yeast in auto mode as localized-first even when only country name is available", () => {
    expect(resolveIngredientDisplayNames({
      type: "yeast",
      countryName: "Russia",
      nameRu: "Квик Восс",
      nameEn: "Voss Kveik",
      displayModeRu: "auto"
    })).toEqual({
      primaryName: "Квик Восс",
      secondaryName: "Voss Kveik"
    });
  });

  it("treats foreign yeast in auto mode as source-first", () => {
    expect(resolveIngredientDisplayNames({
      type: "yeast",
      countryName: "China",
      nameRu: "BF16 Лагер",
      nameEn: "BF16 Lager",
      displayModeRu: "auto"
    })).toEqual({
      primaryName: "BF16 Lager",
      secondaryName: "BF16 Лагер"
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

  it("omits negative fermentable color values from summaries", () => {
    expect(buildIngredientTypedSummary({
      category: "fermentable",
      subtype: "fermentable",
      technicalData: {
        type: "fermentable",
        colorLovibond: -0.5,
        extractPctDryBasis: 80
      }
    })).toBe("Экст-ть 80%");
  });

  it("resolves country labels and codes from country code", () => {
    expect(resolveIngredientCountry({
      countryCode: "US",
      countryName: "USA"
    })).toEqual({
      code: "US",
      label: "USA"
    });
  });

  it("resolves country labels and codes from country names", () => {
    expect(resolveIngredientCountry({
      countryName: "Россия"
    })).toEqual({
      code: "RU",
      label: "Россия"
    });
  });

  it("resolves country labels and codes for catalog countries stored as names only", () => {
    expect(resolveIngredientCountry({
      countryName: "Австралия"
    })).toEqual({
      code: "AU",
      label: "Австралия"
    });

    expect(resolveIngredientCountry({
      countryName: "Индонезия"
    })).toEqual({
      code: "ID",
      label: "Индонезия"
    });

    expect(resolveIngredientCountry({
      countryName: "Таиланд"
    })).toEqual({
      code: "TH",
      label: "Таиланд"
    });

    expect(resolveIngredientCountry({
      countryName: "Латвия"
    })).toEqual({
      code: "LV",
      label: "Латвия"
    });

    expect(resolveIngredientCountry({
      countryName: "Вьетнам"
    })).toEqual({
      code: "VN",
      label: "Вьетнам"
    });
  });
});
