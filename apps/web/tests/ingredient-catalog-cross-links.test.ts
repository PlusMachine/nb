import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие блоков перелинковки детальной страницы каталога
// (notes/catalog-refactor-plan.md, этап 5.4): listAnalogCatalogIngredients /
// listSameBrandCatalogIngredients в catalog-service.ts.
//
// Мок @nb/db — как в coverage-catalog-browse.test.ts (db.query.ingredients.findMany
// на raw-строках каталога, без реальной БД). Обе функции читают только через
// loadIngredients() (системный каталог) — findMany по userCustomIngredients
// оснащён шпионом, чтобы доказать, что кастомные ингредиенты в эти блоки
// физически попасть не могут.

const now = new Date("2026-07-05T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  ingredientRows: [] as any[]
}));

const findManyCustomSpy = vi.hoisted(() => vi.fn(async () => [] as any[]));

// Рекурсивно собирает строковые значения из mock-структуры where (and/eq
// замоканы как массивы), чтобы findFirst мог сопоставить id (как в
// coverage-catalog-browse.test.ts).
const collectStrings = (node: unknown, acc: Set<string>) => {
  if (node == null) {
    return;
  }

  if (typeof node === "string") {
    acc.add(node);
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectStrings(child, acc);
    }
    return;
  }

  if (typeof node === "object") {
    for (const child of Object.values(node as Record<string, unknown>)) {
      collectStrings(child, acc);
    }
  }
};

const whereValues = (where: unknown) => {
  const acc = new Set<string>();
  collectStrings(where, acc);
  return acc;
};

// Raw-строка каталога в форме DB-ряда (как в coverage-catalog-browse.test.ts).
const buildIngredientRow = (overrides: Record<string, unknown> = {}) => ({
  id: "ingredient-1",
  type: "malt",
  nameRu: "Пилснер",
  nameEn: "Pilsner Malt",
  displayModeRu: "localized_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  isActive: true,
  countryCode: null,
  countryName: null,
  brand: null,
  producer: null,
  productCode: null,
  groupName: null,
  category: null,
  subcategory: null,
  itemKind: "malt",
  presentOnBirrf: true,
  inventoryEnabled: true,
  attributes: {},
  quantityDefaults: null,
  createdAt: now,
  updatedAt: now,
  aliases: [] as any[],
  sources: [] as any[],
  packageVariants: [] as any[],
  ...overrides
});

vi.mock("server-only", () => ({}));

vi.mock("@nb/db", () => ({
  db: {
    query: {
      ingredients: {
        findMany: async (args: { where?: unknown } = {}) => {
          // loadIngredients({ includeInactive }) добавляет eq(isActive, true)
          // только когда нужны активные; распознаём это по сериализации where.
          const activeOnly = JSON.stringify(args.where ?? null).includes("isActive");
          return activeOnly
            ? mockState.ingredientRows.filter((row) => row.isActive !== false)
            : mockState.ingredientRows;
        },
        findFirst: async (args: { where?: unknown } = {}) => {
          const values = whereValues(args.where);
          return mockState.ingredientRows.find((row) => values.has(row.id)) ?? null;
        }
      },
      proposedIngredients: {
        findMany: async () => []
      },
      userCustomIngredients: {
        findMany: findManyCustomSpy,
        findFirst: async () => null
      }
    },
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: async () => []
        }),
        innerJoin: () => ({
          where: () => ({
            groupBy: async () => []
          })
        })
      })
    })
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  ingredientAliases: { ingredientId: "ingredientId" },
  ingredientPackageVariants: { ingredientId: "ingredientId" },
  ingredients: { id: "id", isActive: "isActive", type: "type" },
  ingredientSources: { ingredientId: "ingredientId" },
  proposedIngredients: { status: "status" },
  recipeIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", recipeId: "recipeId" },
  recipes: { id: "id", authorId: "authorId" },
  userCustomIngredients: { userId: "userId", id: "id" },
  userIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", userId: "userId", archivedAt: "archivedAt" }
}));

