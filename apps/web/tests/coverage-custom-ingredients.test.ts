import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрываем сервис-слой кастомных ингредиентов (сущности), ссылок на покупку и
// избранного БЕЗ реальной БД: @nb/db мокается in-memory через vi.hoisted + vi.mock.
// Операции над позициями склада (количество/архив/удаление позиции) тут НЕ трогаем —
// это покрыто в inventory-service.test.ts. Здесь — сами кастомные сущности, ссылки и
// избранное (фокус на пробелах: update/delete/usage-gate, replace списком, валидация
// URL, переключение избранного, гейты владельца).

const FIXED_DATE = new Date("2025-01-01T00:00:00.000Z");

const { tableNames, mockState } = vi.hoisted(() => ({
  tableNames: [
    "ingredients",
    "ingredientPackageVariants",
    "ingredientAliases",
    "ingredientSources",
    "recipeIngredients",
    "recipes",
    "userCustomIngredients",
    "userIngredients",
    "userIngredientPreferences",
    "userIngredientPurchaseLinks"
  ],
  mockState: {
    idCounter: 0,
    catalogFindFirst: vi.fn(async (_arg?: unknown) => null as any),
    packageVariantFindFirst: vi.fn(async (_arg?: unknown) => null as any),
    customFindFirst: vi.fn(async (_arg?: unknown) => null as any),
    inventoryFindFirst: vi.fn(async (_arg?: unknown) => null as any),
    purchaseLinkFindFirst: vi.fn(async (_arg?: unknown) => null as any),
    inserted: [] as Array<{ table: string; values: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; set: Record<string, unknown>; where: unknown }>,
    deleted: [] as Array<{ table: string; where: unknown }>,
    updateReturning: null as any[] | null,
    selectRows: {} as Record<string, any[]>
  }
}));

vi.mock("server-only", () => ({}));

// currency-rates тянет "server-only" и системные курсы — для тестируемых функций он не
// нужен, мокаем как в inventory-service.test.ts, чтобы модуль грузился чисто.
vi.mock("../features/system/currency-rates", () => ({
  systemCurrencies: ["RUB", "USD", "EUR"],
  listSystemCurrencyRates: async () => ({ RUB: 100, USD: 7900, EUR: 9170 }),
  convertCurrencyMinorToRubMinor: (amountMinor: number, currency: "RUB" | "USD" | "EUR", rates: Record<string, number>) => (
    Math.round((amountMinor * rates[currency]) / 100)
  )
}));

vi.mock("@nb/db", () => {
  const makeTable = (name: string) => new Proxy({ name }, {
    get(_target, prop) {
      if (prop === "name") {
        return name;
      }
      if (typeof prop === "symbol") {
        return undefined;
      }
      return `${name}.${String(prop)}`;
    }
  });

  const tables: Record<string, unknown> = {};
  for (const name of tableNames) {
    tables[name] = makeTable(name);
  }

  const rowsForTable = (table: { name: string }) => mockState.selectRows[table.name] ?? [];

  const makeThenable = (rows: any[], extra: Record<string, unknown> = {}) => {
    const promise = Promise.resolve(rows);
    return {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
      ...extra
    };
  };

  const insert = (table: { name: string }) => ({
    values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const list = Array.isArray(values) ? values : [values];
      const built = list.map((value) => {
        mockState.inserted.push({ table: table.name, values: value });
        return {
          ...value,
          id: value.id ?? `new-${++mockState.idCounter}`,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE
        };
      });

      return makeThenable(built, {
        returning: async () => built,
        onConflictDoUpdate: (_config: unknown) => Promise.resolve(undefined)
      });
    }
  });

  const deleteFn = (table: { name: string }) => ({
    where: (where: unknown) => {
      mockState.deleted.push({ table: table.name, where });
      return Promise.resolve(undefined);
    }
  });

  const db: any = {
    query: {
      ingredients: { findFirst: (arg: unknown) => mockState.catalogFindFirst(arg) },
      ingredientPackageVariants: { findFirst: (arg: unknown) => mockState.packageVariantFindFirst(arg) },
      userCustomIngredients: { findFirst: (arg: unknown) => mockState.customFindFirst(arg) },
      userIngredients: { findFirst: (arg: unknown) => mockState.inventoryFindFirst(arg) },
      userIngredientPurchaseLinks: { findFirst: (arg: unknown) => mockState.purchaseLinkFindFirst(arg) }
    },
    insert,
    update: (table: { name: string }) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          mockState.updates.push({ table: table.name, set, where });
          const rows = mockState.updateReturning ?? [{ id: "updated-1", position: 0, ...set }];
          return {
            returning: async () => rows
          };
        }
      })
    }),
    delete: deleteFn,
    select: (_shape?: Record<string, unknown>) => ({
      from: (table: { name: string }) => {
        const rows = rowsForTable(table);
        const result = makeThenable(rows, {
          orderBy: (..._args: unknown[]) => Promise.resolve(rows)
        });
        return {
          where: (_where: unknown) => result
        };
      }
    })
  };

  db.transaction = async (callback: (tx: unknown) => unknown) => callback(db);

  return {
    db,
    and: (...args: unknown[]) => args,
    asc: (value: unknown) => value,
    count: (..._args: unknown[]) => ({}),
    desc: (value: unknown) => value,
    eq: (...args: unknown[]) => args,
    gt: (...args: unknown[]) => args,
    gte: (...args: unknown[]) => args,
    ilike: (...args: unknown[]) => args,
    inArray: (...args: unknown[]) => ["inArray", ...args],
    isNotNull: (value: unknown) => ["isNotNull", value],
    isNull: (value: unknown) => ["isNull", value],
    lte: (...args: unknown[]) => args,
    max: (..._args: unknown[]) => ({}),
    or: (...args: unknown[]) => ["or", ...args],
    sql: (..._args: unknown[]) => ({}) as never,
    ...tables
  };
});

