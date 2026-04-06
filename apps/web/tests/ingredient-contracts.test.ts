import { describe, expect, it } from "vitest";

import { ingredientSearchQuerySchema, ingredientUpsertSchema } from "../features/ingredients/contracts";

describe("ingredient contracts", () => {
  it("accepts type and category filters from the new taxonomy", () => {
    const byType = ingredientSearchQuerySchema.parse({ q: "citra", type: "hop" });
    const byCategory = ingredientSearchQuerySchema.parse({ q: "chloride", category: "water_treatment" });
    const byConsumableGroup = ingredientSearchQuerySchema.parse({ q: "pbw", category: "consumable", group: "cleaner" });
    const expandedLimit = ingredientSearchQuerySchema.parse({ q: "pils", limit: 61 });
    const byFamily = ingredientSearchQuerySchema.parse({ q: "", category: "fermentable", subtype: "malt", family: "pilsner" });
    const byFavorites = ingredientSearchQuerySchema.parse({ q: "", category: "fermentable", subtype: "malt", favoritesOnly: true });

    expect(byType.type).toBe("hop");
    expect(byCategory.category).toBe("water_treatment");
    expect(byConsumableGroup.group).toBe("cleaner");
    expect(expandedLimit.limit).toBe(61);
    expect(byFamily.family).toBe("pilsner");
    expect(byFavorites.favoritesOnly).toBe(true);
  });

  it("rejects empty searches that have neither text nor family scope", () => {
    expect(() => ingredientSearchQuerySchema.parse({ q: "" })).toThrow(/Search query or scope is required/);
  });

  it("accepts hop payloads built from canonical names and real aliases", () => {
    const parsed = ingredientUpsertSchema.parse({
      type: "hop",
      nameRu: "Каскад",
      nameEn: "Cascade",
      displayModeRu: "source_first",
      countryCode: "US",
      producer: "Yakima Chief",
      attributes: {
        alpha_acid_pct_typical: 5.8,
        beta_acid_pct_typical: 6.1,
        hop_form: "pellet"
      },
      aliases: [
        { locale: "ru", alias: "каскад" },
        { locale: "en", alias: "cascade" }
      ],
      sources: [
        { label: "BirRF", url: "https://example.test/cascade", position: 0 }
      ]
    });

    expect(parsed.type).toBe("hop");
    expect(parsed.attributes.alpha_acid_pct_typical).toBe(5.8);
    expect(parsed.aliases).toHaveLength(2);
    expect(parsed.sources[0]?.label).toBe("BirRF");
  });

  it("accepts consumables with quantity defaults and package variants", () => {
    const parsed = ingredientUpsertSchema.parse({
      type: "consumable",
      category: "consumable",
      itemKind: "sanitizer",
      nameRu: "Кислотный санитайзер",
      nameEn: "Acid Sanitizer",
      displayModeRu: "localized_first",
      quantityDefaults: {
        quantity_model: "volume",
        recipe_unit_default: "ml",
        stock_unit_default: "ml",
        stock_mode_default: "by_package_content"
      },
      attributes: {
        common_forms: ["liquid"],
        usage_stage: ["packaging"]
      },
      packageVariants: [{
        id: "pv-star-san-946",
        brand: "Five Star",
        productNameEn: "Star San",
        productNameRu: "Star San",
        packageAmount: 946,
        packageUnit: "ml",
        stockContentAmount: 946,
        stockContentUnit: "ml",
        isDefaultForStock: true
      }]
    });

    expect(parsed.quantityDefaults?.stock_unit_default).toBe("ml");
    expect(parsed.packageVariants[0]?.productNameRu).toBe("Star San");
  });

  it("rejects package variants for water treatment items", () => {
    expect(() => ingredientUpsertSchema.parse({
      type: "water_treatment",
      category: "water_treatment",
      itemKind: "acid",
      nameRu: "Молочная кислота",
      displayModeRu: "localized_first",
      packageVariants: [{
        id: "not-allowed",
        brand: "Test",
        productNameEn: "Lactic Acid",
        productNameRu: "Lactic Acid"
      }]
    })).toThrow(/Package variants are only supported for consumables/);
  });
});
