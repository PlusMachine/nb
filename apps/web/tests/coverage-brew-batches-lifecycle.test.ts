import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие жизненного цикла варок (brew batches): сервис-слой тестируется БЕЗ
// реальной БД — `@nb/db` мокается in-memory (vi.hoisted + vi.mock), плюс мок
// межмодульных границ: getOwnedRecipeById (рецепты) и движок аллокаций склада
// (recipes/inventory-service). Фокус — на сквозном журнале: старт из рецепта →
// шаги brew-day → замеры → списание склада → смена статуса → возврат склада.

vi.mock("server-only", () => ({}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const RECIPE_ID = uuid(1);
const USER_ID = uuid(2);
const OTHER_USER = uuid(3);
const ITEM_ID = uuid(21);

// Хранилище таблиц + ссылки на колонки + фикстуры межмодульных моков — всё в
// одном hoisted-блоке, чтобы фабрики vi.mock могли его захватить.
const { tableRefs, store, ids, fixtures } = vi.hoisted(() => {
  const col = (table: string, field: string) => ({ __col: true as const, table, field });
  const ref = (table: string, fields: string[]) => {
    const r: Record<string, unknown> = { __table: table };
    for (const f of fields) {
      r[f] = col(table, f);
    }
    return r;
  };
  return {
    tableRefs: {
      brewBatches: ref("brewBatches", [
        "id", "userId", "recipeId", "status", "brewPlanSnapshot", "brewDayProgress", "createdAt"
      ]),
      brewMeasurements: ref("brewMeasurements", [
        "id", "userId", "brewBatchId", "gravitySg", "takenAt", "isFinal", "note", "createdAt"
      ]),
      inventoryTransactions: ref("inventoryTransactions", [
        "id", "userId", "brewBatchId", "inventoryItemId", "type", "normalizedUnit", "createdAt"
      ]),
      recipeInventoryAllocations: ref("recipeInventoryAllocations", ["id", "userId", "recipeId", "status", "brewBatchId"]),
      // Колонки проекции блокирующего чтения остатка (SELECT … FOR UPDATE в
      // consume/restore): без них фейк вернул бы строку без количеств.
      userIngredients: ref("userIngredients", [
        "id", "userId", "normalizedQuantity", "normalizedUnit", "enteredQuantity", "enteredUnit",
        "packageVariantId", "ingredientCatalogItemId", "userCustomIngredientId"
      ]),
      recipes: ref("recipes", ["id", "authorId"]),
      users: ref("users", ["id"]),
      brewTelemetry: ref("brewTelemetry", ["deviceId", "brewBatchId", "ts"])
    },
    store: {
      brewBatches: [] as any[],
      brewMeasurements: [] as any[],
      inventoryTransactions: [] as any[],
      recipeInventoryAllocations: [] as any[],
      userIngredients: [] as any[],
      recipes: [] as any[],
      users: [] as any[],
      brewTelemetry: [] as any[]
    },
    ids: { counter: 0 },
    fixtures: {
      recipeDetails: [] as any[],
      consumePlan: [] as any[],
      // «1 пачка = N г/мл» по складской позиции (реальный источник —
      // loadInventoryItemPackEquivalent: вариант фасовки/техполя каталога).
      packEquivalents: {} as Record<string, { normalizedUnit: string; normalizedQuantity: number } | null>,
      // Профили оборудования пользователя — для варки «на моём оборудовании».
      equipmentProfiles: [] as any[],
      // Опции, с которыми списание позвало движок аллокаций: по ним видно, в каком
      // объёме партия реально идёт на склад.
      consumeCalls: [] as any[]
    }
  };
});

vi.mock("@nb/db", () => {
  const genId = () => uuid(1000 + ++ids.counter);

  const matchWhere = (row: any, cond: any): boolean => {
    if (!cond) {
      return true;
    }
    if (cond.kind === "and") {
      return cond.conds.every((c: any) => matchWhere(row, c));
    }
    if (cond.kind === "eq") {
      return row[cond.col.field] === cond.value;
    }
    if (cond.kind === "inArray") {
      return cond.values.includes(row[cond.col.field]);
    }
    return true;
  };

  const compareVals = (a: any, b: any): number => {
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    return String(a).localeCompare(String(b));
  };

  const sortRows = (rows: any[], orders: any[]): any[] => {
    const copy = [...rows];
    copy.sort((x, y) => {
      for (const o of orders) {
        const cmp = compareVals(x[o.col.field], y[o.col.field]) * (o.dir === "desc" ? -1 : 1);
        if (cmp !== 0) {
          return cmp;
        }
      }
      return 0;
    });
    return copy;
  };

  const clone = (row: any) => ({ ...row });

  // Drizzle: undefined в set означает «не трогать колонку» — повторяем семантику.
  const applySet = (row: any, set: any) => {
    const next = { ...row };
    for (const [k, v] of Object.entries(set)) {
      if (v !== undefined) {
        next[k] = v;
      }
    }
    return next;
  };

  const makeSelectBuilder = (projection: any) => {
    const state: any = { projection, table: null, where: null, orders: null, groupCol: null, limitN: null };
    const resolve = (): any[] => {
      let rows = store[state.table as keyof typeof store].filter((r: any) => matchWhere(r, state.where));
      if (state.orders) {
        rows = sortRows(rows, state.orders);
      }
      if (state.limitN != null) {
        rows = rows.slice(0, state.limitN);
      }
      if (state.groupCol) {
        const groups = new Map<any, any[]>();
        for (const r of rows) {
          const key = r[state.groupCol.field];
          const bucket = groups.get(key) ?? [];
          bucket.push(r);
          groups.set(key, bucket);
        }
        const out: any[] = [];
        for (const groupRows of groups.values()) {
          const obj: any = {};
          for (const [k, expr] of Object.entries(projection as Record<string, any>)) {
            if (expr?.kind === "max") {
              obj[k] = groupRows.reduce((acc: any, row: any) => {
                const v = row[expr.col.field];
                return acc == null || compareVals(v, acc) > 0 ? v : acc;
              }, null);
            } else if (expr?.kind === "count") {
              obj[k] = groupRows.length;
            } else if (expr?.__col) {
              obj[k] = groupRows[0]?.[expr.field] ?? null;
            }
          }
          out.push(obj);
        }
        return out;
      }
      if (projection) {
        // Агрегат (count/max) без groupBy — «одна большая группа»: одна строка на
        // весь matched-набор, а не одна строка на каждую входную запись.
        const hasAggregate = Object.values(projection).some(
          (expr: any) => expr?.kind === "count" || expr?.kind === "max"
        );
        if (hasAggregate) {
          const obj: any = {};
          for (const [k, expr] of Object.entries(projection as Record<string, any>)) {
            if (expr?.kind === "count") {
              obj[k] = rows.length;
            } else if (expr?.kind === "max") {
              obj[k] = rows.reduce((acc: any, row: any) => {
                const v = row[expr.col.field];
                return acc == null || compareVals(v, acc) > 0 ? v : acc;
              }, null);
            } else if (expr?.__col) {
              obj[k] = rows[0]?.[expr.field] ?? null;
            }
          }
          return [obj];
        }
        return rows.map((r: any) => {
          const obj: any = {};
          for (const [k, expr] of Object.entries(projection as Record<string, any>)) {
            if (expr?.__col) {
              obj[k] = r[expr.field];
            }
          }
          return obj;
        });
      }
      return rows.map(clone);
    };
    const builder: any = {
      from(table: any) {
        state.table = table.__table;
        return builder;
      },
      where(cond: any) {
        state.where = cond;
        return builder;
      },
      orderBy(...orders: any[]) {
        state.orders = orders;
        return builder;
      },
      groupBy(c: any) {
        state.groupCol = c;
        return builder;
      },
      for(_mode: string) {
        return builder;
      },
      limit(n: number) {
        state.limitN = n;
        return builder;
      },
      then(onF: any, onR: any) {
        return Promise.resolve(resolve()).then(onF, onR);
      }
    };
    return builder;
  };

  const doInsert = (tableName: string, values: any) => {
    const base: any = { ...values };
    if (base.id === undefined) {
      base.id = genId();
    }
    if (base.createdAt === undefined) {
      base.createdAt = new Date(Date.UTC(2026, 0, 1) + ++ids.counter * 1000);
    }
    if (tableName === "brewBatches") {
      base.deviceId = base.deviceId ?? null;
      base.brewDayProgress = base.brewDayProgress ?? null;
      base.notes = base.notes ?? null;
      base.startedAt = base.startedAt ?? null;
      base.completedAt = base.completedAt ?? null;
      base.plannedFor = base.plannedFor ?? null;
      base.recipeSnapshot = base.recipeSnapshot ?? null;
      base.equipmentProfileSnapshot = base.equipmentProfileSnapshot ?? null;
      base.waterPlanSnapshot = base.waterPlanSnapshot ?? null;
      base.deviceHints = base.deviceHints ?? [];
      base.updatedAt = base.updatedAt ?? base.createdAt;
    }
    if (tableName === "brewMeasurements") {
      base.note = base.note ?? null;
    }
    store[tableName as keyof typeof store].push(base);
    return base;
  };

  const insert = (table: any) => ({
    values: (values: any) => {
      const row = doInsert(table.__table, values);
      return {
        returning: async () => [clone(row)],
        then: (onF: any, onR: any) => Promise.resolve([clone(row)]).then(onF, onR)
      };
    }
  });

  const update = (table: any) => ({
    set: (set: any) => ({
      where: (cond: any) => {
        const updated: any[] = [];
        store[table.__table as keyof typeof store] = store[table.__table as keyof typeof store].map((r: any) => {
          if (matchWhere(r, cond)) {
            const next = applySet(r, set);
            updated.push(next);
            return next;
          }
          return r;
        }) as any;
        return {
          returning: async () => updated.map(clone),
          then: (onF: any, onR: any) => Promise.resolve(updated.map(clone)).then(onF, onR)
        };
      }
    })
  });

  const del = (table: any) => ({
    where: (cond: any) => {
      const removed: any[] = [];
      store[table.__table as keyof typeof store] = store[table.__table as keyof typeof store].filter((r: any) => {
        if (matchWhere(r, cond)) {
          removed.push(r);
          return false;
        }
        return true;
      }) as any;
      return {
        returning: async () => removed.map(clone),
        then: (onF: any, onR: any) => Promise.resolve(removed.map(clone)).then(onF, onR)
      };
    }
  });

  const findMany = (tableName: string) => async (arg: any) => {
    let rows = store[tableName as keyof typeof store].filter((r: any) => matchWhere(r, arg?.where));
    if (arg?.orderBy) {
      rows = sortRows(rows, arg.orderBy);
    }
    return rows.map(clone);
  };
  const findFirst = (tableName: string) => async (arg: any) => {
    let rows = store[tableName as keyof typeof store].filter((r: any) => matchWhere(r, arg?.where));
    if (arg?.orderBy) {
      rows = sortRows(rows, arg.orderBy);
    }
    return rows.length ? clone(rows[0]) : undefined;
  };

  const db: any = {
    query: {
      brewBatches: { findFirst: findFirst("brewBatches"), findMany: findMany("brewBatches") },
      brewMeasurements: { findFirst: findFirst("brewMeasurements"), findMany: findMany("brewMeasurements") },
      recipes: { findFirst: findFirst("recipes"), findMany: findMany("recipes") },
      recipeInventoryAllocations: {
        findFirst: findFirst("recipeInventoryAllocations"),
        findMany: findMany("recipeInventoryAllocations")
      },
      userIngredients: { findFirst: findFirst("userIngredients"), findMany: findMany("userIngredients") },
      users: { findFirst: findFirst("users"), findMany: findMany("users") }
    },
    select: (projection?: any) => makeSelectBuilder(projection),
    insert,
    update,
    delete: del,
    transaction: async (cb: any) => cb(db)
  };

  return {
    db,
    and: (...conds: any[]) => ({ kind: "and", conds }),
    eq: (col: any, value: any) => ({ kind: "eq", col, value }),
    inArray: (col: any, values: any[]) => ({ kind: "inArray", col, values }),
    asc: (col: any) => ({ kind: "order", dir: "asc", col }),
    desc: (col: any) => ({ kind: "order", dir: "desc", col }),
    max: (col: any) => ({ kind: "max", col }),
    count: () => ({ kind: "count" }),
    brewBatches: tableRefs.brewBatches,
    brewMeasurements: tableRefs.brewMeasurements,
    inventoryTransactions: tableRefs.inventoryTransactions,
    recipeInventoryAllocations: tableRefs.recipeInventoryAllocations,
    userIngredients: tableRefs.userIngredients,
    recipes: tableRefs.recipes,
    users: tableRefs.users,
    brewTelemetry: tableRefs.brewTelemetry
  };
});

// Анти-абьюз-барьеры создания партии/замера зовут assertRateLimit (реальный
// бьёт в БД через db.execute, которого нет в in-memory моке @nb/db выше); в этих
// тестах барьер не в фокусе — стабим no-op, остальное @nb/auth оставляем настоящим.
vi.mock("@nb/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nb/auth")>()),
  assertRateLimit: vi.fn(async () => {})
}));

