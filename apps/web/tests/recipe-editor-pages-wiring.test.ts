import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@nb/ui";

// Роуты рендерят RecipeDesigner, который вызывает useToast на верхнем уровне
// (undo-тост удаления позиции) — статический рендер обязан идти внутри ToastProvider.
const renderPageMarkup = (view: React.ReactElement) =>
  renderToStaticMarkup(React.createElement(ToastProvider, null, view));

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
  // Движок аллокаций мокаем только для guard-теста «страницы редактора его не зовут»:
  // списание — операция варки, редактор в склад не ходит (B1).
  listRecipeStockCoverage: vi.fn(),
  getNextDefaultRecipeTitle: vi.fn(async () => "Новый рецепт 7"),
  // Н5: подтверждение удаления обязано сказать, что будет с варками рецепта, —
  // число партий страница берёт из сервиса и прокидывает в редактор.
  countRecipeBrewBatches: vi.fn(async () => 2),
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
  getNextDefaultRecipeTitle: mocks.getNextDefaultRecipeTitle,
  countRecipeBrewBatches: mocks.countRecipeBrewBatches
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
    const html = renderPageMarkup(view);

    expect(mocks.getOwnedRecipeById).toHaveBeenCalledWith("u-1", "r-1");
    expect(mocks.listRecipeImages).toHaveBeenCalledWith("r-1", "u-1");
    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("u-1");
    // Число партий рецепта — для честного подтверждения удаления (Н5).
    expect(mocks.countRecipeBrewBatches).toHaveBeenCalledWith("u-1", "r-1");
    expect(html).toContain("Название рецепта");
    expect(html).not.toContain("Ингредиенты со склада");
    expect(mocks.listRecipeStockCoverage).not.toHaveBeenCalled();
  });

  it("ownership-safe deny on edit route", async () => {
    mocks.getOwnedRecipeById.mockRejectedValueOnce(new Error("NOT_FOUND"));
    const { default: EditRecipePage } = await import("../app/(app)/app/recipes/[id]/edit/page");

    await expect(EditRecipePage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("new form route renders", async () => {
    const { default: NewRecipePage } = await import("../app/(app)/app/recipes/new/page");
    const html = renderPageMarkup(await NewRecipePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Название рецепта");
    expect(html).not.toContain("Ингредиенты со склада");
    expect(mocks.getNextDefaultRecipeTitle).toHaveBeenCalledWith("u-1");
    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Новый рецепт 7");
    expect(mocks.listRecipeStockCoverage).not.toHaveBeenCalled();
  });

  it("new route resumes an autosaved recipe without redirecting", async () => {
    const { default: NewRecipePage } = await import("../app/(app)/app/recipes/new/page");

    const html = renderPageMarkup(await NewRecipePage({
      searchParams: Promise.resolve({ recipeId: "r-1" })
    }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.getOwnedRecipeById).toHaveBeenCalledWith("u-1", "r-1");
    expect(mocks.listRecipeStockCoverage).not.toHaveBeenCalled();
    expect(mocks.listRecipeImages).toHaveBeenCalledWith("r-1", "u-1");
    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("u-1");
    expect(mocks.countRecipeBrewBatches).toHaveBeenCalledWith("u-1", "r-1");
    expect(html).toContain("Edit me");
  });

  // Новый рецепт партий иметь не может — в БД его ещё нет, и сервис дёргать незачем.
  it("new form route does not count brew batches", async () => {
    mocks.countRecipeBrewBatches.mockClear();
    const { default: NewRecipePage } = await import("../app/(app)/app/recipes/new/page");

    await NewRecipePage({ searchParams: Promise.resolve({}) });

    expect(mocks.countRecipeBrewBatches).not.toHaveBeenCalled();
  });
});