// Анти-абьюз-барьеры сервиса зовут assertRateLimit (реальный бьёт в БД); в этих
// тестах он не в фокусе — стабим no-op, остальное @nb/auth оставляем настоящим.
vi.mock("@nb/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nb/auth")>()),
  assertRateLimit: vi.fn(async () => {})
}));

import {
  createUserCustomIngredient,
  createUserCustomInventoryIngredient,
  deleteUserCustomIngredient,
  findOwnedCustomIngredientByDisplayName,
  resolveCatalogInventoryAdditionSource,
  updateUserCustomIngredient
} from "../features/inventory/service";
import {
  applyFavoriteStateToCatalogItems,
  createIngredientPurchaseLink,
  deleteIngredientPurchaseLink,
  listIngredientFavoriteKeys,
  listIngredientPurchaseLinkSummaries,
  listIngredientPurchaseLinksByReference,
  replaceIngredientPurchaseLinksForReference,
  setIngredientFavoriteState,
  updateIngredientPurchaseLink
} from "../features/ingredients/user-metadata-service";

const insertedFor = (table: string) => mockState.inserted.filter((row) => row.table === table).map((row) => row.values);
const deletedFor = (table: string) => mockState.deleted.filter((row) => row.table === table);

beforeEach(() => {
  mockState.idCounter = 0;
  mockState.inserted = [];
  mockState.updates = [];
  mockState.deleted = [];
  mockState.updateReturning = null;
  mockState.selectRows = {};
  mockState.catalogFindFirst.mockReset();
  mockState.packageVariantFindFirst.mockReset();
  mockState.customFindFirst.mockReset();
  mockState.inventoryFindFirst.mockReset();
  mockState.purchaseLinkFindFirst.mockReset();
});