// Граница «рецепты»: возвращаем заранее собранный RecipeDetailDto с гейтом владельца.
vi.mock("@/features/recipes/service", () => ({
  getOwnedRecipeById: async (authorId: string, recipeId: string) => {
    const found = fixtures.recipeDetails.find((r: any) => r.id === recipeId && r.__authorId === authorId);
    if (!found) {
      throw new Error("NOT_FOUND");
    }
    return found;
  },
  // Доступный рецепт: свой (любой статус) ИЛИ чужой published — для варки без клона.
  getRecipeById: async (viewerId: string, recipeId: string) => {
    const found = fixtures.recipeDetails.find((r: any) => r.id === recipeId);
    if (!found) {
      throw new Error("NOT_FOUND");
    }
    if (found.__authorId !== viewerId && found.publicationState !== "published") {
      throw new Error("FORBIDDEN");
    }
    return found;
  }
}));

// Граница «профили оборудования»: варка «на моём оборудовании» подставляет профиль
// целиком. Скоуп по userId — чужой профиль не подставится (NOT_FOUND).
vi.mock("@/features/equipment-profiles/service", () => ({
  getEquipmentProfile: async (userId: string, profileId: string) => {
    const found = fixtures.equipmentProfiles.find((p: any) => p.id === profileId && p.userId === userId);
    if (!found) {
      throw new Error("NOT_FOUND");
    }
    return found;
  }
}));

// Граница «движок аллокаций склада»: имитируем реальный эффект consume —
// уменьшаем остаток, помечаем аллокацию consumed и пишем consume-транзакцию с
// brewBatchId и allocationId в мете (чтобы restore из brew-batches мог откатить).
vi.mock("@/features/recipes/inventory-service", () => ({
  autoAllocateRecipeInventoryFromStock: async (_userId: string, _recipeId: string, opts: any) => {
    fixtures.consumeCalls.push(opts);
  },
  consumeRecipeInventoryAllocations: async (userId: string, recipeId: string, opts: any) => {
    fixtures.consumeCalls.push(opts);
    for (const line of fixtures.consumePlan) {
      const item = store.userIngredients.find((i: any) => i.id === line.inventoryItemId && i.userId === userId);
      if (!item) {
        continue;
      }
      const before = item.normalizedQuantity;
      const after = Number((before - line.quantity).toFixed(6));
      item.normalizedQuantity = after;
      item.enteredQuantity = after;
      const allocationId = uuid(3000 + ++ids.counter);
      store.recipeInventoryAllocations.push({
        id: allocationId,
        userId,
        recipeId,
        inventoryItemId: item.id,
        status: "consumed",
        // Реальная аллокация несёт списанное количество и — при клампе дрожжей —
        // исходное требование рецепта: из этого buildView собирает честную строку
        // «списали меньше, чем нужно».
        allocatedQuantityNormalized: line.quantity,
        allocatedNormalizedUnit: line.unit,
        allocationMeta: line.requested != null
          ? { clamped: true, requestedQuantityNormalized: line.requested }
          : {},
        // Партия-потребитель — batch-aware блокировка реюза рецепта (см.
        // hasBlockingConsumedAllocations ниже) и прямой путь restoreBrewBatchInventory
        // читают именно это поле, а не только легаси-мету транзакции.
        brewBatchId: opts?.brewBatchId ?? null
      });
      store.inventoryTransactions.push({
        id: uuid(4000 + ++ids.counter),
        userId,
        inventoryItemId: item.id,
        recipeId,
        brewBatchId: opts?.brewBatchId ?? null,
        type: "consume",
        quantityDeltaNormalized: -line.quantity,
        normalizedUnit: line.unit,
        quantityBeforeNormalized: before,
        quantityAfterNormalized: after,
        transactionMeta: { allocationId },
        // Та же база времени, что у doInsert (release), но меньший счётчик —
        // consume гарантированно раньше компенсирующего release в журнале.
        createdAt: new Date(Date.UTC(2026, 0, 1) + ids.counter * 1000)
      });
    }
  },
  // Зеркало реального моста pack↔содержимое (features/inventory/pack.ts): без курса
  // «пачки» разноимённые единицы не конвертируются (null → колонку не трогаем),
  // с курсом — 11 г → 1 пачка. Мок обязан уважать 4-й аргумент, иначе тест не поймал
  // бы протухший entered_quantity после возврата на склад.
  convertNormalizedQuantityToEnteredUnit: (
    quantity: number,
    fromUnit: string,
    toUnit: string,
    packEquivalent?: { normalizedUnit: string; normalizedQuantity: number } | null
  ) => {
    if (fromUnit === toUnit) {
      return quantity;
    }
    if (!packEquivalent || !(packEquivalent.normalizedQuantity > 0)) {
      return null;
    }
    if (toUnit === "pack" && fromUnit === packEquivalent.normalizedUnit) {
      return quantity / packEquivalent.normalizedQuantity;
    }
    if (fromUnit === "pack" && toUnit === packEquivalent.normalizedUnit) {
      return quantity * packEquivalent.normalizedQuantity;
    }
    return null;
  },
  loadInventoryItemPackEquivalent: async (item: any) => fixtures.packEquivalents[item.id] ?? null,
  // Учёт списания — ПО ПАРТИИ: consumed-аллокация запирает только свою партию
  // (повторный клик), варки других партий того же рецепта не трогает. Зеркалит
  // реальную логику в features/recipes/inventory-service.ts (дефект A7).
  hasConsumedAllocationsForBatch: async (userId: string, brewBatchId: string) =>
    store.recipeInventoryAllocations.some(
      (a: any) => a.userId === userId && a.brewBatchId === brewBatchId && a.status === "consumed"
    ),
  // Ф2 (замены на списании) не в фокусе этого файла — план всегда пуст, поэтому
  // consumeBrewBatchInventory не находит замен и substituteAvailableCount = 0.
  buildBrewBatchConsumeLinePlanEntries: async () => ({ entries: [], inventoryItemsById: new Map() })
}));

