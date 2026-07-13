import { beforeEach, describe, expect, it, vi } from "vitest";

// Скрытый модератором рецепт обязан пропасть из ВСЕХ публичных путей. Мокаем @nb/db
// хранилищем рецептов/фото в памяти: интерпретируем только eq-условия из where —
// этого достаточно для гейтов доступа (findFirst по id/slug), а маппинг DTO
// добирает пустыми select-выборками.

vi.mock("server-only", () => ({}));

type RecipeRow = {
  id: string;
  slug: string;
  authorId: string;
  publicationState: string;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  featuredAt: Date | null;
  title: string;
  description: string | null;
  heroImageId: string | null;
  [key: string]: unknown;
};

type ImageRow = {
  id: string;
  recipeId: string;
  status: string;
  deletedAt: Date | null;
  storageKeyLarge: string | null;
  mimeType: string;
  recipe: RecipeRow;
};

const { mockState } = vi.hoisted(() => ({
  mockState: {
    recipes: [] as Array<Record<string, unknown>>,
    images: [] as Array<Record<string, unknown>>
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_target, prop) => `${name}.${String(prop)}`
    });

  // eq(col, value) → ["eq", col, value]; and(...) — вложенные массивы, поэтому
  // условия ищем по плоскому списку токенов.
  const flatten = (value: unknown): unknown[] => (Array.isArray(value) ? value.flat(8) : [value]);

  const matches = (row: Record<string, unknown>, where: unknown): boolean => {
    const tokens = flatten(where);
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] !== "eq") {
        continue;
      }
      const column = String(tokens[index + 1] ?? "");
      const expected = tokens[index + 2];
      const field = column.split(".")[1];
      if (!field) {
        continue;
      }
      if (row[field] !== expected) {
        return false;
      }
    }
    return true;
  };

  const emptyBuilder = () => {
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      innerJoin: () => builder,
      where: () => builder,
      groupBy: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve([]).then(onFulfilled, onRejected)
    };
    return builder;
  };

  const db = {
    select: () => emptyBuilder(),
    query: {
      recipes: {
        findFirst: async ({ where }: { where?: unknown } = {}) =>
          mockState.recipes.find((row) => matches(row, where)),
        findMany: async () => []
      },
      recipeImages: {
        findFirst: async ({ where }: { where?: unknown } = {}) =>
          mockState.images.find((row) => matches(row, where))
      },
      recipeRatings: {
        findFirst: async () => undefined
      },
      users: {
        findFirst: async () => undefined
      }
    }
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    or: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => ["eq", ...args],
    isNull: (...args: unknown[]) => ["isNull", ...args],
    isNotNull: (...args: unknown[]) => ["isNotNull", ...args],
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

vi.mock("@/lib/storage", () => ({
  storageAdapter: {
    getObject: async () => ({ body: Buffer.from("image"), contentType: "image/webp" }),
    upload: async () => {},
    delete: async () => {}
  }
}));

import { getBeerPresentationBySlug } from "../features/beer-page/service";
import { buildBeerShareKey } from "../features/beer-page/share-key";
import { getRecipeImageAsset } from "../features/recipe-images/service";
import {
  cloneRecipeFromPublic,
  getPublicRecipeBySlug,
  getRecipeById,
  getRecipeFeaturedState,
  getViewerRecipeRatingState
} from "../features/recipes/service";

const AUTHOR = "author-1";
const STRANGER = "stranger-1";

const buildRecipe = (overrides: Partial<RecipeRow> = {}): RecipeRow => ({
  id: "recipe-1",
  slug: "hidden-ipa",
  authorId: AUTHOR,
  recipeFamilyId: "family-1",
  versionNumber: 1,
  publicationState: "published",
  hiddenAt: null,
  hiddenReason: null,
  featuredAt: null,
  title: "Скрытая IPA",
  description: null,
  heroImageId: null,
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 70,
  boilTimeMinutes: 60,
  og: 1.05,
  fg: 1.01,
  abv: 5.2,
  ibu: 40,
  color: 8,
  ratingAvg: null,
  ratingCount: 0,
  saveCount: 0,
  authorNotes: null,
  processMeta: null,
  calculationMeta: null,
  draftState: null,
  importMeta: null,
  equipmentProfileId: null,
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  brewPlanMeta: null,
  clonedFromRecipeId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  ingredients: [],
  ...overrides
});

const hiddenRecipe = () =>
  buildRecipe({ hiddenAt: new Date("2026-07-12T10:00:00.000Z"), hiddenReason: "Плагиат" });

const buildImage = (recipe: RecipeRow): ImageRow => ({
  id: "image-1",
  recipeId: recipe.id,
  status: "ready",
  deletedAt: null,
  storageKeyLarge: "recipes/recipe-1/image-1/large.webp",
  mimeType: "image/webp",
  recipe
});

beforeEach(() => {
  mockState.recipes = [];
  mockState.images = [];
});

describe("скрытый рецепт — публичные пути закрыты", () => {
  it("страница рецепта /recipes/<slug> не отдаётся", async () => {
    mockState.recipes = [hiddenRecipe()];
    await expect(getPublicRecipeBySlug("hidden-ipa")).rejects.toThrow("FORBIDDEN");
  });

  it("тот же рецепт без метки скрытия отдаётся (контроль)", async () => {
    mockState.recipes = [buildRecipe()];
    const recipe = await getPublicRecipeBySlug("hidden-ipa");
    expect(recipe.title).toBe("Скрытая IPA");
    expect(recipe.hiddenAt).toBeNull();
  });

  it("чужой пользователь не получает скрытый рецепт по id", async () => {
    mockState.recipes = [hiddenRecipe()];
    await expect(getRecipeById(STRANGER, "recipe-1")).rejects.toThrow("FORBIDDEN");
  });

  it("«Выбор редакции» скрытому поставить нельзя (published=false)", async () => {
    mockState.recipes = [hiddenRecipe()];
    await expect(getRecipeFeaturedState("recipe-1")).resolves.toEqual({
      exists: true,
      published: false,
      featured: false
    });
  });

  it("скрытый рецепт нельзя оценить", async () => {
    mockState.recipes = [hiddenRecipe()];
    const state = await getViewerRecipeRatingState(STRANGER, "recipe-1");
    expect(state.canRate).toBe(false);
  });

  // Гард клонирования обязан читать hidden_at из БД: publicationState у скрытого
  // остаётся "published", и по нему одному чужой клон прошёл бы вместе с содержимым.
  it("скрытый рецепт нельзя склонировать себе", async () => {
    mockState.recipes = [hiddenRecipe()];
    await expect(cloneRecipeFromPublic(STRANGER, "recipe-1")).rejects.toThrow("FORBIDDEN");
  });

  it("гостевая страница пива /beer/<slug> закрыта даже по share-ключу с наклейки", async () => {
    mockState.recipes = [hiddenRecipe()];
    const shareKey = buildBeerShareKey("recipe-1");

    await expect(getBeerPresentationBySlug({ slug: "hidden-ipa", shareKey })).resolves.toBeNull();
    await expect(getBeerPresentationBySlug({ slug: "hidden-ipa", viewerId: AUTHOR })).resolves.toBeNull();
  });

  it("непубличный, но не скрытый рецепт по share-ключу открывается (контроль)", async () => {
    mockState.recipes = [buildRecipe({ publicationState: "private" })];
    const shareKey = buildBeerShareKey("recipe-1");

    const presentation = await getBeerPresentationBySlug({ slug: "hidden-ipa", shareKey });
    expect(presentation?.title).toBe("Скрытая IPA");
    expect(presentation?.isPublished).toBe(false);
  });

  it("фото скрытого рецепта не отдаётся ни гостю, ни по share-ключу", async () => {
    const recipe = hiddenRecipe();
    mockState.recipes = [recipe];
    mockState.images = [buildImage(recipe)];
    const shareKey = buildBeerShareKey("recipe-1");

    await expect(
      getRecipeImageAsset({ imageId: "image-1", variant: "large", viewerId: null })
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      getRecipeImageAsset({ imageId: "image-1", variant: "large", viewerId: null, beerShareKey: shareKey })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("фото published-рецепта гостю по-прежнему отдаётся (контроль)", async () => {
    const recipe = buildRecipe();
    mockState.recipes = [recipe];
    mockState.images = [buildImage(recipe)];

    const asset = await getRecipeImageAsset({ imageId: "image-1", variant: "large", viewerId: null });
    expect(asset.contentType).toBe("image/webp");
  });
});

describe("скрытый рецепт — автор видит свой", () => {
  it("автор получает свой скрытый рецепт вместе с причиной", async () => {
    mockState.recipes = [hiddenRecipe()];

    const recipe = await getRecipeById(AUTHOR, "recipe-1");
    expect(recipe.title).toBe("Скрытая IPA");
    expect(recipe.hiddenAt).not.toBeNull();
    expect(recipe.hiddenReason).toBe("Плагиат");
  });
});
