import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Сквозное покрытие ПОИСКА во всём приложении (домен «Поиск»):
 *  - поиск ингредиентов (`searchIngredientSuggestions` / ранжирование);
 *  - поиск стилей рецепта (`searchRecipeStyles`);
 *  - поиск публичных рецептов (`searchPublicRecipes`);
 *  - подсказки склада (`searchInventorySuggestions`).
 *
 * Сервис-слой тестируется БЕЗ реальной БД: `@nb/db` мокается in-memory.
 * Чистые функции (ранжирование, фаззи-поиск стилей) проверяются напрямую.
 * Здесь сознательно НЕ дублируются проверки из:
 *  ingredient-search-service / ingredient-ranking / recipe-style-search /
 *  public-recipes-service / inventory-suggestions-api.
 */

const now = new Date("2026-06-29T10:00:00.000Z");

const { mockState } = vi.hoisted(() => ({
  mockState: {
    // db.query.ingredients.findMany — каталог ингредиентов
    ingredientRows: [] as any[],
    // db.select(...) — публичные рецепты / склад
    rows: [] as Record<string, unknown>[],
    captured: [] as Array<{
      projection: Record<string, unknown>;
      where: unknown;
      order: unknown;
      limit: number | null;
      offset: number | null;
    }>
  }
}));

vi.mock("server-only", () => ({}));

// Подсказкам склада нужны курсы валют и сводки по ссылкам — оба бьют в БД,
// поэтому мокаются отдельно (БД-агностично).
vi.mock("../features/system/currency-rates", () => ({
  listSystemCurrencyRates: vi.fn(async () => ({}))
}));
vi.mock("../features/ingredients/user-metadata-service", () => ({
  listIngredientPurchaseLinkSummaries: vi.fn(async () => new Map())
}));