import {
  addBrewMeasurement,
  createBrewBatchFromRecipe,
  deleteBrewMeasurement,
  getBrewBatchById,
  getBrewBatchDetail,
  listActiveBrewBatchesForUser,
  listBrewBatchesForRecipe,
  listBrewBatchesForUser,
  listBrewMeasurements,
  setBrewDayStepState,
  updateBrewBatchNotes,
  updateBrewBatchPlannedFor,
  updateBrewBatchStatus,
  updateBrewBatchTastingNotes
} from "@/features/brew-batches/service";
import {
  consumeBrewBatchInventory,
  getBrewBatchInventoryView,
  restoreBrewBatchInventory
} from "@/features/brew-batches/inventory";
// Фейковая db из мока выше — нужна, чтобы вклиниться в момент «мы уже в транзакции,
// но ещё не прочитали строку партии» и смоделировать конкурента.
import { db as fakeDb } from "@nb/db";
import {
  addBrewMeasurementSchema,
  brewDayStepStatePatchSchema,
  type BrewBatchStatus
} from "@/features/brew-batches/contracts";

// --- Фикстуры ----------------------------------------------------------------

const makeRecipeDetail = (id: string, authorId: string, publicationState = "private") => ({
  __authorId: authorId,
  id,
  authorId,
  publicationState,
  title: "Тестовый IPA",
  versionNumber: 1,
  og: 1.052,
  fg: 1.012,
  abv: 5.2,
  batchSizeNormalizedQuantity: 20,
  batchSizeNormalizedUnit: "l",
  boilTimeMinutes: 60,
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  brewPlanMeta: null,
  processMeta: {
    mashProfile: { steps: [{ id: "m1", name: "Затирание", temperatureC: 66, durationMinutes: 60 }] },
    fermentationProfile: { primaryTemperatureC: 19, primaryDurationDays: 14 }
  },
  ingredients: [
    {
      persistentKey: "h1",
      ingredientDisplayName: "Magnum",
      ingredientDisplayNameSnapshot: "Magnum",
      ingredientCategory: "hop",
      stage: "boil",
      timeOffset: 60,
      amountEnteredQuantity: 20,
      amountEnteredUnit: "g",
      stepMeta: null
    }
  ]
});

// Схема-валидный снапшот плана для прямого посева партий (минуя рецепт). Даёт
// шаги brew-day: mash:m1, boil:timer, ferment:primary.
const validSnapshot = (recipeId: string) => ({
  version: "brew_plan_v1",
  recipe: { id: recipeId, title: "Снапшот", versionNumber: 1, batchSizeL: 20 },
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  mashSteps: [{ id: "m1", name: "Затирание", targetTemperatureC: 66, durationMinutes: 60 }],
  boilPlan: { boilTimeMinutes: 60, timedAdditions: [] },
  whirlpoolPlan: [],
  fermentationPlan: { primaryTemperatureC: 19, primaryDurationDays: 14 },
  packagingPlan: null,
  deviceHints: []
});

let batchSeq = 0;

// Прямой посев партии в стор (минуя createBrewBatchFromRecipe).
const seedBatch = (overrides: Partial<Record<string, any>> = {}) => {
  batchSeq += 1;
  const id = overrides.id ?? uuid(500 + batchSeq);
  const row: any = {
    id,
    userId: USER_ID,
    recipeId: RECIPE_ID,
    status: "planned" as BrewBatchStatus,
    name: `Партия ${batchSeq}`,
    brewNumber: batchSeq,
    deviceId: null,
    brewPlanSnapshot: validSnapshot(overrides.recipeId ?? RECIPE_ID),
    brewDayProgress: null,
    recipeSnapshot: { title: "Тестовый IPA" },
    equipmentProfileSnapshot: null,
    waterPlanSnapshot: null,
    deviceHints: [],
    notes: null,
    tastingNotes: null,
    plannedFor: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(Date.UTC(2026, 1, 1) + batchSeq * 86_400_000),
    updatedAt: new Date(Date.UTC(2026, 1, 1) + batchSeq * 86_400_000),
    ...overrides
  };
  store.brewBatches.push(row);
  return row;
};

beforeEach(() => {
  ids.counter = 0;
  batchSeq = 0;
  store.brewBatches = [];
  store.brewMeasurements = [];
  store.inventoryTransactions = [];
  store.recipeInventoryAllocations = [];
  store.recipes = [{ id: RECIPE_ID, og: 1.052, fg: 1.012, abv: 5.2 }];
  store.userIngredients = [
    {
      id: ITEM_ID,
      userId: USER_ID,
      ingredientDisplayNameSnapshot: "Cascade",
      normalizedQuantity: 100,
      normalizedUnit: "g",
      enteredQuantity: 100,
      enteredUnit: "g",
      archivedAt: null,
      updatedAt: new Date(Date.UTC(2026, 0, 1))
    }
  ];
  store.brewTelemetry = [];
  store.users = [{ id: USER_ID, displayName: "Пивовар" }];
  fixtures.recipeDetails = [makeRecipeDetail(RECIPE_ID, USER_ID)];
  fixtures.consumePlan = [{ inventoryItemId: ITEM_ID, quantity: 50, unit: "g" }];
  fixtures.packEquivalents = {};
  fixtures.equipmentProfiles = [];
  fixtures.consumeCalls = [];
});

// --- createBrewBatchFromRecipe -----------------------------------------------