describe("кастомные ингредиенты — жизненный цикл сущности", () => {
  it("createUserCustomInventoryIngredient допускает ингредиент без обязательных тех. полей, в отличие от строгого создания", async () => {
    const payload = {
      category: "fermentable" as const,
      displayName: "Овсяные хлопья"
    };

    // Строгая схема требует цвет EBC и экстрактивность для бродильных — отклоняет.
    await expect(createUserCustomIngredient("u1", payload)).rejects.toThrow();

    const created = await createUserCustomInventoryIngredient("u1", payload);

    expect(created.displayName).toBe("Овсяные хлопья");
    expect(created.normalizedName).toBe("овсяные хлопья");
    const inserts = insertedFor("userCustomIngredients");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.properties).toMatchObject({
      category: "fermentable"
    });
  });

  it("updateUserCustomIngredient проверяет владельца и пересчитывает нормализованное имя", async () => {
    mockState.customFindFirst.mockResolvedValueOnce({
      id: "custom-1",
      userId: "u1",
      type: "hop",
      displayName: "Старое имя",
      normalizedName: "staroe imya",
      properties: { category: "hop" }
    });

    const updated = await updateUserCustomIngredient("u1", "custom-1", {
      category: "hop",
      displayName: "  Магнум  HBC-394 ",
      hopAlphaAcidPct: 14
    });

    expect(updated).toBeTruthy();
    const update = mockState.updates.find((row) => row.table === "userCustomIngredients");
    expect(update).toBeTruthy();
    expect(update?.set).toMatchObject({
      // displayName лишь триммится по краям, а normalizedName схлопывает двойной пробел.
      displayName: "Магнум  HBC-394",
      normalizedName: "магнум hbc 394",
      hopAlphaAcidPct: 14
    });
    expect(update?.set.updatedAt).toBeInstanceOf(Date);
  });

  it("updateUserCustomIngredient отклоняет чужой ингредиент", async () => {
    mockState.customFindFirst.mockResolvedValueOnce(null);

    await expect(updateUserCustomIngredient("u1", "custom-foreign", {
      category: "hop",
      displayName: "Cascade",
      hopAlphaAcidPct: 6
    })).rejects.toThrowError("CUSTOM_INGREDIENT_NOT_FOUND");

    expect(mockState.updates).toHaveLength(0);
  });

  it("deleteUserCustomIngredient удаляет неиспользуемый ингредиент и возвращает его", async () => {
    const current = {
      id: "custom-1",
      userId: "u1",
      type: "hop",
      displayName: "Citra",
      properties: { category: "hop" }
    };
    mockState.customFindFirst.mockResolvedValueOnce(current);
    mockState.selectRows.userIngredients = [{ count: 0 }];
    mockState.selectRows.recipeIngredients = [{ count: 0 }];

    const result = await deleteUserCustomIngredient("u1", "custom-1");

    expect(result).toBe(current);
    expect(deletedFor("userCustomIngredients")).toHaveLength(1);
  });

  it("deleteUserCustomIngredient запрещает удаление, если ингредиент используется на складе", async () => {
    mockState.customFindFirst.mockResolvedValueOnce({ id: "custom-1", userId: "u1", type: "hop", properties: {} });
    mockState.selectRows.userIngredients = [{ count: 1 }];
    mockState.selectRows.recipeIngredients = [{ count: 0 }];

    await expect(deleteUserCustomIngredient("u1", "custom-1")).rejects.toThrowError("CUSTOM_INGREDIENT_IN_USE");
    expect(deletedFor("userCustomIngredients")).toHaveLength(0);
  });

  it("deleteUserCustomIngredient запрещает удаление, если ингредиент используется в рецепте", async () => {
    mockState.customFindFirst.mockResolvedValueOnce({ id: "custom-1", userId: "u1", type: "hop", properties: {} });
    mockState.selectRows.userIngredients = [{ count: 0 }];
    mockState.selectRows.recipeIngredients = [{ count: 2 }];

    await expect(deleteUserCustomIngredient("u1", "custom-1")).rejects.toThrowError("CUSTOM_INGREDIENT_IN_USE");
    expect(deletedFor("userCustomIngredients")).toHaveLength(0);
  });

  it("deleteUserCustomIngredient отклоняет чужой ингредиент", async () => {
    mockState.customFindFirst.mockResolvedValueOnce(null);

    await expect(deleteUserCustomIngredient("u1", "custom-foreign")).rejects.toThrowError("CUSTOM_INGREDIENT_NOT_FOUND");
    expect(deletedFor("userCustomIngredients")).toHaveLength(0);
  });
});

