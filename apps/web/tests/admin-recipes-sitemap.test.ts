import { beforeEach, describe, expect, it, vi } from "vitest";

// Карта сайта и витрина обязаны отсекать скрытые рецепты на уровне SQL, а не
// после выборки. Мок @nb/db возвращает кандидатов и ЗАПОМИНАЕТ where — проверяем,
// что в условии есть isNull(recipes.hidden_at), а не только publicationState.

vi.mock("server-only", () => ({}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    candidateRows: [] as Array<Record<string, unknown>>,
    selectCallCount: 0,
    whereClauses: [] as unknown[]
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_target, prop) => `${name}.${String(prop)}`
    });

  const makeBuilder = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      where: (where: unknown) => {
        mockState.whereClauses.push(where);
        return builder;
      },
      groupBy: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(onFulfilled, onRejected)
    };
    return builder;
  };

  const db = {
    select: () => {
      mockState.selectCallCount += 1;
      // 1-й select — кандидаты sitemap, дальше батчи (варки/клоны) — пустые.
      return makeBuilder(mockState.selectCallCount === 1 ? mockState.candidateRows : []);
    }
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    or: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => ["eq", ...args],
    isNull: (...args: unknown[]) => ["isNull", ...args],
    inArray: (...args: unknown[]) => ["inArray", ...args],
    gte: (...args: unknown[]) => args,
    lte: (...args: unknown[]) => args,
    ilike: (...args: unknown[]) => args,
    asc: (...args: unknown[]) => args,
    desc: (...args: unknown[]) => args,
    count: () => "count",
    sql: Object.assign((..._args: unknown[]) => ["sql"], { raw: (value: unknown) => ({ raw: String(value) }) }),
    brewBatches: tableToken("brewBatches"),
    ingredients: tableToken("ingredients"),
    recipeImages: tableToken("recipeImages"),
    recipeIngredients: tableToken("recipeIngredients"),
    recipeRatings: tableToken("recipeRatings"),
    recipeSaves: tableToken("recipeSaves"),
    recipes: tableToken("recipes"),
    userBrewingSettings: tableToken("userBrewingSettings"),
    userCustomIngredients: tableToken("userCustomIngredients"),
    users: tableToken("users")
  };
});

import { listRecipeSitemapEntries } from "../features/recipes/service";
import { publiclyVisibleRecipeConditions } from "../features/recipes/visibility";

beforeEach(() => {
  mockState.candidateRows = [];
  mockState.selectCallCount = 0;
  mockState.whereClauses = [];
});

describe("sitemap и публичные выборки — фильтр скрытых", () => {
  it("выборка кандидатов sitemap фильтрует и по publicationState, и по hidden_at", async () => {
    mockState.candidateRows = [
      {
        id: "recipe-1",
        slug: "rich-recipe",
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
        title: "Hazy IPA",
        description: null,
        heroImageId: "img-1",
        ratingCount: 0,
        clonedFromRecipeId: null
      }
    ];

    const entries = await listRecipeSitemapEntries();
    expect(entries).toEqual([{ slug: "rich-recipe", updatedAt: new Date("2026-06-01T00:00:00.000Z") }]);

    const where = JSON.stringify(mockState.whereClauses[0]);
    expect(where).toContain("recipes.publicationState");
    expect(where).toContain("published");
    // Ключевое: скрытые не доходят даже до фильтра качества.
    expect(where).toContain("isNull");
    expect(where).toContain("recipes.hiddenAt");
  });

  it("общее условие видимости — ровно два предиката: published и не скрыт", () => {
    expect(publiclyVisibleRecipeConditions()).toEqual([
      ["eq", "recipes.publicationState", "published"],
      ["isNull", "recipes.hiddenAt"]
    ]);
  });
});
