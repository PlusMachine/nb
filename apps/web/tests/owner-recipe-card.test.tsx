import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OwnerRecipeCardDto } from "../features/recipes/contracts";

// Карточка тянет серверный экшен удаления — мокаем, чтобы не тащить db-слой в тест.
vi.mock("../app/(app)/app/recipes/actions", () => ({
  deleteRecipeAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { OwnerRecipeCard, OwnerRecipeRow } from "../components/recipes/owner-recipe-card";

const baseRecipe: OwnerRecipeCardDto = {
  id: "r-1",
  slug: "my-pils",
  title: "My Pils",
  publicationState: "draft",
  versionNumber: 1,
  versionCount: 1,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  styleName: null,
  styleCode: null,
  styleHref: null,
  og: 1.048,
  abv: 5,
  ibu: 28,
  colorSrm: 7,
  heroImage: null,
  styleImageUrl: null,
  styleFit: null
};

describe("OwnerRecipeCard", () => {
  it("published → показывает бейдж «Публичный»", () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeCard recipe={{ ...baseRecipe, publicationState: "published" }} preferredGravityUnit="plato" />
    );
    expect(html).toContain("Публичный");
  });

  it("private → статус-бейдж не рендерится вовсе", () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeCard recipe={{ ...baseRecipe, publicationState: "private" }} preferredGravityUnit="plato" />
    );
    expect(html).not.toContain("Публичный");
    expect(html).not.toContain("Приватный");
  });

  it("styleFit=deviations → «Вне стиля» не рендерится", () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeCard recipe={{ ...baseRecipe, styleFit: "deviations" }} preferredGravityUnit="plato" />
    );
    expect(html).not.toContain("Вне стиля");
    expect(html).not.toContain("В стиле");
  });

  it("styleFit=in_style → показывает «В стиле»", () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeCard recipe={{ ...baseRecipe, styleFit: "in_style" }} preferredGravityUnit="plato" />
    );
    expect(html).toContain("В стиле");
  });

  it('intent="brew" → нет кнопки «Действия», есть аффорданс «Сварить»', () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeCard
        recipe={baseRecipe}
        preferredGravityUnit="plato"
        intent="brew"
        onBrew={() => undefined}
      />
    );
    expect(html).not.toContain('aria-label="Действия с рецептом');
    expect(html).toContain("Сварить");
  });

  it('intent="manage" (по умолчанию) → есть кнопка-меню «Действия», label привязан к названию рецепта', () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeCard recipe={baseRecipe} preferredGravityUnit="plato" />
    );
    expect(html).toContain('aria-label="Действия с рецептом');
    expect(html).toMatch(/aria-label="Действия с рецептом[^"]*My Pils[^"]*"/);
  });

  it('intent="preview" → нет кнопки «Действия», stretched-link ведёт в редактор', () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeCard
        recipe={baseRecipe}
        preferredGravityUnit="plato"
        intent="preview"
        onBrew={() => undefined}
      />
    );
    expect(html).not.toContain('aria-label="Действия с рецептом');
    expect(html).toContain('href="/app/recipes/r-1/edit"');
  });

  it('intent="manage" → у каждой карточки в списке label содержит её название', () => {
    const recipeA = { ...baseRecipe, id: "r-a", title: "Alpha IPA" };
    const recipeB = { ...baseRecipe, id: "r-b", title: "Beta Stout" };
    const html = renderToStaticMarkup(
      <>
        <OwnerRecipeCard recipe={recipeA} preferredGravityUnit="plato" />
        <OwnerRecipeCard recipe={recipeB} preferredGravityUnit="plato" />
      </>
    );
    expect(html).toMatch(/aria-label="Действия с рецептом[^"]*Alpha IPA[^"]*"/);
    expect(html).toMatch(/aria-label="Действия с рецептом[^"]*Beta Stout[^"]*"/);
  });
});

describe("OwnerRecipeRow", () => {
  it('intent="brew" → нет кнопки «Действия», есть «Сварить»', () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeRow
        recipe={baseRecipe}
        preferredGravityUnit="plato"
        intent="brew"
        onBrew={() => undefined}
      />
    );
    expect(html).not.toContain('aria-label="Действия с рецептом');
    expect(html).toContain("Сварить");
  });

  it('intent="manage" → есть кнопка-меню «Действия», label привязан к названию рецепта', () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeRow recipe={baseRecipe} preferredGravityUnit="plato" />
    );
    expect(html).toMatch(/aria-label="Действия с рецептом[^"]*My Pils[^"]*"/);
  });

  it('intent="preview" → нет кнопки «Действия», stretched-link ведёт в редактор', () => {
    const html = renderToStaticMarkup(
      <OwnerRecipeRow
        recipe={baseRecipe}
        preferredGravityUnit="plato"
        intent="preview"
        onBrew={() => undefined}
      />
    );
    expect(html).not.toContain('aria-label="Действия с рецептом');
    expect(html).toContain('href="/app/recipes/r-1/edit"');
  });
});
