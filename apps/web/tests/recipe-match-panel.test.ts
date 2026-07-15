import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecipeMatchPanelView } from "../components/recipes/recipe-match-panel";
import type { RecipeMatchDto, RecipeMatchLineDto } from "../features/recipes/contracts";

const baseLine = (overrides: Partial<RecipeMatchLineDto> = {}): RecipeMatchLineDto => ({
  recipeIngredientId: "ri-1",
  persistentKey: "ri-1-pk",
  displayOrder: 0,
  ingredientDisplayName: "Кориандр молотый",
  category: "consumable",
  status: "missing",
  coveragePercent: 0,
  requiredQuantityNormalized: 10,
  availableQuantityNormalized: 0,
  shortfallNormalized: 10,
  normalizedUnit: "g",
  viaSubstitute: false,
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  suggestedAddQuantity: 10,
  suggestedAddUnit: "g",
  ...overrides
});

const baseMatch = (lines: RecipeMatchLineDto[], overrides: Partial<RecipeMatchDto> = {}): RecipeMatchDto => ({
  recipeId: "r-1",
  matchPercent: 50,
  label: "partial",
  totalLines: lines.length,
  coveredLines: 0,
  missingCount: lines.filter((line) => line.status === "missing").length,
  lines,
  targetBatchVolumeL: 20,
  recipeBatchVolumeL: 20,
  scaledToInventory: false,
  ...overrides
});

const render = (match: RecipeMatchDto) =>
  renderToStaticMarkup(React.createElement(RecipeMatchPanelView, { match, onChanged: () => undefined }));

describe("RecipeMatchPanelView — П3: строки-нехватки без привязки получают выход", () => {
  it("renders the inline «На склад» form for a gap line with only a custom-ingredient link", () => {
    const html = render(baseMatch([
      baseLine({ ingredientCatalogItemId: null, userCustomIngredientId: "custom-1" })
    ]));

    expect(html).toContain("Не хватает на складе");
    expect(html).toContain("Кориандр молотый");
    expect(html).toContain("На склад");
    // Не должно провалиться в «нет привязки вовсе» ветку.
    expect(html).not.toContain("Найти в каталоге");
  });

  it("renders two links (catalog search + add-custom deeplink) for a gap line with no link at all", () => {
    const html = render(baseMatch([baseLine()]));

    expect(html).toContain("Не хватает на складе");
    expect(html).toContain("Кориандр молотый");
    expect(html).toContain("Найти в каталоге");
    expect(html).toContain("Добавить свой");
    expect(html).toContain('href="/catalog?q=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80%20%D0%BC%D0%BE%D0%BB%D0%BE%D1%82%D1%8B%D0%B9"');
    expect(html).toContain(
      'href="/app/ingredients?addName=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80%20%D0%BC%D0%BE%D0%BB%D0%BE%D1%82%D1%8B%D0%B9&amp;addQty=10&amp;addUnit=g&amp;addCategory=consumable"'
    );
    // Не рендерит инлайн-форму количества для этой строки (нечего докидывать).
    expect(html).not.toContain('aria-label="Количество, г"');
  });

  it("no gap section renders when every line is covered", () => {
    const html = render(baseMatch([baseLine({ status: "covered", coveragePercent: 100 })], { missingCount: 0 }));

    expect(html).not.toContain("Не хватает на складе");
  });
});

describe("RecipeMatchPanelView — П2: вердикт ведёт в список покупок", () => {
  it("делает «не хватает K» ссылкой на /app/shopping, когда нехватки есть", () => {
    const html = render(baseMatch([baseLine()], { missingCount: 3, coveredLines: 2, totalLines: 5 }));

    expect(html).toMatch(/<a[^>]+href="\/app\/shopping"[^>]*>\s*не хватает 3\s*<\/a>/);
  });

  it("не рендерит ссылку на /app/shopping, когда нехваток нет", () => {
    const html = render(baseMatch([baseLine({ status: "covered", coveragePercent: 100 })], { missingCount: 0 }));

    expect(html).not.toContain('href="/app/shopping"');
    expect(html).toContain("Есть 0 из 1");
    expect(html).not.toContain("Есть 0 из 1 · ");
  });
});
