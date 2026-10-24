import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecipeHeaderShell } from "../components/recipes/recipe-color-band";
import { RecipeIngredientsSection } from "../components/recipes/recipe-ingredients-section";
import { RecipeStatsSummary } from "../components/recipes/recipe-stats-summary";
import type { RecipeIngredientDto } from "../features/recipes/contracts";

const recipe = { styleId: "3B", og: 1.048, fg: 1.015, abv: 4.4, ibu: 40, color: 4 };
const textContent = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const trackGeometry = (html: string) => html.match(/style="left:[^"]+"/g) ?? [];

describe("public recipe presentation", () => {
  it.each(["sg", "plato", "brix"] as const)("keeps the same values, labels and five style tracks in %s", (unit) => {
    const card = renderToStaticMarkup(<RecipeStatsSummary recipe={recipe} preferredGravityUnit={unit} />);
    const plain = renderToStaticMarkup(<RecipeStatsSummary recipe={recipe} preferredGravityUnit={unit} variant="plain" />);

    expect(textContent(plain)).toBe(textContent(card));
    expect(plain).toContain("Параметры рецепта");
    expect(plain).toContain("В стиле");
    expect(trackGeometry(plain)).toHaveLength(10);
    expect(trackGeometry(plain)).toEqual(trackGeometry(card));
    expect(plain).not.toContain("Этот рецепт");
    expect(plain).not.toContain("В диапазонах");
  });

  it("keeps the deviation status and marker positions for values outside the style", () => {
    const outside = { ...recipe, og: 1.09, ibu: 5 };
    const card = renderToStaticMarkup(<RecipeStatsSummary recipe={outside} preferredGravityUnit="plato" />);
    const plain = renderToStaticMarkup(<RecipeStatsSummary recipe={outside} preferredGravityUnit="plato" variant="plain" />);

    expect(textContent(plain)).toBe(textContent(card));
    expect(plain).toContain("Есть отклонения");
    expect(plain).toContain("выше");
    expect(plain).toContain("ниже");
    expect(trackGeometry(plain)).toEqual(trackGeometry(card));
  });

  it("does not invent a style status or ranges when the recipe has no style", () => {
    const html = renderToStaticMarkup(<RecipeStatsSummary recipe={{ ...recipe, styleId: null }} preferredGravityUnit="plato" variant="plain" />);
    expect(html).not.toContain("В стиле");
    expect(html).not.toContain("Есть отклонения");
    expect(trackGeometry(html)).toHaveLength(0);
    for (const label of ["OG", "FG", "ABV", "IBU", "Цвет"]) expect(html).toContain(label);
  });

  it.each([4, 12, 40])("keeps the SRM colour strip above the recipe header at %s SRM", (colorSrm) => {
    const html = renderToStaticMarkup(<RecipeHeaderShell colorSrm={colorSrm}><h1>Pilsner Urquell</h1></RecipeHeaderShell>);
    expect(html).toContain("linear-gradient(90deg");
    expect(html).toContain("h-1.5 w-full");
    expect(html.indexOf("linear-gradient")).toBeLessThan(html.indexOf("<h1"));
  });

  it("omits the strip only when no recipe colour is available", () => {
    const html = renderToStaticMarkup(<RecipeHeaderShell colorSrm={null}><h1>Рецепт</h1></RecipeHeaderShell>);
    expect(html).not.toContain("linear-gradient");
    expect(html).toContain("Рецепт");
  });

  it("keeps ingredient amounts, technical data, links and category stripes", () => {
    const base: RecipeIngredientDto = {
      id: "malt", recipeId: "recipe", persistentKey: "00000000-0000-4000-8000-000000000001", displayOrder: 0,
      ingredientCatalogItemId: "pilsner", userCustomIngredientId: null,
      type: "malt", ingredientCategory: "fermentable", ingredientSubtype: "malt", ingredientDisplayName: "Пильзнер",
      amountEnteredQuantity: 5.7, amountEnteredUnit: "kg", amountNormalizedQuantity: 5700, amountNormalizedUnit: "g",
      stage: "mash", timeOffset: null, stepMeta: null,
      ingredientTechnicalData: { type: "malt", colorEbcMin: 5.3, colorEbcMax: 5.3, extractPctDryBasis: 80.5 },
      createdAt: new Date("2026-10-23T00:00:00Z"), updatedAt: new Date("2026-10-23T00:00:00Z")
    };
    const hop: RecipeIngredientDto = {
      ...base, id: "hop", persistentKey: "00000000-0000-4000-8000-000000000002", displayOrder: 1,
      ingredientCatalogItemId: "saaz", type: "hop", ingredientCategory: "hop", ingredientSubtype: "hop", ingredientDisplayName: "Saaz",
      amountEnteredQuantity: 50, amountEnteredUnit: "g", amountNormalizedQuantity: 50,
      stage: "boil", timeOffset: 60, ingredientTechnicalData: { type: "hop", alphaAcidPctTypical: 4 }
    };
    const html = renderToStaticMarkup(<RecipeIngredientsSection ingredients={[base, hop]} batchSizeEnteredQuantity={30} batchSizeEnteredUnit="l" efficiency={72} />);
    for (const value of ["Пильзнер", "Saaz", "5.3 EBC", "Экст-ть 80.5%", "100%", "60 мин", "30 л", "72%"]) expect(textContent(html)).toContain(value);
    expect(html).toContain('href="/catalog/system/pilsner"');
    expect(html).toContain('href="/catalog/system/saaz"');
    expect(html).toContain("border-l-amber-400");
    expect(html).toContain("border-l-emerald-500");
    expect(html).toContain("border-l-[3px]");
  });
});
