import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RecipeListItemDto } from "../features/recipes/contracts";

const recipeListItem: RecipeListItemDto = {
  id: "r-1",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "draft",
  title: "My Pils",
  slug: "public-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.048,
  fg: 1.01,
  abv: 5,
  ibu: 28,
  color: 7,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "u1@example.com" })),
  listRecipesForAuthor: vi.fn(async () => [recipeListItem]),
  cloneRecipeAction: vi.fn(async () => ({ ok: true, message: "ok", recipe: { id: "r-2" } })),
  push: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({ listRecipesForAuthor: mocks.listRecipesForAuthor }));
vi.mock("../app/(app)/app/recipes/actions", () => ({
  deleteRecipeAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  cloneRecipeAction: mocks.cloneRecipeAction
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  useRouter: vi.fn(() => ({ push: mocks.push }))
}));

describe("recipes pages wiring", () => {
  it("list page uses listRecipesForAuthor", async () => {
    const { MyRecipesContent } = await import("../app/(app)/app/recipes/content");
    const view = await MyRecipesContent();
    const html = renderToStaticMarkup(view);

    expect(mocks.listRecipesForAuthor).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Мои рецепты");
    expect(html).toContain("My Pils");
    expect(html).toContain("Приватный");
    expect(html).toContain('href="/app/recipes/r-1/edit"');
    expect(html).not.toContain('href="/app/recipes/r-1"');
    expect(html).toContain("Удалить");
  });

  it("list page empty state scenario works", async () => {
    mocks.listRecipesForAuthor.mockResolvedValueOnce([]);
    const { MyRecipesContent } = await import("../app/(app)/app/recipes/content");
    const view = await MyRecipesContent();
    const html = renderToStaticMarkup(view);

    expect(html).toContain("Пока нет рецептов");
  });

  it("compat route redirects legacy owner detail url to edit", async () => {
    const { default: RecipePage } = await import("../app/(app)/app/recipes/[id]/page");

    await expect(RecipePage({ params: Promise.resolve({ id: "r-1" }) })).rejects.toThrow("NEXT_REDIRECT:/app/recipes/r-1/edit");
    expect(mocks.redirect).toHaveBeenCalledWith("/app/recipes/r-1/edit");
  });
});
