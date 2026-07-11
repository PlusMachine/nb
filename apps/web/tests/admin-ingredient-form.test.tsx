import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// admin-ingredient-form.tsx не импортирует React явно (в отличие от
// большинства других клиентских компонентов в этом репо) — с automatic JSX
// runtime у Next.js это нормально, но esbuild/vitest транспилирует JSX в
// классический React.createElement(...), которому нужен React в области
// видимости модуля. Компонент трогать нельзя, поэтому подставляем React в
// globalThis до того, как рендер вызовет тело компонента.
(globalThis as unknown as { React: typeof React }).React = React;

import {
  AdminIngredientForm,
  getAdminIngredientFieldVisibility,
  getAdminIngredientSubtypeOptions,
  getNextAdminIngredientTaxonomyState
} from "../components/ingredients/admin-ingredient-form";

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
    expect(html).toContain("JSON-редакторы");
    expect(html).toContain("Атрибуты");
    expect(html).toContain("Источники");
    expect(html).not.toContain("Варианты упаковки");
    expect(html).toContain("Cascade");
    expect(html).toContain("Каскад");
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
  });
});
