import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type SaveRow = { recipeId: string; userId: string };
type RecipeRow = { id: string; authorId: string; publicationState: string; saveCount: number };

const { mockState } = vi.hoisted(() => ({
  mockState: {
    recipes: [] as RecipeRow[],
    saves: [] as SaveRow[]
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_t, prop) => `${name}.${String(prop)}`
    });

  const flat = (where: unknown): unknown[] => (Array.isArray(where) ? where.flat(8) : [where]);
  const getEqValue = (where: unknown, key: string) => {
    const items = flat(where);
    const index = items.findIndex((item) => item === key);
    return index >= 0 ? items[index + 1] : undefined;
  };
  // inArray(col, values) → ["inArray", col, values]; найти значения по колонке.
  const getInArrayValues = (where: unknown, key: string): unknown[] | undefined => {
    const items = flat(where);
    for (let i = 0; i < items.length; i += 1) {
      if (items[i] === "inArray" && items[i + 1] === key) {
        return items[i + 2] as unknown[];
      }
    }
    return undefined;
  };

  const sql = (..._args: unknown[]) => ["sql"];
  (sql as unknown as { raw: (v: unknown) => unknown }).raw = (value: unknown) => ({ raw: String(value) });

  const recipesToken = tableToken("recipes");
  const recipeSavesToken = tableToken("recipeSaves");

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
          // recipeSaves: либо батч getSavedRecipeIds (userId + inArray), либо
          // агрегат recomputeRecipeSaveCount (count по recipeId).
          const userId = getEqValue(state.where, "recipeSaves.userId");
          if (userId !== undefined) {
            const ids = getInArrayValues(state.where, "recipeSaves.recipeId") ?? [];
            rows = mockState.saves
              .filter((save) => save.userId === userId && ids.includes(save.recipeId))
              .map((save) => ({ recipeId: save.recipeId }));
          } else {
            const recipeId = getEqValue(state.where, "recipeSaves.recipeId");
            const total = mockState.saves.filter((save) => save.recipeId === recipeId).length;
            rows = [{ total }];
          }
        }
        return Promise.resolve(rows).then(onFulfilled, onRejected);
      }
    };
    return builder;
  };

  const db = {
    query: {
      recipeSaves: {
        findFirst: async (arg: { where: unknown }) => {
          const recipeId = getEqValue(arg.where, "recipeSaves.recipeId");
          const userId = getEqValue(arg.where, "recipeSaves.userId");
          return mockState.saves.find((save) => save.recipeId === recipeId && save.userId === userId) ?? null;
        }
      }
    },
    execute: async () => undefined,
    select: () => selectBuilder(),
    insert: () => ({
      values: (values: SaveRow) => ({
        onConflictDoNothing: () => {
          const exists = mockState.saves.some(
            (save) => save.recipeId === values.recipeId && save.userId === values.userId
          );
          if (!exists) {
            mockState.saves.push({ recipeId: values.recipeId, userId: values.userId });
          }
          return Promise.resolve();
        }
      })
    }),
    delete: () => ({
      where: (clause: unknown) => {
        const recipeId = getEqValue(clause, "recipeSaves.recipeId");
        const userId = getEqValue(clause, "recipeSaves.userId");
        mockState.saves = mockState.saves.filter(
          (save) => !(save.recipeId === recipeId && save.userId === userId)
        );
        return Promise.resolve();
      }
    }),
    update: () => ({
      set: (set: { saveCount: number }) => ({
        where: (clause: unknown) => {
          const id = getEqValue(clause, "recipes.id");
          const recipe = mockState.recipes.find((row) => row.id === id);
          if (recipe) {
            recipe.saveCount = set.saveCount;
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
    recipeSaves: recipeSavesToken,
    recipeRatings: tableToken("recipeRatings"),
    recipeImages: tableToken("recipeImages"),
    recipeIngredients: tableToken("recipeIngredients"),
    ingredients: tableToken("ingredients"),
    users: tableToken("users"),
    userBrewingSettings: tableToken("userBrewingSettings"),
    userCustomIngredients: tableToken("userCustomIngredients")
  };
});

import { getSavedRecipeIds, getViewerRecipeSaveState, setRecipeSave } from "../features/recipes/service";

const PUBLISHED = "recipe-published";
const PUBLISHED_2 = "recipe-published-2";
const DRAFT = "recipe-draft";
const AUTHOR = "user-author";
const SAVER = "user-saver";
const SAVER_2 = "user-saver-2";

beforeEach(() => {
  mockState.saves = [];
  mockState.recipes = [
    { id: PUBLISHED, authorId: AUTHOR, publicationState: "published", saveCount: 0 },
    { id: PUBLISHED_2, authorId: AUTHOR, publicationState: "published", saveCount: 0 },
    { id: DRAFT, authorId: AUTHOR, publicationState: "draft", saveCount: 0 }
  ];
});

const currentRecipe = (id: string) => mockState.recipes.find((recipe) => recipe.id === id)!;

describe("setRecipeSave", () => {
  it("saves a recipe and recomputes save_count transactionally", async () => {
    const summary = await setRecipeSave(SAVER, PUBLISHED, true);

    expect(summary).toEqual({ saved: true, count: 1 });
    expect(currentRecipe(PUBLISHED)).toMatchObject({ saveCount: 1 });
    expect(mockState.saves).toHaveLength(1);
  });

  it("is idempotent: saving twice keeps a single row and count=1", async () => {
    await setRecipeSave(SAVER, PUBLISHED, true);
    const summary = await setRecipeSave(SAVER, PUBLISHED, true);

    expect(summary).toEqual({ saved: true, count: 1 });
    expect(mockState.saves).toHaveLength(1);
  });

  it("counts distinct savers", async () => {
    await setRecipeSave(SAVER, PUBLISHED, true);
    const summary = await setRecipeSave(SAVER_2, PUBLISHED, true);

    expect(summary).toEqual({ saved: true, count: 2 });
    expect(currentRecipe(PUBLISHED)).toMatchObject({ saveCount: 2 });
  });

  it("unsaves and recomputes the count down", async () => {
    await setRecipeSave(SAVER, PUBLISHED, true);
    await setRecipeSave(SAVER_2, PUBLISHED, true);

    const summary = await setRecipeSave(SAVER, PUBLISHED, false);
    expect(summary).toEqual({ saved: false, count: 1 });
    expect(currentRecipe(PUBLISHED)).toMatchObject({ saveCount: 1 });
    expect(mockState.saves).toHaveLength(1);
  });

  it("rejects saving a non-published recipe", async () => {
    await expect(setRecipeSave(SAVER, DRAFT, true)).rejects.toThrow("FORBIDDEN");
    expect(mockState.saves).toHaveLength(0);
  });

  it("rejects a missing recipe", async () => {
    await expect(setRecipeSave(SAVER, "nope", true)).rejects.toThrow("NOT_FOUND");
  });
});

describe("getViewerRecipeSaveState", () => {
  it("reflects whether the current user saved the recipe", async () => {
    expect(await getViewerRecipeSaveState(SAVER, PUBLISHED)).toEqual({ saved: false });
    await setRecipeSave(SAVER, PUBLISHED, true);
    expect(await getViewerRecipeSaveState(SAVER, PUBLISHED)).toEqual({ saved: true });
    expect(await getViewerRecipeSaveState(SAVER_2, PUBLISHED)).toEqual({ saved: false });
  });
});

describe("getSavedRecipeIds", () => {
  it("returns the subset of ids saved by the user", async () => {
    await setRecipeSave(SAVER, PUBLISHED, true);
    const ids = await getSavedRecipeIds(SAVER, [PUBLISHED, PUBLISHED_2]);
    expect([...ids]).toEqual([PUBLISHED]);
  });

  it("returns an empty set for no ids without touching the db", async () => {
    const ids = await getSavedRecipeIds(SAVER, []);
    expect(ids.size).toBe(0);
  });
});