describe("createBrewBatchFromRecipe", () => {
  it("создаёт планируемую партию из рецепта владельца: снапшот плана + дефолтное имя (F5: первая партия = название рецепта, brewNumber = 1) + снапшот рецепта", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);

    expect(batch.status).toBe("planned");
    expect(batch.name).toBe("Тестовый IPA");
    expect(batch.brewNumber).toBe(1);
    expect(batch.userId).toBe(USER_ID);
    expect(batch.recipeId).toBe(RECIPE_ID);
    expect(batch.brewPlanSnapshot.recipe.id).toBe(RECIPE_ID);
    expect(batch.brewPlanSnapshot.boilPlan.boilTimeMinutes).toBe(60);
    // recipeSnapshot перенёс строки рецепта (для аудита состава на момент старта).
    expect((batch.recipeSnapshot as any)?.ingredients?.[0]).toMatchObject({
      persistentKey: "h1",
      displayName: "Magnum",
      unit: "g"
    });
    expect(store.brewBatches).toHaveLength(1);
  });

  it("F5: вторая и третья партии того же рецепта того же юзера сохраняют имя = название рецепта, а brewNumber растёт (2, 3)", async () => {
    const first = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    const second = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    const third = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);

    expect(first.name).toBe("Тестовый IPA");
    expect(first.brewNumber).toBe(1);
    expect(second.name).toBe("Тестовый IPA");
    expect(second.brewNumber).toBe(2);
    expect(third.name).toBe("Тестовый IPA");
    expect(third.brewNumber).toBe(3);
  });

  it("F5: отменённые партии тоже считаются в нумерации", async () => {
    const first = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    await updateBrewBatchStatus(USER_ID, first.id, "cancelled");
    const second = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    expect(second.name).toBe("Тестовый IPA");
    expect(second.brewNumber).toBe(2);
  });

  it("F5: партии ДРУГОГО юзера того же рецепта не влияют на счёт нумерации", async () => {
    const PUBLIC_RECIPE = uuid(5);
    fixtures.recipeDetails.push(makeRecipeDetail(PUBLIC_RECIPE, USER_ID, "published"));

    const other = await createBrewBatchFromRecipe(OTHER_USER, PUBLIC_RECIPE);
    expect(other.name).toBe("Тестовый IPA");
    expect(other.brewNumber).toBe(1);

    const mine = await createBrewBatchFromRecipe(USER_ID, PUBLIC_RECIPE);
    expect(mine.name).toBe("Тестовый IPA");
    expect(mine.brewNumber).toBe(1);
  });

  it("F5: партии РАЗНЫХ рецептов того же юзера нумеруются независимо", async () => {
    const SECOND_RECIPE = uuid(8);
    fixtures.recipeDetails.push(makeRecipeDetail(SECOND_RECIPE, USER_ID));

    await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    const firstOfSecondRecipe = await createBrewBatchFromRecipe(USER_ID, SECOND_RECIPE);

    // Счёт по RECIPE_ID (2 партии) не просочился в счёт SECOND_RECIPE — своя пара
    // (userId, recipeId) начинает нумерацию заново, с 1.
    expect(firstOfSecondRecipe.brewNumber).toBe(1);
  });

  it("F5: input.name, если передан, приоритетнее автоимени — но не brewNumber, тот назначается всегда", async () => {
    await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    const named = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID, { name: "Особая партия" });
    expect(named.name).toBe("Особая партия");
    expect(named.brewNumber).toBe(2);
  });

  it("обрезает пользовательское имя партии", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID, { name: "  Моя варка  " });
    expect(batch.name).toBe("Моя варка");
  });

  it("сохраняет plannedFor из input, если передан", async () => {
    const plannedFor = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID, { plannedFor });
    expect(batch.plannedFor?.getTime()).toBe(plannedFor.getTime());
  });

  it("отказывает не-владельцу НЕпубличного рецепта (FORBIDDEN из гейта доступа)", async () => {
    await expect(createBrewBatchFromRecipe(OTHER_USER, RECIPE_ID)).rejects.toThrow("FORBIDDEN");
    expect(store.brewBatches).toHaveLength(0);
  });

  it("варит чужой ОПУБЛИКОВАННЫЙ рецепт без клона: партия во владении варщика + атрибуция автора в снапшоте", async () => {
    const PUBLIC_RECIPE = uuid(4);
    fixtures.recipeDetails.push(makeRecipeDetail(PUBLIC_RECIPE, OTHER_USER, "published"));
    store.users.push({ id: OTHER_USER, displayName: "Автор" });

    const batch = await createBrewBatchFromRecipe(USER_ID, PUBLIC_RECIPE);

    expect(batch.userId).toBe(USER_ID);
    expect(batch.recipeId).toBe(PUBLIC_RECIPE);
    expect((batch.recipeSnapshot as any)?.authorId).toBe(OTHER_USER);
    expect((batch.recipeSnapshot as any)?.authorName).toBe("Автор");
    // Таргеты og/fg/abv осели в снапшоте — сводка партии переживёт удаление источника.
    expect((batch.recipeSnapshot as any)?.og).toBe(1.052);
    expect(store.brewBatches).toHaveLength(1);
  });
});

// --- createBrewBatchFromRecipe: объём варки и оборудование --------------------
//
// Рецепт на 30 л, оборудование пользователя — на 20 л. Раньше объём партии молча
// брался из рецепта: гид говорил «засыпьте 6 кг», карточка считала потребность под
// профиль (20 л), а склад списывался на 30 л. Теперь объём — явный выбор в диалоге
// «Сварить», и от него считается ВСЁ: план, слепок состава, водный план, списание.

const RECIPE_30L = uuid(6);
const PROFILE_ID = uuid(7);

// Рецепт 30 л на эффективности 75%: 6 кг солода + 1 кг сахара + 30 г хмеля. Батч —
// в мл (иначе объём не читается, см. toBatchVolumeLiters), количества — и entered, и
// normalized: план варочного дня берёт entered, засыпь и водный движок — normalized.
const makeRecipe30L = (id: string, authorId: string) => ({
  ...makeRecipeDetail(id, authorId),
  efficiency: 75,
  batchSizeEnteredQuantity: 30,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 30_000,
  batchSizeNormalizedUnit: "ml",
  ingredients: [
    {
      persistentKey: "m1",
      ingredientDisplayName: "Пильзнер",
      ingredientDisplayNameSnapshot: "Пильзнер",
      ingredientCategory: "fermentable",
      type: "malt",
      stage: "mash",
      timeOffset: null,
      amountEnteredQuantity: 6,
      amountEnteredUnit: "kg",
      amountNormalizedQuantity: 6000,
      amountNormalizedUnit: "g",
      stepMeta: null
    },
    {
      // Сахар: эффективность затирания на него не действует (100% выход) → дожим
      // его НЕ касается, только объём.
      persistentKey: "s1",
      ingredientDisplayName: "Декстроза",
      ingredientDisplayNameSnapshot: "Декстроза",
      ingredientCategory: "fermentable",
      type: "fermentable",
      stage: "boil",
      timeOffset: 10,
      amountEnteredQuantity: 1,
      amountEnteredUnit: "kg",
      amountNormalizedQuantity: 1000,
      amountNormalizedUnit: "g",
      stepMeta: null
    },
    {
      persistentKey: "h1",
      ingredientDisplayName: "Magnum",
      ingredientDisplayNameSnapshot: "Magnum",
      ingredientCategory: "hop",
      type: "hop",
      stage: "boil",
      timeOffset: 60,
      amountEnteredQuantity: 30,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 30,
      amountNormalizedUnit: "g",
      stepMeta: null
    }
  ]
});

const myProfile = () => ({
  id: PROFILE_ID,
  userId: USER_ID,
  name: "Моя пивоварня",
  targetBatchVolumeL: 20,
  brewhouseEfficiencyPct: 65,
  evaporationRateLPerHr: 2.5,
  trubChillerLossL: 1,
  fermenterLossL: 0.5,
  grainAbsorptionLPerKg: 0.9,
  coolingShrinkagePct: 4,
  mashThicknessLPerKg: 3,
  mashTunDeadspaceL: 0,
  minMashVolumeL: null,
  maxMashVolumeL: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null
});