describe("разрешение дубликата по отображаемому имени и источника каталог/кастом", () => {
  it("findOwnedCustomIngredientByDisplayName ищет по владельцу/типу с нормализованным именем", async () => {
    const row = { id: "custom-1", userId: "u1", type: "hop" };
    mockState.customFindFirst.mockResolvedValueOnce(row);

    const found = await findOwnedCustomIngredientByDisplayName("u1", "hop", "  Магнум /  X-100 ");

    expect(found).toBe(row);
    const callArg = mockState.customFindFirst.mock.calls[0]?.[0] as { where: unknown };
    // eq/and замоканы как массивы — проверяем, что в условие ушло нормализованное имя.
    expect(JSON.stringify(callArg.where)).toContain("магнум x 100");
  });

  it("resolveCatalogInventoryAdditionSource бросает CATALOG_INGREDIENT_NOT_FOUND для несуществующего каталога", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce(null);

    await expect(resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "missing",
      hopAlphaAcidPct: 13
    })).rejects.toThrowError("CATALOG_INGREDIENT_NOT_FOUND");
  });

  it("resolveCatalogInventoryAdditionSource переиспользует уже существующий производный кастом без дубля", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-hop-1",
      isActive: true,
      type: "hop",
      itemKind: "hop",
      nameRu: "Цитра",
      nameEn: "Citra",
      displayModeRu: "localized_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: "US",
      countryName: "США",
      brand: "Yakima Chief",
      producer: "Yakima Chief",
      productCode: null,
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        alpha_acid_pct_typical: 12
      },
      quantityDefaults: null
    });
    // Под первым кандидатом имени уже лежит производный кастом с нужной альфой —
    // его и переиспользуем, новую сущность не создаём.
    mockState.customFindFirst.mockResolvedValue({
      id: "custom-derived-1",
      userId: "u1",
      type: "hop",
      displayName: "Цитра",
      normalizedName: "citra",
      manufacturer: "Yakima Chief",
      country: "США",
      hopAlphaAcidPct: 13.2,
      hopForm: "pellet",
      fermentableColorEbc: null,
      fermentableExtractYieldPct: null,
      yeastAttenuationPct: null,
      yeastForm: null,
      yeastMinFermentationTempC: null,
      yeastMaxFermentationTempC: null,
      properties: {
        category: "hop",
        subtype: "hop",
        derivedFromIngredientId: "cat-hop-1",
        derivedFromDisplayName: "Цитра",
        technicalData: {
          type: "hop",
          alphaAcidPctTypical: 13.2,
          betaAcidPctTypical: 3.8,
          hopForm: "pellet"
        }
      }
    });

    const resolved = await resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "cat-hop-1",
      hopAlphaAcidPct: 13.2
    });

    expect(resolved).toEqual({
      sourceKind: "custom",
      userCustomIngredientId: "custom-derived-1"
    });
    expect(insertedFor("userCustomIngredients")).toHaveLength(0);
  });
});

