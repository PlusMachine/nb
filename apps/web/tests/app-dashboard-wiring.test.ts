import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const activeBrew = {
  id: "bb-1",
  name: "Test Brew",
  status: "brewing" as const,
  recipeId: "r-1",
  recipeTitle: "Test Recipe",
  hasDevice: false,
  plannedFor: null,
  startedAt: new Date("2026-06-27T10:00:00Z"),
  completedAt: null,
  createdAt: new Date("2026-06-27T09:00:00Z"),
  updatedAt: new Date("2026-06-27T10:00:00Z"),
  lastMeasurementAt: null,
  measurementCount: 0
};

const brewableRecipe = {
  recipeId: "r-9",
  slug: "my-ipa",
  title: "My IPA",
  matchPercent: 100,
  label: "ready" as const,
  totalLines: 5,
  coveredLines: 5,
  missingCount: 0
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "brewer@example.com", displayName: "Brewer" })),
  countRecipesForAuthor: vi.fn(async () => 3),
  listAuthorRecipeCards: vi.fn(async () => []),
  getInventorySummaries: vi.fn(async () => ({ totalItems: 5, inStockItems: 3, emptyItems: 2 })),
  listActiveBrewBatchesForUser: vi.fn(async () => [activeBrew]),
  countBrewBatchesForUser: vi.fn(async () => 4),
  findBrewableOwnRecipesForUser: vi.fn(async () => [brewableRecipe])
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({
  countRecipesForAuthor: mocks.countRecipesForAuthor,
  listAuthorRecipeCards: mocks.listAuthorRecipeCards
}));
vi.mock("../features/recipes/match-service", () => ({ findBrewableOwnRecipesForUser: mocks.findBrewableOwnRecipesForUser }));
vi.mock("../features/inventory/service", () => ({ getInventorySummaries: mocks.getInventorySummaries }));
vi.mock("../features/brew-batches/service", () => ({
  listActiveBrewBatchesForUser: mocks.listActiveBrewBatchesForUser,
  countBrewBatchesForUser: mocks.countBrewBatchesForUser
}));

import AppZonePage from "../app/(app)/app/page";

describe("App dashboard", () => {
  it("greets the user and funnels into the core workflow with real counts", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Brewer");
    // quick entries into the workshop loop
    expect(html).toContain("Создать рецепт");
    expect(html).toContain('href="/app/recipes/new"');
    expect(html).toContain('href="/app/ingredients"');
    expect(html).toContain('href="/catalog"');
    // discover strip bridges back to public knowledge surfaces
    expect(html).toContain('href="/bjcp"');
    expect(html).toContain('href="/calculators"');
    // recipe count comes from the cheap scoped count, not a full row load
    expect(mocks.countRecipesForAuthor).toHaveBeenCalledWith("u-1");
    // brew count tile is wired to its own scoped count, not derived from the active-brews list
    expect(mocks.countBrewBatchesForUser).toHaveBeenCalledWith("u-1");
    expect(html).toContain('href="/app/brew-batches"');
    expect(html).toMatch(/>4<\/p>\s*<p class="mt-1 text-sm text-zinc-500">Варки</);
  });

  it("surfaces active brews with a next-step nudge", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Активные варки");
    expect(html).toContain("Test Brew");
    expect(html).toContain('href="/app/brew-batches/bb-1"');
    // brewing batch without a reading is nudged to log OG
    expect(html).toContain("Запишите начальную плотность");
  });

  it("surfaces recipes that can be brewed right now from stock", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Можно сварить сейчас");
    expect(html).toContain("My IPA");
    expect(html).toContain("Можно сварить");
    expect(html).toContain('href="/app/recipes/r-9/edit"');
  });

  it("greets a first-time user with an explicit catalog->inventory->recipe path instead of stats", async () => {
    mocks.countRecipesForAuthor.mockResolvedValueOnce(0);
    mocks.getInventorySummaries.mockResolvedValueOnce({ totalItems: 0, inStockItems: 0, emptyItems: 0 });
    mocks.listActiveBrewBatchesForUser.mockResolvedValueOnce([]);
    mocks.findBrewableOwnRecipesForUser.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Добро пожаловать, Brewer");
    expect(html).not.toContain("С возвращением");
    // zero stats carry no value for a brand-new account
    expect(html).not.toContain("Всего позиций");

    const catalogIndex = html.indexOf('href="/catalog"');
    const inventoryIndex = html.indexOf('href="/app/ingredients"');
    const recipeIndex = html.indexOf('href="/app/recipes/new"');
    expect(catalogIndex).toBeGreaterThan(-1);
    expect(catalogIndex).toBeLessThan(inventoryIndex);
    expect(inventoryIndex).toBeLessThan(recipeIndex);
  });
});