describe("createBrewBatchFromRecipe — объём варки и оборудование", () => {
  beforeEach(() => {
    fixtures.recipeDetails.push(makeRecipe30L(RECIPE_30L, USER_ID));
    fixtures.equipmentProfiles = [myProfile()];
  });

  const snapshotAmount = (batch: any, persistentKey: string): number =>
    (batch.recipeSnapshot as any).ingredients.find((i: any) => i.persistentKey === persistentKey).amount;

  it("без выбора объёма варит в объёме рецепта (прежнее поведение)", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_30L);

    expect(batch.brewPlanSnapshot.recipe.batchSizeL).toBe(30);
    expect(batch.brewPlanSnapshot.grainBillTotalKg).toBe(7);
    expect(snapshotAmount(batch, "m1")).toBe(6);
  });

  it("объём партии 20 л без смены оборудования: всё пересчитано ×2/3, эффективность авторская", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_30L, { targetBatchVolumeL: 20 });

    expect(batch.brewPlanSnapshot.recipe.batchSizeL).toBe(20);
    // Засыпь для шага «Засыпьте солод»: (6 + 1) кг → 4.67 кг.
    expect(batch.brewPlanSnapshot.grainBillTotalKg).toBeCloseTo(4.67, 2);
    // Хмель в шагах кипячения: 30 г → 20 г.
    const hopAddition = batch.brewPlanSnapshot.boilPlan.timedAdditions.find((a: any) => a.name === "Magnum");
    expect(hopAddition?.amount).toMatchObject({ quantity: 20, unit: "g" });
    // Слепок состава — то же самое, иначе «состав партии» разошёлся бы с гидом.
    expect(snapshotAmount(batch, "m1")).toBe(4);
    expect(snapshotAmount(batch, "h1")).toBe(20);
    // Оборудование не меняли → дожима засыпи нет.
    expect(batch.brewPlanSnapshot.recipe.efficiencyPct).toBe(75);
    expect(batch.brewPlanSnapshot.recipe.recipeEfficiencyPct).toBe(75);
  });

  it("варка на своей эффективности (75% → 65%): засыпь дожата ×1.154, сахар и хмель — только по объёму", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_30L, {
      targetBatchVolumeL: 20,
      equipmentProfileId: PROFILE_ID
    });

    // Солод: 6 кг × 2/3 × (75/65) = 4.615 кг — иначе на 65%-оборудовании недобрали бы OG.
    expect(snapshotAmount(batch, "m1")).toBeCloseTo(4.615, 2);
    // Сахар усваивается полностью, эффективность затирания на него не действует:
    // 1 кг × 2/3 = 0.667 кг, без дожима.
    expect(snapshotAmount(batch, "s1")).toBeCloseTo(0.667, 2);
    // Хмель — только по объёму: 30 г → 20 г.
    expect(snapshotAmount(batch, "h1")).toBe(20);
    // План помнит обе эффективности — по ним списание и матч повторят тот же дожим.
    expect(batch.brewPlanSnapshot.recipe.efficiencyPct).toBe(65);
    expect(batch.brewPlanSnapshot.recipe.recipeEfficiencyPct).toBe(75);
  });

  it("«на моём оборудовании»: профиль подставлен целиком (потери, выпаривание), а не только объём", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_30L, {
      targetBatchVolumeL: 20,
      equipmentProfileId: PROFILE_ID
    });

    const snapshot = batch.equipmentProfileSnapshot as any;
    expect(snapshot).toMatchObject({
      id: PROFILE_ID,
      name: "Моя пивоварня",
      targetBatchVolumeL: 20,
      evaporationRateLPerHr: 2.5,
      trubChillerLossL: 1,
      grainAbsorptionLPerKg: 0.9
    });
    // Тот же профиль уезжает в план варочного дня — водный план считается по МОЕМУ котлу.
    expect((batch.brewPlanSnapshot.equipmentProfileSnapshot as any)?.id).toBe(PROFILE_ID);
  });

  it("чужой профиль оборудования не подставляется: NOT_FOUND, партия не создаётся", async () => {
    fixtures.equipmentProfiles = [{ ...myProfile(), userId: OTHER_USER }];

    await expect(
      createBrewBatchFromRecipe(USER_ID, RECIPE_30L, { targetBatchVolumeL: 20, equipmentProfileId: PROFILE_ID })
    ).rejects.toThrow("NOT_FOUND");
    expect(store.brewBatches).toHaveLength(0);
  });

  it("списание идёт в объёме ПАРТИИ (20 л), а не рецепта (30 л)", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_30L, { targetBatchVolumeL: 20 });
    await consumeBrewBatchInventory(USER_ID, batch.id);

    // Движок аллокаций масштабирует строки рецепта под targetBatchVolumeL (см.
    // features/recipes/batch-scale.ts) — партия обязана передать ему СВОЙ объём.
    expect(fixtures.consumeCalls.length).toBeGreaterThan(0);
    for (const call of fixtures.consumeCalls) {
      expect(call).toMatchObject({ brewBatchId: batch.id, targetBatchVolumeL: 20, efficiencyFactor: 1 });
    }
  });

  it("списание получает ТОТ ЖЕ дожим засыпи, что зашит в план (иначе гид и склад разойдутся)", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_30L, {
      targetBatchVolumeL: 20,
      equipmentProfileId: PROFILE_ID
    });
    await consumeBrewBatchInventory(USER_ID, batch.id);

    expect(fixtures.consumeCalls.length).toBeGreaterThan(0);
    for (const call of fixtures.consumeCalls) {
      expect(call.targetBatchVolumeL).toBe(20);
      expect(call.efficiencyFactor).toBeCloseTo(75 / 65, 4);
    }
  });
});

// --- getBrewBatchById: гейт владельца ----------------------------------------

describe("getBrewBatchById — гейт владельца", () => {
  it("возвращает партию владельцу", async () => {
    const seeded = seedBatch();
    const batch = await getBrewBatchById(USER_ID, seeded.id);
    expect(batch?.id).toBe(seeded.id);
  });

  it("возвращает null для чужого пользователя", async () => {
    const seeded = seedBatch();
    expect(await getBrewBatchById(OTHER_USER, seeded.id)).toBeNull();
  });
});

// --- updateBrewBatchStatus: переходы + временные метки ------------------------

describe("updateBrewBatchStatus — переходы и метки времени", () => {
  it("переход в brewing проставляет startedAt и updatedAt, completedAt остаётся null", async () => {
    const seeded = seedBatch();
    const updated = await updateBrewBatchStatus(USER_ID, seeded.id, "brewing");
    expect(updated.status).toBe("brewing");
    expect(updated.startedAt).toBeInstanceOf(Date);
    expect(updated.completedAt).toBeNull();
  });

  it("переход в completed проставляет completedAt и сохраняет ранее выставленный startedAt", async () => {
    const startedAt = new Date(Date.UTC(2026, 2, 1));
    const seeded = seedBatch({ status: "fermenting", startedAt });
    const updated = await updateBrewBatchStatus(USER_ID, seeded.id, "completed");
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBeInstanceOf(Date);
    // startedAt не перезатёрт undefined-ом (drizzle-семантика set).
    expect(updated.startedAt?.getTime()).toBe(startedAt.getTime());
  });

  it("переход в fermenting не трогает startedAt/completedAt", async () => {
    const seeded = seedBatch({ status: "brewing", startedAt: new Date(Date.UTC(2026, 2, 1)) });
    const updated = await updateBrewBatchStatus(USER_ID, seeded.id, "fermenting");
    expect(updated.status).toBe("fermenting");
    expect(updated.startedAt).toBeInstanceOf(Date);
    expect(updated.completedAt).toBeNull();
  });

  it("бросает NOT_FOUND для чужой партии и несуществующего id", async () => {
    const seeded = seedBatch();
    await expect(updateBrewBatchStatus(OTHER_USER, seeded.id, "brewing")).rejects.toThrow("NOT_FOUND");
    await expect(updateBrewBatchStatus(USER_ID, uuid(999), "brewing")).rejects.toThrow("NOT_FOUND");
  });
});

// --- Списки варок ------------------------------------------------------------