describe("ссылки на покупку — CRUD и replace списком", () => {
  it("createIngredientPurchaseLink (каталог) нормализует URL и проставляет позицию по числу существующих", async () => {
    mockState.selectRows.userIngredientPurchaseLinks = [
      {
        id: "link-existing",
        userId: "u1",
        ingredientCatalogItemId: "cat-1",
        userCustomIngredientId: null,
        url: "https://ozon.ru/product/a",
        normalizedUrl: "https://ozon.ru/product/a",
        position: 0
      }
    ];

    const created = await createIngredientPurchaseLink("u1", { source: "catalog", id: "cat-1" }, "kolba.ru/catalog/citra/");

    expect(created).toMatchObject({
      url: "https://kolba.ru/catalog/citra",
      marketplace: "kolba",
      marketplaceLabel: "Колба",
      position: 1
    });
    const inserts = insertedFor("userIngredientPurchaseLinks");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      userId: "u1",
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      url: "https://kolba.ru/catalog/citra",
      normalizedUrl: "https://kolba.ru/catalog/citra",
      position: 1
    });
  });

  it("createIngredientPurchaseLink (кастом) требует владельца", async () => {
    mockState.customFindFirst.mockResolvedValueOnce(null);

    await expect(createIngredientPurchaseLink("u1", { source: "custom", id: "custom-foreign" }, "ozon.ru/x"))
      .rejects.toThrowError("CUSTOM_INGREDIENT_NOT_FOUND");
    expect(insertedFor("userIngredientPurchaseLinks")).toHaveLength(0);
  });

  it("createIngredientPurchaseLink отклоняет пустой/невалидный URL", async () => {
    await expect(createIngredientPurchaseLink("u1", { source: "catalog", id: "cat-1" }, "   "))
      .rejects.toThrowError("INVALID_PURCHASE_LINK_URL");
  });

  it("listIngredientPurchaseLinksByReference возвращает только строки, относящиеся к ссылке", async () => {
    mockState.selectRows.userIngredientPurchaseLinks = [
      {
        id: "link-1",
        userId: "u1",
        ingredientCatalogItemId: "cat-1",
        userCustomIngredientId: null,
        url: "https://ozon.ru/product/a",
        normalizedUrl: "https://ozon.ru/product/a",
        position: 0
      },
      {
        id: "link-2",
        userId: "u1",
        ingredientCatalogItemId: null,
        userCustomIngredientId: "custom-9",
        url: "https://kolba.ru/catalog/b",
        normalizedUrl: "https://kolba.ru/catalog/b",
        position: 0
      }
    ];

    const links = await listIngredientPurchaseLinksByReference("u1", { source: "catalog", id: "cat-1" });

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      id: "link-1",
      marketplace: "ozon",
      displayHost: "ozon.ru"
    });
  });

  it("updateIngredientPurchaseLink обновляет URL найденной ссылки", async () => {
    mockState.purchaseLinkFindFirst.mockResolvedValueOnce({
      id: "link-1",
      userId: "u1",
      url: "https://ozon.ru/old",
      normalizedUrl: "https://ozon.ru/old",
      position: 0
    });

    const updated = await updateIngredientPurchaseLink("u1", "link-1", "avito.ru/items/citra/");

    expect(updated).toMatchObject({
      url: "https://avito.ru/items/citra",
      marketplace: "avito"
    });
    const update = mockState.updates.find((row) => row.table === "userIngredientPurchaseLinks");
    expect(update?.set).toMatchObject({
      url: "https://avito.ru/items/citra",
      normalizedUrl: "https://avito.ru/items/citra"
    });
  });

  it("updateIngredientPurchaseLink бросает PURCHASE_LINK_NOT_FOUND для чужой/несуществующей ссылки", async () => {
    mockState.purchaseLinkFindFirst.mockResolvedValueOnce(null);

    await expect(updateIngredientPurchaseLink("u1", "link-x", "ozon.ru/x"))
      .rejects.toThrowError("PURCHASE_LINK_NOT_FOUND");
  });

  it("updateIngredientPurchaseLink отклоняет невалидный URL у найденной ссылки", async () => {
    mockState.purchaseLinkFindFirst.mockResolvedValueOnce({
      id: "link-1",
      userId: "u1",
      url: "https://ozon.ru/old",
      normalizedUrl: "https://ozon.ru/old",
      position: 0
    });

    await expect(updateIngredientPurchaseLink("u1", "link-1", "   "))
      .rejects.toThrowError("INVALID_PURCHASE_LINK_URL");
    expect(mockState.updates).toHaveLength(0);
  });

  it("deleteIngredientPurchaseLink удаляет с гейтом владельца (userId + id в условии)", async () => {
    await deleteIngredientPurchaseLink("u1", "link-1");

    const deletes = deletedFor("userIngredientPurchaseLinks");
    expect(deletes).toHaveLength(1);
    const serialized = JSON.stringify(deletes[0]?.where);
    expect(serialized).toContain("link-1");
    expect(serialized).toContain("u1");
  });

  it("replaceIngredientPurchaseLinksForReference нормализует+дедупит и пишет позиции в транзакции", async () => {
    await replaceIngredientPurchaseLinksForReference("u1", { source: "catalog", id: "cat-1" }, [
      "ozon.ru/product/citra",
      "https://ozon.ru/product/citra/",
      "rdshop.ru/catalog/citra"
    ]);

    expect(deletedFor("userIngredientPurchaseLinks")).toHaveLength(1);
    const inserts = insertedFor("userIngredientPurchaseLinks");
    expect(inserts).toHaveLength(2);
    expect(inserts.map((value) => ({ url: value.url, position: value.position }))).toEqual([
      { url: "https://ozon.ru/product/citra", position: 0 },
      { url: "https://rdshop.ru/catalog/citra", position: 1 }
    ]);
  });

  it("replaceIngredientPurchaseLinksForReference с пустым списком только удаляет, без вставки", async () => {
    await replaceIngredientPurchaseLinksForReference("u1", { source: "catalog", id: "cat-1" }, []);

    expect(deletedFor("userIngredientPurchaseLinks")).toHaveLength(1);
    expect(insertedFor("userIngredientPurchaseLinks")).toHaveLength(0);
  });

  it("replaceIngredientPurchaseLinksForReference (кастом) требует владельца", async () => {
    mockState.customFindFirst.mockResolvedValueOnce(null);

    await expect(replaceIngredientPurchaseLinksForReference("u1", { source: "custom", id: "custom-foreign" }, ["ozon.ru/x"]))
      .rejects.toThrowError("CUSTOM_INGREDIENT_NOT_FOUND");
    expect(deletedFor("userIngredientPurchaseLinks")).toHaveLength(0);
  });

  it("listIngredientPurchaseLinkSummaries агрегирует count и маркетплейсы (дедуп, лимит 3)", async () => {
    mockState.selectRows.userIngredientPurchaseLinks = [
      { id: "l1", userId: "u1", ingredientCatalogItemId: "cat-1", userCustomIngredientId: null, url: "https://ozon.ru/a", normalizedUrl: "https://ozon.ru/a", position: 0 },
      { id: "l2", userId: "u1", ingredientCatalogItemId: "cat-1", userCustomIngredientId: null, url: "https://ozon.ru/b", normalizedUrl: "https://ozon.ru/b", position: 1 },
      { id: "l3", userId: "u1", ingredientCatalogItemId: "cat-1", userCustomIngredientId: null, url: "https://kolba.ru/c", normalizedUrl: "https://kolba.ru/c", position: 2 },
      { id: "l4", userId: "u1", ingredientCatalogItemId: "cat-1", userCustomIngredientId: null, url: "https://avito.ru/d", normalizedUrl: "https://avito.ru/d", position: 3 },
      { id: "l5", userId: "u1", ingredientCatalogItemId: "cat-1", userCustomIngredientId: null, url: "https://wildberries.ru/e", normalizedUrl: "https://wildberries.ru/e", position: 4 }
    ];

    const summaries = await listIngredientPurchaseLinkSummaries("u1", [{ source: "catalog", id: "cat-1" }]);

    const summary = summaries.get("catalog:cat-1");
    expect(summary?.count).toBe(5);
    expect(summary?.marketplaces).toEqual(["ozon", "kolba", "avito"]);
  });
});

