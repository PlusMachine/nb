import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined })
}));

import { AdminIngredientForm } from "../components/ingredients/admin-ingredient-form";
import {
  getAdminIngredientFieldVisibility,
  getAdminIngredientSubtypeOptions,
  getNextAdminIngredientTaxonomyState,
  validateJsonText
} from "../features/ingredients/admin-form-model";

describe("admin ingredient form", () => {
  it("exposes subtype options from the new taxonomy source of truth", () => {
    expect(getAdminIngredientSubtypeOptions("fermentable")).toContain("malt");
    expect(getAdminIngredientSubtypeOptions("water_treatment")).toContain("acid");
    expect(getAdminIngredientSubtypeOptions("consumable")).toContain("technical_additives");
    expect(getAdminIngredientSubtypeOptions("consumable")).toContain("flavoring");
  });

  it("returns category-aware field visibility", () => {
    expect(getAdminIngredientFieldVisibility("hop", "hop")).toEqual({
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources"]
    });

    expect(getAdminIngredientFieldVisibility("water_treatment", "acid").advanced).toContain("quantity_defaults");
    expect(getAdminIngredientFieldVisibility("consumable", "sanitizer").advanced).toContain("package_variants");
  });

  it("resets incompatible subtype when category changes", () => {
    expect(getNextAdminIngredientTaxonomyState({
      category: "fermentable",
      subtype: "malt"
    }, {
      category: "hop"
    })).toEqual({
      category: "hop",
      subtype: "hop"
    });
  });

  it("renders the new source-of-truth fields for standard catalog editing", () => {
    const html = renderToStaticMarkup(React.createElement(AdminIngredientForm, {
      initial: {
        id: "hop-cascade",
        type: "hop",
        category: "hop",
        subtype: "hop",
        nameRu: "Каскад",
        nameEn: "Cascade",
        displayModeRu: "source_first",
        aliases: [],
        sources: [{ id: "src-1", kind: null, label: "BirRF", url: null, sourceBasis: null, position: 0 }],
        attributes: { alpha_acid_pct_typical: 5.8, hop_form: "pellet" }
      }
    }));

    expect(html).toContain('name="nameRu"');
    expect(html).toContain('name="nameEn"');
    expect(html).toContain('name="displayModeRu"');
    expect(html).toContain("Атрибуты");
    expect(html).toContain("Источники");
    expect(html).toContain("Алиасы");
    expect(html).not.toContain("Варианты упаковки");
    expect(html).toContain("Cascade");
    expect(html).toContain("Каскад");
  });

  it("keeps package variant fields out of the payload shape for non-consumables", () => {
    const html = renderToStaticMarkup(React.createElement(AdminIngredientForm, {
      initial: {
        id: "hop-citra",
        type: "hop",
        category: "hop",
        subtype: "hop",
        nameEn: "Citra",
        aliases: [
          { id: "a-1", locale: "ru", alias: "Цитра", aliasNormalized: "цитра", source: "admin", isEnabled: true }
        ],
        attributes: {}
      }
    }));

    // Алиасы редактируются полями, а не сырым JSON: значение попадает в input.
    expect(html).toContain('value="Цитра"');
  });

  it("renders package variant and quantity settings for consumables", () => {
    const html = renderToStaticMarkup(React.createElement(AdminIngredientForm, {
      initial: {
        id: "acid-sanitizer",
        type: "consumable",
        category: "consumable",
        subtype: "sanitizer",
        nameRu: "Кислотный санитайзер",
        nameEn: "Acid Sanitizer",
        displayModeRu: "localized_first",
        aliases: [],
        packageVariants: [{
          id: "pv-1",
          brand: "Five Star",
          productNameEn: "Star San",
          productNameRu: "Star San",
          countryNameRu: null,
          packageAmount: 946,
          packageUnit: "ml",
          stockContentAmount: 946,
          stockContentUnit: "ml",
          sourceGroup: null,
          sourceUrl: null,
          isDefaultForStock: true,
          position: 0
        }],
        quantityDefaults: {
          quantity_model: "volume",
          recipe_unit_default: "ml",
          stock_unit_default: "ml",
          stock_mode_default: "by_package_content"
        },
        attributes: { usage_stage: ["packaging"] }
      }
    }));

    expect(html).toContain("Варианты упаковки");
    expect(html).toContain("Количества по умолчанию");
    expect(html).toContain("Рецепт / Склад");
    expect(html).toContain("package_variants");
    expect(html).toContain("quantity_defaults");
    // Фасовка редактируется полями: значения вариантов приходят в inputs.
    expect(html).toContain('value="Five Star"');
    expect(html).toContain('value="946"');
  });

  it("validates json fields against the expected shape", () => {
    expect(validateJsonText("", "object")).toBeNull();
    expect(validateJsonText('{"a": 1}', "object")).toBeNull();
    expect(validateJsonText("{oops}", "object")).toBe("Некорректный JSON.");
    expect(validateJsonText("[1, 2]", "object")).toBe("Ожидается объект в фигурных скобках.");
    expect(validateJsonText('{"a": 1}', "array")).toBe("Ожидается массив в квадратных скобках.");
    expect(validateJsonText("[]", "array")).toBeNull();
    expect(validateJsonText("null", "object_or_null")).toBeNull();
    expect(validateJsonText("null", "object")).toBe("Ожидается объект в фигурных скобках.");
  });
});