describe("списки варок", () => {
  it("listBrewBatchesForUser отдаёт партии пользователя новыми сверху и скоупит по userId", async () => {
    const a = seedBatch();
    const b = seedBatch();
    seedBatch({ userId: OTHER_USER }); // чужая — не должна попасть
    const list = await listBrewBatchesForUser(USER_ID);
    expect(list.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(list[0].recipeTitle).toBe("Тестовый IPA");
  });

  it("listActiveBrewBatchesForUser отдаёт только активные с агрегатами журнала замеров", async () => {
    const planned = seedBatch({ status: "planned" });
    const brewing = seedBatch({ status: "brewing" });
    seedBatch({ status: "completed" }); // терминальная — исключается
    seedBatch({ status: "cancelled" }); // терминальная — исключается

    // Два замера у brewing-партии для агрегата (последний + число).
    store.brewMeasurements.push(
      { id: uuid(701), userId: USER_ID, brewBatchId: brewing.id, gravitySg: 1.05, takenAt: new Date(Date.UTC(2026, 2, 10)), note: null, createdAt: new Date(Date.UTC(2026, 2, 10)) },
      { id: uuid(702), userId: USER_ID, brewBatchId: brewing.id, gravitySg: 1.02, takenAt: new Date(Date.UTC(2026, 2, 15)), note: null, createdAt: new Date(Date.UTC(2026, 2, 15)) }
    );

    const active = await listActiveBrewBatchesForUser(USER_ID);
    const ids = active.map((x) => x.id).sort();
    expect(ids).toEqual([planned.id, brewing.id].sort());

    const brewingItem = active.find((x) => x.id === brewing.id)!;
    expect(brewingItem.measurementCount).toBe(2);
    expect(brewingItem.lastMeasurementAt?.getTime()).toBe(new Date(Date.UTC(2026, 2, 15)).getTime());

    const plannedItem = active.find((x) => x.id === planned.id)!;
    expect(plannedItem.measurementCount).toBe(0);
    expect(plannedItem.lastMeasurementAt).toBeNull();
  });

  it("listActiveBrewBatchesForUser возвращает [] когда активных нет", async () => {
    seedBatch({ status: "completed" });
    expect(await listActiveBrewBatchesForUser(USER_ID)).toEqual([]);
  });

  it("listBrewBatchesForRecipe скоупит по рецепту и пользователю", async () => {
    const mine = seedBatch({ recipeId: RECIPE_ID });
    seedBatch({ recipeId: uuid(77) }); // другой рецепт
    const list = await listBrewBatchesForRecipe(USER_ID, RECIPE_ID);
    expect(list.map((x) => x.id)).toEqual([mine.id]);
  });
});

// --- Журнал замеров ----------------------------------------------------------

describe("журнал замеров", () => {
  it("addBrewMeasurement пишет замер и обрезает заметку; listBrewMeasurements — oldest→newest", async () => {
    const seeded = seedBatch();
    await addBrewMeasurement(USER_ID, seeded.id, { gravitySg: 1.012, takenAt: new Date(Date.UTC(2026, 3, 10)), note: "  FG  " });
    await addBrewMeasurement(USER_ID, seeded.id, { gravitySg: 1.05, takenAt: new Date(Date.UTC(2026, 3, 1)), note: null });

    const list = await listBrewMeasurements(USER_ID, seeded.id);
    expect(list.map((m) => m.gravitySg)).toEqual([1.05, 1.012]); // сортировка по takenAt
    const fg = list.find((m) => m.gravitySg === 1.012)!;
    expect(fg.note).toBe("FG");
  });

  it("addBrewMeasurement с пустой заметкой сохраняет null", async () => {
    const seeded = seedBatch();
    const m = await addBrewMeasurement(USER_ID, seeded.id, { gravitySg: 1.04, note: "   " });
    expect(m.note).toBeNull();
    // takenAt по умолчанию проставляется (now).
    expect(m.takenAt).toBeInstanceOf(Date);
  });

  it("addBrewMeasurement бросает NOT_FOUND для чужой партии", async () => {
    const seeded = seedBatch();
    await expect(addBrewMeasurement(OTHER_USER, seeded.id, { gravitySg: 1.05 })).rejects.toThrow("NOT_FOUND");
  });

  it("listBrewMeasurements для чужой партии возвращает [] (без исключения)", async () => {
    const seeded = seedBatch();
    store.brewMeasurements.push({ id: uuid(710), userId: USER_ID, brewBatchId: seeded.id, gravitySg: 1.05, takenAt: new Date(), note: null, createdAt: new Date() });
    expect(await listBrewMeasurements(OTHER_USER, seeded.id)).toEqual([]);
  });

  it("deleteBrewMeasurement удаляет свой замер и бросает NOT_FOUND на чужой/несуществующий", async () => {
    const seeded = seedBatch();
    const m = await addBrewMeasurement(USER_ID, seeded.id, { gravitySg: 1.05 });

    await expect(deleteBrewMeasurement(OTHER_USER, seeded.id, m.id)).rejects.toThrow("NOT_FOUND");
    await expect(deleteBrewMeasurement(USER_ID, seeded.id, uuid(888))).rejects.toThrow("NOT_FOUND");

    await deleteBrewMeasurement(USER_ID, seeded.id, m.id);
    expect(await listBrewMeasurements(USER_ID, seeded.id)).toHaveLength(0);
  });

  it("getBrewBatchDetail считает сводку OG/FG/ABV и подмешивает цели рецепта", async () => {
    const seeded = seedBatch();
    await addBrewMeasurement(USER_ID, seeded.id, { gravitySg: 1.05, takenAt: new Date(Date.UTC(2026, 3, 1)) });
    await addBrewMeasurement(USER_ID, seeded.id, { gravitySg: 1.01, takenAt: new Date(Date.UTC(2026, 3, 14)), isFinal: true });

    const detail = await getBrewBatchDetail(USER_ID, seeded.id);
    expect(detail).not.toBeNull();
    expect(detail!.measurements).toHaveLength(2);
    expect(detail!.summary.og).toBe(1.05);
    expect(detail!.summary.fg).toBe(1.01);
    expect(detail!.summary.abv).toBeCloseTo(5.25, 2);
    expect(detail!.summary.target).toEqual({ og: 1.052, fg: 1.012, abv: 5.2 });
  });

  it("getBrewBatchDetail возвращает null для чужой партии", async () => {
    const seeded = seedBatch();
    expect(await getBrewBatchDetail(OTHER_USER, seeded.id)).toBeNull();
  });
});

// --- Гид варочного дня (шаги) -------------------------------------------------

describe("setBrewDayStepState — шаги brew-day", () => {
  it("отмечает валидный шаг done, прогресс сохраняется с updatedAt", async () => {
    const seeded = seedBatch();
    const progress = await setBrewDayStepState(USER_ID, seeded.id, "mash:m1", { done: true });
    expect(progress.steps["mash:m1"]).toEqual({ done: true, timerStartedAt: null });
    expect(progress.updatedAt).not.toBeNull();
    // Сохранилось в сторе.
    const reread = await getBrewBatchById(USER_ID, seeded.id);
    expect(reread!.brewDayProgress.steps["mash:m1"].done).toBe(true);
  });

  it("старт таймера, затем done — поля не затирают друг друга", async () => {
    const seeded = seedBatch();
    await setBrewDayStepState(USER_ID, seeded.id, "boil:timer", { timerStartedAt: "2026-03-01T10:00:00.000Z" });
    const progress = await setBrewDayStepState(USER_ID, seeded.id, "boil:timer", { done: true });
    expect(progress.steps["boil:timer"]).toEqual({ done: true, timerStartedAt: "2026-03-01T10:00:00.000Z" });
  });

  it("отклоняет неизвестный шаг (UNKNOWN_STEP)", async () => {
    const seeded = seedBatch();
    await expect(setBrewDayStepState(USER_ID, seeded.id, "bogus:step", { done: true })).rejects.toThrow("UNKNOWN_STEP");
  });

  it("бросает NOT_FOUND для чужой партии", async () => {
    const seeded = seedBatch();
    await expect(setBrewDayStepState(OTHER_USER, seeded.id, "mash:m1", { done: true })).rejects.toThrow("NOT_FOUND");
  });
});

// --- Заметки -----------------------------------------------------------------

describe("updateBrewBatchNotes", () => {
  it("обрезает заметки, пустые → null", async () => {
    const seeded = seedBatch();
    const withNotes = await updateBrewBatchNotes(USER_ID, seeded.id, "  заметка  ");
    expect(withNotes.notes).toBe("заметка");
    const cleared = await updateBrewBatchNotes(USER_ID, seeded.id, "   ");
    expect(cleared.notes).toBeNull();
  });

  it("бросает NOT_FOUND для чужой партии", async () => {
    const seeded = seedBatch();
    await expect(updateBrewBatchNotes(OTHER_USER, seeded.id, "x")).rejects.toThrow("NOT_FOUND");
  });
});

describe("updateBrewBatchTastingNotes", () => {
  it("обрезает дегустацию, пустые → null", async () => {
    const seeded = seedBatch();
    const withNotes = await updateBrewBatchTastingNotes(USER_ID, seeded.id, "  сухой финиш  ");
    expect(withNotes.tastingNotes).toBe("сухой финиш");
    const cleared = await updateBrewBatchTastingNotes(USER_ID, seeded.id, "   ");
    expect(cleared.tastingNotes).toBeNull();
  });

  it("бросает NOT_FOUND для чужой партии", async () => {
    const seeded = seedBatch();
    await expect(updateBrewBatchTastingNotes(OTHER_USER, seeded.id, "x")).rejects.toThrow("NOT_FOUND");
  });

  // Корень дефекта A4: обе секции сидели на одной колонке notes, и дегустация,
  // сохранённая на завершённой партии, затирала заметки варочного дня.
  it("дегустация и заметки о варке живут в разных полях и не затирают друг друга", async () => {
    const seeded = seedBatch({ status: "completed" as BrewBatchStatus });

    await updateBrewBatchNotes(USER_ID, seeded.id, "Затор держал 66 °C, охлаждение затянулось");
    const afterTasting = await updateBrewBatchTastingNotes(USER_ID, seeded.id, "Хлебный солод, мягкая горечь");

    expect(afterTasting.notes).toBe("Затор держал 66 °C, охлаждение затянулось");
    expect(afterTasting.tastingNotes).toBe("Хлебный солод, мягкая горечь");

    const afterNotes = await updateBrewBatchNotes(USER_ID, seeded.id, "Дополнил задним числом");
    expect(afterNotes.notes).toBe("Дополнил задним числом");
    expect(afterNotes.tastingNotes).toBe("Хлебный солод, мягкая горечь");
  });
});

// --- Дата варки (plannedFor) --------------------------------------------------

describe("updateBrewBatchPlannedFor", () => {
  it("устанавливает и сбрасывает дату у запланированной партии", async () => {
    const seeded = seedBatch({ status: "planned" });
    const plannedFor = new Date(Date.UTC(2026, 7, 1, 12, 0, 0));

    const withDate = await updateBrewBatchPlannedFor(USER_ID, seeded.id, plannedFor);
    expect(withDate.plannedFor?.getTime()).toBe(plannedFor.getTime());

    const cleared = await updateBrewBatchPlannedFor(USER_ID, seeded.id, null);
    expect(cleared.plannedFor).toBeNull();
  });

  it("бросает INVALID_STATUS для партии не в статусе planned", async () => {
    const seeded = seedBatch({ status: "brewing" });
    await expect(
      updateBrewBatchPlannedFor(USER_ID, seeded.id, new Date(Date.UTC(2026, 7, 1)))
    ).rejects.toThrow("INVALID_STATUS");
  });

  it("бросает NOT_FOUND для чужой партии", async () => {
    const seeded = seedBatch({ status: "planned" });
    await expect(
      updateBrewBatchPlannedFor(OTHER_USER, seeded.id, new Date(Date.UTC(2026, 7, 1)))
    ).rejects.toThrow("NOT_FOUND");
  });
});

// --- Списание / возврат склада -----------------------------------------------

describe("инвентарь варки: consume / restore", () => {
  it("getBrewBatchInventoryView: null для чужой, пустой вид без списаний", async () => {
    const seeded = seedBatch();
    expect(await getBrewBatchInventoryView(OTHER_USER, seeded.id)).toBeNull();

    const view = await getBrewBatchInventoryView(USER_ID, seeded.id);
    expect(view).not.toBeNull();
    expect(view!.hasConsumed).toBe(false);
    expect(view!.canRestore).toBe(false);
    expect(view!.consumed).toEqual([]);
  });

  it("consume для терминального статуса даёт INVALID_STATUS", async () => {
    const completed = seedBatch({ status: "completed" });
    await expect(consumeBrewBatchInventory(USER_ID, completed.id)).rejects.toThrow("INVALID_STATUS");
    const cancelled = seedBatch({ status: "cancelled" });
    await expect(consumeBrewBatchInventory(USER_ID, cancelled.id)).rejects.toThrow("INVALID_STATUS");
  });

  it("consume для чужой партии даёт NOT_FOUND", async () => {
    const seeded = seedBatch({ status: "brewing" });
    await expect(consumeBrewBatchInventory(OTHER_USER, seeded.id)).rejects.toThrow("NOT_FOUND");
  });

  // Гонка «завершение против списания»: статус, прочитанный ДО транзакции, к моменту
  // взятия блокировки мог протухнуть (варку завершили в соседней вкладке). Гейт обязан
  // перечитать его под локом, иначе списание уезжает в терминальную партию — а вернуть
  // склад оттуда уже нечем.
  it("партию завершили, пока мы ждали блокировку → INVALID_STATUS, склад не тронут", async () => {
    const seeded = seedBatch({ status: "brewing" });
    const realTransaction = (fakeDb as any).transaction;
    const spy = vi
      .spyOn(fakeDb as any, "transaction")
      .mockImplementation(async (cb: any) => {
        // Конкурент завершил варку ровно между чтением статуса и блокировкой строки.
        const row = store.brewBatches.find((batch: any) => batch.id === seeded.id);
        row.status = "completed";
        return realTransaction(cb);
      });

    try {
      await expect(consumeBrewBatchInventory(USER_ID, seeded.id)).rejects.toThrow("INVALID_STATUS");
    } finally {
      spy.mockRestore();
    }

    expect(store.userIngredients[0].normalizedQuantity).toBe(100);
    expect(store.inventoryTransactions).toHaveLength(0);
    expect(store.recipeInventoryAllocations).toHaveLength(0);
  });

  it("consume списывает остаток, помечает партию списанной; повторный consume → ALREADY_CONSUMED", async () => {
    const seeded = seedBatch({ status: "brewing" });
    const view = await consumeBrewBatchInventory(USER_ID, seeded.id);

    expect(view.hasConsumed).toBe(true);
    expect(view.canRestore).toBe(true);
    expect(view.batchAlreadyConsumed).toBe(true);
    expect(view.consumed).toHaveLength(1);
    expect(view.consumed[0]).toMatchObject({ quantityNormalized: 50, normalizedUnit: "g", ingredientDisplayName: "Cascade" });
    // Списали ровно сколько нужно — «нужно было» не показываем (это был бы шум).
    expect(view.consumed[0].requiredQuantityNormalized).toBeNull();
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);

    await expect(consumeBrewBatchInventory(USER_ID, seeded.id)).rejects.toThrow("ALREADY_CONSUMED");
  });

  // H2: дрожжей на складе меньше, чем требует рецепт → списание ужимается до остатка
  // (варку это не роняет). Раньше кламп был немым: пользователь видел «Списано» и не
  // узнавал, что дрожжей ушло меньше рецепта.
  it("кламп дрожжей доезжает до вида: строка честно показывает, что списали меньше нужного", async () => {
    fixtures.consumePlan = [{ inventoryItemId: ITEM_ID, quantity: 11, unit: "g", requested: 22 }];
    const seeded = seedBatch({ status: "brewing" });

    const view = await consumeBrewBatchInventory(USER_ID, seeded.id);

    expect(view.consumed[0]).toMatchObject({
      quantityNormalized: 11,
      requiredQuantityNormalized: 22,
      normalizedUnit: "g"
    });
  });

  it("restore откатывает списание: остаток возвращается, аллокация освобождается, повторное списание снова доступно", async () => {
    const seeded = seedBatch({ status: "brewing" });
    await consumeBrewBatchInventory(USER_ID, seeded.id);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);

    const { view, restoredItemCount } = await restoreBrewBatchInventory(USER_ID, seeded.id);
    expect(restoredItemCount).toBe(1);
    expect(store.userIngredients[0].normalizedQuantity).toBe(100);
    expect(view.hasConsumed).toBe(false);
    expect(view.canRestore).toBe(false);
    expect(view.batchAlreadyConsumed).toBe(false);
    // Журнал движений: consume + компенсирующий release.
    expect(view.log.map((entry) => entry.type)).toEqual(["consume", "release"]);

    // После возврата рецепт снова можно списать.
    const reconsumed = await consumeBrewBatchInventory(USER_ID, seeded.id);
    expect(reconsumed.hasConsumed).toBe(true);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);
  });

  // Возврат берёт складские строки в том же порядке, что и списание (по позиции
  // склада), а не в порядке журнала. Иначе два возврата разных партий, поделивших
  // один солод, захватывали бы строки встречно и вставали в дедлок — Postgres убивает
  // одну транзакцию, пользователь получает 500 на «Вернуть на склад».
  it("restore обходит позиции в порядке склада, даже если журнал писался в обратном", async () => {
    const SECOND_ITEM = uuid(22);
    store.userIngredients.push({
      id: SECOND_ITEM,
      userId: USER_ID,
      ingredientDisplayNameSnapshot: "Magnum",
      normalizedQuantity: 80,
      normalizedUnit: "g",
      enteredQuantity: 80,
      enteredUnit: "g",
      archivedAt: null,
      updatedAt: new Date(Date.UTC(2026, 0, 1))
    });
    // Журнал ляжет в обратном порядке позиций: сначала «старший» id, потом «младший».
    const [firstById, lastById] = [ITEM_ID, SECOND_ITEM].sort((left, right) => left.localeCompare(right));
    fixtures.consumePlan = [
      { inventoryItemId: lastById, quantity: 10, unit: "g" },
      { inventoryItemId: firstById, quantity: 20, unit: "g" }
    ];

    const seeded = seedBatch({ status: "brewing" });
    await consumeBrewBatchInventory(USER_ID, seeded.id);

    await restoreBrewBatchInventory(USER_ID, seeded.id);

    const releaseOrder = store.inventoryTransactions
      .filter((txn: any) => txn.type === "release")
      .map((txn: any) => txn.inventoryItemId);
    expect(releaseOrder).toEqual([firstById, lastById]);
  });

  it("restore идемпотентен: повторный возврат ничего не меняет (restoredItemCount = 0)", async () => {
    const seeded = seedBatch({ status: "brewing" });
    await consumeBrewBatchInventory(USER_ID, seeded.id);
    await restoreBrewBatchInventory(USER_ID, seeded.id);
    const { restoredItemCount } = await restoreBrewBatchInventory(USER_ID, seeded.id);
    expect(restoredItemCount).toBe(0);
    expect(store.userIngredients[0].normalizedQuantity).toBe(100);
  });

  it("restore для чужой партии даёт NOT_FOUND", async () => {
    const seeded = seedBatch({ status: "brewing" });
    await expect(restoreBrewBatchInventory(OTHER_USER, seeded.id)).rejects.toThrow("NOT_FOUND");
  });

  // Позиция заведена «в пачках», а склад раскрыл пачку в граммы (entered_unit=pack,
  // normalized_unit=g). При возврате обратный пересчёт 11 г → 1 пачка невозможен без
  // курса пачки: раньше restore звал конвертер без него, тот отдавал null, и
  // entered_quantity навсегда оставался нулём от списания — normalized_quantity
  // показывал 11 г, а колонка ввода врала «0 пачек».
  it("restore возвращает пачечную позицию в её единицах: entered_quantity не застревает на нуле", async () => {
    const packItemId = uuid(22);
    store.userIngredients.push({
      id: packItemId,
      userId: USER_ID,
      ingredientDisplayNameSnapshot: "Safale US-05",
      normalizedQuantity: 11,
      normalizedUnit: "g",
      enteredQuantity: 1,
      enteredUnit: "pack",
      archivedAt: null,
      updatedAt: new Date(Date.UTC(2026, 0, 1))
    });
    fixtures.packEquivalents[packItemId] = { normalizedUnit: "g", normalizedQuantity: 11 };
    fixtures.consumePlan = [{ inventoryItemId: packItemId, quantity: 11, unit: "g" }];

    const seeded = seedBatch({ status: "brewing" });
    await consumeBrewBatchInventory(USER_ID, seeded.id);

    const packItem = () => store.userIngredients.find((item: any) => item.id === packItemId);
    expect(packItem().normalizedQuantity).toBe(0);

    const { restoredItemCount } = await restoreBrewBatchInventory(USER_ID, seeded.id);

    expect(restoredItemCount).toBe(1);
    expect(packItem().normalizedQuantity).toBe(11);
    expect(packItem().enteredQuantity).toBe(1);
    expect(packItem().enteredUnit).toBe("pack");
  });

  // Регресс A7: пока первая партия ЕЩЁ ВАРИТСЯ, вторая партия того же рецепта
  // должна списывать свой склад. Защита «по рецепту» молча оставляла её без
  // единой аллокации: пользователь просил списать, склад не менялся, а страница
  // партии писала «уже списаны».
  it("вторая партия того же рецепта списывает свой склад, пока первая ещё активна", async () => {
    const first = seedBatch({ status: "brewing" });
    const firstView = await consumeBrewBatchInventory(USER_ID, first.id);
    expect(firstView.hasConsumed).toBe(true);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);

    // Первая партия НЕ завершена — просто варится дальше.
    const second = seedBatch({ status: "brewing" });
    const secondView = await consumeBrewBatchInventory(USER_ID, second.id);

    // Списание второй партии реально уменьшило остаток (50 → 0) и попало в её журнал.
    expect(secondView.hasConsumed).toBe(true);
    expect(secondView.batchAlreadyConsumed).toBe(true);
    expect(secondView.consumed).toHaveLength(1);
    expect(store.userIngredients[0].normalizedQuantity).toBe(0);

    // Журналы партий не перемешались: у каждой своё списание.
    expect(secondView.log.filter((entry) => entry.type === "consume")).toHaveLength(1);
    const firstAfter = await getBrewBatchInventoryView(USER_ID, first.id);
    expect(firstAfter!.log.filter((entry) => entry.type === "consume")).toHaveLength(1);
    expect(firstAfter!.hasConsumed).toBe(true);
  });

  // Возврат склада второй партией не должен трогать списание первой.
  it("возврат второй партии возвращает только её списание", async () => {
    const first = seedBatch({ status: "brewing" });
    await consumeBrewBatchInventory(USER_ID, first.id);
    const second = seedBatch({ status: "brewing" });
    await consumeBrewBatchInventory(USER_ID, second.id);
    expect(store.userIngredients[0].normalizedQuantity).toBe(0);

    const { restoredItemCount } = await restoreBrewBatchInventory(USER_ID, second.id);

    expect(restoredItemCount).toBe(1);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);
    const firstAfter = await getBrewBatchInventoryView(USER_ID, first.id);
    expect(firstAfter!.hasConsumed).toBe(true);
    expect(firstAfter!.batchAlreadyConsumed).toBe(true);
  });

  // Регресс П2 (docs/brew-day-assistant-audit-round2.md): без batch-aware защиты
  // рецепт был варибелен ровно один раз навсегда — завершение первой партии
  // никогда не освобождало её consumed-аллокации, поэтому вторая партия того же
  // рецепта не могла списать даже новую закупку ингредиента.
  it("завершение ПЕРВОЙ партии не блокирует списание ВТОРОЙ партии того же рецепта (новая закупка)", async () => {
    const first = seedBatch({ status: "brewing" });
    await consumeBrewBatchInventory(USER_ID, first.id);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);

    await updateBrewBatchStatus(USER_ID, first.id, "fermenting");
    await updateBrewBatchStatus(USER_ID, first.id, "completed");

    // Новая закупка того же ингредиента перед второй варкой.
    store.userIngredients[0].normalizedQuantity = 100;
    store.userIngredients[0].enteredQuantity = 100;

    const second = seedBatch({ status: "brewing" });
    const view = await consumeBrewBatchInventory(USER_ID, second.id);

    expect(view.hasConsumed).toBe(true);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);
  });
});

