import { beforeEach, describe, expect, it, vi } from "vitest";

// Жизненный цикл рецептов: черновик → правки → ингредиенты → предпросмотр →
// публикация, клонирование (своего/публичного), версии, удаление, гейты владельца,
// дефолтные заголовки и счётчики. Сервис-слой тестируется БЕЗ реальной БД: модуль
// `@nb/db` мокается in-memory (vi.hoisted + vi.mock), как в tests/recipe-service.test.ts.
// Харнесс расширен: db.select (count/проекции/grouped), таблицы users и recipeImages —
// чтобы покрыть clone-атрибуцию, countRecipesForAuthor, listRecipesForAuthor и
// listAuthorRecipeCards, которых нет в существующих тестах.

vi.mock("server-only", () => ({}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    recipes: {
      name: "recipes",
      id: "id",
      authorId: "authorId",
      recipeFamilyId: "recipeFamilyId",
      versionNumber: "versionNumber",
      publicationState: "publicationState",
      hiddenAt: "hiddenAt",
      title: "title",
      slug: "slug",
      styleId: "styleId",
      og: "og",
      fg: "fg",
      abv: "abv",
      ibu: "ibu",
      color: "color",
      batchSizeNormalizedQuantity: "batchSizeNormalizedQuantity",
      batchSizeNormalizedUnit: "batchSizeNormalizedUnit",
      updatedAt: "updatedAt",
      createdAt: "createdAt",
      heroImageId: "heroImageId",
      ratingAvg: "ratingAvg",
      ratingCount: "ratingCount",
      saveCount: "saveCount"
    },
    recipeIngredients: { name: "recipe_ingredients", id: "id", recipeId: "recipeId", persistentKey: "persistentKey", displayOrder: "displayOrder", ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", type: "type", stage: "stage" },
    ingredients: { name: "ingredients", id: "id", isActive: "isActive", type: "type" },
    recipeImages: { name: "recipe_images", id: "ri_id", storageKeyThumb: "ri_storageKeyThumb", blurDataUrl: "ri_blurDataUrl" },
    recipeRatings: { name: "recipe_ratings", id: "id", recipeId: "recipeId", userId: "userId", stars: "stars", body: "body" },
    recipeSaves: { name: "recipe_saves", id: "id", recipeId: "recipeId", userId: "userId" },
    users: { name: "users", id: "u_id", displayName: "u_displayName", email: "u_email", image: "u_image" },
    userBrewingSettings: { name: "userBrewingSettings", userId: "userId" },
    userCustomIngredients: { name: "userCustomIngredients", id: "id", userId: "userId", type: "type", normalizedName: "normalizedName" },
    // resolveCompletedBrewCount (mapRecipeDetailDto) — как и users выше (table.name
    // !== "recipes" в runSelect ниже), всегда отдаёт [] → completedBrewCount = 0.
    brewBatches: { name: "brew_batches", id: "id", recipeId: "recipeId", status: "status" }
  },
  mockState: {
    idCounter: 0,
    recipesById: new Map<string, any>(),
    ingredientsByRecipeId: new Map<string, any[]>(),
    catalogById: new Map<string, any>(),
    customById: new Map<string, any>(),
    usersById: new Map<string, any>()
  }
}));

