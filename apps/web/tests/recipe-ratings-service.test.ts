import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type RatingRow = { recipeId: string; userId: string; stars: number; body: string | null };
type RecipeRow = { id: string; authorId: string; publicationState: string; ratingAvg: number | null; ratingCount: number };

const { mockState } = vi.hoisted(() => ({
  mockState: {
    recipes: [] as RecipeRow[],
    ratings: [] as RatingRow[]
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_t, prop) => `${name}.${String(prop)}`
    });

  // eq(...) → ["eq", col, value]; and(...) → ["and", ...]. Flatten to look up.
  const flat = (where: unknown): unknown[] => (Array.isArray(where) ? where.flat(8) : [where]);
  const getEqValue = (where: unknown, key: string) => {
    const items = flat(where);
    const index = items.findIndex((item) => item === key);
    return index >= 0 ? items[index + 1] : undefined;
  };

  const sql = (..._args: unknown[]) => ["sql"];
  (sql as unknown as { raw: (v: unknown) => unknown }).raw = (value: unknown) => ({ raw: String(value) });

  const recipesToken = tableToken("recipes");
  const recipeRatingsToken = tableToken("recipeRatings");

  // Builder для `select(...)`: различает чтение строки recipes (под локом в
  // rateRecipe) и агрегат по recipe_ratings (пересчёт rating_avg/count).
  const selectBuilder = () => {
    const state = { table: null as unknown, where: undefined as unknown };
    const builder: Record<string, unknown> = {
      from: (table: unknown) => {
        state.table = table;
        return builder;
      },
      where: (clause: unknown) => {
        state.where = clause;
        return builder;
      },
      limit: () => builder,
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        let rows: unknown[];
        if (state.table === recipesToken) {
          const id = getEqValue(state.where, "recipes.id");
          rows = mockState.recipes.filter((recipe) => recipe.id === id);
        } else {
          const recipeId = getEqValue(state.where, "recipeRatings.recipeId");
          const matched = mockState.ratings.filter((rating) => rating.recipeId === recipeId);
          const total = matched.length;
          const average = total > 0 ? matched.reduce((sum, rating) => sum + rating.stars, 0) / total : null;
          rows = [{ average, total }];
        }
        return Promise.resolve(rows).then(onFulfilled, onRejected);
      }
    };
    return builder;
  };

  const db = {
    query: {
      recipes: {
        findFirst: async (arg: { where: unknown }) => {
          const id = getEqValue(arg.where, "recipes.id");
          return mockState.recipes.find((recipe) => recipe.id === id) ?? null;
        }
      },
      recipeRatings: {
        findFirst: async (arg: { where: unknown }) => {
          const recipeId = getEqValue(arg.where, "recipeRatings.recipeId");
          const userId = getEqValue(arg.where, "recipeRatings.userId");
          return mockState.ratings.find((rating) => rating.recipeId === recipeId && rating.userId === userId) ?? null;
        }
      }
    },
    execute: async () => undefined,
    select: () => selectBuilder(),
    insert: () => ({
      values: (values: RatingRow) => ({
        onConflictDoUpdate: ({ set }: { target: unknown; set: { stars: number; body: string | null } }) => {
          const existing = mockState.ratings.find(
            (rating) => rating.recipeId === values.recipeId && rating.userId === values.userId
          );
          if (existing) {
            existing.stars = set.stars;
            existing.body = set.body;
          } else {
            mockState.ratings.push({ recipeId: values.recipeId, userId: values.userId, stars: values.stars, body: values.body });
          }
          return Promise.resolve();
        }
      })
    }),
    delete: () => ({
      where: (clause: unknown) => {
        const recipeId = getEqValue(clause, "recipeRatings.recipeId");
        const userId = getEqValue(clause, "recipeRatings.userId");
        mockState.ratings = mockState.ratings.filter(
          (rating) => !(rating.recipeId === recipeId && rating.userId === userId)
        );
        return Promise.resolve();
      }
    }),
    update: () => ({
      set: (set: { ratingAvg: number | null; ratingCount: number }) => ({
        where: (clause: unknown) => {
          const id = getEqValue(clause, "recipes.id");
          const recipe = mockState.recipes.find((row) => row.id === id);
          if (recipe) {
            recipe.ratingAvg = set.ratingAvg;
            recipe.ratingCount = set.ratingCount;
          }
          return Promise.resolve();
        }
      })
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db)
  };

  return {
    db,
    sql,
    and: (...args: unknown[]) => ["and", ...args],
    or: (...args: unknown[]) => ["or", ...args],
    eq: (...args: unknown[]) => ["eq", ...args],
    gte: (...args: unknown[]) => ["gte", ...args],
    lte: (...args: unknown[]) => ["lte", ...args],
    ilike: (...args: unknown[]) => ["ilike", ...args],
    inArray: (...args: unknown[]) => ["inArray", ...args],
    asc: (value: unknown) => ["asc", value],
    desc: (value: unknown) => ["desc", value],
    count: () => "count",
    recipes: recipesToken,
    recipeRatings: recipeRatingsToken,
    recipeImages: tableToken("recipeImages"),
    recipeIngredients: tableToken("recipeIngredients"),
    ingredients: tableToken("ingredients"),
    users: tableToken("users"),
    userBrewingSettings: tableToken("userBrewingSettings"),
    userCustomIngredients: tableToken("userCustomIngredients")
  };
});

