import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@nb/ui";

import type { PublicRecipeListItem, PublicRecipeListResult } from "../features/recipes/contracts";
import { parsePublicRecipeFilters } from "../features/recipes/public-recipe-query";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src as string, alt: (props.alt as string) ?? "" })
}));

const mocks = vi.hoisted(() => ({
  searchPublicRecipes: vi.fn(),
  navState: { searchParams: "" }
}));

vi.mock("../features/recipes/service", () => ({
  searchPublicRecipes: mocks.searchPublicRecipes
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/recipes",
  useSearchParams: () => new URLSearchParams(mocks.navState.searchParams)
}));

// Пустая витрина (no-recipes) лениво читает сессию для CTA — мокаем как гостя.
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => null) }));

import { RecipesResults } from "../components/recipes/recipes-results";

const item = (overrides: Partial<PublicRecipeListItem> = {}): PublicRecipeListItem => ({
  id: "r-1",
  slug: "hazy-ipa",
  name: "Hazy IPA",
  author: { id: "u-1", displayName: "Alice", image: null },
  style: { code: "21A", name: "American IPA" },
  styleHref: "/bjcp/bjcp-21a-american-ipa",
  og: 1.048,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  colorSrm: 9.5,
  colorEbc: 19,
  batchSizeL: 20,
  method: null,
  heroImage: null,
  styleImageUrl: null,
  cloneCount: 0,
  rating: null,
  featured: false,
  saveCount: 0,
  publishedAt: "2026-02-01T00:00:00.000Z",
  createdAt: "2026-02-01T00:00:00.000Z",
  ...overrides
});

const result = (overrides: Partial<PublicRecipeListResult> = {}): PublicRecipeListResult => ({
  items: [item()],
  total: 1,
  page: 1,
  pageSize: 24,
  ...overrides
});

beforeEach(() => {
  mocks.searchPublicRecipes.mockReset();
  mocks.navState.searchParams = "";
});

describe("/recipes results", () => {
  it("passes parsed filters to searchPublicRecipes and renders the grid", async () => {
    mocks.searchPublicRecipes.mockResolvedValue(result());
    const filters = parsePublicRecipeFilters({ sort: "abv_desc", abvMin: "6" });

    const el = await RecipesResults({ filters });
    // RecipeSaveButton внутри карточек рендерится через useToast() — нужен ToastProvider.
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, el));

    expect(mocks.searchPublicRecipes).toHaveBeenCalledWith(filters);
    expect(html).toContain("Найдено 1 рецепт");
    expect(html).toContain("Hazy IPA");
    expect(html).toContain('href="/recipes/hazy-ipa"');
  });

  it("renders numbered pagination links preserving filters across pages", async () => {
    mocks.navState.searchParams = "sort=abv_desc";
    mocks.searchPublicRecipes.mockResolvedValue(result({ total: 60, page: 1, pageSize: 24 }));
    const filters = parsePublicRecipeFilters({ sort: "abv_desc" });

    const el = await RecipesResults({ filters });
    // RecipeSaveButton внутри карточек рендерится через useToast() — нужен ToastProvider.
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, el));

    expect(html).toContain('aria-label="Пагинация"');
    expect(html).toContain('href="/recipes?sort=abv_desc&amp;page=2"');
  });

  it("shows the «no recipes» empty state when there is nothing and no active filters", async () => {
    mocks.searchPublicRecipes.mockResolvedValue(result({ items: [], total: 0 }));
    const filters = parsePublicRecipeFilters({});

    const el = await RecipesResults({ filters });
    // RecipeSaveButton внутри карточек рендерится через useToast() — нужен ToastProvider.
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, el));

    expect(html).toContain("Публичных рецептов пока нет");
  });

  it("shows the «no results» empty state when filters are active but nothing matches", async () => {
    mocks.searchPublicRecipes.mockResolvedValue(result({ items: [], total: 0 }));
    const filters = parsePublicRecipeFilters({ q: "zzz" });

    const el = await RecipesResults({ filters });
    // RecipeSaveButton внутри карточек рендерится через useToast() — нужен ToastProvider.
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, el));

    expect(html).toContain("Ничего не найдено");
  });

  it("рендерит ItemList JSON-LD с учётом смещения по page, когда нет свободного поиска", async () => {
    mocks.searchPublicRecipes.mockResolvedValue(result({
      items: [item(), item({ id: "r-2", slug: "second-ipa", name: "Second IPA" })],
      total: 26,
      page: 2,
      pageSize: 24
    }));
    const filters = parsePublicRecipeFilters({ page: "2" });

    const el = await RecipesResults({ filters });
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, el));

    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"position":25');
    expect(html).toContain('"url":"http://localhost:3000/recipes/hazy-ipa"');
    expect(html).toContain('"position":26');
    expect(html).toContain('"url":"http://localhost:3000/recipes/second-ipa"');
  });

  it("не рендерит ItemList JSON-LD при свободном текстовом поиске", async () => {
    mocks.searchPublicRecipes.mockResolvedValue(result());
    const filters = parsePublicRecipeFilters({ q: "hazy" });

    const el = await RecipesResults({ filters });
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, el));

    expect(html).not.toContain('"@type":"ItemList"');
  });
});