vi.mock("@nb/db", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const COUNT = Symbol("count");

  const getEqValue = (where: any, key: string) => {
    if (Array.isArray(where) && where.length === 2 && where[0] === key) {
      return where[1];
    }
    const items = Array.isArray(where) ? where : [where];
    const found = items.find((entry) => Array.isArray(entry) && entry[0] === key);
    return found?.[1];
  };

  // --- db.select(...) builder (count / проекции / grouped count) -----------
  const runSelect = (state: any) => {
    const sel: Record<string, unknown> = state.selection ?? {};
    const selEntries = Object.entries(sel);
    const isCount = selEntries.some(([, v]) => v === COUNT);

    if (state.table?.name !== "recipes") {
      return [];
    }

    const id = getEqValue(state.where, "id");
    const authorId = getEqValue(state.where, "authorId");
    const familyId = getEqValue(state.where, "recipeFamilyId");
    const publicationState = getEqValue(state.where, "publicationState");

    let rows = [...mockState.recipesById.values()]
      .filter((r) => (id ? r.id === id : true))
      .filter((r) => (authorId ? r.authorId === authorId : true))
      .filter((r) => (familyId ? r.recipeFamilyId === familyId : true))
      .filter((r) => (publicationState ? r.publicationState === publicationState : true));

    // grouped count (listAuthorRecipeCards: count() per recipeFamilyId)
    if (state.group != null) {
      const groups = new Map<string, any[]>();
      for (const r of rows) {
        const arr = groups.get(r.recipeFamilyId) ?? [];
        arr.push(r);
        groups.set(r.recipeFamilyId, arr);
      }
      return [...groups.values()].map((arr) => {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of selEntries) {
          obj[k] = v === COUNT ? arr.length : typeof v === "string" ? (arr[0] as any)[v] ?? null : null;
        }
        return obj;
      });
    }

    // плоский count (countRecipesForAuthor / versionCounts)
    if (isCount) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of selEntries) {
        obj[k] = v === COUNT ? rows.length : null;
      }
      return [obj];
    }

    // проекция строк (resolveRecipeCloneSource / listAuthorRecipeCards main)
    if (state.offsetN != null) rows = rows.slice(state.offsetN);
    if (state.limitN != null) rows = rows.slice(0, state.limitN);
    return rows.map((r) => {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of selEntries) {
        if (typeof v === "string" && v.startsWith("u_")) {
          const u = mockState.usersById.get(r.authorId);
          obj[k] = u ? u[v.slice(2)] ?? null : null;
        } else if (typeof v === "string" && v.startsWith("ri_")) {
          obj[k] = null; // нет совпадения join'а recipe_images
        } else if (typeof v === "string") {
          obj[k] = r[v] ?? null;
        } else {
          obj[k] = null;
        }
      }
      return obj;
    });
  };

  const makeSelectBuilder = (selection: unknown) => {
    const state: any = { selection, table: null, where: undefined, group: null, limitN: null, offsetN: null };
    const builder: any = {
      from(table: any) { state.table = table; return builder; },
      leftJoin() { return builder; },
      innerJoin() { return builder; },
      where(cond: any) { state.where = cond; return builder; },
      orderBy() { return builder; },
      groupBy(col: any) { state.group = col; return builder; },
      limit(n: number) { state.limitN = n; return builder; },
      offset(n: number) { state.offsetN = n; return builder; },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          resolve(runSelect(state));
        } catch (error) {
          reject(error);
        }
      }
    };
    return builder;
  };

  const db: any = {
    query: {
      recipes: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          const authorId = getEqValue(arg?.where, "authorId");
          const slug = getEqValue(arg?.where, "slug");

          const recipe = id
            ? mockState.recipesById.get(id)
            : slug
              ? [...mockState.recipesById.values()].find((item) => item.slug === slug)
              : null;

          if (!recipe) return null;
          if (authorId && recipe.authorId !== authorId) return null;
          if (arg?.with?.ingredients) return { ...recipe, ingredients: mockState.ingredientsByRecipeId.get(recipe.id) ?? [] };
          return recipe;
        },
        findMany: async (arg: any) => {
          const authorId = getEqValue(arg?.where, "authorId");
          const recipeFamilyId = getEqValue(arg?.where, "recipeFamilyId");
          const publicationState = getEqValue(arg?.where, "publicationState");

          return [...mockState.recipesById.values()]
            .filter((recipe) => (authorId ? recipe.authorId === authorId : true))
            .filter((recipe) => (recipeFamilyId ? recipe.recipeFamilyId === recipeFamilyId : true))
            .filter((recipe) => (publicationState ? recipe.publicationState === publicationState : true));
        }
      },
      recipeIngredients: {
        findMany: async (arg: any) => {
          const recipeId = getEqValue(arg?.where, "recipeId");
          // Возвращаем СНИМОК (как реальный Drizzle): иначе sync, вставляя новые
          // строки в ту же ссылку-массив, посчитал бы их «устаревшими» и удалил.
          return [...(mockState.ingredientsByRecipeId.get(recipeId) ?? [])];
        }
      },
      ingredients: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          return mockState.catalogById.get(id) ?? null;
        }
      },
      userCustomIngredients: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          const userId = getEqValue(arg?.where, "userId");
          const item = id ? mockState.customById.get(id) ?? null : null;
          return item && (!userId || item.userId === userId) ? item : null;
        }
      },
      users: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "u_id");
          return id ? mockState.usersById.get(id) ?? null : null;
        }
      },
      userBrewingSettings: {
        findFirst: async () => null
      }
    },
    select: (selection: unknown) => makeSelectBuilder(selection),
    insert: (table: { name: string }) => ({
      values: (values: any) => {
        if (table.name === "recipe_ingredients") {
          const payload = Array.isArray(values) ? values : [values];
          for (const value of payload) {
            const row = {
              ...value,
              id: uuid(++mockState.idCounter),
              persistentKey: value.persistentKey ?? uuid(++mockState.idCounter),
              displayOrder: value.displayOrder ?? 0,
              createdAt: now,
              updatedAt: now
            };
            const current = mockState.ingredientsByRecipeId.get(row.recipeId) ?? [];
            current.push(row);
            mockState.ingredientsByRecipeId.set(row.recipeId, current);
          }
        }

        return {
          returning: async () => {
            if (table.name === "recipes") {
              const row = { ...values, id: uuid(++mockState.idCounter), createdAt: now, updatedAt: now };
              mockState.recipesById.set(row.id, row);
              return [row];
            }

            if (table.name === "userCustomIngredients") {
              const row = { ...values, id: uuid(++mockState.idCounter), createdAt: now, updatedAt: now };
              mockState.customById.set(row.id, row);
              return [row];
            }

            return Array.isArray(values) ? values : [values];
          }
        };
      }
    }),
    update: (table: { name: string }) => ({
      set: (set: any) => ({
        // Реальный Drizzle-билдер thenable на любом шаге цепочки — `await
        // db.update(...).set(...).where(...)` без `.returning()` (как делает
        // инкремент cloneCount и перенос унаследованных статов) реально бьёт в
        // БД. Фейк повторяет это: `where(...)` одновременно и awaitable
        // (`then`), и поддерживает явный `.returning()`.
        where: (where: any) => {
          const apply = () => {
            if (table.name === "recipe_ingredients") {
              const recipeId = getEqValue(where, "recipeId");
              const id = getEqValue(where, "id");
              const current = recipeId ? mockState.ingredientsByRecipeId.get(recipeId) ?? [] : [];
              const index = current.findIndex((ingredient) => ingredient.id === id);
              if (index < 0) return [];
              const updated = { ...current[index], ...set };
              current[index] = updated;
              mockState.ingredientsByRecipeId.set(recipeId, current);
              return [updated];
            }

            const id = getEqValue(where, "id") ?? [...mockState.recipesById.keys()][0];
            const current = id ? mockState.recipesById.get(id) : null;
            if (!current || !id) return [];
            const updated = { ...current, ...set };
            mockState.recipesById.set(id, updated);
            return [updated];
          };

          return {
            returning: async () => apply(),
            then: (onFulfilled: any, onRejected?: any) => Promise.resolve(apply()).then(onFulfilled, onRejected)
          };
        }
      })
    }),
    delete: (table: { name: string }) => ({
      where: async (where: any) => {
        if (table.name === "recipe_ingredients") {
          const recipeId = getEqValue(where, "recipeId");
          const id = getEqValue(where, "id");
          if (!id) {
            mockState.ingredientsByRecipeId.set(recipeId, []);
            return;
          }
          const current = mockState.ingredientsByRecipeId.get(recipeId) ?? [];
          mockState.ingredientsByRecipeId.set(recipeId, current.filter((ingredient) => ingredient.id !== id));
          return;
        }

        if (table.name === "recipes") {
          const id = getEqValue(where, "id");
          if (id) {
            mockState.recipesById.delete(id);
            mockState.ingredientsByRecipeId.delete(id);
          }
        }
      }
    })
  };

  const sqlTag: any = (...args: unknown[]) => args;
  sqlTag.raw = (...args: unknown[]) => args;

  return {
    db,
    and: (...args: unknown[]) => args,
    or: (...args: unknown[]) => args,
    count: () => COUNT,
    asc: (v: unknown) => v,
    desc: (v: unknown) => v,
    eq: (...args: unknown[]) => args,
    gte: (...args: unknown[]) => args,
    lte: (...args: unknown[]) => args,
    ilike: (...args: unknown[]) => args,
    inArray: (col: unknown, values: unknown) => ({ __inArray: true, col, values }),
    sql: sqlTag,
    recipes: tableRefs.recipes,
    recipeIngredients: tableRefs.recipeIngredients,
    ingredients: tableRefs.ingredients,
    recipeImages: tableRefs.recipeImages,
    recipeRatings: tableRefs.recipeRatings,
    recipeSaves: tableRefs.recipeSaves,
    users: tableRefs.users,
    userBrewingSettings: tableRefs.userBrewingSettings,
    userCustomIngredients: tableRefs.userCustomIngredients,
    brewBatches: tableRefs.brewBatches
  };
});

