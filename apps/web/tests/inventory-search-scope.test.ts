import { beforeEach, describe, expect, it, vi } from "vitest";

// Реконструируем sql-тег в читаемый текст (тот же приём, что в
// public-recipes-service.test.ts:~235) — так можно проверить, что вариант
// «50%off» попадает в ilike-паттерн уже экранированным.
const { mockState } = vi.hoisted(() => ({
  mockState: {
    selectRows: [] as any[]
  }
}));

vi.mock("@nb/db", () => {
  // Символьные ключи (Symbol.toPrimitive и пр.) отдаём как функцию-имя таблицы —
  // buildInventorySearchWhere подставляет саму таблицу в EXISTS-подзапрос
  // (`from ${ingredientAliases}`), и шаблонный тег коэрсит объект в строку.
  const tableToken = (name: string) => new Proxy({} as Record<string, string>, {
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

  const toText = (value: unknown): string => (
    value && typeof value === "object" && "text" in (value as Record<string, unknown>)
      ? String((value as { text: unknown }).text)
      : String(value)
  );

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = "";
    strings.forEach((chunk, index) => {
      text += chunk;
      if (index < values.length) {
        text += toText(values[index]);
      }
    });
    return { text: text.trim() };
  };
  sql.join = (chunks: Array<{ text: string }>, separator: { text: string }) => ({
    text: chunks.map((chunk) => chunk.text).join(separator.text)
  });

  const builder = {
    from: () => builder,
    leftJoin: () => builder,
    where: (_where: unknown) => ({
      // Резервы (applyInventoryReservationsToItems): where().groupBy() → без резервов.
      groupBy: async (..._cols: unknown[]) => [] as unknown[],
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => (
        Promise.resolve(mockState.selectRows).then(onFulfilled, onRejected)
      )
    })
  };

  const db = {
    query: {
      ingredients: { findFirst: async () => null },
      ingredientPackageVariants: { findFirst: async () => null },
      userCustomIngredients: { findFirst: async () => null },
      userIngredients: { findFirst: async () => null }
    },
    select: (_shape: Record<string, unknown>) => builder
  };

  return {
    db,
    sql,
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    desc: (value: unknown) => value,
    count: () => ({}),
    gt: (...args: unknown[]) => args,
    inArray: (...args: unknown[]) => args,
    isNull: (value: unknown) => value,
    ingredientAliases: tableToken("ingredientAliases"),
    ingredientPackageVariants: tableToken("ingredientPackageVariants"),
    ingredients: tableToken("ingredients"),
    brewBatches: tableToken("brewBatches"),
    recipeIngredients: tableToken("recipeIngredients"),
    recipeInventoryAllocations: tableToken("recipeInventoryAllocations"),
    recipes: tableToken("recipes"),
    userCustomIngredients: tableToken("userCustomIngredients"),
    userIngredients: tableToken("userIngredients"),
    inventoryTransactions: tableToken("inventoryTransactions")
  };
});

vi.mock("../features/system/currency-rates", () => ({
  systemCurrencies: ["RUB", "USD", "EUR"],
  listSystemCurrencyRates: async () => ({ RUB: 100, USD: 7900, EUR: 9170 }),
  convertCurrencyMinorToRubMinor: (amountMinor: number) => amountMinor
}));

vi.mock("../features/ingredients/user-metadata-service", () => ({
  listIngredientPurchaseLinkSummaries: async () => new Map()
}));

vi.mock("@nb/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nb/auth")>()),
  assertRateLimit: async () => {}
}));

import {
  buildInventorySearchScope,
  buildInventorySearchWhere,
  listInventoryForUser,
  listInventoryForUserWithMeta
} from "../features/inventory/service";

const catalogRow = (overrides: Record<string, unknown> = {}) => ({
  id: "cat-1",
  isActive: true,
  type: "hop",
  itemKind: "hop",
  nameRu: null,
  nameEn: "Citra",
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
  attributes: {},
  quantityDefaults: null,
  ...overrides
});

const inventoryRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ingredientCatalogItemId: "cat-1",
  userCustomIngredientId: null,
  packageVariantId: null,
  ingredientFamilyId: null,
  ingredientCategory: "hop",
  ingredientSubtype: "hop",
  ingredientDisplayNameSnapshot: "Citra",
  ingredientDefaultDisplayUnitSnapshot: "g",
  ingredientMeasurementDimension: "weight",
  enteredQuantity: 100,
  enteredUnit: "g",
  normalizedQuantity: 100,
  normalizedUnit: "g",
  unitDimension: "weight",
  purchasedAt: null,
  freshnessDate: null,
  notes: null,
  archivedAt: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  ...overrides
});

