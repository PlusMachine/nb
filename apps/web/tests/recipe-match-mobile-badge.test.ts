import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecipeMatchMobileBadgeView } from "../components/recipes/recipe-match-mobile-badge";
import type { RecipeMatchDto, RecipeMatchLineDto } from "../features/recipes/contracts";

// Ф25: gapCount читается из match.lines (countStockGaps), а не из missingCount —
// фикстура несёт настоящие строки-нехватки, чтобы счётчик считался по ним же.
const gapLine = (overrides: Partial<RecipeMatchLineDto> = {}): RecipeMatchLineDto => ({
  recipeIngredientId: "gap-1",
  persistentKey: "gap-1-pk",
  displayOrder: 0,
  ingredientDisplayName: "Хмель",
  category: "hop",
  brand: null,
  status: "missing",
  coveragePercent: 0,
  requiredQuantityNormalized: 10,
  availableQuantityNormalized: 0,
  shortfallNormalized: 10,
  normalizedUnit: "g",
  viaSubstitute: false,
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  suggestedAddQuantity: null,
  suggestedAddUnit: null,
  ...overrides
});

const baseMatch = (overrides: Partial<RecipeMatchDto> = {}): RecipeMatchDto => ({
  recipeId: "r-1",
  matchPercent: 60,
  label: "partial",
  totalLines: 5,
  coveredLines: 3,
  missingCount: 2,
  lines: [gapLine({ recipeIngredientId: "gap-1" }), gapLine({ recipeIngredientId: "gap-2" })],
  targetBatchVolumeL: 20,
  recipeBatchVolumeL: 20,
  scaledToInventory: false,
  hasEquipmentProfile: null,
  ...overrides
});

const render = (match: RecipeMatchDto) => renderToStaticMarkup(React.createElement(RecipeMatchMobileBadgeView, { match }));

describe("RecipeMatchMobileBadgeView — П1: вердикт матча виден на мобильном", () => {
  it("показывает процент и «Есть N из M · не хватает K» без новых формулировок", () => {
    const html = render(baseMatch());

    expect(html).toContain("60%");
    expect(html).toContain("Есть 3 из 5");
    expect(html).toContain("не хватает 2");
  });

  it("скрывает «не хватает» при полном покрытии", () => {
    const html = render(baseMatch({ missingCount: 0, coveredLines: 5, lines: [] }));

    expect(html).toContain("Есть 5 из 5");
    expect(html).not.toContain("не хватает");
  });

  it("Ф25: partial-строка тоже считается нехваткой в счётчике плашки", () => {
    const html = render(baseMatch({
      coveredLines: 4,
      lines: [gapLine({ recipeIngredientId: "gap-partial", status: "partial", coveragePercent: 40 })]
    }));

    expect(html).toContain("не хватает 1");
  });

  it("рендерится кнопкой, скроллящей к #match-panel (не ссылкой)", () => {
    const html = render(baseMatch());

    expect(html).toMatch(/<button[^>]*class="[^"]*lg:hidden[^"]*"/);
  });

  it("рендерит null, когда в рецепте нет строк", () => {
    const html = render(baseMatch({ totalLines: 0 }));

    expect(html).toBe("");
  });
});