// Барьер createRecipe зовёт assertRateLimit (реальный бьёт в БД); в этих тестах
// он не в фокусе — стабим no-op, остальное @nb/auth оставляем настоящим.
vi.mock("@nb/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nb/auth")>()),
  assertRateLimit: vi.fn(async () => {})
}));

import { starterEquipmentProfileDefaults } from "../features/equipment-profiles/contracts";
import {
  cloneRecipe,
  cloneRecipeFromPublic,
  countRecipesForAuthor,
  createRecipe,
  createRecipeVersion,
  deleteRecipe,
  getNextDefaultRecipeTitle,
  getOwnedRecipeById,
  getRecipeById,
  listAuthorRecipeCards,
  listRecipesForAuthor,
  previewRecipeDraft,
  setRecipeIngredients,
  updateRecipe
} from "../features/recipes/service";

// Каталожные ингредиенты — те же формы, что в tests/recipe-service.test.ts.
const seedCatalog = () => {
  mockState.catalogById.set(uuid(101), {
    id: uuid(101),
    isActive: true,
    type: "malt",
    itemKind: "malt",
    nameRu: null,
    nameEn: "Pale Malt",
    displayModeRu: "source_first",
    displayNameOverrideRu: null,
    secondaryNameOverrideRu: null,
    hideSecondaryNameRu: false,
    countryCode: null,
    countryName: null,
    brand: null,
    producer: null,
    productCode: null,
    groupName: null,
    category: null,
    subcategory: null,
    presentOnBirrf: true,
    inventoryEnabled: true,
    quantityDefaults: null,
    attributes: { extract_pct_dry_basis: 80, color_lovibond: 2 }
  });
  mockState.catalogById.set(uuid(102), {
    id: uuid(102),
    isActive: true,
    type: "hop",
    itemKind: "hop",
    nameRu: null,
    nameEn: "Cascade",
    displayModeRu: "source_first",
    displayNameOverrideRu: null,
    secondaryNameOverrideRu: null,
    hideSecondaryNameRu: false,
    countryCode: null,
    countryName: null,
    brand: null,
    producer: null,
    productCode: null,
    groupName: null,
    category: null,
    subcategory: null,
    presentOnBirrf: true,
    inventoryEnabled: true,
    quantityDefaults: null,
    attributes: { alpha_acid_pct_typical: 6 }
  });
  mockState.catalogById.set(uuid(103), {
    id: uuid(103),
    isActive: true,
    type: "yeast",
    itemKind: "yeast",
    nameRu: "US-05",
    nameEn: "US-05",
    displayModeRu: "source_first",
    displayNameOverrideRu: null,
    secondaryNameOverrideRu: null,
    hideSecondaryNameRu: false,
    countryCode: null,
    countryName: null,
    brand: null,
    producer: null,
    productCode: "US-05",
    groupName: null,
    category: null,
    subcategory: null,
    presentOnBirrf: true,
    inventoryEnabled: true,
    quantityDefaults: null,
    attributes: {
      form: "dry",
      attenuation_pct_min: 74,
      attenuation_pct_max: 82,
      attenuation_pct_typical: 78,
      package_size: 11,
      package_unit: "g"
    }
  });
};

