import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Хаб /catalog: до рендера page.tsx разбирает легаси-параметры (?category=/
// ?subtype=/?page=) и делает permanentRedirect на канонический URL — сам
// рендер (IngredientCatalogContent) и БД-цепочку за ним сюда тащить не нужно.
const mocks = vi.hoisted(() => ({
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  })
}));

vi.mock("next/navigation", () => ({
  permanentRedirect: mocks.permanentRedirect
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: async () => null
}));

// page.tsx импортирует парсеры (`parseCategory` и т.п.) и сам компонент из
// "./content" — мокаем весь модуль: парсеры реализованы теми же правилами,
// что и оригинал (через настоящую таксономию из contracts.ts), а сам
// IngredientCatalogContent — лёгкая заглушка без БД/сессии/тулбара.
vi.mock("@/app/(public)/catalog/content", async () => {
  const contracts = await import("@/features/ingredients/contracts");

  const parseView = (value: string | undefined) => (
    (contracts.ingredientCatalogViews as readonly string[]).includes(value ?? "") ? value : "all"
  );
  const parseCategory = (value: string | undefined) => (
    (contracts.ingredientCategories as readonly string[]).includes(value ?? "") ? value : undefined
  );
  const parseSort = (value: string | undefined) => (
    (contracts.ingredientCatalogSortOptions as readonly string[]).includes(value ?? "") ? value : "name"
  );
  const parseSubtype = (value: string | undefined) => (
    value === "malt" || value === "fermentable" ? value : undefined
  );
  const parsePage = (value: string | undefined) => {
    const parsed = Number(value ?? "1");
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  };

  return {
    parseView,
    parseCategory,
    parseSort,
    parseSubtype,
    parsePage,
    IngredientCatalogContent: () => React.createElement("div", null, "hub-stub")
  };
});

import IngredientCatalogPage from "../app/(public)/catalog/page";

const buildSearchParams = (query: Record<string, string>) => Promise.resolve(query);

beforeEach(() => {
  mocks.permanentRedirect.mockClear();
});

describe("catalog legacy redirects", () => {
  it("redirects ?category=hop to /catalog/hops", async () => {
    await expect(
      IngredientCatalogPage({ searchParams: buildSearchParams({ category: "hop" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/catalog/hops");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/catalog/hops");
  });

  it("redirects ?category=hop&q=citra to /catalog/hops?q=citra, carrying the query over", async () => {
    await expect(
      IngredientCatalogPage({ searchParams: buildSearchParams({ category: "hop", q: "citra" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/catalog/hops?q=citra");
  });

  it("redirects ?category=hop&page=2&sort=alpha to /catalog/hops?sort=alpha&page=2, carrying both over", async () => {
    await expect(
      IngredientCatalogPage({ searchParams: buildSearchParams({ category: "hop", page: "2", sort: "alpha" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/catalog/hops?sort=alpha&page=2");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/catalog/hops?sort=alpha&page=2");
  });

  it("resolves a landing from ?subtype= alone: ?subtype=malt to /catalog/malts", async () => {
    await expect(
      IngredientCatalogPage({ searchParams: buildSearchParams({ subtype: "malt" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/catalog/malts");
  });

  it("collapses an unresolved category (fermentable without subtype) to the base hub", async () => {
    await expect(
      IngredientCatalogPage({ searchParams: buildSearchParams({ category: "fermentable" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/catalog");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/catalog");
  });

  it("collapses a legacy ?page= without a category to the base hub (no pagination on the hub)", async () => {
    await expect(
      IngredientCatalogPage({ searchParams: buildSearchParams({ page: "2" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/catalog");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/catalog");
  });

  it("keeps q when collapsing a legacy ?page= without a category", async () => {
    await expect(
      IngredientCatalogPage({ searchParams: buildSearchParams({ page: "2", q: "x" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/catalog?q=x");
  });

  it("does not redirect a plain visit without legacy parameters", async () => {
    const view = await IngredientCatalogPage({ searchParams: buildSearchParams({}) });

    expect(mocks.permanentRedirect).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(view)).toContain("hub-stub");
  });
});