// --- Валидация контрактов (zod) ----------------------------------------------

describe("addBrewMeasurementSchema — валидация замеров", () => {
  it("отвергает плотность вне диапазона [0.99, 1.2]", () => {
    expect(addBrewMeasurementSchema.safeParse({ gravitySg: 0.5 }).success).toBe(false);
    expect(addBrewMeasurementSchema.safeParse({ gravitySg: 1.5 }).success).toBe(false);
  });

  it("отвергает дату замера в будущем", () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const parsed = addBrewMeasurementSchema.safeParse({ gravitySg: 1.05, takenAt: future });
    expect(parsed.success).toBe(false);
  });

  it("отвергает заметку длиннее 500 символов", () => {
    const parsed = addBrewMeasurementSchema.safeParse({ gravitySg: 1.05, note: "x".repeat(501) });
    expect(parsed.success).toBe(false);
  });

  it("приводит строковую плотность к числу и принимает валидный замер", () => {
    const parsed = addBrewMeasurementSchema.safeParse({ gravitySg: "1.048", note: "  ок  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.gravitySg).toBeCloseTo(1.048, 3);
      expect(parsed.data.note).toBe("ок");
    }
  });
});

describe("brewDayStepStatePatchSchema — валидация патча шага", () => {
  it("отвергает пустой патч", () => {
    expect(brewDayStepStatePatchSchema.safeParse({}).success).toBe(false);
  });

  it("принимает патч только с done и патч только с timerStartedAt=null", () => {
    expect(brewDayStepStatePatchSchema.safeParse({ done: true }).success).toBe(true);
    expect(brewDayStepStatePatchSchema.safeParse({ timerStartedAt: null }).success).toBe(true);
  });
});

