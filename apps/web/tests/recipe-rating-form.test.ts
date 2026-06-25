import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Не тянем серверный actions-модуль (next/cache, lib/auth) в node-рендер.
vi.mock("@/app/(public)/recipes/[slug]/actions", () => ({
  rateRecipeAction: vi.fn(),
  deleteRecipeRatingAction: vi.fn(),
  loadRecipeRatingViewerState: vi.fn()
}));

import { RecipeRatingForm, RecipeRatingFormView } from "../components/recipes/recipe-rating-form";
import type { RecipeRatingViewerState } from "../app/(public)/recipes/[slug]/actions";

const renderView = (viewerState: RecipeRatingViewerState) =>
  renderToStaticMarkup(
    React.createElement(RecipeRatingFormView, { recipeId: "r-1", slug: "hazy-ipa", viewerState })
  );

describe("RecipeRatingFormView", () => {
  it("renders 5 star buttons for a signed-in user who can rate", () => {
    const html = renderView({ authenticated: true, canRate: true, rating: null });
    for (const value of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`Оценить на ${value} из 5`);
    }
    expect(html).toContain("Оценить");
  });

  it("shows a login CTA when not authenticated", () => {
    const html = renderView({ authenticated: false, canRate: false, rating: null });
    expect(html).toContain("Войдите");
    expect(html).toContain("/login");
    expect(html).not.toContain("Оценить на 1 из 5");
  });

  it("blocks rating when canRate is false (own recipe)", () => {
    const html = renderView({ authenticated: true, canRate: false, rating: null });
    expect(html).toContain("Нельзя оценивать собственный рецепт");
    expect(html).not.toContain("Оценить на 1 из 5");
  });

  it("prefills the existing rating and offers update + remove", () => {
    const html = renderView({ authenticated: true, canRate: true, rating: { stars: 4, body: "Хорошо" } });
    expect(html).toContain("Обновить оценку");
    expect(html).toContain("Убрать оценку");
    expect(html).toContain("Хорошо");
  });
});

describe("RecipeRatingForm (self-fetching wrapper)", () => {
  it("renders a neutral placeholder in static/SSR markup (no personal content → cacheable)", () => {
    // Эффект не выполняется в renderToStaticMarkup → персональное состояние не загружено,
    // значит документ не содержит per-user данных и кэшируется одинаково для всех.
    const html = renderToStaticMarkup(
      React.createElement(RecipeRatingForm, { recipeId: "r-1", slug: "hazy-ipa" })
    );
    expect(html).toContain("Загрузка");
    expect(html).not.toContain("Оценить на 1 из 5");
    expect(html).not.toContain("Войдите");
  });
});
