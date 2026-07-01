import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const recipe = {
  id: "r-1",
  authorId: "u-1",
  publicationState: "draft",
  title: "Edit me",
  slug: "public-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  og: 1.05,
  fg: 1.01,
  abv: 5.3,
  ibu: 30,
  color: 7,
  description: null,
  authorNotes: null,
  heroImageId: null,
  ingredients: [],
  createdAt: new Date(),
  updatedAt: new Date()
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", preferredGravityUnit: "plato" })),
  getOwnedRecipeById: vi.fn(async () => recipe),
  listRecipeImages: vi.fn(async () => []),
  listEquipmentProfiles: vi.fn(async () => []),
  listRecipeStockCoverage: vi.fn(async () => ({
    recipeId: "r-1",
    lines: [],
    summary: {
      totalLines: 0,
      selectedLines: 0,
      coveredLines: 0,
      reservedLines: 0,
      consumedLines: 0,
      shortLines: 0
    }
  })),
  getNextDefaultRecipeTitle: vi.fn(async () => "Новый рецепт 7"),
  usePathname: vi.fn(() => "/app/recipes/new"),
  useRouter: vi.fn(() => ({ replace: vi.fn(), push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({
  getOwnedRecipeById: mocks.getOwnedRecipeById,
  getNextDefaultRecipeTitle: mocks.getNextDefaultRecipeTitle
}));
vi.mock("../features/recipe-images/service", () => ({
  listRecipeImages: mocks.listRecipeImages
}));
vi.mock("../features/recipes/inventory-service", () => ({
  listRecipeStockCoverage: mocks.listRecipeStockCoverage
}));
vi.mock("../features/equipment-profiles/service", () => ({
  listEquipmentProfiles: mocks.listEquipmentProfiles
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  usePathname: mocks.usePathname,
  useRouter: mocks.useRouter,
  useSearchParams: mocks.useSearchParams
}));

describe("recipe editor pages wiring", () => {
  it("edit form renders from owner-safe service", async () => {
    const { default: EditRecipePage } = await import("../app/(app)/app/recipes/[id]/edit/page");
    const view = await EditRecipePage({ params: Promise.resolve({ id: "r-1" }) });
    const html = renderToStaticMarkup(view);

    expect(mocks.getOwnedRecipeById).toHaveBeenCalledWith("u-1", "r-1");
    expect(mocks.listRecipeImages).toHaveBeenCalledWith("r-1", "u-1");
    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Название рецепта");
    expect(html).toContain("Ингредиенты со склада");
  });

  it("ownership-safe deny on edit route", async () => {
    mocks.getOwnedRecipeById.mockRejectedValueOnce(new Error("NOT_FOUND"));
    const { default: EditRecipePage } = await import("../app/(app)/app/recipes/[id]/edit/page");

    await expect(EditRecipePage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("new form route renders", async () => {
    const { default: NewRecipePage } = await import("../app/(app)/app/recipes/new/page");
    const html = renderToStaticMarkup(await NewRecipePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Название рецепта");
    expect(html).toContain("Ингредиенты со склада");
    expect(mocks.getNextDefaultRecipeTitle).toHaveBeenCalledWith("u-1");
    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Новый рецепт 7");
  });

  it("new route resumes an autosaved recipe without redirecting", async () => {
    const { default: NewRecipePage } = await import("../app/(app)/app/recipes/new/page");

    const html = renderToStaticMarkup(await NewRecipePage({
      searchParams: Promise.resolve({ recipeId: "r-1" })
    }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.getOwnedRecipeById).toHaveBeenCalledWith("u-1", "r-1");
    expect(mocks.listRecipeStockCoverage).toHaveBeenCalledWith("u-1", "r-1");
    expect(mocks.listRecipeImages).toHaveBeenCalledWith("r-1", "u-1");
    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Edit me");
  });
});
