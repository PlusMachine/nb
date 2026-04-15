import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultRecipeProcessMeta, type RecipeDetailDto, type RecipeListItemDto } from "../features/recipes/contracts";

const publicRecipe: RecipeDetailDto = {
  id: "r-public",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  title: "Public IPA",
  slug: "public-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9.5,
  description: "Public desc",
  authorNotes: "Public notes",
  processMeta: defaultRecipeProcessMeta,
  heroImageId: null,
  versions: [{ id: "r-1", versionNumber: 1, updatedAt: new Date("2026-01-02T00:00:00.000Z") }],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: [
    {
      id: "ri-1",
      recipeId: "r-public",
      persistentKey: "00000000-0000-4000-8000-000000000021",
      displayOrder: 0,
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      type: "hop",
      amountEnteredQuantity: 50,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 50,
      amountNormalizedUnit: "g",
      stage: "boil",
      timeOffset: 20,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  ]
};

const publicList: RecipeListItemDto[] = [
  {
    id: "r-public",
    authorId: "u-1",
    recipeFamilyId: "rf-1",
    versionNumber: 1,
    versionCount: 1,
    publicationState: "published",
    title: "Public IPA",
    slug: "public-ipa",
    styleId: null,
    batchSizeEnteredQuantity: 20,
    batchSizeEnteredUnit: "l",
    batchSizeNormalizedQuantity: 20000,
    batchSizeNormalizedUnit: "ml",
    efficiency: 75,
    boilTimeMinutes: 60,
    og: 1.06,
    fg: 1.012,
    abv: 6.2,
    ibu: 45,
    color: 9.5,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z")
  }
];

const mocks = vi.hoisted(() => ({
  getPublicRecipeBySlug: vi.fn(async () => publicRecipe),
  listPublicRecipes: vi.fn(async () => publicList),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  })
}));

vi.mock("../features/recipes/service", () => ({
  getPublicRecipeBySlug: mocks.getPublicRecipeBySlug,
  listPublicRecipes: mocks.listPublicRecipes
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

describe("public recipe pages wiring", () => {
  beforeEach(() => {
    mocks.getPublicRecipeBySlug.mockReset();
    mocks.listPublicRecipes.mockReset();

    mocks.getPublicRecipeBySlug.mockResolvedValue(publicRecipe);
    mocks.listPublicRecipes.mockResolvedValue(publicList);

    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
  });

  it("uses getPublicRecipeBySlug and renders read-only recipe", async () => {
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");
    const view = await PublicRecipeRoute({ params: Promise.resolve({ slug: "public-ipa" }) });

    expect(mocks.getPublicRecipeBySlug).toHaveBeenCalledWith("public-ipa");
    expect(view).toBeTruthy();
  }, 60000);

  it("returns notFound behavior for inaccessible slug recipe", async () => {
    mocks.getPublicRecipeBySlug.mockImplementationOnce(async () => {
      throw new Error("FORBIDDEN");
    });
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");

    await expect(PublicRecipeRoute({ params: Promise.resolve({ slug: "secret" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  }, 60000);

  it("builds metadata from slug-based public recipe", async () => {
    const { generateMetadata } = await import("../app/(public)/recipes/[slug]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "public-ipa" }) });

    expect(mocks.getPublicRecipeBySlug).toHaveBeenCalledWith("public-ipa");
    expect(metadata.title).toContain("Public IPA");
    expect(metadata.description).toContain("Public desc");
  });


  it("public listing page uses listPublicRecipes accessor", async () => {
    const { default: PublicRecipesPage } = await import("../app/(public)/recipes/page");
    const view = await PublicRecipesPage();

    expect(mocks.listPublicRecipes).toHaveBeenCalledWith();
    expect(view).toBeTruthy();
  });
});
