import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { RecipeDetailDto } from "../features/recipes/contracts";

const publicRecipe: RecipeDetailDto = {
  id: "r-public",
  authorId: "u-1",
  status: "published",
  visibility: "public",
  title: "Public IPA",
  slug: null,
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9.5,
  description: "Public desc",
  authorNotes: "Public notes",
  heroImageId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: [
    {
      id: "ri-1",
      recipeId: "r-public",
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

const mocks = vi.hoisted(() => ({
  getPublicRecipeById: vi.fn(async () => publicRecipe),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("../features/recipes/service", () => ({
  getPublicRecipeById: mocks.getPublicRecipeById
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

describe("public recipe page wiring", () => {
  beforeEach(() => {
    mocks.getPublicRecipeById.mockReset();
    mocks.getPublicRecipeById.mockResolvedValue(publicRecipe);
    mocks.notFound.mockClear();
  });

  it("uses getPublicRecipeById and renders read-only recipe", async () => {
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[id]/page");
    const view = await PublicRecipeRoute({ params: Promise.resolve({ id: "r-public" }) });

    expect(mocks.getPublicRecipeById).toHaveBeenCalledWith("r-public");
    expect(view).toBeTruthy();
  }, 60000);

  it("returns notFound behavior for inaccessible recipe", async () => {
    mocks.getPublicRecipeById.mockImplementationOnce(async () => {
      throw new Error("FORBIDDEN");
    });
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[id]/page");

    await expect(PublicRecipeRoute({ params: Promise.resolve({ id: "secret" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  }, 60000);

  it("builds metadata from public recipe", async () => {
    const { generateMetadata } = await import("../app/(public)/recipes/[id]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "r-public" }) });

    expect(mocks.getPublicRecipeById).toHaveBeenCalledWith("r-public");
    expect(metadata.title).toContain("Public IPA");
    expect(metadata.description).toContain("Public desc");
  });
});
