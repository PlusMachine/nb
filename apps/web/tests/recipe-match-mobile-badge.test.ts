import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecipeMatchMobileBadgeView } from "../components/recipes/recipe-match-mobile-badge";
import type { RecipeMatchDto } from "../features/recipes/contracts";

const baseMatch = (overrides: Partial<RecipeMatchDto> = {}): RecipeMatchDto => ({
  recipeId: "r-1",
  matchPercent: 60,
  label: "partial",
  totalLines: 5,
  coveredLines: 3,
  missingCount: 2,
  lines: [],
  targetBatchVolumeL: 20,
  recipeBatchVolumeL: 20,
  scaledToInventory: false,
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
    const html = render(baseMatch({ missingCount: 0, coveredLines: 5 }));

    expect(html).toContain("Есть 5 из 5");
    expect(html).not.toContain("не хватает");
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