describe("buildInventorySearchScope", () => {
  it("пустой запрос → пустые массивы", () => {
    expect(buildInventorySearchScope("")).toEqual({ variants: [], layoutVariants: [] });
  });

  it("раскладочный мусор («wbnhf») не попадает в честные варианты, но есть в layoutVariants", () => {
    const scope = buildInventorySearchScope("wbnhf");
    expect(scope.variants).not.toContain("цитра");
    expect(scope.layoutVariants).toContain("цитра");
  });

  it("ё/е фолдятся в один и тот же набор честных вариантов", () => {
    // layoutVariants может отличаться (swapKeyboardLayout работает до ё→е фолдинга),
    // но честные variants — источник основного матчинга — идентичны.
    expect(buildInventorySearchScope("ёлка").variants).toEqual(buildInventorySearchScope("елка").variants);
    expect(buildInventorySearchScope("ёлка").variants).toContain("елка");
  });

  it("семейство ингредиентов («пилс») разворачивается в канонические синонимы", () => {
    const scope = buildInventorySearchScope("пилс");
    expect(scope.variants).toContain("пилснер");
    expect(scope.variants).toContain("pilsner");
  });

  it("честная (не раскладочная) транслитерация работает в обе стороны", () => {
    const scope = buildInventorySearchScope("cascade");
    expect(scope.variants).toContain("cascade");
    expect(scope.variants).toContain("каскаде");
  });

  it("запрос, целиком состоящий из вырезаемой пунктуации («!!!»), не роняет фильтр — держит сырую строку вариантом", () => {
    // buildQueryVariants("!!!") === [] (normalizeSearchText вырезает всю пунктуацию),
    // а buildInventorySearchWhere([]) === undefined — без фолбэка на сырую строку
    // это молча убирало SQL-условие поиска и отдавало ВЕСЬ склад вместо пустой выдачи.
    const scope = buildInventorySearchScope("!!!");
    expect(scope.variants).toEqual(["!!!"]);
  });
});

describe("buildInventorySearchWhere", () => {
  it("пустой список вариантов → undefined (условие не добавляется)", () => {
    expect(buildInventorySearchWhere([])).toBeUndefined();
  });

  it("экранирует % и _ в варианте перед подстановкой в ilike-шаблон", () => {
    const where = buildInventorySearchWhere(["50%off"]) as unknown as { text: string };
    expect(where.text).toContain("%50\\%off%");
    // Экранированный процент не должен остаться неэкранированным (иначе % работает как wildcard).
    expect(where.text).not.toContain("%50%off%");
  });

  it("склеивает несколько вариантов через OR", () => {
    const where = buildInventorySearchWhere(["citra", "цитра"]) as unknown as { text: string };
    expect(where.text).toContain("%citra%");
    expect(where.text).toContain("%цитра%");
    expect(where.text).toContain(" or ");
  });
});

describe("listInventoryForUser — ранжирование по релевантности при поиске", () => {
  beforeEach(() => {
    mockState.selectRows = [];
  });

  it("точное совпадение по названию всплывает выше совпадения только по бренду", async () => {
    mockState.selectRows = [
      {
        inventory: inventoryRow("inv-brand-substring", {
          ingredientDisplayNameSnapshot: "Mystery Hop",
          normalizedQuantity: 100
        }),
        catalog: catalogRow({ nameEn: "Mystery Hop", brand: "Citra Farms", producer: "Citra Farms" }),
        custom: null,
        packageVariant: null
      },
      {
        inventory: inventoryRow("inv-exact-name", {
          ingredientDisplayNameSnapshot: "Citra",
          normalizedQuantity: 100
        }),
        catalog: catalogRow({ nameEn: "Citra" }),
        custom: null,
        packageVariant: null
      }
    ];

    const items = await listInventoryForUser("u1", { search: "citra" });

    expect(items.map((item) => item.id)).toEqual(["inv-exact-name", "inv-brand-substring"]);
  });

  it("явный sort=quantity не перебивается релевантностью", async () => {
    mockState.selectRows = [
      {
        inventory: inventoryRow("inv-exact-name", {
          ingredientDisplayNameSnapshot: "Citra",
          normalizedQuantity: 50
        }),
        catalog: catalogRow({ nameEn: "Citra" }),
        custom: null,
        packageVariant: null
      },
      {
        inventory: inventoryRow("inv-brand-substring", {
          ingredientDisplayNameSnapshot: "Mystery Hop",
          normalizedQuantity: 200
        }),
        catalog: catalogRow({ nameEn: "Mystery Hop", brand: "Citra Farms", producer: "Citra Farms" }),
        custom: null,
        packageVariant: null
      }
    ];

    const items = await listInventoryForUser("u1", { search: "citra", sort: "quantity" });

    expect(items.map((item) => item.id)).toEqual(["inv-brand-substring", "inv-exact-name"]);
  });

  it("listInventoryForUserWithMeta отдаёт searchRescue: null, когда первый проход честно нашёл строки", async () => {
    mockState.selectRows = [
      {
        inventory: inventoryRow("inv-exact-name"),
        catalog: catalogRow(),
        custom: null,
        packageVariant: null
      }
    ];

    const { items, searchRescue } = await listInventoryForUserWithMeta("u1", { search: "citra" });

    expect(items).toHaveLength(1);
    expect(searchRescue).toBeNull();
  });
});