describe("избранное", () => {
  it("setIngredientFavoriteState=true вставляет предпочтение и возвращает true", async () => {
    const result = await setIngredientFavoriteState("u1", { source: "catalog", id: "cat-1" }, true);

    expect(result).toBe(true);
    const inserts = insertedFor("userIngredientPreferences");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      userId: "u1",
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      isFavorite: true
    });
    expect(deletedFor("userIngredientPreferences")).toHaveLength(0);
  });

  it("setIngredientFavoriteState=false удаляет предпочтение и возвращает false", async () => {
    const result = await setIngredientFavoriteState("u1", { source: "catalog", id: "cat-1" }, false);

    expect(result).toBe(false);
    expect(deletedFor("userIngredientPreferences")).toHaveLength(1);
    expect(insertedFor("userIngredientPreferences")).toHaveLength(0);
  });

  it("setIngredientFavoriteState (кастом) требует владельца", async () => {
    mockState.customFindFirst.mockResolvedValueOnce(null);

    await expect(setIngredientFavoriteState("u1", { source: "custom", id: "custom-foreign" }, true))
      .rejects.toThrowError("CUSTOM_INGREDIENT_NOT_FOUND");
    expect(insertedFor("userIngredientPreferences")).toHaveLength(0);
  });

  it("listIngredientFavoriteKeys строит набор ключей по избранным строкам", async () => {
    mockState.selectRows.userIngredientPreferences = [
      { ingredientCatalogItemId: "cat-1", userCustomIngredientId: null },
      { ingredientCatalogItemId: null, userCustomIngredientId: "custom-9" }
    ];

    const keys = await listIngredientFavoriteKeys("u1", [
      { source: "catalog", id: "cat-1" },
      { source: "custom", id: "custom-9" }
    ]);

    expect(keys.has("catalog:cat-1")).toBe(true);
    expect(keys.has("custom:custom-9")).toBe(true);
    expect(keys.size).toBe(2);
  });

  it("listIngredientFavoriteKeys без ссылок возвращает пустой набор (без запроса)", async () => {
    const keys = await listIngredientFavoriteKeys("u1", []);

    expect(keys.size).toBe(0);
  });

  it("applyFavoriteStateToCatalogItems проставляет isFavorite по ключам", async () => {
    mockState.selectRows.userIngredientPreferences = [
      { ingredientCatalogItemId: "cat-1", userCustomIngredientId: null }
    ];

    const items = await applyFavoriteStateToCatalogItems("u1", [
      { id: "cat-1", source: "catalog" } as any,
      { id: "custom-9", source: "custom" } as any
    ]);

    expect(items.find((item) => item.id === "cat-1")?.isFavorite).toBe(true);
    expect(items.find((item) => item.id === "custom-9")?.isFavorite).toBe(false);
  });
});
