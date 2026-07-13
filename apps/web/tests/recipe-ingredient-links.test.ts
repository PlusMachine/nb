import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие listPublicRecipesForIngredient (notes/catalog-refactor-plan.md,
// этап 5.4): JOIN строго по recipeIngredients.ingredientCatalogItemId (не по
// снапшот-имени), total = все published-рецепты с этим ингредиентом, items —
// свежие по updatedAt. Мок @nb/db — db.select chain-билдер, как в
// public-recipes-service.test.ts, без реальной БД.

vi.mock("server-only", () => ({}));

const mockState = vi.hoisted(() => ({
  linkedRecipeIds: [] as string[],
  rows: [] as Record<string, unknown>[],
  captured: [] as Array<{
    projection: Record<string, unknown>;
    where: unknown;
    order: unknown;
    limit: number | null;
  }>
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_target, prop) => `${name}.${String(prop)}`
    });

  const resolveRows = (projection: Record<string, unknown>) => {
    const keys = Object.keys(projection);
    if (keys.length === 1 && keys[0] === "recipeId") {
      return mockState.linkedRecipeIds.map((recipeId) => ({ recipeId }));
    }
    if (keys.length === 1 && keys[0] === "value") {
      return [{ value: mockState.rows.length }];
    }
    return mockState.rows;
  };

  const makeBuilder = (projection: Record<string, unknown>) => {
    const state = {
      projection,
      where: undefined as unknown,
      order: undefined as unknown,
      limit: null as number | null
    };
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      where: (clause: unknown) => {
        state.where = clause;
        return builder;
      },
      orderBy: (...order: unknown[]) => {
        state.order = order;
        return builder;
      },
      limit: (value: number) => {
        state.limit = value;
        return builder;
      },
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        mockState.captured.push({ ...state });
        return Promise.resolve(resolveRows(projection)).then(onFulfilled, onRejected);
      }
    };
    return builder;
  };

  const db = {
    select: (projection: Record<string, unknown>) => makeBuilder(projection)
  };

  return {
    db,
    and: (...args: unknown[]) => ["and", ...args],
    eq: (...args: unknown[]) => ["eq", ...args],
    inArray: (...args: unknown[]) => ["inArray", ...args],
    isNull: (...args: unknown[]) => ["isNull", ...args],
    desc: (value: unknown) => ["desc", value],
    count: () => "count",
    recipes: tableToken("recipes"),
    recipeImages: tableToken("recipeImages"),
    recipeIngredients: tableToken("recipeIngredients"),
    users: tableToken("users")
  };
});

import { listPublicRecipesForIngredient } from "../features/recipes/service";

const baseRow = () => ({
  id: "r-1",
  slug: "hazy-ipa",
  title: "Hazy IPA",
  authorId: "u-1",
  styleId: null,
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9.5,
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  heroImageId: null,
  ratingAvg: null,
  ratingCount: 0,
  saveCount: 0,
  featuredAt: null,
  authorDisplayName: "Alice",
  authorImage: null,
  heroThumbKey: null,
  heroBlurDataUrl: null
});

const idsQuery = () => mockState.captured.find((query) => "recipeId" in query.projection);
const countQuery = () => mockState.captured.find((query) => "value" in query.projection);
const mainQuery = () => mockState.captured.find((query) => (
  !("recipeId" in query.projection) && !("value" in query.projection)
));

beforeEach(() => {
  mockState.linkedRecipeIds = [];
  mockState.rows = [];
  mockState.captured = [];
});

describe("listPublicRecipesForIngredient", () => {
  it("возвращает total=0 и пустой список, когда ни один рецепт не ссылается на ингредиент", async () => {
    mockState.linkedRecipeIds = [];

    const result = await listPublicRecipesForIngredient("us-citra-standard");

    expect(result).toEqual({ total: 0, items: [] });
    // Пустой join — короткий путь: до count/main-запроса дело не доходит.
    expect(countQuery()).toBeUndefined();
    expect(mainQuery()).toBeUndefined();
  });

  it("джойнит строго по ingredientCatalogItemId и фильтрует на publicationState=published", async () => {
    mockState.linkedRecipeIds = ["r-1"];
    mockState.rows = [baseRow()];

    await listPublicRecipesForIngredient("us-citra-standard", 5);

    expect(idsQuery()!.where).toEqual(["eq", "recipeIngredients.ingredientCatalogItemId", "us-citra-standard"]);

    const mainWhere = mainQuery()!.where as unknown[];
    expect(mainWhere[0]).toBe("and");
    expect(mainWhere).toContainEqual(["eq", "recipes.publicationState", "published"]);
    const inArrayClause = mainWhere.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "inArray"
    );
    expect(inArrayClause).toBeTruthy();
    expect(inArrayClause![1]).toBe("recipes.id");
    expect(inArrayClause![2]).toEqual(["r-1"]);

    const countWhere = countQuery()!.where as unknown[];
    expect(countWhere).toContainEqual(["eq", "recipes.publicationState", "published"]);
  });

  it("возвращает total и маппит items через тот же маппинг, что и searchPublicRecipes", async () => {
    mockState.linkedRecipeIds = ["r-1", "r-2"];
    mockState.rows = [baseRow(), { ...baseRow(), id: "r-2", slug: "second-recipe", title: "Second Recipe" }];

    const result = await listPublicRecipesForIngredient("us-citra-standard", 5);

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("Hazy IPA");
    expect(result.items[0].slug).toBe("hazy-ipa");
  });

  it("сортирует по updatedAt desc и передаёт limit в запрос", async () => {
    mockState.linkedRecipeIds = ["r-1"];
    mockState.rows = [baseRow()];

    await listPublicRecipesForIngredient("us-citra-standard", 3);

    expect(mainQuery()!.order).toEqual([["desc", "recipes.updatedAt"]]);
    expect(mainQuery()!.limit).toBe(3);
  });

  it("дедуплицирует id, если один ингредиент встречается в рецепте несколько раз", async () => {
    mockState.linkedRecipeIds = ["r-1", "r-1"];
    mockState.rows = [baseRow()];

    await listPublicRecipesForIngredient("us-citra-standard");

    const mainWhere = mainQuery()!.where as unknown[];
    const inArrayClause = mainWhere.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "inArray"
    );
    expect(inArrayClause![2]).toEqual(["r-1"]);
  });
});
