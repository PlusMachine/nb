import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие блоков перелинковки детальной страницы каталога
// (notes/catalog-refactor-plan.md, этап 5.4): listSimilarCatalogIngredients /
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
  listSameBrandCatalogIngredients,
  listSimilarCatalogIngredients
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

describe("каталог: похожие ингредиенты (listSimilarCatalogIngredients)", () => {
  it("хмель — сортирует по близости альфы, без альфы уходит в конец, сам ингредиент исключён", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "hop-ref", type: "hop", nameRu: "Кэскейд", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6 } }),
      buildIngredientRow({ id: "hop-far", type: "hop", nameRu: "Магнум", itemKind: "hop", attributes: { alpha_acid_pct_typical: 14 } }),
      buildIngredientRow({ id: "hop-close", type: "hop", nameRu: "Симко", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6.5 } }),
      buildIngredientRow({ id: "hop-no-alpha", type: "hop", nameRu: "Апполон", itemKind: "hop", attributes: {} }),
      buildIngredientRow({ id: "malt-other", type: "malt", nameRu: "Абрикосовый", itemKind: "malt", attributes: {} })
    ];

    const similar = await listSimilarCatalogIngredients(await referenceItem("hop-ref"));

    // hop-close (diff 0.5) ближе hop-far (diff 8); hop-no-alpha без значения — в
    // конец; malt-other другой категории — не попадает вовсе; сам hop-ref исключён.
    expect(similar.map((item) => item.id)).toEqual(["hop-close", "hop-far", "hop-no-alpha"]);
    expect(similar.every((item) => item.source === "catalog")).toBe(true);
    expect(findManyCustomSpy).not.toHaveBeenCalled();
  });

  it("режет результат по limit", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "hop-ref", type: "hop", nameRu: "Кэскейд", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6 } }),
      buildIngredientRow({ id: "hop-a", type: "hop", nameRu: "А", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6.1 } }),
      buildIngredientRow({ id: "hop-b", type: "hop", nameRu: "Б", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6.2 } }),
      buildIngredientRow({ id: "hop-c", type: "hop", nameRu: "В", itemKind: "hop", attributes: { alpha_acid_pct_typical: 6.3 } })
    ];

    const similar = await listSimilarCatalogIngredients(await referenceItem("hop-ref"), 2);
    expect(similar).toHaveLength(2);
  });

  it("солод/сырьё — тот же subtype приоритетнее близкого EBC из другого subtype", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-ref", type: "malt", nameRu: "Пилснер", itemKind: "malt", attributes: { color_ebc_min: 3, color_ebc_max: 4 } }),
      buildIngredientRow({ id: "malt-close", type: "malt", nameRu: "Венский", itemKind: "malt", attributes: { color_ebc_min: 5, color_ebc_max: 6 } }),
      buildIngredientRow({ id: "malt-far", type: "malt", nameRu: "Шоколадный", itemKind: "malt", attributes: { color_ebc_min: 800, color_ebc_max: 900 } }),
      buildIngredientRow({ id: "malt-no-color", type: "malt", nameRu: "Загадочный", itemKind: "malt", attributes: {} }),
      // Численно ближе всех к эталону (diff ~1.53), но другой subtype (fermentable, не malt) — должен уйти в конец группы.
      buildIngredientRow({ id: "ferm-numerically-closer", type: "fermentable", nameRu: "Декстроза", itemKind: "sugar", attributes: { color_lovibond: 1 } })
    ];

    const similar = await listSimilarCatalogIngredients(await referenceItem("malt-ref"));

    expect(similar.map((item) => item.id)).toEqual(["malt-close", "malt-far", "malt-no-color", "ferm-numerically-closer"]);
  });

  it("дрожжи — тот же yeastFamily приоритетнее близкой аттенюации из другого семейства, затем |аттенюация-аттенюация|", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "yeast-ref", type: "yeast", nameRu: "US-05", itemKind: "yeast", attributes: { yeast_family: "ale", attenuation_pct_typical: 75 } }),
      buildIngredientRow({ id: "yeast-far-same-family", type: "yeast", nameRu: "S-04", itemKind: "yeast", attributes: { yeast_family: "ale", attenuation_pct_typical: 95 } }),
      buildIngredientRow({ id: "yeast-close-same-family", type: "yeast", nameRu: "Notthingham", itemKind: "yeast", attributes: { yeast_family: "ale", attenuation_pct_typical: 78 } }),
      // Ближе по аттенюации (diff 1), но другое семейство — должен уйти после same-family кандидатов.
      buildIngredientRow({ id: "yeast-other-family", type: "yeast", nameRu: "W-34/70", itemKind: "yeast", attributes: { yeast_family: "lager", attenuation_pct_typical: 76 } })
    ];

    const similar = await listSimilarCatalogIngredients(await referenceItem("yeast-ref"));

    expect(similar.map((item) => item.id)).toEqual([
      "yeast-close-same-family",
      "yeast-far-same-family",
      "yeast-other-family"
    ]);
  });

  it("расходники/вода — тот же subtype, затем алфавит", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "wt-ref", type: "water_treatment", nameRu: "Хлорид кальция", itemKind: "salt", attributes: {} }),
      buildIngredientRow({ id: "wt-salt-b", type: "water_treatment", nameRu: "Сульфат кальция", itemKind: "salt", attributes: {} }),
      buildIngredientRow({ id: "wt-salt-a", type: "water_treatment", nameRu: "Гипс", itemKind: "salt", attributes: {} }),
      buildIngredientRow({ id: "wt-acid", type: "water_treatment", nameRu: "Молочная кислота", itemKind: "acid", attributes: {} })
    ];

    const similar = await listSimilarCatalogIngredients(await referenceItem("wt-ref"));

    expect(similar.map((item) => item.id)).toEqual(["wt-salt-a", "wt-salt-b", "wt-acid"]);
  });
});

describe("каталог: другие ингредиенты бренда (listSameBrandCatalogIngredients)", () => {
  it("фильтрует по бренду без учёта регистра, сортирует по алфавиту и исключает сам ингредиент", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "brand-ref", type: "hop", nameRu: "Кэскейд", itemKind: "hop", brand: "Yakima Chief Hops" }),
      buildIngredientRow({ id: "brand-b", type: "hop", nameRu: "Симко", itemKind: "hop", brand: "yakima chief hops" }),
      buildIngredientRow({ id: "brand-a", type: "yeast", nameRu: "Азимут", itemKind: "yeast", brand: "YAKIMA CHIEF HOPS" }),
      buildIngredientRow({ id: "other-brand", type: "hop", nameRu: "Магнум", itemKind: "hop", brand: "Barth-Haas" })
    ];

    const sameBrand = await listSameBrandCatalogIngredients(await referenceItem("brand-ref"));

    expect(sameBrand.map((item) => item.id)).toEqual(["brand-a", "brand-b"]);
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