import {
  deleteRecipeRating,
  getUserRecipeRating,
  getViewerRecipeRatingState,
  rateRecipe
} from "../features/recipes/service";

const PUBLISHED = "recipe-published";
const DRAFT = "recipe-draft";
const AUTHOR = "user-author";
const RATER = "user-rater";
const RATER_2 = "user-rater-2";

beforeEach(() => {
  mockState.ratings = [];
  mockState.recipes = [
    { id: PUBLISHED, authorId: AUTHOR, publicationState: "published", ratingAvg: null, ratingCount: 0 },
    { id: DRAFT, authorId: AUTHOR, publicationState: "draft", ratingAvg: null, ratingCount: 0 }
  ];
});

const currentRecipe = (id: string) => mockState.recipes.find((recipe) => recipe.id === id)!;

describe("rateRecipe", () => {
  it("creates a rating and recomputes avg/count transactionally", async () => {
    const summary = await rateRecipe(RATER, PUBLISHED, { stars: 4 });

    expect(summary).toEqual({ average: 4, count: 1 });
    expect(currentRecipe(PUBLISHED)).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
    expect(mockState.ratings).toHaveLength(1);
  });

  it("upserts: the same user re-rating updates in place (one rating per user)", async () => {
    await rateRecipe(RATER, PUBLISHED, { stars: 2 });
    const summary = await rateRecipe(RATER, PUBLISHED, { stars: 5, body: "Передумал" });

    expect(mockState.ratings).toHaveLength(1);
    expect(summary).toEqual({ average: 5, count: 1 });
    expect(mockState.ratings[0]).toMatchObject({ stars: 5, body: "Передумал" });
  });

  it("averages across multiple raters and rounds to 1 decimal", async () => {
    await rateRecipe(RATER, PUBLISHED, { stars: 5 });
    const summary = await rateRecipe(RATER_2, PUBLISHED, { stars: 4 });

    // (5 + 4) / 2 = 4.5
    expect(summary).toEqual({ average: 4.5, count: 2 });
    expect(currentRecipe(PUBLISHED)).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
  });

  it("rejects rating your own recipe", async () => {
    await expect(rateRecipe(AUTHOR, PUBLISHED, { stars: 5 })).rejects.toThrow("OWN_RECIPE");
    expect(mockState.ratings).toHaveLength(0);
  });

  it("rejects rating a non-published recipe", async () => {
    await expect(rateRecipe(RATER, DRAFT, { stars: 5 })).rejects.toThrow("FORBIDDEN");
  });

  it("rejects a missing recipe", async () => {
    await expect(rateRecipe(RATER, "nope", { stars: 5 })).rejects.toThrow("NOT_FOUND");
  });

  it("validates stars range on the server (Zod)", async () => {
    await expect(rateRecipe(RATER, PUBLISHED, { stars: 6 })).rejects.toThrow();
    await expect(rateRecipe(RATER, PUBLISHED, { stars: 0 })).rejects.toThrow();
  });
});

describe("deleteRecipeRating", () => {
  it("removes the rating and recomputes aggregates to null/0 when empty", async () => {
    await rateRecipe(RATER, PUBLISHED, { stars: 4 });
    const summary = await deleteRecipeRating(RATER, PUBLISHED);

    expect(summary).toEqual({ average: 0, count: 0 });
    expect(mockState.ratings).toHaveLength(0);
    expect(currentRecipe(PUBLISHED)).toMatchObject({ ratingAvg: null, ratingCount: 0 });
  });

  it("recomputes the average from the remaining ratings", async () => {
    await rateRecipe(RATER, PUBLISHED, { stars: 5 });
    await rateRecipe(RATER_2, PUBLISHED, { stars: 3 });

    const summary = await deleteRecipeRating(RATER, PUBLISHED);
    expect(summary).toEqual({ average: 3, count: 1 });
    expect(currentRecipe(PUBLISHED)).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
  });
});

describe("getUserRecipeRating", () => {
  it("returns the current user's rating or null", async () => {
    expect(await getUserRecipeRating(RATER, PUBLISHED)).toBeNull();
    await rateRecipe(RATER, PUBLISHED, { stars: 4, body: "Норм" });
    expect(await getUserRecipeRating(RATER, PUBLISHED)).toEqual({ stars: 4, body: "Норм" });
    expect(await getUserRecipeRating(RATER_2, PUBLISHED)).toBeNull();
  });
});

describe("getViewerRecipeRatingState", () => {
  it("canRate=true for a non-author on a published recipe, with their rating", async () => {
    await rateRecipe(RATER, PUBLISHED, { stars: 5, body: null });
    expect(await getViewerRecipeRatingState(RATER, PUBLISHED)).toEqual({
      canRate: true,
      rating: { stars: 5, body: null }
    });
  });

  it("canRate=false for the author of the recipe", async () => {
    expect(await getViewerRecipeRatingState(AUTHOR, PUBLISHED)).toEqual({ canRate: false, rating: null });
  });

  it("canRate=false for a non-published recipe", async () => {
    expect(await getViewerRecipeRatingState(RATER, DRAFT)).toEqual({ canRate: false, rating: null });
  });

  it("canRate=false for a missing recipe", async () => {
    expect(await getViewerRecipeRatingState(RATER, "nope")).toEqual({ canRate: false, rating: null });
  });
});