const maltLine = () => ({ ingredientCatalogItemId: uuid(101), type: "malt", category: "fermentable", amountEnteredQuantity: 4, amountEnteredUnit: "kg", stage: "mash" });
const hopLine = () => ({ ingredientCatalogItemId: uuid(102), type: "hop", category: "hop", amountEnteredQuantity: 40, amountEnteredUnit: "g", stage: "boil", timeOffset: 60 });
const yeastLine = () => ({ ingredientCatalogItemId: uuid(103), type: "yeast", category: "yeast", amountEnteredQuantity: 11, amountEnteredUnit: "g", stage: "fermentation" });

const buildPublicPayload = (overrides: Record<string, unknown> = {}) => ({
  title: "Public recipe",
  publicationState: "published",
  styleId: "21A",
  description: "Публичное описание рецепта.",
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  boilTimeMinutes: 60,
  ingredients: [maltLine(), hopLine(), yeastLine()],
  ...overrides
});

describe("жизненный цикл рецептов", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.recipesById.clear();
    mockState.ingredientsByRecipeId.clear();
    mockState.catalogById.clear();
    mockState.customById.clear();
    mockState.usersById.clear();
    seedCatalog();
    mockState.usersById.set("u1", { id: "u1", displayName: "Артём", email: "artyom@example.com", image: null });
    mockState.usersById.set("u-me", { id: "u-me", displayName: "Борис", email: "boris@example.com", image: null });
    mockState.usersById.set("u-other", { id: "u-other", displayName: "Чужой пивовар", email: "other@example.com", image: null });
  });

  // ── Сквозной журнал: черновик → правки → ингредиенты → предпросмотр → публикация
  it("проводит рецепт от пустого черновика до публикации через все этапы", async () => {
    // 1) черновик только с названием
    const draft = await createRecipe("u1", { title: "Путь к публикации", publicationState: "draft" });
    expect(draft.publicationState).toBe("draft");
    expect(draft.ingredients).toEqual([]);

    // 2) правка параметров партии (без ингредиентов — статус прежний)
    const edited = await updateRecipe("u1", draft.id, {
      batchSizeEnteredQuantity: 25,
      batchSizeEnteredUnit: "l",
      authorNotes: "первая прикидка"
    });
    expect(edited.batchSizeEnteredQuantity).toBe(25);
    expect(edited.authorNotes).toBe("первая прикидка");

    // 3) установка ингредиентов отдельным путём
    const withIngredients = await setRecipeIngredients("u1", draft.id, [maltLine(), hopLine(), yeastLine()]);
    expect(withIngredients.ingredients).toHaveLength(3);
    expect(withIngredients.og).not.toBeNull();
    expect(withIngredients.ibu).not.toBeNull();

    // 4) предпросмотр черновика пересчитывает метрики без сохранения
    const preview = await previewRecipeDraft("u1", {
      title: "Путь к публикации",
      styleId: "21A",
      batchSizeEnteredQuantity: 25,
      batchSizeEnteredUnit: "l",
      boilTimeMinutes: 60,
      ingredients: [maltLine(), hopLine(), yeastLine()]
    });
    expect(preview.og).not.toBeNull();
    expect(preview.styleId).toBe("21A");
    expect(preview.styleRange).not.toBeNull();

    // 5) публикация: добавляем стиль и описание, шлём полный набор ингредиентов
    const published = await updateRecipe("u1", draft.id, {
      publicationState: "published",
      styleId: "21A",
      description: "Готово к публикации.",
      ingredients: [maltLine(), hopLine(), yeastLine()]
    });
    expect(published.publicationState).toBe("published");
    expect(published.styleId).toBe("21A");
    expect(published.ibu).not.toBeNull();
  });

  // ── setRecipeIngredients ───────────────────────────────────────────────────
  it("setRecipeIngredients заменяет состав и пересчитывает статистику", async () => {
    const recipe = await createRecipe("u1", { title: "Только солод", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", ingredients: [maltLine()] });
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.ibu).toBeNull();

    const updated = await setRecipeIngredients("u1", recipe.id, [maltLine(), hopLine()]);
    expect(updated.ingredients).toHaveLength(2);
    expect(updated.og).not.toBeNull();
    expect(updated.ibu).not.toBeNull();
    expect(mockState.ingredientsByRecipeId.get(recipe.id) ?? []).toHaveLength(2);
  });

  it("setRecipeIngredients для чужого рецепта отказывает (NOT_FOUND)", async () => {
    const recipe = await createRecipe("u1", { title: "Чужой состав", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    await expect(setRecipeIngredients("u2", recipe.id, [maltLine()])).rejects.toThrowError("NOT_FOUND");
  });

  // ── updateRecipe: путь «без ингредиентов» сохраняет существующий состав ──────
  it("updateRecipe без поля ingredients сохраняет ранее заданный состав", async () => {
    const recipe = await createRecipe("u1", {
      title: "Состав на месте",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [maltLine(), hopLine()]
    });

    const updated = await updateRecipe("u1", recipe.id, { authorNotes: "правка без состава" });
    expect(updated.authorNotes).toBe("правка без состава");
    expect(updated.ingredients).toHaveLength(2);
  });

  // ── Валидация ──────────────────────────────────────────────────────────────
  it("createRecipe с пустым заголовком отклоняется на уровне схемы", async () => {
    await expect(createRecipe("u1", { title: "   ", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" })).rejects.toThrow();
  });

  it("публикация без описания и дрожжей даёт RecipeValidationError (стиль НЕ обязателен)", async () => {
    const recipe = await createRecipe("u1", {
      title: "Недопубликованный",
      publicationState: "private",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [maltLine(), hopLine()]
    });

    let captured: any = null;
    try {
      await updateRecipe("u1", recipe.id, { publicationState: "published", styleId: "21A" });
    } catch (error) {
      captured = error;
    }

    expect(captured).not.toBeNull();
    expect(captured.name).toBe("RecipeValidationError");
    expect(captured.fieldErrors).toMatchObject({
      description: "Добавьте описание рецепта.",
      "ingredients.yeast": "Для публичного рецепта добавьте дрожжи."
    });
    // Текущее правило: стиль BJCP НЕ требуется для публикации.
    expect(captured.fieldErrors).not.toHaveProperty("styleId");
  });

  // ── Гейты владельца ────────────────────────────────────────────────────────
  it("getOwnedRecipeById не находит чужой рецепт", async () => {
    const recipe = await createRecipe("u1", { title: "Личное", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    await expect(getOwnedRecipeById("u2", recipe.id)).rejects.toThrowError("NOT_FOUND");
  });

  it("deleteRecipe чужого рецепта отказывает и не удаляет данные", async () => {
    const recipe = await createRecipe("u1", { title: "Не трогать", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    await expect(deleteRecipe("u2", recipe.id)).rejects.toThrowError("NOT_FOUND");
    // владелец по-прежнему видит рецепт
    await expect(getOwnedRecipeById("u1", recipe.id)).resolves.toMatchObject({ id: recipe.id });
  });

  // ── previewRecipeDraft: пустой состав ──────────────────────────────────────
  it("previewRecipeDraft без ингредиентов отдаёт null-метрики и режим unavailable", async () => {
    const preview = await previewRecipeDraft("u1", {
      title: "",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      boilTimeMinutes: 60,
      ingredients: []
    });

    expect(preview.og).toBeNull();
    expect(preview.fg).toBeNull();
    expect(preview.ibu).toBeNull();
    expect(preview.color).toBeNull();
    expect(preview.fgEstimateMode).toBe("unavailable");
  });

  // ── Копирование своего рецепта ─────────────────────────────────────────────
  it("cloneRecipe создаёт приватную копию своего рецепта с суффиксом «(копия)»", async () => {
    const original = await createRecipe("u1", buildPublicPayload({ title: "Мой эль" }));
    const clone = await cloneRecipe("u1", original.id);

    expect(clone.id).not.toBe(original.id);
    expect(clone.publicationState).toBe("private");
    expect(clone.title).toBe("Мой эль (копия)");
    expect(clone.recipeFamilyId).not.toBe(original.recipeFamilyId); // новое семейство, не версия
    expect(clone.slug).not.toBe(original.slug);
    expect(clone.ingredients).toHaveLength(original.ingredients.length);
    expect(clone.clonedFrom ?? null).toBeNull(); // свой клон не ставит атрибуцию
  });

  // ── Копирование публичного/чужого рецепта ──────────────────────────────────
  it("cloneRecipeFromPublic копирует чужой published в мой черновик с атрибуцией источника", async () => {
    const source = await createRecipe("u-other", buildPublicPayload({ title: "Чужой IPA" }));
    const clone = await cloneRecipeFromPublic("u-me", source.id);

    expect(clone.authorId).toBe("u-me");
    expect(clone.publicationState).toBe("private");
    expect(clone.title).toBe("Чужой IPA (копия)");
    expect(clone.clonedFrom).toMatchObject({
      id: source.id,
      authorId: "u-other",
      isPublished: true
    });
  });

  it("атрибуция клона считает скрытый модератором источник неопубликованным", async () => {
    const source = await createRecipe("u-other", buildPublicPayload({ title: "Чужой IPA" }));
    const clone = await cloneRecipeFromPublic("u-me", source.id);
    expect(clone.clonedFrom).toMatchObject({ id: source.id, isPublished: true });

    // модерационное скрытие не трогает publicationState — рецепт остаётся "published"
    mockState.recipesById.set(source.id, {
      ...mockState.recipesById.get(source.id),
      hiddenAt: new Date()
    });

    const afterHide = await getRecipeById("u-me", clone.id);
    expect(afterHide.clonedFrom).toMatchObject({ id: source.id, isPublished: false });
  });

  it("cloneRecipeFromPublic запрещает копировать чужой непубличный рецепт (FORBIDDEN)", async () => {
    const source = await createRecipe("u-other", {
      title: "Чужой черновик",
      publicationState: "private",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [maltLine()]
    });
    await expect(cloneRecipeFromPublic("u-me", source.id)).rejects.toThrowError("FORBIDDEN");
  });

  it("cloneRecipeFromPublic для несуществующего источника даёт NOT_FOUND", async () => {
    await expect(cloneRecipeFromPublic("u-me", uuid(9999))).rejects.toThrowError("NOT_FOUND");
  });

  it("cloneRecipeFromPublic клонирует СВОЙ рецепт в любом статусе", async () => {
    const source = await createRecipe("u-me", {
      title: "Мой приватный",
      publicationState: "private",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [maltLine(), hopLine()]
    });
    const clone = await cloneRecipeFromPublic("u-me", source.id);

    expect(clone.authorId).toBe("u-me");
    expect(clone.publicationState).toBe("private");
    expect(clone.id).not.toBe(source.id);
  });

  // ── Наследование показателей источника (баг Ф1) ────────────────────────────
  it("cloneRecipeFromPublic наследует «авторитетные» og/fg/abv/ibu/color источника без пересчёта движком", async () => {
    const source = await createRecipe("u-other", buildPublicPayload({ title: "Курируемый лагер" }));
    const engineStats = { og: source.og, fg: source.fg, abv: source.abv, ibu: source.ibu, color: source.color };

    // Витринные/кураторские цифры первоисточника, положенные поверх движка (см.
    // docs/recipe-stats-divergence.md) — заведомо отличные от того, что насчитал движок выше.
    const authoritative = { og: 1.099, fg: 1.02, abv: 9.9, ibu: 99, color: 40 };
    expect(authoritative).not.toEqual(engineStats);
    mockState.recipesById.set(source.id, { ...mockState.recipesById.get(source.id), ...authoritative });

    const clone = await cloneRecipeFromPublic("u-me", source.id);

    expect(clone.og).toBe(authoritative.og);
    expect(clone.fg).toBe(authoritative.fg);
    expect(clone.abv).toBe(authoritative.abv);
    expect(clone.ibu).toBe(authoritative.ibu);
    expect(clone.color).toBe(authoritative.color);
  });

  it("cloneRecipeFromPublic с пересчётом под другой объём НЕ наследует статы источника", async () => {
    const source = await createRecipe("u-other", buildPublicPayload({ title: "Курируемый лагер (объём)" }));
    const authoritative = { og: 1.099, fg: 1.02, abv: 9.9, ibu: 99, color: 40 };
    mockState.recipesById.set(source.id, { ...mockState.recipesById.get(source.id), ...authoritative });

    const clone = await cloneRecipeFromPublic("u-me", source.id, { targetBatchVolumeLitres: 40 });

    expect(clone.batchSizeEnteredQuantity).toBe(40);
    expect(clone.og).not.toBe(authoritative.og);
    expect(clone.ibu).not.toBe(authoritative.ibu);
  });

  // ── Клон-с-объёмом мёржит масштабированную строку целиком (Ф9) ─────────────
  it("clone-at-volume конвертирует дрожжи «в пачках» в граммы вместе с единицей, а не только числом", async () => {
    const source = await createRecipe("u-other", buildPublicPayload({
      title: "Лагер с пачкой дрожжей",
      ingredients: [maltLine(), hopLine(), { ...yeastLine(), amountEnteredQuantity: 1, amountEnteredUnit: "pack" }]
    }));

    // 20 → 40 л (factor 2): 1 пачка US-05 (package_size 11 г) → 22 г. До фикса
    // applyCloneTargetVolume брал из масштабированной строки только количество —
    // клон сохранялся как бессмысленные «22 pack».
    const clone = await cloneRecipeFromPublic("u-me", source.id, { targetBatchVolumeLitres: 40 });
    const yeast = clone.ingredients.find((ingredient) => ingredient.type === "yeast");

    expect(yeast?.amountEnteredUnit).toBe("g");
    expect(yeast?.amountEnteredQuantity).toBeCloseTo(22, 5);
    expect(yeast?.amountNormalizedUnit).toBe("g");
    expect(yeast?.amountNormalizedQuantity).toBeCloseTo(22, 5);
  });

  it("cloneRecipe своего рецепта тоже наследует сохранённые показатели без пересчёта", async () => {
    const original = await createRecipe("u1", buildPublicPayload({ title: "Мой лагер" }));
    const authoritative = { og: 1.077, fg: 1.015, abv: 8.1, ibu: 33, color: 12 };
    mockState.recipesById.set(original.id, { ...mockState.recipesById.get(original.id), ...authoritative });

    const clone = await cloneRecipe("u1", original.id);

    expect(clone.og).toBe(authoritative.og);
    expect(clone.fg).toBe(authoritative.fg);
    expect(clone.abv).toBe(authoritative.abv);
    expect(clone.ibu).toBe(authoritative.ibu);
    expect(clone.color).toBe(authoritative.color);
  });

  // ── Кросс-юзер клон не уносит чужой equipmentProfileId ─────────────────────
  it("cloneRecipeFromPublic чужого рецепта обнуляет equipmentProfileId, но сохраняет снапшот", async () => {
    const source = await createRecipe("u-other", buildPublicPayload({ title: "Чужой IPA с профилем" }));
    const equipmentProfileId = uuid(777);
    // Снапшот должен пройти equipmentProfileSnapshotSchema целиком (mapRecipeDetailDto
    // safeParse-ит его молча в null иначе) — полный набор полей, не огрызок.
    const equipmentProfileSnapshot = {
      ...starterEquipmentProfileDefaults,
      id: uuid(9990),
      snapshotAt: "2026-07-15T00:00:00.000Z"
    };
    mockState.recipesById.set(source.id, {
      ...mockState.recipesById.get(source.id),
      equipmentProfileId,
      equipmentProfileSnapshot
    });

    const clone = await cloneRecipeFromPublic("u-me", source.id);

    expect(clone.equipmentProfileId).toBeNull();
    expect(clone.equipmentProfileSnapshot).toEqual(equipmentProfileSnapshot);
  });

  it("cloneRecipe своего рецепта сохраняет equipmentProfileId", async () => {
    const original = await createRecipe("u1", buildPublicPayload({ title: "Мой IPA с профилем" }));
    const equipmentProfileId = uuid(778);
    mockState.recipesById.set(original.id, {
      ...mockState.recipesById.get(original.id),
      equipmentProfileId
    });

    const clone = await cloneRecipe("u1", original.id);

    expect(clone.equipmentProfileId).toBe(equipmentProfileId);
  });

  // ── Версии ─────────────────────────────────────────────────────────────────
  it("createRecipeVersion создаёт v2 в том же семействе", async () => {
    const v1 = await createRecipe("u1", buildPublicPayload({ title: "Версионируемый" }));
    const v2 = await createRecipeVersion("u1", v1.id);

    expect(v2.versionNumber).toBe(2);
    expect(v2.recipeFamilyId).toBe(v1.recipeFamilyId);
    expect(v2.publicationState).toBe("private"); // новая версия всегда приватный черновик
    expect(v2.id).not.toBe(v1.id);
    expect(v2.versions.map((version) => version.versionNumber).sort()).toEqual([1, 2]);
  });

  it("createRecipeVersion для чужого рецепта отказывает (NOT_FOUND)", async () => {
    const recipe = await createRecipe("u1", { title: "Только владелец", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    await expect(createRecipeVersion("u2", recipe.id)).rejects.toThrowError("NOT_FOUND");
  });

  // ── Списки и счётчики ──────────────────────────────────────────────────────
  it("listRecipesForAuthor фильтрует по статусу публикации", async () => {
    await createRecipe("u1", { title: "Черновик X", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    await createRecipe("u1", buildPublicPayload({ title: "Публичный X" }));

    const onlyPublished = await listRecipesForAuthor("u1", { publicationState: "published" });
    expect(onlyPublished).toHaveLength(1);
    expect(onlyPublished[0]?.title).toBe("Публичный X");

    const all = await listRecipesForAuthor("u1");
    expect(all).toHaveLength(2);
  });

  it("listRecipesForAuthor проставляет versionCount по семейству", async () => {
    const v1 = await createRecipe("u1", buildPublicPayload({ title: "Семейный" }));
    await createRecipeVersion("u1", v1.id);

    const rows = await listRecipesForAuthor("u1");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.recipeFamilyId === v1.recipeFamilyId)).toBe(true);
    expect(rows.every((row) => row.versionCount === 2)).toBe(true);
  });

  it("countRecipesForAuthor считает все версии и рецепты автора", async () => {
    const v1 = await createRecipe("u1", buildPublicPayload({ title: "A" }));
    await createRecipeVersion("u1", v1.id); // +1 версия того же семейства
    await createRecipe("u1", { title: "B", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" }); // другое семейство
    await createRecipe("u-other", { title: "Чужой", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" }); // не считается

    await expect(countRecipesForAuthor("u1")).resolves.toBe(3);
    await expect(countRecipesForAuthor("u-other")).resolves.toBe(1);
  });

  it("listAuthorRecipeCards отдаёт карточку владельца с разрешённым стилем и числом версий", async () => {
    const v1 = await createRecipe("u1", buildPublicPayload({ title: "Карточка IPA" }));
    await createRecipeVersion("u1", v1.id);

    const cards = await listAuthorRecipeCards("u1");
    expect(cards).toHaveLength(2);

    const head = cards.find((card) => card.id === v1.id);
    expect(head).toBeDefined();
    expect(head?.title).toBe("Карточка IPA");
    expect(head?.styleCode).toBe("21A"); // стиль резолвится из фикстур BJCP
    expect(head?.styleName).toBeTruthy();
    expect(head?.versionCount).toBe(2);
    expect(head?.heroImage).toBeNull();
  });

  // ── Дефолтные заголовки (счётчик «Новый рецепт N») ─────────────────────────
  it("getNextDefaultRecipeTitle учитывает только нумерованные дефолтные названия автора", async () => {
    await createRecipe("u1", { title: "Новый рецепт 1" });
    await createRecipe("u1", { title: "Новый рецепт 5" });
    await createRecipe("u1", { title: "Custom name" });
    await createRecipe("u-other", { title: "Новый рецепт 9" }); // чужой не влияет

    await expect(getNextDefaultRecipeTitle("u1")).resolves.toBe("Новый рецепт 6");
    await expect(getNextDefaultRecipeTitle("u-me")).resolves.toBe("Новый рецепт 1");
  });
});
