import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const fermentingBrew = {
  ...activeBrew,
  id: "bb-2",
  name: "Fermenting Brew",
  status: "fermenting" as const,
  startedAt: new Date("2026-06-20T10:00:00Z"),
  lastMeasurementAt: new Date("2026-06-28T10:00:00Z"),
  measurementCount: 2
};

const plannedBrew = {
  ...activeBrew,
  id: "bb-3",
  name: "Planned Brew",
  status: "planned" as const,
  startedAt: null,
  plannedFor: null
};

const brewableRecipe = {
  recipeId: "r-9",
  slug: "my-ipa",
  title: "My IPA",
  matchPercent: 100,
  label: "ready" as const,
  totalLines: 5,
  coveredLines: 5,
  missingCount: 0,
  missingNames: [],
  styleName: "American IPA",
  styleCode: "21A",
  styleHref: "/bjcp/21a",
  colorSrm: 6,
  heroImage: null,
  styleImageUrl: null
};

const recipeCard = {
  id: "r-1",
  slug: "test-recipe",
  title: "Test Recipe",
  publicationState: "draft" as const,
  versionNumber: 1,
  versionCount: 1,
  updatedAt: new Date("2026-06-27T10:00:00Z"),
  styleName: "Saison",
  styleCode: "25B",
  styleHref: "/bjcp/25b",
  og: 1.052,
  abv: 6.2,
  ibu: 25,
  colorSrm: 5,
  heroImage: null,
  styleImageUrl: null,
  styleFit: null
};

const emptyPrimaryGroups = {
  fermentable: 0,
  hop: 0,
  yeast: 0,
  water_treatment: 0,
  consumable_supply: 0,
  consumable_additive: 0
};

const filledInventory = {
  totalItems: 5,
  inStockItems: 3,
  emptyItems: 2,
  byCategory: {},
  inStockByCategory: {},
  byPrimaryGroup: { ...emptyPrimaryGroups, fermentable: 3, hop: 1, yeast: 1 },
  inStockByPrimaryGroup: { ...emptyPrimaryGroups, fermentable: 2, hop: 1 },
  byFermentableSubtype: { malt: 3, fermentable: 0 },
  inStockByFermentableSubtype: { malt: 2, fermentable: 0 }
};

const emptyInventory = {
  ...filledInventory,
  totalItems: 0,
  inStockItems: 0,
  emptyItems: 0,
  byPrimaryGroup: { ...emptyPrimaryGroups },
  inStockByPrimaryGroup: { ...emptyPrimaryGroups }
};

const onlineDevice = {
  id: "d-1",
  userId: "u-1",
  providerId: "brewforge",
  name: "Кухонный BrewForge",
  hardwareId: "bf-0001",
  fw: "1.2.0",
  capabilities: [],
  status: "online" as const,
  localUrl: null,
  mqttPrefix: null,
  lastSeenAt: new Date("2026-06-27T10:00:00Z"),
  createdAt: new Date("2026-06-01T10:00:00Z"),
  updatedAt: new Date("2026-06-27T10:00:00Z")
};

const shoppingWithItems = {
  groups: [
    {
      category: "hop" as const,
      label: "Хмель",
      items: [
        {
          key: "hop-1",
          ingredientDisplayName: "Citra",
          category: "hop" as const,
          quantityToBuy: 100,
          unit: "g" as const,
          quantityLabel: "100 г",
          catalogHref: null,
          addToStockHref: null,
          neededBy: []
        }
      ]
    }
  ],
  totalItems: 1,
  plannedBrews: [],
  emptyReason: null
};

const emptyShopping = {
  groups: [],
  totalItems: 0,
  plannedBrews: [],
  emptyReason: "no_planned_brews" as const
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "brewer@example.com", displayName: "Brewer", preferredGravityUnit: "plato" as const })),
  countRecipesForAuthor: vi.fn(async () => 3),
  countSavedRecipes: vi.fn(async () => 0),
  listAuthorRecipeCards: vi.fn(async (): Promise<unknown[]> => []),
  getInventorySummaries: vi.fn(async (): Promise<unknown> => filledInventory),
  listActiveBrewBatchesForUser: vi.fn(async (): Promise<unknown[]> => [activeBrew]),
  countBrewBatchesForUser: vi.fn(async () => 4),
  findBrewableOwnRecipesForUser: vi.fn(async (): Promise<unknown[]> => [brewableRecipe]),
  listUserDevices: vi.fn(async (): Promise<unknown[]> => []),
  buildShoppingListForUser: vi.fn(async (): Promise<unknown> => emptyShopping),
  listFavoriteCalculators: vi.fn(async (): Promise<unknown[]> => [])
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({
  countRecipesForAuthor: mocks.countRecipesForAuthor,
  countSavedRecipes: mocks.countSavedRecipes,
  listAuthorRecipeCards: mocks.listAuthorRecipeCards
}));
vi.mock("../features/recipes/match-service", () => ({ findBrewableOwnRecipesForUser: mocks.findBrewableOwnRecipesForUser }));
vi.mock("../features/inventory/service", () => ({ getInventorySummaries: mocks.getInventorySummaries }));
vi.mock("../features/brew-batches/service", () => ({
  listActiveBrewBatchesForUser: mocks.listActiveBrewBatchesForUser,
  countBrewBatchesForUser: mocks.countBrewBatchesForUser
}));
vi.mock("../features/devices/service", () => ({ listUserDevices: mocks.listUserDevices }));
vi.mock("../features/shopping/service", () => ({ buildShoppingListForUser: mocks.buildShoppingListForUser }));
vi.mock("../features/calculators/favorites-service", () => ({ listFavoriteCalculators: mocks.listFavoriteCalculators }));