import {
  getUserCatalogIngredientByRef,
  listAnalogCatalogIngredients,
  listSameBrandCatalogIngredients
} from "../features/ingredients/catalog-service";

const referenceItem = async (id: string) => {
  const item = await getUserCatalogIngredientByRef(null, "catalog", id);
  if (!item) {
    throw new Error(`fixture ingredient ${id} not found`);
  }
  return item;
};

beforeEach(() => {
  mockState.ingredientRows = [];
  findManyCustomSpy.mockClear();
});

describe("каталог: аналоги (listAnalogCatalogIngredients)", () => {
  it("солод — тот же канонический сорт у других производителей, сортировка по близости EBC", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-ref", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "Курский солод", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-pils-far", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "Бел-Гер", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 8, color_ebc_max: 8 } }),
      buildIngredientRow({ id: "malt-pils-close", type: "malt", nameRu: "Пильзнер", nameEn: "Pilsner Malt", brand: "Weyermann", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 3, color_ebc_max: 4 } }),
      // Тот же бренд — живёт в блоке «Другие ингредиенты {бренд}», в аналоги не попадает.
      buildIngredientRow({ id: "malt-same-brand", type: "malt", nameRu: "Пилснер Премиум", nameEn: "Pilsner Premium", brand: "Курский солод", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 3.7, color_ebc_max: 3.7 } }),
      // Другой канонический сорт при близком цвете — не аналог.
      buildIngredientRow({ id: "malt-vienna", type: "malt", nameRu: "Венский", nameEn: "Vienna Malt", brand: "Weyermann", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 5, color_ebc_max: 6 } }),
      // «Пильзен» в имени, но другой класс солода (wheat, не base) — не аналог.
      buildIngredientRow({ id: "malt-wheat-pilsen", type: "malt", nameRu: "Пшеничный Пильзен", nameEn: "Wheat Pilsen", brand: "Soufflet", itemKind: "malt", attributes: { malt_type: "wheat", color_ebc_min: 3.5, color_ebc_max: 5 } }),
      buildIngredientRow({ id: "hop-other", type: "hop", nameRu: "Кэскейд", itemKind: "hop", attributes: {} })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("malt-ref"));

    // malt-pils-close (diff ~0.5) ближе malt-pils-far (diff 4); сам эталон,
    // одноимённый бренд, другой сорт и другая категория исключены.
    expect(analogs.map((item) => item.id)).toEqual(["malt-pils-close", "malt-pils-far"]);
    expect(analogs.every((item) => item.source === "catalog")).toBe(true);
    expect(findManyCustomSpy).not.toHaveBeenCalled();
  });

  it("аналоги из той же страны, что и эталон, — первыми, даже при менее близком EBC", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-ref", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "Курский солод", countryCode: "RU", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-de-close", type: "malt", nameRu: "Пильзнер", nameEn: "Pilsner Malt", brand: "Weyermann", countryCode: "DE", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-ru-far", type: "malt", nameRu: "Пилснер Премьер", nameEn: "Pilsner Premier", brand: "WinnerMalt", countryCode: "RU", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 8, color_ebc_max: 8 } })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("malt-ref"));
    expect(analogs.map((item) => item.id)).toEqual(["malt-ru-far", "malt-de-close"]);
  });

  it("своя страна не вытесняет блок целиком: не больше половины мест, если есть аналоги из других стран", async () => {
    const pils = (id: string, brand: string, countryCode: string, ebc: number) => buildIngredientRow({
      id, type: "malt", nameRu: `Пилснер ${brand}`, nameEn: `Pilsner ${brand}`, brand, countryCode,
      itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: ebc, color_ebc_max: ebc }
    });
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-ref", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "Курский солод", countryCode: "RU", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      pils("ru-1", "Р1", "RU", 4), pils("ru-2", "Р2", "RU", 4.1), pils("ru-3", "Р3", "RU", 4.2), pils("ru-4", "Р4", "RU", 4.3),
      pils("de-1", "Н1", "DE", 4), pils("de-2", "Н2", "DE", 4.1), pils("de-3", "Н3", "DE", 4.2), pils("de-4", "Н4", "DE", 4.3)
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("malt-ref"), 6);
    expect(analogs.map((item) => item.id)).toEqual(["ru-1", "ru-2", "ru-3", "de-1", "de-2", "de-3"]);
  });

  it("солод с сортовым алиасом, но другим сортом в имени — не аналог (имя приоритетнее алиаса)", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-ref", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "Курский солод", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      // malt_type тоже base (ошибка данных), но имя даёт wheat — алиас «Pilsen de Blé» не должен перетянуть в pilsner.
      buildIngredientRow({ id: "malt-wheat-by-name", type: "malt", nameRu: "Пшеничный", nameEn: "Wheat", brand: "Soufflet", itemKind: "malt", aliases: [{ alias: "Pilsen de Blé", aliasNormalized: "pilsen de ble", isEnabled: true }], attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      // Имя сорта не даёт, алиас даёт — алиас учитывается.
      buildIngredientRow({ id: "malt-pils-by-alias", type: "malt", nameRu: "Особый", nameEn: "Osobyi", brand: "Weyermann", itemKind: "malt", aliases: [{ alias: "Pilsner Extra", aliasNormalized: "pilsner extra", isEnabled: true }], attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("malt-ref"));
    expect(analogs.map((item) => item.id)).toEqual(["malt-pils-by-alias"]);
  });

  it("карамельный солод — аналог только в той же цветовой полосе EBC", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "cara-ref", type: "malt", nameRu: "Карамельный 20", nameEn: "Caramel 20", brand: "Soufflet", itemKind: "malt", attributes: { malt_type: "caramel", color_ebc_min: 20, color_ebc_max: 20 } }),
      buildIngredientRow({ id: "cara-same-band", type: "malt", nameRu: "Карамельный 30", nameEn: "Caramel 30", brand: "Weyermann", itemKind: "malt", attributes: { malt_type: "caramel", color_ebc_min: 30, color_ebc_max: 30 } }),
      buildIngredientRow({ id: "cara-other-band", type: "malt", nameRu: "Карамельный 150", nameEn: "Caramel 150", brand: "Weyermann", itemKind: "malt", attributes: { malt_type: "caramel", color_ebc_min: 150, color_ebc_max: 150 } })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("cara-ref"));
    expect(analogs.map((item) => item.id)).toEqual(["cara-same-band"]);
  });

  it("солод вне канонических сортов — блок скрыт (классовый фолбэк по EBC не считается аналогом)", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-odd-ref", type: "malt", nameRu: "Абрикосовый", nameEn: "Apricot Malt", brand: "Курский солод", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-odd-other", type: "malt", nameRu: "Загадочный", nameEn: "Mystery Malt", brand: "Weyermann", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("malt-odd-ref"));
    expect(analogs).toEqual([]);
  });

  it("хмель — тот же сорт у другого производителя, другой сорт не попадает", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "hop-ref", type: "hop", nameRu: "Каскад", nameEn: "Cascade", brand: "Yakima Chief Hops", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6 } }),
      buildIngredientRow({ id: "hop-same-variety", type: "hop", nameRu: "Каскад", nameEn: "Cascade", brand: "Barth-Haas", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6.5 } }),
      buildIngredientRow({ id: "hop-other-variety", type: "hop", nameRu: "Симко", nameEn: "Simcoe", brand: "Barth-Haas", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6.2 } })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("hop-ref"));
    expect(analogs.map((item) => item.id)).toEqual(["hop-same-variety"]);
  });

  it("дрожжи — аналоги не показываются (штамм-специфичны)", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "yeast-ref", type: "yeast", nameRu: "US-05", itemKind: "yeast", attributes: { yeast_family: "ale", attenuation_pct_typical: 75 } }),
      buildIngredientRow({ id: "yeast-same-family", type: "yeast", nameRu: "Notthingham", itemKind: "yeast", attributes: { yeast_family: "ale", attenuation_pct_typical: 78 } })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("yeast-ref"));
    expect(analogs).toEqual([]);
  });

  it("вода — аналог по химической формуле, без формулы блок скрыт", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "wt-ref", type: "water_treatment", nameRu: "Гипс", brand: "А", itemKind: "salt", attributes: { formula: "CaSO4" } }),
      buildIngredientRow({ id: "wt-same-formula", type: "water_treatment", nameRu: "Сульфат кальция", brand: "Б", itemKind: "salt", attributes: { formula: "CaSO4" } }),
      buildIngredientRow({ id: "wt-other-formula", type: "water_treatment", nameRu: "Хлорид кальция", brand: "Б", itemKind: "salt", attributes: { formula: "CaCl2" } }),
      buildIngredientRow({ id: "wt-no-formula", type: "water_treatment", nameRu: "Соль без формулы", brand: "Б", itemKind: "salt", attributes: {} })
    ];

    expect((await listAnalogCatalogIngredients(await referenceItem("wt-ref"))).map((item) => item.id))
      .toEqual(["wt-same-formula"]);
    expect(await listAnalogCatalogIngredients(await referenceItem("wt-no-formula"))).toEqual([]);
  });

  it("режет результат по limit", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-ref", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "Курский солод", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-a", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "А", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-b", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "Б", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-c", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", brand: "В", itemKind: "malt", attributes: { malt_type: "base", color_ebc_min: 4, color_ebc_max: 4 } })
    ];

    const analogs = await listAnalogCatalogIngredients(await referenceItem("malt-ref"), 2);
    expect(analogs).toHaveLength(2);
  });
});