// --- Сквозной журнал варки ----------------------------------------------------

describe("сквозной журнал: рецепт → brew-day → замеры → склад → статус → возврат", () => {
  it("проходит полный жизненный цикл варки", async () => {
    // 1. Старт из рецепта.
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID, { name: "Сквозная" });
    expect(batch.status).toBe("planned");

    // 2. Отметка шага варочного дня.
    const progress = await setBrewDayStepState(USER_ID, batch.id, "mash:m1", { done: true });
    expect(progress.steps["mash:m1"].done).toBe(true);

    // 3. Старт варки.
    const brewing = await updateBrewBatchStatus(USER_ID, batch.id, "brewing");
    expect(brewing.startedAt).toBeInstanceOf(Date);

    // 4. Замер OG.
    await addBrewMeasurement(USER_ID, batch.id, { gravitySg: 1.05, takenAt: new Date(Date.UTC(2026, 4, 1)) });

    // 5. Списание ингредиентов на варку.
    const consumeView = await consumeBrewBatchInventory(USER_ID, batch.id);
    expect(consumeView.hasConsumed).toBe(true);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);

    // 6. Брожение + замер FG (помечен финальным).
    await updateBrewBatchStatus(USER_ID, batch.id, "fermenting");
    await addBrewMeasurement(USER_ID, batch.id, { gravitySg: 1.012, takenAt: new Date(Date.UTC(2026, 4, 15)), isFinal: true });

    // 7. Завершение.
    const completed = await updateBrewBatchStatus(USER_ID, batch.id, "completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.startedAt).toBeInstanceOf(Date);

    // 8. Сводка детали: OG/FG/ABV vs цель.
    const detail = await getBrewBatchDetail(USER_ID, batch.id);
    expect(detail!.summary.og).toBe(1.05);
    expect(detail!.summary.fg).toBe(1.012);
    expect(detail!.summary.abv).toBeGreaterThan(0);
    expect(detail!.summary.target?.og).toBe(1.052);

    // 9. Возврат склада (по кнопке / при разборе варки).
    const { restoredItemCount, view } = await restoreBrewBatchInventory(USER_ID, batch.id);
    expect(restoredItemCount).toBe(1);
    expect(store.userIngredients[0].normalizedQuantity).toBe(100);
    expect(view.hasConsumed).toBe(false);
  });
});
