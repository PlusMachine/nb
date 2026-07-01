import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OwnerRecipeCardDto } from "../features/recipes/contracts";

const ownerCard: OwnerRecipeCardDto = {
  id: "r-1",
  slug: "public-ipa",
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

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "u1@example.com", preferredGravityUnit: "plato" })),
  listAuthorRecipeCards: vi.fn(async () => [ownerCard]),
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
vi.mock("../features/recipes/service", () => ({ listAuthorRecipeCards: mocks.listAuthorRecipeCards }));
vi.mock("../app/(app)/app/recipes/actions", () => ({
  deleteRecipeAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  cloneRecipeAction: mocks.cloneRecipeAction
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  usePathname: vi.fn(() => "/app/recipes"),
  useRouter: vi.fn(() => ({ push: mocks.push }))
}));

describe("recipes pages wiring", () => {
  it("list page uses listAuthorRecipeCards", async () => {
    const { MyRecipesContent } = await import("../app/(app)/app/recipes/content");
    const view = await MyRecipesContent();
    const html = renderToStaticMarkup(view);

    expect(mocks.listAuthorRecipeCards).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Рецепты");
    expect(html).toContain("My Pils");
    expect(html).toContain("Приватный");
    expect(html).toContain('href="/app/recipes/r-1/edit"');
    expect(html).not.toContain('href="/app/recipes/r-1"');
    expect(html).toContain("Удалить");
  });

  it("list page empty state scenario works", async () => {
    mocks.listAuthorRecipeCards.mockResolvedValueOnce([]);
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