import AppZonePage from "../app/(app)/app/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "u-1", email: "brewer@example.com", displayName: "Brewer", preferredGravityUnit: "plato" as const });
  mocks.countRecipesForAuthor.mockResolvedValue(3);
  mocks.countSavedRecipes.mockResolvedValue(0);
  mocks.listAuthorRecipeCards.mockResolvedValue([recipeCard]);
  mocks.getInventorySummaries.mockResolvedValue(filledInventory);
  mocks.listActiveBrewBatchesForUser.mockResolvedValue([activeBrew]);
  mocks.countBrewBatchesForUser.mockResolvedValue(4);
  mocks.findBrewableOwnRecipesForUser.mockResolvedValue([brewableRecipe]);
  mocks.listUserDevices.mockResolvedValue([]);
  mocks.buildShoppingListForUser.mockResolvedValue(emptyShopping);
  mocks.listFavoriteCalculators.mockResolvedValue([]);
});

describe("App dashboard", () => {
  it("greets the user and wires counts to scoped services", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Brewer");
    expect(html).toContain("С возвращением");
    expect(mocks.countRecipesForAuthor).toHaveBeenCalledWith("u-1");
    expect(mocks.countBrewBatchesForUser).toHaveBeenCalledWith("u-1");
    expect(mocks.listUserDevices).toHaveBeenCalledWith("u-1");
    expect(mocks.buildShoppingListForUser).toHaveBeenCalledWith("u-1");
    // brewable widget fetches with headroom so title-dedupe still fills the teaser
    expect(mocks.findBrewableOwnRecipesForUser).toHaveBeenCalledWith({ userId: "u-1", limit: 9 });
  });

  it("surfaces in-progress brews with a next-step nudge", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("В работе");
    expect(html).toContain("Test Brew");
    expect(html).toContain('href="/app/brew-batches/bb-1"');
    // brewing batch without a reading is nudged to log OG
    expect(html).toContain("Запишите начальную плотность");
  });

  it("splits planned brews into a compact list instead of cards", async () => {
    mocks.listActiveBrewBatchesForUser.mockResolvedValue([activeBrew, plannedBrew]);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Запланированы");
    expect(html).toContain("Planned Brew");
    expect(html).toContain("готова к старту");
    expect(html).toContain('href="/app/brew-batches/bb-3"');
  });

  it("shows fermentation day for fermenting batches", async () => {
    mocks.listActiveBrewBatchesForUser.mockResolvedValue([fermentingBrew]);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Брожение");
    expect(html).toMatch(/День \d+/);
    expect(html).toContain("2 замера");
  });

  it("renders resource widgets: inventory breakdown, shopping empty state, devices CTA", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    // inventory: in-stock number + group breakdown + href
    expect(html).toContain('href="/app/ingredients"');
    expect(html).toContain("в наличии");
    // shopping: empty reason for no planned brews
    expect(html).toContain("Список покупок");
    // devices: soft CTA to connect
    expect(html).toContain('href="/app/devices"');
    expect(html).toContain("Подключить");
  });

  it("lists devices with status when connected", async () => {
    mocks.listUserDevices.mockResolvedValue([onlineDevice]);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Кухонный BrewForge");
    expect(html).toContain("онлайн");
    expect(html).toContain('href="/app/devices/d-1"');
  });

  it("shows the shopping list summary when items are missing", async () => {
    mocks.buildShoppingListForUser.mockResolvedValue(shoppingWithItems);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain('href="/app/shopping"');
    expect(html).toContain("Citra");
    expect(html).toContain("100 г");
  });

  it("surfaces recipes that can be brewed right now from stock", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Можно сварить сейчас");
    expect(html).toContain("My IPA");
    expect(html).toContain('href="/app/recipes/r-9/edit"');
  });

  it("shows recent own recipes with create/all actions", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Мои рецепты");
    expect(html).toContain('href="/app/recipes/new"');
    expect(html).toContain('href="/app/recipes"');
    expect(html).toContain("Test Recipe");
    // OwnerRecipeCard shows the publication-state badge ("Приватный" for a draft)
    expect(html).toContain("Приватный");
  });

  it("does not repeat a recipe across brewable and recent sections", async () => {
    // the brewable recipe (r-9 / My IPA) is also among the author's recent cards
    mocks.listAuthorRecipeCards.mockResolvedValue([
      { ...recipeCard, id: "r-9", title: "My IPA", publicationState: "published" as const },
      recipeCard
    ]);

    const html = renderToStaticMarkup(await AppZonePage());

    // brewable section still surfaces it, but the recent section drops the dupe:
    // exactly one card links to r-9 (the brewable one), and the recent section
    // falls back to the non-brewable recipe instead.
    const r9Links = html.split('href="/app/recipes/r-9/edit"').length - 1;
    expect(r9Links).toBe(1);
    expect(html).toContain("Test Recipe");
  });

  it("collapses same-titled clones within the brewable teaser", async () => {
    mocks.findBrewableOwnRecipesForUser.mockResolvedValue([
      brewableRecipe,
      { ...brewableRecipe, recipeId: "r-9b", slug: "my-ipa-clone" }
    ]);

    const html = renderToStaticMarkup(await AppZonePage());

    // both clones share the title "My IPA" -> only one card is rendered
    const brewLinks =
      (html.split('href="/app/recipes/r-9/edit"').length - 1) +
      (html.split('href="/app/recipes/r-9b/edit"').length - 1);
    expect(brewLinks).toBe(1);
  });

  it("collapses same-titled clones within the recent recipes strip", async () => {
    mocks.listAuthorRecipeCards.mockResolvedValue([
      { ...recipeCard, id: "s-1", title: "Stone IPA" },
      { ...recipeCard, id: "s-2", title: "Stone IPA" },
      { ...recipeCard, id: "s-3", title: "Stone IPA" }
    ]);

    const html = renderToStaticMarkup(await AppZonePage());

    const stoneLinks =
      (html.split('href="/app/recipes/s-1/edit"').length - 1) +
      (html.split('href="/app/recipes/s-2/edit"').length - 1) +
      (html.split('href="/app/recipes/s-3/edit"').length - 1);
    expect(stoneLinks).toBe(1);
  });

  it("surfaces favorite calculators when the user has starred any", async () => {
    const { calculatorBySlug } = await import("../features/calculators/catalog");
    mocks.listFavoriteCalculators.mockResolvedValue([calculatorBySlug.ibu, calculatorBySlug["keg-carbonation"]]);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Избранные калькуляторы");
    expect(html).toContain('href="/calculators"');
    expect(html).toContain(calculatorBySlug.ibu.shortTitle);
    expect(html).toContain(calculatorBySlug["keg-carbonation"].shortTitle);
  });

  it("hides the favorite calculators section when there are none", async () => {
    const html = renderToStaticMarkup(await AppZonePage());
    expect(html).not.toContain("Избранные калькуляторы");
  });

  it("does not offer a duplicate 'Мои рецепты' link above the recipes section", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    // "Мои рецепты" appears once — as the section heading, not also as the
    // brewable section's see-all link.
    const occurrences = html.split("Мои рецепты").length - 1;
    expect(occurrences).toBe(1);
  });

  it("keeps the onboarding checklist until the first brew loop is complete", async () => {
    // recipes exist, but no brews yet -> checklist stays with brew step pending
    mocks.countBrewBatchesForUser.mockResolvedValue(0);
    mocks.listActiveBrewBatchesForUser.mockResolvedValue([]);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("С чего начать");
    expect(html).toContain("Запустите первую варку");
    // working blocks own the top of the page; the checklist trails after them
    const recipesIndex = html.indexOf("Мои рецепты");
    const checklistIndex = html.indexOf("С чего начать");
    expect(recipesIndex).toBeGreaterThan(-1);
    expect(recipesIndex).toBeLessThan(checklistIndex);
  });

  it("hides the onboarding checklist once stock, recipe and brew all exist", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).not.toContain("С чего начать");
  });

  it("greets a first-time user with the onboarding path instead of empty widgets", async () => {
    mocks.countRecipesForAuthor.mockResolvedValue(0);
    mocks.countSavedRecipes.mockResolvedValue(0);
    mocks.getInventorySummaries.mockResolvedValue(emptyInventory);
    mocks.listActiveBrewBatchesForUser.mockResolvedValue([]);
    mocks.countBrewBatchesForUser.mockResolvedValue(0);
    mocks.findBrewableOwnRecipesForUser.mockResolvedValue([]);
    mocks.listAuthorRecipeCards.mockResolvedValue([]);

    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Добро пожаловать, Brewer");
    expect(html).not.toContain("С возвращением");
    expect(html).toContain("С чего начать");
    // first loop in order: stock -> recipe -> brew
    const stockIndex = html.indexOf("Пополните склад");
    const recipeIndex = html.indexOf("Найдите или создайте рецепт");
    const brewIndex = html.indexOf("Запустите первую варку");
    expect(stockIndex).toBeGreaterThan(-1);
    expect(stockIndex).toBeLessThan(recipeIndex);
    expect(recipeIndex).toBeLessThan(brewIndex);
    // empty resource widgets are not rendered on day one
    expect(html).not.toContain("Список покупок");
    // knowledge surfaces stay reachable
    expect(html).toContain('href="/articles"');
    expect(html).toContain('href="/bjcp"');
    expect(html).toContain('href="/calculators"');
  });
});