describe("каталог: другие ингредиенты бренда (listSameBrandCatalogIngredients)", () => {
  it("фильтрует по бренду без учёта регистра, категория эталона первой, исключает сам ингредиент", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "brand-ref", type: "hop", nameRu: "Кэскейд", itemKind: "hop", brand: "Yakima Chief Hops" }),
      buildIngredientRow({ id: "brand-b", type: "hop", nameRu: "Симко", itemKind: "hop", brand: "yakima chief hops" }),
      // По алфавиту раньше Симко, но другая категория — уходит после хмеля.
      buildIngredientRow({ id: "brand-a", type: "yeast", nameRu: "Азимут", itemKind: "yeast", brand: "YAKIMA CHIEF HOPS" }),
      buildIngredientRow({ id: "other-brand", type: "hop", nameRu: "Магнум", itemKind: "hop", brand: "Barth-Haas" })
    ];

    const sameBrand = await listSameBrandCatalogIngredients(await referenceItem("brand-ref"));

    expect(sameBrand.map((item) => item.id)).toEqual(["brand-b", "brand-a"]);
    expect(findManyCustomSpy).not.toHaveBeenCalled();
  });

  it("падает через producer, если brand не заполнен", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "producer-ref", type: "malt", nameRu: "Пилснер", itemKind: "malt", brand: null, producer: "Weyermann" }),
      buildIngredientRow({ id: "producer-match", type: "malt", nameRu: "Мюнхенский", itemKind: "malt", brand: null, producer: "weyermann" })
    ];

    const sameBrand = await listSameBrandCatalogIngredients(await referenceItem("producer-ref"));
    expect(sameBrand.map((item) => item.id)).toEqual(["producer-match"]);
  });

  it("без бренда у эталона возвращает пустой список", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "no-brand-ref", type: "consumable", nameRu: "Стар Сан", itemKind: "sanitizer", brand: null, producer: null }),
      buildIngredientRow({ id: "some-brand", type: "consumable", nameRu: "Айодофор", itemKind: "sanitizer", brand: "Five Star" })
    ];

    const sameBrand = await listSameBrandCatalogIngredients(await referenceItem("no-brand-ref"));
    expect(sameBrand).toEqual([]);
  });
});