vi.mock("@nb/db", () => {
  // Любой доступ к колонке таблицы -> строка "table.column" (для проверки where/order).
  // Символьные ключи (Symbol.toPrimitive/toStringTag и пр.) отдаём как функцию-имя,
  // чтобы саму таблицу можно было подставить в s`…${table}…` (напр. EXISTS-подзапрос).
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_target, prop) => {
        if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
          return () => name;
        }
        if (typeof prop === "symbol") {
          return undefined;
        }
        return `${name}.${String(prop)}`;
      }
    });

  const resolveRows = (projection: Record<string, unknown>) => {
    if (projection && typeof projection === "object" && "value" in projection) {
      return [{ value: mockState.rows.length }];
    }
    return mockState.rows;
  };

  const makeBuilder = (projection: Record<string, unknown>) => {
    const state = {
      projection,
      where: undefined as unknown,
      order: undefined as unknown,
      limit: null as number | null,
      offset: null as number | null
    };
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      innerJoin: () => builder,
      groupBy: () => builder,
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
      offset: (value: number) => {
        state.offset = value;
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
    select: (projection: Record<string, unknown>) => makeBuilder(projection),
    query: {
      ingredients: {
        findMany: async () => mockState.ingredientRows,
        findFirst: async () => mockState.ingredientRows[0] ?? undefined
      },
      proposedIngredients: { findMany: async () => [] },
      userCustomIngredients: { findMany: async () => [], findFirst: async () => undefined },
      userIngredients: { findMany: async () => [], findFirst: async () => undefined }
    }
  };

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let out = "";
    strings.forEach((chunk, index) => {
      out += chunk;
      if (index < values.length) {
        const value = values[index];
        out += value && typeof value === "object" && "raw" in (value as Record<string, unknown>)
          ? String((value as { raw: unknown }).raw)
          : String(value);
      }
    });
    return ["sql", out.trim()];
  };
  (sql as unknown as { raw: (value: unknown) => unknown }).raw = (value: unknown) => ({ raw: String(value) });

  const result: Record<string, unknown> = {
    db,
    pool: {},
    sql,
    and: (...args: unknown[]) => ["and", ...args],
    or: (...args: unknown[]) => ["or", ...args],
    eq: (...args: unknown[]) => ["eq", ...args],
    gt: (...args: unknown[]) => ["gt", ...args],
    lt: (...args: unknown[]) => ["lt", ...args],
    gte: (...args: unknown[]) => ["gte", ...args],
    lte: (...args: unknown[]) => ["lte", ...args],
    ilike: (...args: unknown[]) => ["ilike", ...args],
    like: (...args: unknown[]) => ["like", ...args],
    inArray: (...args: unknown[]) => ["inArray", ...args],
    notInArray: (...args: unknown[]) => ["notInArray", ...args],
    isNull: (...args: unknown[]) => ["isNull", ...args],
    isNotNull: (...args: unknown[]) => ["isNotNull", ...args],
    asc: (value: unknown) => ["asc", value],
    desc: (value: unknown) => ["desc", value],
    count: () => "count",
    max: (value: unknown) => ["max", value]
  };

  // Все табличные/enum-экспорты `@nb/db` -> токены вида "table.column"
  // (нужны на уровне модуля, например в карте колонок сортировки рецептов).
  const schemaExports = [
    "accounts", "authRateLimits", "brewBatchStatusEnum", "brewBatches", "brewBatchesRelations",
    "brewDeviceStatusEnum", "brewDevices", "brewDevicesRelations", "brewLogEvents", "brewLogEventsRelations",
    "brewMeasurements", "brewMeasurementsRelations", "brewTelemetry", "brewTelemetryRelations",
    "contentArticleStatusEnum", "contentArticleTypeEnum", "contentArticles", "contentArticlesRelations",
    "deviceCommandStatusEnum", "deviceCommands", "deviceCommandsRelations", "devicePairingTokens",
    "devicePairingTokensRelations", "deviceProfiles", "deviceProfilesRelations", "equipmentProfiles",
    "equipmentProfilesRelations", "hopFormEnum", "ingredientAliases", "ingredientAliasesRelations",
    "ingredientCategoryEnum",
    "ingredientCompletenessLevelEnum", "ingredientFamilies",
    "ingredientMatchPolicyEnum", "ingredientPackageVariants", "ingredientPackageVariantsRelations",
    "ingredientSources", "ingredientSourcesRelations", "ingredientStatusEnum", "ingredientTypeEnum",
    "ingredientVisibilityEnum", "ingredients", "ingredientsRelations", "inventoryPriceInputModeEnum",
    "inventoryTransactionTypeEnum", "inventoryTransactions", "inventoryTransactionsRelations",
    "inventoryUnitDimensionEnum", "proposedIngredientStatusEnum", "proposedIngredients",
    "recipeImageStatusEnum", "recipeImages", "recipeImagesRelations", "recipeIngredientStageEnum",
    "recipeIngredients", "recipeIngredientsRelations", "recipeInventoryAllocationStatusEnum",
    "recipeInventoryAllocations", "recipeInventoryAllocationsRelations", "recipePublicationStateEnum",
    "recipeRatings", "recipeRatingsRelations", "recipeSaves", "recipeSavesRelations", "recipes",
    "recipesRelations", "sessions", "systemCurrencyEnum", "systemCurrencyRates", "systemEvents",
    "userBrewingSettings", "userBrewingSettingsRelations", "userCustomIngredientVisibilityEnum",
    "userCustomIngredients", "userCustomIngredientsRelations", "userIngredientPreferences",
    "userIngredientPreferencesRelations", "userIngredientPurchaseLinks",
    "userIngredientPurchaseLinksRelations", "userIngredients", "userIngredientsRelations",
    "userRoleEnum", "users", "usersRelations", "verificationTypeEnum", "verifications", "yeastFormEnum",
    "yeastTypeEnum"
  ];
  for (const name of schemaExports) {
    result[name] = tableToken(name);
  }

  return result;
});

import {
  rankIngredientCandidate,
  scoreIngredientCandidate
} from "../features/ingredients/ranking";
import {
  searchRecipeStyles,
  type RecipeStyleSearchIndex
} from "../features/recipes/style-search";
import { searchIngredientSuggestions } from "../features/ingredients/service";
import { parsePublicRecipeFilters } from "../features/recipes/public-recipe-query";
import { searchPublicRecipes } from "../features/recipes/service";
import { searchInventorySuggestions } from "../features/inventory/service";

