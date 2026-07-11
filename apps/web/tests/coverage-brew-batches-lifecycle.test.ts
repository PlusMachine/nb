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
      userIngredients: ref("userIngredients", ["id", "userId"]),
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
      consumePlan: [] as any[]
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

// Граница «движок аллокаций склада»: имитируем реальный эффект consume —
// уменьшаем остаток, помечаем аллокацию consumed и пишем consume-транзакцию с
// brewBatchId и allocationId в мете (чтобы restore из brew-batches мог откатить).
vi.mock("@/features/recipes/inventory-service", () => ({
  autoAllocateRecipeInventoryFromStock: async () => {},
  consumeRecipeInventoryAllocations: async (userId: string, recipeId: string, opts: any) => {
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
  convertNormalizedQuantityToEnteredUnit: (quantity: number, fromUnit: string, toUnit: string) =>
    fromUnit === toUnit ? quantity : null,
  // Batch-aware реализация для мока: consumed-аллокация блокирует реюз рецепта,
  // только если у неё нет brewBatchId (легаси/вне партии) ИЛИ её партия ещё в
  // активном статусе (planned/brewing/fermenting) — зеркалит реальную логику в
  // features/recipes/inventory-service.ts (см. docs/brew-day-assistant-audit-
  // round2.md, П2).
  hasBlockingConsumedAllocations: async (userId: string, recipeId: string) => {
    const activeBrewBatchStatuses = ["planned", "brewing", "fermenting"];
    const consumed = store.recipeInventoryAllocations.filter(
      (a: any) => a.userId === userId && a.recipeId === recipeId && a.status === "consumed"
    );
    return consumed.some((a: any) => {
      if (!a.brewBatchId) {
        return true;
      }
      const batch = store.brewBatches.find((b: any) => b.id === a.brewBatchId);
      return !batch || activeBrewBatchStatuses.includes(batch.status);
    });
  }
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
  updateBrewBatchStatus
} from "@/features/brew-batches/service";
import {
  consumeBrewBatchInventory,
  getBrewBatchInventoryView,
  restoreBrewBatchInventory
} from "@/features/brew-batches/inventory";
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
    deviceId: null,
    brewPlanSnapshot: validSnapshot(overrides.recipeId ?? RECIPE_ID),
    brewDayProgress: null,
    recipeSnapshot: { title: "Тестовый IPA" },
    equipmentProfileSnapshot: null,
    waterPlanSnapshot: null,
    deviceHints: [],
    notes: null,
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
});

// --- createBrewBatchFromRecipe -----------------------------------------------

describe("createBrewBatchFromRecipe", () => {
  it("создаёт планируемую партию из рецепта владельца: снапшот плана + дефолтное имя (F5: первая партия = название рецепта) + снапшот рецепта", async () => {
    const batch = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);

    expect(batch.status).toBe("planned");
    expect(batch.name).toBe("Тестовый IPA");
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

  it("F5: вторая партия того же рецепта того же юзера получает имя «<Название> №2», третья — «№3»", async () => {
    const first = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    const second = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    const third = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);

    expect(first.name).toBe("Тестовый IPA");
    expect(second.name).toBe("Тестовый IPA №2");
    expect(third.name).toBe("Тестовый IPA №3");
  });

  it("F5: отменённые партии тоже считаются в нумерации", async () => {
    const first = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    await updateBrewBatchStatus(USER_ID, first.id, "cancelled");
    const second = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    expect(second.name).toBe("Тестовый IPA №2");
  });

  it("F5: партии ДРУГОГО юзера того же рецепта не влияют на счёт нумерации", async () => {
    const PUBLIC_RECIPE = uuid(5);
    fixtures.recipeDetails.push(makeRecipeDetail(PUBLIC_RECIPE, USER_ID, "published"));

    const other = await createBrewBatchFromRecipe(OTHER_USER, PUBLIC_RECIPE);
    expect(other.name).toBe("Тестовый IPA");

    const mine = await createBrewBatchFromRecipe(USER_ID, PUBLIC_RECIPE);
    expect(mine.name).toBe("Тестовый IPA");
  });

  it("F5: input.name, если передан, приоритетнее автоимени", async () => {
    await createBrewBatchFromRecipe(USER_ID, RECIPE_ID);
    const named = await createBrewBatchFromRecipe(USER_ID, RECIPE_ID, { name: "Особая партия" });
    expect(named.name).toBe("Особая партия");
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

  it("consume списывает остаток, помечает рецепт списанным; повторный consume → ALREADY_CONSUMED", async () => {
    const seeded = seedBatch({ status: "brewing" });
    const view = await consumeBrewBatchInventory(USER_ID, seeded.id);

    expect(view.hasConsumed).toBe(true);
    expect(view.canRestore).toBe(true);
    expect(view.recipeAlreadyConsumed).toBe(true);
    expect(view.consumed).toHaveLength(1);
    expect(view.consumed[0]).toMatchObject({ quantityNormalized: 50, normalizedUnit: "g", ingredientDisplayName: "Cascade" });
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);

    await expect(consumeBrewBatchInventory(USER_ID, seeded.id)).rejects.toThrow("ALREADY_CONSUMED");
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
    expect(view.recipeAlreadyConsumed).toBe(false);
    // Журнал движений: consume + компенсирующий release.
    expect(view.log.map((entry) => entry.type)).toEqual(["consume", "release"]);

    // После возврата рецепт снова можно списать.
    const reconsumed = await consumeBrewBatchInventory(USER_ID, seeded.id);
    expect(reconsumed.hasConsumed).toBe(true);
    expect(store.userIngredients[0].normalizedQuantity).toBe(50);
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
