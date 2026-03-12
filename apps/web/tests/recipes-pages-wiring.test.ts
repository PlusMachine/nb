import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RecipeDetailDto, RecipeListItemDto } from "../features/recipes/contracts";

const recipeListItem: RecipeListItemDto = {
  id: "r-1",
  authorId: "u-1",
  status: "draft",
  visibility: "private",
  title: "My Pils",
  slug: null,
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  og: 1.048,
  fg: 1.01,
  abv: 5,
  ibu: 28,
  color: 7,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
};

const recipeDetail: RecipeDetailDto = {
  ...recipeListItem,
  description: "desc",
  authorNotes: "notes",
  heroImageId: null,
  ingredients: []
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "u1@example.com" })),
  listRecipesForAuthor: vi.fn(async () => [recipeListItem]),
  getRecipeById: vi.fn(async () => recipeDetail),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({
  listRecipesForAuthor: mocks.listRecipesForAuthor,
  getRecipeById: mocks.getRecipeById
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

describe("recipes pages wiring", () => {
  it("list page uses listRecipesForAuthor", async () => {
    const { default: RecipesPage } = await import("../app/(app)/app/recipes/page");
    const view = await RecipesPage();
    const html = renderToStaticMarkup(view);

    expect(mocks.listRecipesForAuthor).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Мои рецепты");
    expect(html).toContain("My Pils");
  });

  it("list page empty state scenario works", async () => {
    mocks.listRecipesForAuthor.mockResolvedValueOnce([]);
    const { default: RecipesPage } = await import("../app/(app)/app/recipes/page");
    const view = await RecipesPage();
    const html = renderToStaticMarkup(view);

    expect(html).toContain("Пока нет рецептов");
  });

  it("detail page uses getRecipeById", async () => {
    const { default: RecipePage } = await import("../app/(app)/app/recipes/[id]/page");
    const view = await RecipePage({ params: Promise.resolve({ id: "r-1" }) });
    const html = renderToStaticMarkup(view);

    expect(mocks.getRecipeById).toHaveBeenCalledWith("u-1", "r-1");
    expect(html).toContain("My Pils");
    expect(html).toContain("Ингредиенты");
  });

  it("foreign recipe is blocked through service wiring", async () => {
    mocks.getRecipeById.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const { default: RecipePage } = await import("../app/(app)/app/recipes/[id]/page");

    await expect(RecipePage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