beforeEach(() => {
  mockState.ingredientRows = [];
  mockState.rows = [];
  mockState.captured = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ранжирование ингредиентов (чистые функции)
// ─────────────────────────────────────────────────────────────────────────────

describe("ранжирование ингредиентов: устойчивость запроса", () => {
  const candidate = {
    displayName: "Magnum",
    normalizedName: "magnum"
  };

  it("пустой и пробельный запрос не дают ранга (score 0, rank null)", () => {
    expect(scoreIngredientCandidate("", candidate)).toBe(0);
    expect(scoreIngredientCandidate("   ", candidate)).toBe(0);
    expect(rankIngredientCandidate("", candidate)).toBeNull();
    expect(rankIngredientCandidate("\t\n ", candidate)).toBeNull();
  });

  it("регистр запроса не влияет на совпадение (CASE-insensitive)", () => {
    const upper = scoreIngredientCandidate("MAGNUM", candidate);
    const lower = scoreIngredientCandidate("magnum", candidate);
    expect(upper).toBeGreaterThan(0);
    expect(upper).toBe(lower);
  });

  it("точное совпадение сильнее префиксного", () => {
    const exact = scoreIngredientCandidate("magnum", candidate);
    const prefix = scoreIngredientCandidate("magn", candidate);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(0);
  });

  it("выключенный алиас (isEnabled:false) не участвует в поиске", () => {
    const enabled = scoreIngredientCandidate("пилснер", {
      displayName: "Base Malt",
      aliases: [{ alias: "пилснер", aliasNormalized: "пилснер", source: "seed", isEnabled: true }]
    });
    const disabled = scoreIngredientCandidate("пилснер", {
      displayName: "Base Malt",
      aliases: [{ alias: "пилснер", aliasNormalized: "пилснер", source: "seed", isEnabled: false }]
    });
    expect(enabled).toBeGreaterThan(0);
    expect(disabled).toBe(0);
  });

  it("опечатка (лишняя буква) ловится фаззи-поиском", () => {
    // "magnumm" отличается от "magnum" на 1 символ -> попадает в фаззи-бакет.
    expect(scoreIngredientCandidate("magnumm", candidate)).toBeGreaterThan(0);
    // "xyzzy" — несвязанный запрос, совпадения нет.
    expect(scoreIngredientCandidate("xyzzy", candidate)).toBe(0);
  });

  it("кросс-скрипт латиница->кириллица (saaz -> Сааз)", () => {
    expect(scoreIngredientCandidate("saaz", { displayName: "Сааз" })).toBeGreaterThan(0);
  });

  it("кросс-скрипт кириллица->латиница (сааз -> Saaz)", () => {
    expect(scoreIngredientCandidate("сааз", { displayName: "Saaz" })).toBeGreaterThan(0);
  });

  it("семейная транслитерация: кириллица «мюнхен» матчит латинский Munich Malt", () => {
    const ranked = rankIngredientCandidate("мюнхен", { displayName: "Munich Malt" });
    expect(ranked).not.toBeNull();
    expect((ranked?.score ?? 0)).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Поиск стилей рецепта (чистая фаззи-функция)
// ─────────────────────────────────────────────────────────────────────────────

describe("searchRecipeStyles: пробелы покрытия", () => {
  const index: RecipeStyleSearchIndex = {
    families: [
      { id: "ipa_hoppy", nameRu: "IPA и хмелевые", nameEn: "IPA & Hoppy", styleCount: 12, sortOrder: 3 },
      { id: "porters_stouts", nameRu: "Портеры и стауты", nameEn: "Porters & Stouts", styleCount: 9, sortOrder: 7 }
    ],
    styles: [
      { code: "21A", title: "American IPA", titleEn: "American IPA", familyIds: ["ipa_hoppy"], familyNameRu: "IPA и хмелевые" },
      { code: "S1", title: "Стаут", titleEn: "Stout", familyIds: ["porters_stouts"], familyNameRu: "Портеры и стауты" },
      { code: "S2", title: "Имперский стаут", titleEn: "Imperial Stout", familyIds: ["porters_stouts"], familyNameRu: "Портеры и стауты" }
    ]
  };

  it("регистр запроса не влияет (IPA == ipa)", () => {
    const upper = searchRecipeStyles("IPA", index);
    const lower = searchRecipeStyles("ipa", index);
    expect(upper.families.map((f) => f.id)).toEqual(lower.families.map((f) => f.id));
    expect(upper.styles.map((s) => s.code)).toEqual(lower.styles.map((s) => s.code));
    expect(upper.families.map((f) => f.id)).toContain("ipa_hoppy");
  });

  it("BJCP-код матчится в нижнем регистре (21a -> 21A)", () => {
    expect(searchRecipeStyles("21a", index).styles.map((s) => s.code)).toContain("21A");
  });

  it("граница в 2 символа: запрос «ip» уже даёт результаты (не пусто)", () => {
    const result = searchRecipeStyles("ip", index);
    expect(result.families.map((f) => f.id)).toContain("ipa_hoppy");
  });

  it("точное название стиля ранжируется выше частичного («стаут»)", () => {
    const codes = searchRecipeStyles("стаут", index).styles.map((s) => s.code);
    // «Стаут» (точное) должно идти выше «Имперский стаут» (вхождение).
    expect(codes.indexOf("S1")).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf("S2")).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf("S1")).toBeLessThan(codes.indexOf("S2"));
  });

  it("несвязанный запрос даёт пустую выдачу", () => {
    expect(searchRecipeStyles("zzzqwer", index)).toEqual({ families: [], styles: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Поиск ингредиентов: searchIngredientSuggestions (через каталог в БД-моке)
// ─────────────────────────────────────────────────────────────────────────────

const buildIngredientRow = (overrides: Record<string, unknown> = {}) => ({
  id: "ingredient-1",
  type: "hop",
  nameRu: null,
  nameEn: "Citra",
  displayModeRu: "source_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  isActive: true,
  countryCode: "US",
  countryName: "USA",
  brand: null,
  producer: "Yakima Chief",
  productCode: null,
  groupName: null,
  category: null,
  subcategory: null,
  itemKind: "hop",
  presentOnBirrf: true,
  inventoryEnabled: true,
  attributes: { alpha_acid_pct_typical: 12, hop_form: "pellet" },
  quantityDefaults: null,
  createdAt: now,
  updatedAt: now,
  aliases: [] as any[],
  sources: [] as any[],
  packageVariants: [] as any[],
  ...overrides
});

describe("searchIngredientSuggestions: каталог", () => {
  it("точное совпадение выше частичного и соблюдается limit", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "citra", nameEn: "Citra" }),
      buildIngredientRow({ id: "citra-plus", nameEn: "Citra Plus" }),
      buildIngredientRow({ id: "citra-gold", nameEn: "Citra Gold" })
    ];

    const items = await searchIngredientSuggestions({ q: "citra", type: "hop", limit: 2 });

    // limit=2 -> ровно два результата из трёх подходящих.
    expect(items).toHaveLength(2);
    // Точное «Citra» строго выше частичных «Citra Plus/Gold».
    expect(items[0]?.id).toBe("citra");
  });

  it("регистр запроса не влияет (CITRA находит Citra)", async () => {
    mockState.ingredientRows = [buildIngredientRow({ id: "citra", nameEn: "Citra" })];
    const items = await searchIngredientSuggestions({ q: "CITRA", type: "hop", limit: 8 });
    expect(items[0]?.id).toBe("citra");
  });

  it("опечатка в запросе ловится (Magnumm -> Magnum)", async () => {
    mockState.ingredientRows = [buildIngredientRow({ id: "magnum", nameEn: "Magnum" })];
    const items = await searchIngredientSuggestions({ q: "magnumm", type: "hop", limit: 8 });
    expect(items.map((item) => item.id)).toContain("magnum");
  });

  it("поиск по кириллическому алиасу латинского ингредиента", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({
        id: "saaz",
        nameEn: "Saaz",
        producer: "Bohemia Hop",
        aliases: [{
          id: "alias-saaz",
          ingredientId: "saaz",
          locale: "ru",
          alias: "Жатецкий",
          aliasNormalized: "жатецкий",
          source: "seed",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];
    const items = await searchIngredientSuggestions({ q: "жатецкий", type: "hop", limit: 8 });
    expect(items[0]?.id).toBe("saaz");
    expect(items[0]?.matchType).toBe("alias");
  });

  it("пустой запрос без скоупа отклоняется схемой", async () => {
    await expect(searchIngredientSuggestions({ q: "", type: "hop", limit: 8 })).rejects.toThrow();
  });

  it("несовпадающий запрос даёт пустой список", async () => {
    mockState.ingredientRows = [buildIngredientRow({ id: "citra", nameEn: "Citra" })];
    const items = await searchIngredientSuggestions({ q: "zzzqwerty", type: "hop", limit: 8 });
    expect(items).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Поиск публичных рецептов: searchPublicRecipes (фильтры/сортировки)
// ─────────────────────────────────────────────────────────────────────────────

const baseRecipeRow = () => ({
  id: "r-1",
  slug: "hazy-ipa",
  title: "Hazy IPA",
  authorId: "u-1",
  styleId: "21A",
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9.5,
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  heroImageId: "img-1",
  ratingAvg: null,
  ratingCount: 0,
  saveCount: 0,
  authorDisplayName: "Alice",
  authorImage: null,
  heroThumbKey: null,
  heroBlurDataUrl: null
});

const mainQuery = () => mockState.captured.find((q) => q.limit != null);

describe("searchPublicRecipes: фильтры и сортировки", () => {
  it("фильтр по цвету (SRM) строит gte+lte по recipes.color", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ colorMin: "5", colorMax: "15" }));

    const where = mainQuery()!.where as unknown[];
    expect(where).toContainEqual(["gte", "recipes.color", 5]);
    expect(where).toContainEqual(["lte", "recipes.color", 15]);
  });

  it("фильтр по IBU строит gte+lte по recipes.ibu", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ ibuMin: "20", ibuMax: "80" }));

    const where = mainQuery()!.where as unknown[];
    expect(where).toContainEqual(["gte", "recipes.ibu", 20]);
    expect(where).toContainEqual(["lte", "recipes.ibu", 80]);
  });

  it("перепутанные границы диапазона ABV нормализуются (min<->max)", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ abvMin: "8", abvMax: "4" }));

    const where = mainQuery()!.where as unknown[];
    expect(where).toContainEqual(["gte", "recipes.abv", 4]);
    expect(where).toContainEqual(["lte", "recipes.abv", 8]);
  });

  it("пустой/пробельный q не добавляет ilike-условие", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ q: "   " }));

    const where = mainQuery()!.where as unknown[];
    const hasOr = where.some((clause) => Array.isArray(clause) && clause[0] === "or");
    expect(hasOr).toBe(false);
  });

  it("сортировка «popular» -> saveCount desc с вторичным updatedAt", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ sort: "popular" }));

    expect(mainQuery()!.order).toEqual([
      ["desc", "recipes.saveCount"],
      ["desc", "recipes.updatedAt"]
    ]);
  });

  it("сортировка «name» -> title asc с вторичным updatedAt", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ sort: "name" }));

    expect(mainQuery()!.order).toEqual([
      ["asc", "recipes.title"],
      ["desc", "recipes.updatedAt"]
    ]);
  });

  it("неизвестное семейство -> пустой scope (inArray []), без падения", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ family: "___no_such_family___" }));

    const where = mainQuery()!.where as unknown[];
    const inArrayClause = where.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "inArray"
    );
    expect(inArrayClause).toBeTruthy();
    expect(inArrayClause![1]).toBe("recipes.styleId");
    expect(inArrayClause![2]).toEqual([]);
  });

  it("дефолтная пагинация: limit 24, offset 0", async () => {
    mockState.rows = [baseRecipeRow()];
    const result = await searchPublicRecipes(parsePublicRecipeFilters({}));

    expect(mainQuery()!.limit).toBe(24);
    expect(mainQuery()!.offset).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(24);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4b. searchPublicRecipes: текстовый поиск — транслит/curated-словарь/стиль,
//     раскладка строго фолбэком при нуле результатов (Ф8).
// ─────────────────────────────────────────────────────────────────────────────

const mainQueries = () => mockState.captured.filter((entry) => entry.limit != null);

describe("searchPublicRecipes: текстовый поиск (транслит/раскладка/стиль)", () => {
  it("«пил» строит OR из нескольких ilike-вариантов (в т.ч. «пилснер» и «pilsner»)", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ q: "пил" }));

    const where = mainQuery()!.where as unknown[];
    const orClause = where.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "or"
    );
    expect(orClause).toBeTruthy();
    expect(orClause).toContainEqual(["ilike", "recipes.title", "%пилснер%"]);
    expect(orClause).toContainEqual(["ilike", "recipes.title", "%pilsner%"]);
    expect(orClause).toContainEqual(["ilike", "users.displayName", "%пилснер%"]);
  });

  it("пустой/пробельный q — ровно один основной запрос, без OR (не сломан существующий кейс)", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ q: "   " }));

    expect(mainQueries()).toHaveLength(1);
    const where = mainQuery()!.where as unknown[];
    expect(where.some((clause) => Array.isArray(clause) && clause[0] === "or")).toBe(false);
  });

  it("непустой первый проход НЕ запускает раскладочный фолбэк (1 основной запрос)", async () => {
    mockState.rows = [baseRecipeRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ q: "hazy ipa" }));

    expect(mainQueries()).toHaveLength(1);
  });

  it("0 результатов первого прохода -> второй проход с раскладкой («gbkcyth» = «пилснер»)", async () => {
    mockState.rows = []; // мок не фильтрует по WHERE — пустые rows эмулируют «0 результатов»
    await searchPublicRecipes(parsePublicRecipeFilters({ q: "gbkcyth" }));

    const queries = mainQueries();
    expect(queries).toHaveLength(2); // первый проход + раскладочный фолбэк
    const firstWhere = queries[0]!.where as unknown[];
    const secondWhere = queries[1]!.where as unknown[];
    const firstOr = firstWhere.find((c): c is unknown[] => Array.isArray(c) && c[0] === "or") ?? [];
    const secondOr = secondWhere.find((c): c is unknown[] => Array.isArray(c) && c[0] === "or") ?? [];
    expect(firstOr).not.toContainEqual(["ilike", "recipes.title", "%пилснер%"]);
    expect(secondOr).toContainEqual(["ilike", "recipes.title", "%пилснер%"]);
  });

  it("фолбэк не трогает чистые фильтры без q (0 строк остаётся 0 строк, без второго прохода)", async () => {
    mockState.rows = [];
    await searchPublicRecipes(parsePublicRecipeFilters({ family: "___no_such_family___" }));

    expect(mainQueries()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Подсказки склада: searchInventorySuggestions (дедуп уже добавленного)
// ─────────────────────────────────────────────────────────────────────────────

const buildInventoryRow = (overrides: {
  id: string;
  ingredientCatalogItemId: string;
  displayName?: string;
}) => ({
  inventory: {
    id: overrides.id,
    ingredientCatalogItemId: overrides.ingredientCatalogItemId,
    userCustomIngredientId: null,
    packageVariantId: null,
    ingredientFamilyId: null,
    ingredientCategory: "hop",
    ingredientSubtype: null,
    ingredientDisplayNameSnapshot: overrides.displayName ?? "Saaz",
    ingredientDefaultDisplayUnitSnapshot: "g",
    ingredientMeasurementDimension: "mass",
    enteredQuantity: 100,
    enteredUnit: "g",
    normalizedQuantity: 100,
    normalizedUnit: "g",
    unitDimension: "mass",
    priceInputMode: null,
    priceInputAmountMinor: null,
    priceInputCurrency: null,
    purchasePriceMinor: null,
    purchaseCurrency: null,
    purchaseQuantity: null,
    purchaseQuantityUnit: null,
    purchaseQuantityNormalized: null,
    purchaseQuantityNormalizedUnit: null,
    normalizedUnitCostMinorRub: null,
    properties: {},
    purchasedAt: null,
    freshnessDate: null,
    notes: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  },
  catalog: null,
  custom: null,
  packageVariant: null
});

describe("searchInventorySuggestions: дедуп и лимит", () => {
  it("две складские позиции одного каталожного источника схлопываются в одну", async () => {
    mockState.rows = [
      buildInventoryRow({ id: "inv-1", ingredientCatalogItemId: "cat-1" }),
      buildInventoryRow({ id: "inv-2", ingredientCatalogItemId: "cat-1" })
    ];

    const items = await searchInventorySuggestions("u1", { q: "saaz" });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "cat-1", source: "catalog" });
  });

  it("dedupeSource:false сохраняет обе позиции одного источника", async () => {
    mockState.rows = [
      buildInventoryRow({ id: "inv-1", ingredientCatalogItemId: "cat-1" }),
      buildInventoryRow({ id: "inv-2", ingredientCatalogItemId: "cat-1" })
    ];

    const items = await searchInventorySuggestions("u1", { q: "saaz", dedupeSource: false });

    expect(items).toHaveLength(2);
  });

  it("разные источники не схлопываются, но limit обрезает выдачу", async () => {
    mockState.rows = [
      buildInventoryRow({ id: "inv-1", ingredientCatalogItemId: "cat-1", displayName: "Saaz" }),
      buildInventoryRow({ id: "inv-2", ingredientCatalogItemId: "cat-2", displayName: "Citra" })
    ];

    const all = await searchInventorySuggestions("u1", { q: "" });
    expect(all).toHaveLength(2);

    const limited = await searchInventorySuggestions("u1", { q: "", limit: 1 });
    expect(limited).toHaveLength(1);
  });
});
