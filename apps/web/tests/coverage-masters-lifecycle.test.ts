import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие жизненного цикла витрины мастеров (docs/masters-showcase.md, M1):
// сервис-слой тестируется БЕЗ реальной БД — `@nb/db` мокается in-memory
// (vi.hoisted + vi.mock), структура мок-харнесса скопирована со стиля
// tests/coverage-brew-batches-lifecycle.test.ts / tests/coverage-content-articles-crud.test.ts.
// `@/lib/auth` и `@/lib/storage` мокаются напрямую (по образцу
// tests/inventory-add-flow.test.ts), чтобы не тянуть их реальные модульные
// цепочки (env-парсинг, @nb/auth) в юнит-тест.

vi.mock("server-only", () => ({}));

type Row = Record<string, any>;

const { store, ids, ensureUser } = vi.hoisted(() => {
  const store = {
    users: [] as Row[],
    masterProfiles: [] as Row[],
    masterItems: [] as Row[],
    masterImages: [] as Row[]
  };

  // FK master_profiles.user_id → users.id: витрины без владельца в БД не бывает.
  // Публичный предикат (features/masters/visibility.ts) джойнит владельца, поэтому
  // мок обязан держать тот же инвариант — иначе тесты разъедутся с реальной БД.
  const ensureUser = (userId: string) => {
    if (!userId || store.users.some((u: Row) => u.id === userId)) {
      return;
    }
    store.users.push({ id: userId, displayName: userId, blockedAt: null, anonymizedAt: null });
  };

  return { store, ids: { counter: 0, clock: 0 }, ensureUser };
});

vi.mock("@nb/db", () => {
  const col = (table: string, field: string) => ({ __col: true as const, table, field });
  const ref = (table: string, fields: string[]) => {
    const r: Record<string, unknown> = { __table: table };
    for (const f of fields) {
      r[f] = col(table, f);
    }
    return r;
  };

  const matchWhere = (row: Row, cond: any): boolean => {
    if (!cond) {
      return true;
    }
    if (cond.kind === "and") {
      return cond.conds.every((c: any) => matchWhere(row, c));
    }
    if (cond.kind === "eq") {
      return row[cond.col.field] === cond.value;
    }
    if (cond.kind === "isNotNull") {
      return row[cond.col.field] !== null && row[cond.col.field] !== undefined;
    }
    if (cond.kind === "isNull") {
      return row[cond.col.field] === null || row[cond.col.field] === undefined;
    }
    if (cond.kind === "inArray") {
      // Подзапрос (db.select(...).from(...).where(...)) — так публичный предикат
      // отбирает витрины живых владельцев: user_id in (select id from users ...).
      const sub = cond.values;
      const allowed = store[sub.table as keyof typeof store]
        .filter((r: Row) => matchWhere(r, sub.cond))
        .map((r: Row) => r[sub.field]);
      return allowed.includes(row[cond.col.field]);
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
    if (a == null && b == null) {
      return 0;
    }
    if (a == null) {
      return -1;
    }
    if (b == null) {
      return 1;
    }
    return String(a).localeCompare(String(b));
  };

  const sortRows = (rows: Row[], orders: any[]): Row[] => {
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

  const clone = (row: Row) => ({ ...row });

  const applySet = (row: Row, set: Row) => {
    const next = { ...row };
    for (const [k, v] of Object.entries(set)) {
      if (v !== undefined) {
        next[k] = v;
      }
    }
    return next;
  };

  // uuid-формат нужен по-настоящему: getMasterProfileForModeration (фикс #13)
  // валидирует id через z.string().uuid() до запроса к БД — плоское "id-1" его
  // не пройдёт. Версия/вариант-ниблы (4/8) подставлены, чтобы регэксп zod
  // (требует [1-5] и [89ab]) точно совпал.
  const genId = () => {
    const hex = (++ids.counter).toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  };
  const nowTick = () => new Date(Date.UTC(2026, 0, 1) + ++ids.clock * 1000);

  const doInsert = (tableName: string, values: Row): Row => {
    const base: Row = { ...values };
    if (base.id === undefined) {
      base.id = genId();
    }
    const now = nowTick();
    base.createdAt = base.createdAt ?? now;
    base.updatedAt = base.updatedAt ?? base.createdAt;

    if (tableName === "masterProfiles") {
      base.slug = base.slug ?? null;
      base.specializations = base.specializations ?? [];
      base.summary = base.summary ?? "";
      base.about = base.about ?? "";
      base.contactTelegram = base.contactTelegram ?? null;
      base.contactPhone = base.contactPhone ?? null;
      base.contactEmail = base.contactEmail ?? null;
      base.contactWebsite = base.contactWebsite ?? null;
      base.craftSince = base.craftSince ?? null;
      base.reviewStatus = base.reviewStatus ?? "draft";
      base.isListed = base.isListed ?? true;
      base.publishedJson = base.publishedJson ?? null;
      base.publishedAt = base.publishedAt ?? null;
      base.submittedAt = base.submittedAt ?? null;
      base.moderatorId = base.moderatorId ?? null;
      base.moderationNote = base.moderationNote ?? null;
    }
    if (tableName === "masterProfiles") {
      ensureUser(base.userId);
    }
    if (tableName === "masterItems") {
      base.description = base.description ?? "";
      base.priceNote = base.priceNote ?? null;
      base.coverImageId = base.coverImageId ?? null;
      base.sortOrder = base.sortOrder ?? 0;
      base.hiddenAt = base.hiddenAt ?? null;
      base.hiddenReason = base.hiddenReason ?? null;
      base.hiddenByUserId = base.hiddenByUserId ?? null;
    }
    if (tableName === "masterImages") {
      base.itemId = base.itemId ?? null;
      base.storageKeyOriginal = base.storageKeyOriginal ?? null;
      base.storageKeyLarge = base.storageKeyLarge ?? null;
      base.storageKeyMedium = base.storageKeyMedium ?? null;
      base.storageKeyThumb = base.storageKeyThumb ?? null;
      base.width = base.width ?? null;
      base.height = base.height ?? null;
      base.blurDataUrl = base.blurDataUrl ?? null;
      base.sortOrder = base.sortOrder ?? 0;
      base.status = base.status ?? "uploading";
      base.hiddenAt = base.hiddenAt ?? null;
      base.hiddenReason = base.hiddenReason ?? null;
      base.hiddenByUserId = base.hiddenByUserId ?? null;
      base.deletedAt = base.deletedAt ?? null;
    }

    store[tableName as keyof typeof store].push(base);
    return base;
  };

  const insert = (table: any) => ({
    values: (values: Row) => {
      const row = doInsert(table.__table, values);
      return {
        returning: async () => [clone(row)],
        then: (onF: any, onR: any) => Promise.resolve([clone(row)]).then(onF, onR)
      };
    }
  });

  const update = (table: any) => ({
    set: (set: Row) => ({
      where: (cond: any) => {
        const updated: Row[] = [];
        store[table.__table as keyof typeof store] = store[table.__table as keyof typeof store].map((r: Row) => {
          if (matchWhere(r, cond)) {
            const next = applySet(r, set);
            updated.push(next);
            return next;
          }
          return r;
        });
        return {
          returning: async () => updated.map(clone),
          then: (onF: any, onR: any) => Promise.resolve(updated.map(clone)).then(onF, onR)
        };
      }
    })
  });

  const del = (table: any) => ({
    where: (cond: any) => {
      const removed: Row[] = [];
      store[table.__table as keyof typeof store] = store[table.__table as keyof typeof store].filter((r: Row) => {
        if (matchWhere(r, cond)) {
          removed.push(r);
          return false;
        }
        return true;
      });
      return {
        returning: async () => removed.map(clone),
        then: (onF: any, onR: any) => Promise.resolve(removed.map(clone)).then(onF, onR)
      };
    }
  });

  const findMany = (tableName: string) => async (arg: any) => {
    let rows = store[tableName as keyof typeof store].filter((r: Row) => matchWhere(r, arg?.where)).map(clone);
    if (arg?.orderBy) {
      rows = sortRows(rows, arg.orderBy);
    }
    if (arg?.columns) {
      const keys = Object.keys(arg.columns);
      rows = rows.map((r: Row) => {
        const projected: Row = {};
        for (const k of keys) {
          projected[k] = r[k];
        }
        return projected;
      });
    }
    return rows;
  };

  const findFirst = (tableName: string) => async (arg: any) => {
    let rows = store[tableName as keyof typeof store].filter((r: Row) => matchWhere(r, arg?.where)).map(clone);
    if (arg?.orderBy) {
      rows = sortRows(rows, arg.orderBy);
    }
    return rows[0];
  };

  // db.select({ id: users.id }).from(users).where(...) — как и в drizzle, билдер сам
  // по себе ничего не выполняет: он либо становится подзапросом для inArray (см.
  // matchWhere), либо выполняется на await (thenable) — так публичный предикат
  // проверяет одну витрину (isMasterProfilePubliclyVisible).
  const select = (projection: Record<string, any>) => {
    const [firstCol] = Object.values(projection) as any[];
    return {
      from: (table: any) => ({
        where: (cond: any) => ({
          table: table.__table,
          field: firstCol.field,
          cond,
          then: (onFulfilled: any, onRejected: any) => {
            const rows = store[table.__table as keyof typeof store]
              .filter((r: Row) => matchWhere(r, cond))
              .map((r: Row) =>
                Object.fromEntries(
                  Object.entries(projection).map(([alias, col]) => [alias, r[(col as any).field]])
                )
              );
            return Promise.resolve(rows).then(onFulfilled, onRejected);
          }
        })
      })
    };
  };

  const db: any = {
    query: {
      masterProfiles: { findFirst: findFirst("masterProfiles"), findMany: findMany("masterProfiles") },
      masterItems: { findFirst: findFirst("masterItems"), findMany: findMany("masterItems") },
      masterImages: { findFirst: findFirst("masterImages"), findMany: findMany("masterImages") }
    },
    select,
    insert,
    update,
    delete: del,
    // no-op: реальная сериализация "for update" тут не нужна (мок однопоточный),
    // но approve/reject/createMasterItem/deleteMasterItem/reorderMasterItems
    // (фиксы #3/#4/#10/#11) зовут tx.execute(sql`...for update`) внутри транзакции.
    execute: async () => {},
    transaction: async (cb: any) => cb(db)
  };

  return {
    db,
    and: (...conds: any[]) => ({ kind: "and", conds }),
    eq: (col: any, value: any) => ({ kind: "eq", col, value }),
    isNotNull: (col: any) => ({ kind: "isNotNull", col }),
    isNull: (col: any) => ({ kind: "isNull", col }),
    inArray: (col: any, values: any) => ({ kind: "inArray", col, values }),
    asc: (col: any) => ({ kind: "order", dir: "asc", col }),
    desc: (col: any) => ({ kind: "order", dir: "desc", col }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    users: ref("users", ["id", "displayName", "role", "blockedAt", "anonymizedAt"]),
    masterProfiles: ref("masterProfiles", [
      "id", "userId", "slug", "displayName", "city", "specializations", "summary", "about",
      "contactTelegram", "contactPhone", "contactEmail", "contactWebsite", "craftSince",
      "reviewStatus", "isListed", "publishedJson", "publishedAt", "submittedAt",
      "moderatorId", "moderationNote", "createdAt", "updatedAt"
    ]),
    masterItems: ref("masterItems", [
      "id", "profileId", "title", "description", "priceNote", "coverImageId", "sortOrder",
      "hiddenAt", "hiddenReason", "hiddenByUserId", "createdAt", "updatedAt"
    ]),
    masterImages: ref("masterImages", [
      "id", "profileId", "itemId", "storageKeyOriginal", "storageKeyLarge", "storageKeyMedium", "storageKeyThumb",
      "width", "height", "mimeType", "sizeBytes", "blurDataUrl", "sortOrder", "status",
      "hiddenAt", "hiddenReason", "hiddenByUserId", "createdAt", "updatedAt", "deletedAt"
    ])
  };
});

// roleWeights как в apps/web/lib/auth.ts (user < editor < moderator < admin) —
// реальный модуль не грузим, чтобы не тянуть его цепочку (@nb/auth, env, sms).
const ROLE_WEIGHTS: Record<string, number> = { user: 1, editor: 2, moderator: 3, admin: 4 };
vi.mock("@/lib/auth", () => ({
  hasRequiredRole: (current: string, required: string) => ROLE_WEIGHTS[current] >= ROLE_WEIGHTS[required]
}));

const { storageDeleteSpy } = vi.hoisted(() => ({
  storageDeleteSpy: vi.fn(async (_key: string) => {})
}));

vi.mock("@/lib/storage", () => ({
  storageAdapter: {
    getObject: async (key: string | null) => (key ? { body: Buffer.from(key), contentType: null } : null),
    delete: (key: string) => storageDeleteSpy(key)
  }
}));

import {
  approveMasterProfile,
  countPendingMasters,
  createMasterItem,
  createMasterProfile,
  deleteMasterItem,
  getMasterImageAsset,
  getMasterProfileForModeration,
  getOwnMasterProfile,
  getPublishedMasterBySlug,
  hideMasterImage,
  hideMasterItem,
  listMasterModerationQueue,
  listMasterSitemapEntries,
  listPublishedMarketItems,
  listPublishedMasters,
  rejectMasterProfile,
  reorderMasterItems,
  setMasterListed,
  setOwnListed,
  submitForReview,
  unhideMasterImage,
  unhideMasterItem,
  updateMasterItem,
  updateMasterProfile,
  withdrawSubmission,
  type MasterActor
} from "@/features/masters/service";
// Кросс-импорт из соседнего модуля фичи (images.ts) — намеренно: интеграционный
// тест GC (фикс #1) должен гонять реальный deleteMasterImage поверх той же
// in-memory БД, что и approveMasterProfile/submitForReview из service.ts (оба
// модуля резолвят один и тот же vi.mock("@nb/db") в рамках этого тест-файла).
import { deleteMasterImage } from "@/features/masters/images";
import type { MasterProfileInput } from "@/features/masters/contracts";

const USER: MasterActor = { id: "user-1", role: "user" as any };
const USER_2: MasterActor = { id: "user-2", role: "user" as any };
const MODERATOR: MasterActor = { id: "moderator-1", role: "moderator" as any };
const ADMIN: MasterActor = { id: "admin-1", role: "admin" as any };

const validInput = (overrides: Partial<MasterProfileInput> = {}) => ({
  displayName: "Иван Кузнецов",
  city: "Новосибирск",
  specializations: ["vessels", "automation"],
  summary: "Делаю ЦКТ и щиты автоматики из нержавейки.",
  about: "Работаю с нержавейкой с 2019 года, варю ЦКТ на заказ и собираю автоматику под ключ.",
  contactTelegram: "@ivan_brew",
  craftSince: 2019,
  ...overrides
});

const seedProfile = (partial: Partial<Row> = {}): Row => {
  const now = new Date(Date.UTC(2026, 0, 1) + ++ids.clock * 1000);
  const row: Row = {
    id: `seed-profile-${++ids.counter}`,
    userId: "seed-user",
    slug: null,
    displayName: "Seed Master",
    city: "Город",
    specializations: ["vessels"],
    summary: "summary",
    about: "about",
    contactTelegram: "@seed",
    contactPhone: null,
    contactEmail: null,
    contactWebsite: null,
    craftSince: null,
    reviewStatus: "draft",
    isListed: true,
    publishedJson: null,
    publishedAt: null,
    submittedAt: null,
    moderatorId: null,
    moderationNote: null,
    createdAt: now,
    updatedAt: now,
    ...partial
  };
  ensureUser(row.userId);
  store.masterProfiles.push(row);
  return row;
};

const blockOwner = (userId: string) => {
  const owner = store.users.find((u: Row) => u.id === userId);
  if (!owner) {
    throw new Error(`нет владельца ${userId}`);
  }
  owner.blockedAt = new Date();
};

const anonymizeOwner = (userId: string) => {
  const owner = store.users.find((u: Row) => u.id === userId);
  if (!owner) {
    throw new Error(`нет владельца ${userId}`);
  }
  owner.anonymizedAt = new Date();
  owner.blockedAt = new Date();
};

beforeEach(() => {
  store.users = [];
  store.masterProfiles = [];
  store.masterItems = [];
  store.masterImages = [];
  ids.counter = 0;
  ids.clock = 0;
  storageDeleteSpy.mockClear();
});

// --- Жизненный цикл: draft → pending → approve (снапшот + слаг) -----------------
describe("жизненный цикл: create → submit → approve", () => {
  it("создаёт черновик, отправляет на модерацию и публикует со слагом", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    expect(created.reviewStatus).toBe("draft");
    expect(created.hasPublished).toBe(false);
    expect(created.slug).toBeNull();

    const submitted = await submitForReview(USER.id);
    expect(submitted.reviewStatus).toBe("pending");
    expect(submitted.submittedAt).toBeInstanceOf(Date);

    const approved = await approveMasterProfile(MODERATOR, submitted.id);
    expect(approved.reviewStatus).toBe("draft"); // черновик снова редактируем сразу после публикации
    expect(approved.hasPublished).toBe(true);
    expect(approved.slug).toBe("ivan-kuznecov");
    expect(approved.moderatorId).toBe(MODERATOR.id);
    expect(approved.submittedAt).toBeNull();

    const published = await getPublishedMasterBySlug(approved.slug!);
    expect(published?.snapshot.displayName).toBe("Иван Кузнецов");
    expect(published?.snapshot.version).toBe(1);
  });

  it("второй мастер с тем же displayName получает слаг с суффиксом -2", async () => {
    const a = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);
    const approvedA = await approveMasterProfile(MODERATOR, a.id);
    expect(approvedA.slug).toBe("ivan-kuznecov");

    const b = await createMasterProfile(USER_2.id, validInput());
    await submitForReview(USER_2.id);
    const approvedB = await approveMasterProfile(MODERATOR, b.id);
    expect(approvedB.slug).toBe("ivan-kuznecov-2");
  });

  it("pending → reject → правка НЕ меняет статус (остаётся rejected, заметка остаётся) → submit переводит в pending и чистит заметку (фикс #12)", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);

    const rejected = await rejectMasterProfile(MODERATOR, created.id, "Уточните контакты, пожалуйста");
    expect(rejected.reviewStatus).toBe("rejected");
    expect(rejected.moderationNote).toBe("Уточните контакты, пожалуйста");

    // Раньше правка профиля переводила rejected→draft (а правка изделий/фото —
    // нет). Теперь НИКАКАЯ правка черновика не меняет reviewStatus — единая
    // точка перехода это submitForReview.
    const edited = await updateMasterProfile(USER.id, validInput({ city: "Москва" }));
    expect(edited.reviewStatus).toBe("rejected");
    expect(edited.city).toBe("Москва");
    // Заметка модератора остаётся видна в кабинете до следующей отправки.
    expect(edited.moderationNote).toBe("Уточните контакты, пожалуйста");

    const resubmitted = await submitForReview(USER.id);
    expect(resubmitted.reviewStatus).toBe("pending");
    expect(resubmitted.moderationNote).toBeNull();
  });

  it("withdrawSubmission переводит pending → draft без участия модератора", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    const submitted = await submitForReview(USER.id);
    expect(submitted.reviewStatus).toBe("pending");

    const withdrawn = await withdrawSubmission(USER.id);
    expect(withdrawn.reviewStatus).toBe("draft");
    expect(withdrawn.submittedAt).toBeNull();
    expect(withdrawn.id).toBe(created.id);
  });

  it("withdrawSubmission вне pending → WITHDRAW_NOT_ALLOWED", async () => {
    await createMasterProfile(USER.id, validInput());
    await expect(withdrawSubmission(USER.id)).rejects.toThrow("WITHDRAW_NOT_ALLOWED");
  });

  it("повторная публикация обновляет снапшот, слаг остаётся стабильным", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);
    const firstApproval = await approveMasterProfile(MODERATOR, created.id);

    await updateMasterProfile(USER.id, validInput({ summary: "Новое summary после правки" }));
    await submitForReview(USER.id);
    const secondApproval = await approveMasterProfile(ADMIN, created.id);

    expect(secondApproval.slug).toBe(firstApproval.slug);
    const published = await getPublishedMasterBySlug(secondApproval.slug!);
    expect(published?.snapshot.summary).toBe("Новое summary после правки");
  });
});

// --- Инвариант: правки после публикации не видны публике до approve -------------
describe("инвариант: черновые правки не просачиваются в publishedJson", () => {
  it("правка профиля и изделий не меняет опубликованный снапшот до approve", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await createMasterItem(USER.id, { title: "ЦКТ 60 л", description: "Нержавейка" });
    await submitForReview(USER.id);
    await approveMasterProfile(MODERATOR, created.id);

    const beforeEdit = await getPublishedMasterBySlug((await getOwnMasterProfile(USER.id))!.profile.slug!);
    expect(beforeEdit?.snapshot.items).toHaveLength(1);

    // Правим черновик: новое summary + новое изделие. Публика не должна это видеть.
    await updateMasterProfile(USER.id, validInput({ summary: "Изменили описание" }));
    const own = await getOwnMasterProfile(USER.id);
    await createMasterItem(USER.id, { title: "Чиллер 200Вт", description: "Титан" });

    const stillOld = await getPublishedMasterBySlug(own!.profile.slug!);
    expect(stillOld?.snapshot.summary).not.toBe("Изменили описание");
    expect(stillOld?.snapshot.items).toHaveLength(1);
  });
});

// --- Запреты правок при pending ---------------------------------------------------
describe("правки заблокированы, пока профиль на модерации", () => {
  it("updateMasterProfile/createMasterItem/reorderMasterItems → PROFILE_LOCKED_PENDING", async () => {
    await createMasterProfile(USER.id, validInput());
    const item = await createMasterItem(USER.id, { title: "ЦКТ 60 л", description: "" });
    await submitForReview(USER.id);

    await expect(updateMasterProfile(USER.id, validInput())).rejects.toThrow("PROFILE_LOCKED_PENDING");
    await expect(createMasterItem(USER.id, { title: "Ещё изделие", description: "" })).rejects.toThrow(
      "PROFILE_LOCKED_PENDING"
    );
    await expect(updateMasterItem(USER.id, item.id, { title: "Новое имя", description: "" })).rejects.toThrow(
      "PROFILE_LOCKED_PENDING"
    );
    await expect(deleteMasterItem(USER.id, item.id)).rejects.toThrow("PROFILE_LOCKED_PENDING");
    await expect(reorderMasterItems(USER.id, [item.id])).rejects.toThrow("PROFILE_LOCKED_PENDING");
  });
});

// --- submitForReview: неполный профиль -------------------------------------------
describe("submitForReview требует полноты профиля", () => {
  it("падает на профиле без единого контакта", async () => {
    const row = seedProfile({
      userId: USER.id,
      contactTelegram: null,
      contactPhone: null,
      contactEmail: null,
      contactWebsite: null
    });
    await expect(submitForReview(row.userId)).rejects.toThrow("PROFILE_INCOMPLETE");
  });
});

// --- Лимит изделий и уникальность профиля -----------------------------------------
describe("лимиты", () => {
  it("не больше 12 изделий на профиль", async () => {
    await createMasterProfile(USER.id, validInput());
    for (let i = 0; i < 12; i += 1) {
      await createMasterItem(USER.id, { title: `Изделие ${i}`, description: "" });
    }
    await expect(createMasterItem(USER.id, { title: "Тринадцатое", description: "" })).rejects.toThrow(
      "ITEM_LIMIT_REACHED"
    );
  });

  it("один пользователь — максимум один профиль", async () => {
    await createMasterProfile(USER.id, validInput());
    await expect(createMasterProfile(USER.id, validInput())).rejects.toThrow("PROFILE_EXISTS");
  });
});

// --- reorderMasterItems -----------------------------------------------------------
describe("reorderMasterItems", () => {
  it("переставляет sortOrder и отвергает несовпадающий набор id", async () => {
    await createMasterProfile(USER.id, validInput());
    const a = await createMasterItem(USER.id, { title: "Изделие A", description: "" });
    const b = await createMasterItem(USER.id, { title: "Изделие B", description: "" });

    const reordered = await reorderMasterItems(USER.id, [b.id, a.id]);
    expect(reordered.map((item) => item.id)).toEqual([b.id, a.id]);

    await expect(reorderMasterItems(USER.id, [b.id])).rejects.toThrow("ITEM_REORDER_MISMATCH");
  });
});

// --- deleteMasterItem отвязывает фото, а не удаляет их ----------------------------
describe("deleteMasterItem", () => {
  it("отвязывает фото изделия (itemId → null) вместо удаления", async () => {
    const profile = await createMasterProfile(USER.id, validInput());
    const item = await createMasterItem(USER.id, { title: "ЦКТ", description: "" });

    store.masterImages.push({
      id: "img-1",
      profileId: profile.id,
      itemId: item.id,
      storageKeyOriginal: "orig",
      storageKeyLarge: "large",
      storageKeyMedium: "medium",
      storageKeyThumb: "thumb",
      width: 800,
      height: 600,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      blurDataUrl: null,
      sortOrder: 0,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    });

    await deleteMasterItem(USER.id, item.id);

    const own = await getOwnMasterProfile(USER.id);
    expect(own?.items).toHaveLength(0);
    expect(own?.images).toHaveLength(1);
    expect(own?.images[0].itemId).toBeNull();
  });
});

// --- Права: владелец/модератор -----------------------------------------------------
describe("права владельца и модератора", () => {
  it("владельческие мутации применяются только к своему профилю", async () => {
    await createMasterProfile(USER.id, validInput());
    // У USER_2 своего профиля ещё нет — правки/статусные операции должны падать NOT_FOUND.
    await expect(updateMasterProfile(USER_2.id, validInput())).rejects.toThrow("NOT_FOUND");
    await expect(submitForReview(USER_2.id)).rejects.toThrow("NOT_FOUND");
    await expect(setOwnListed(USER_2.id, false)).rejects.toThrow("NOT_FOUND");
  });

  it("не-модератор не может модерировать: approve/reject/listQueue/getForModeration/setListed → FORBIDDEN", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);

    await expect(listMasterModerationQueue(USER, { status: "pending" })).rejects.toThrow("FORBIDDEN");
    await expect(getMasterProfileForModeration(USER, created.id)).rejects.toThrow("FORBIDDEN");
    await expect(approveMasterProfile(USER, created.id)).rejects.toThrow("FORBIDDEN");
    await expect(rejectMasterProfile(USER, created.id, "нет, не так")).rejects.toThrow("FORBIDDEN");
    await expect(setMasterListed(USER, created.id, false)).rejects.toThrow("FORBIDDEN");
  });

  it("moderator/admin проходят гейт модерации", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);

    await expect(listMasterModerationQueue(MODERATOR, { status: "pending" })).resolves.toHaveLength(1);
    const preview = await getMasterProfileForModeration(ADMIN, created.id);
    expect(preview.previewSnapshot.displayName).toBe("Иван Кузнецов");
  });

  it("approve/reject вне pending → *_NOT_ALLOWED", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await expect(approveMasterProfile(MODERATOR, created.id)).rejects.toThrow("APPROVE_NOT_ALLOWED");
    await expect(rejectMasterProfile(MODERATOR, created.id, "какая-то заметка")).rejects.toThrow(
      "REJECT_NOT_ALLOWED"
    );
  });
});

// --- Видимость: isListed скрывает из публичных выдач ------------------------------
describe("isListed", () => {
  const publishOne = async (actor = MODERATOR) => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);
    return approveMasterProfile(actor, created.id);
  };

  it("setOwnListed(false) скрывает мастера из listPublishedMasters и getPublishedMasterBySlug", async () => {
    const approved = await publishOne();
    expect(await listPublishedMasters()).toHaveLength(1);

    await setOwnListed(USER.id, false);
    expect(await listPublishedMasters()).toHaveLength(0);
    expect(await getPublishedMasterBySlug(approved.slug!)).toBeNull();
    expect(await listMasterSitemapEntries()).toHaveLength(0);

    await setOwnListed(USER.id, true);
    expect(await listPublishedMasters()).toHaveLength(1);
  });

  it("setMasterListed модератора работает так же, как тумблер владельца", async () => {
    const approved = await publishOne();
    await setMasterListed(MODERATOR, approved.id, false);
    expect(await listPublishedMasters()).toHaveLength(0);
  });
});

// --- Видимость: заблокированный/обезличенный владелец --------------------------------
// Контакты мастера лежат в снапшоте published_json, поэтому витрина забаненного,
// оставшаяся в паблике, — это утечка связи в обход площадки. Блокировка снимает
// is_listed отдельной записью (features/admin-users/service.ts), но гейт держит
// сам запрос: тесты ниже поднимают ровно то состояние, где компенсирующая правка
// не сработала или была откачена.
describe("витрина заблокированного/обезличенного владельца", () => {
  const publishMaster = async (actor: MasterActor, displayName: string) => {
    const created = await createMasterProfile(actor.id, validInput({ displayName }));
    await createMasterItem(actor.id, { title: `ЦКТ 60 л (${displayName})`, description: "Нержавейка" });
    await submitForReview(actor.id);
    return approveMasterProfile(MODERATOR, created.id);
  };

  it("блокировка владельца убирает витрину из списка, /market, со страницы по слагу и из sitemap", async () => {
    const blocked = await publishMaster(USER, "Иван Кузнецов");
    const live = await publishMaster(USER_2, "Пётр Сварщик");
    expect(await listPublishedMasters()).toHaveLength(2);

    blockOwner(USER.id);

    expect((await listPublishedMasters()).map((m) => m.slug)).toEqual([live.slug]);
    expect((await listPublishedMarketItems()).map((i) => i.masterSlug)).toEqual([live.slug]);
    expect((await listMasterSitemapEntries()).map((e) => e.slug)).toEqual([live.slug]);
    expect(await getPublishedMasterBySlug(blocked.slug!)).toBeNull();

    const stillPublic = await getPublishedMasterBySlug(live.slug!);
    expect(stillPublic?.snapshot.contacts.telegram).toBe("@ivan_brew");
  });

  it("обезличенный владелец выпадает из паблика, даже если снапшот ещё не вычищен", async () => {
    const purged = await publishMaster(USER, "Иван Кузнецов");
    const live = await publishMaster(USER_2, "Пётр Сварщик");

    anonymizeOwner(USER.id);

    expect((await listPublishedMasters()).map((m) => m.slug)).toEqual([live.slug]);
    expect(await listPublishedMarketItems()).toHaveLength(1);
    expect(await getPublishedMasterBySlug(purged.slug!)).toBeNull();
    expect((await listMasterSitemapEntries()).map((e) => e.slug)).toEqual([live.slug]);
  });

  it("возврат is_listed забаненному не возвращает витрину в паблик", async () => {
    const approved = await publishMaster(USER, "Иван Кузнецов");
    blockOwner(USER.id);

    await setMasterListed(MODERATOR, approved.id, true);

    expect(await listPublishedMasters()).toHaveLength(0);
    expect(await listPublishedMarketItems()).toHaveLength(0);
    expect(await listMasterSitemapEntries()).toHaveLength(0);
    expect(await getPublishedMasterBySlug(approved.slug!)).toBeNull();
  });

  it("модератор видит витрину забаненного, владелец — свой профиль", async () => {
    const approved = await publishMaster(USER, "Иван Кузнецов");
    blockOwner(USER.id);

    const forModeration = await getMasterProfileForModeration(MODERATOR, approved.id);
    expect(forModeration.profile.id).toBe(approved.id);
    expect(forModeration.profile.hasPublished).toBe(true);
    expect(forModeration.items).toHaveLength(1);

    const own = await getOwnMasterProfile(USER.id);
    expect(own?.profile.id).toBe(approved.id);
  });
});

// --- Доступ к изображению ------------------------------------------------------------
describe("getMasterImageAsset", () => {
  const seedReadyImage = (overrides: Partial<Row> = {}): Row => {
    const row: Row = {
      id: `img-${++ids.counter}`,
      profileId: "profile-x",
      itemId: null,
      storageKeyOriginal: "orig-key",
      storageKeyLarge: "large-key",
      storageKeyMedium: "medium-key",
      storageKeyThumb: "thumb-key",
      width: 800,
      height: 600,
      mimeType: "image/jpeg",
      sizeBytes: 1234,
      blurDataUrl: null,
      sortOrder: 0,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides
    };
    store.masterImages.push(row);
    return row;
  };

  it("несуществующее/удалённое/не-ready фото → NOT_FOUND для всех", async () => {
    await expect(
      getMasterImageAsset({ imageId: "ghost", variant: "medium", viewer: null })
    ).rejects.toThrow("NOT_FOUND");

    const deleted = seedReadyImage({ deletedAt: new Date() });
    await expect(
      getMasterImageAsset({ imageId: deleted.id, variant: "medium", viewer: null })
    ).rejects.toThrow("NOT_FOUND");

    const uploading = seedReadyImage({ status: "uploading" });
    await expect(
      getMasterImageAsset({ imageId: uploading.id, variant: "medium", viewer: null })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("публичный доступ только к фото из снапшота listed-профиля", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);

    const galleryImage = seedReadyImage({ profileId: created.id, itemId: null });

    // Пока не approved — снапшота ещё нет, аноним не видит НИЧЕГО из фото профиля.
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");

    // Владелец видит своё фото всегда (даже до публикации).
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: { id: USER.id, role: "user" as any } })
    ).resolves.toMatchObject({ cacheControl: "private, max-age=3600" });

    await approveMasterProfile(MODERATOR, created.id);

    // Фото из опубликованного снапшота — видно анониму.
    const publicAsset = await getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null });
    expect(publicAsset.cacheControl).toBe("public, max-age=31536000, immutable");

    // Скрыли витрину — публичный доступ пропадает, хотя фото по-прежнему ready.
    await setOwnListed(USER.id, false);
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");

    // Модератор видит фото независимо от isListed.
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: { id: MODERATOR.id, role: "moderator" as any } })
    ).resolves.toMatchObject({ cacheControl: "private, max-age=3600" });
  });

  it("фото, не входящее в снапшот (загружено уже после approve), анонимам не видно", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);
    await approveMasterProfile(MODERATOR, created.id);

    // Новое фото появилось в черновике ПОСЛЕ approve — в published_json его ещё нет.
    const freshImage = seedReadyImage({ profileId: created.id, itemId: null });

    await expect(
      getMasterImageAsset({ imageId: freshImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      getMasterImageAsset({ imageId: freshImage.id, variant: "medium", viewer: { id: USER.id, role: "user" as any } })
    ).resolves.toBeTruthy();
  });

  // Ссылка на файл живёт вне страницы мастера: убрать витрину забаненного из
  // /market, со страницы и из sitemap мало — без владельца в гейте фото продолжает
  // отдаваться по прямой ссылке.
  const publishWithPhoto = async () => {
    const created = await createMasterProfile(USER.id, validInput());
    const galleryImage = seedReadyImage({ profileId: created.id, itemId: null });
    await submitForReview(USER.id);
    await approveMasterProfile(MODERATOR, created.id);

    // Пока владелец жив, фото публично — иначе тесты ниже зелёные по ошибке.
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).resolves.toMatchObject({ cacheControl: "public, max-age=31536000, immutable" });

    return { profileId: created.id, galleryImage };
  };

  it("фото заблокированного владельца не отдаётся по прямой ссылке, даже если модератор вернул is_listed", async () => {
    const { profileId, galleryImage } = await publishWithPhoto();

    blockOwner(USER.id);

    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");

    await setMasterListed(MODERATOR, profileId, true);
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");

    // Личный кабинет и админка не сломаны: владелец и модератор фото видят.
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: { id: USER.id, role: USER.role } })
    ).resolves.toMatchObject({ cacheControl: "private, max-age=3600" });
    await expect(
      getMasterImageAsset({
        imageId: galleryImage.id,
        variant: "medium",
        viewer: { id: MODERATOR.id, role: MODERATOR.role }
      })
    ).resolves.toMatchObject({ cacheControl: "private, max-age=3600" });
  });

  it("фото обезличенного владельца не отдаётся по прямой ссылке, даже если снапшот ещё не вычищен", async () => {
    const { galleryImage } = await publishWithPhoto();

    anonymizeOwner(USER.id);

    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("фото живого мастера в паблике остаётся публичным, когда забанен сосед", async () => {
    const { galleryImage } = await publishWithPhoto();

    const other = await createMasterProfile(USER_2.id, validInput({ displayName: "Пётр Сварщик" }));
    const otherImage = seedReadyImage({ profileId: other.id, itemId: null });
    await submitForReview(USER_2.id);
    await approveMasterProfile(MODERATOR, other.id);

    blockOwner(USER_2.id);

    await expect(
      getMasterImageAsset({ imageId: otherImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).resolves.toMatchObject({ cacheControl: "public, max-age=31536000, immutable" });
  });
});

// --- countPendingMasters -----------------------------------------------------------
describe("countPendingMasters", () => {
  it("считает только профили в pending", async () => {
    expect(await countPendingMasters()).toBe(0);
    await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);
    expect(await countPendingMasters()).toBe(1);

    await createMasterProfile(USER_2.id, validInput({ displayName: "Пётр Смирнов" }));
    expect(await countPendingMasters()).toBe(1); // второй ещё в draft, не в очереди
  });
});

// --- Фикс #1: снапшот переживает удаление фото, GC подчищает осиротевшее ---------
describe("удаление фото из опубликованного снапшота не ломает витрину (фикс #1)", () => {
  it("storage сохраняется, пока снапшот ссылается; getMasterImageAsset отдаёт его публично; следующий approve чистит GC", async () => {
    const created = await createMasterProfile(USER.id, validInput());

    const galleryImage = {
      id: "img-gc-1",
      profileId: created.id,
      itemId: null,
      storageKeyOriginal: "orig-1",
      storageKeyLarge: "large-1",
      storageKeyMedium: "medium-1",
      storageKeyThumb: "thumb-1",
      width: 800,
      height: 600,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      blurDataUrl: null,
      sortOrder: 0,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    };
    store.masterImages.push(galleryImage);

    await submitForReview(USER.id);
    const approved = await approveMasterProfile(MODERATOR, created.id);
    expect(approved.hasPublished).toBe(true);

    // approve вернул профиль обратно в draft — удаление фото разрешено.
    await deleteMasterImage(USER.id, galleryImage.id);
    expect(storageDeleteSpy).not.toHaveBeenCalled();

    // Публика по-прежнему видит фото по старому снапшоту, несмотря на deletedAt.
    const publicAsset = await getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null });
    expect(publicAsset.cacheControl).toBe("public, max-age=31536000, immutable");

    // Правим черновик и публикуем снова — в новый снапшот удалённое фото уже
    // не попадает (assembleMasterSnapshot берёт только ready+не-deleted).
    await updateMasterProfile(USER.id, validInput({ summary: "Новое summary после правки" }));
    await submitForReview(USER.id);
    await approveMasterProfile(MODERATOR, created.id);

    // GC подчистил storage у осиротевшего фото.
    expect(storageDeleteSpy).toHaveBeenCalledWith("orig-1");
    expect(storageDeleteSpy).toHaveBeenCalledWith("large-1");
    expect(storageDeleteSpy).toHaveBeenCalledWith("medium-1");
    expect(storageDeleteSpy).toHaveBeenCalledWith("thumb-1");

    // И публичный доступ пропал совсем: фото deletedAt и уже не в снапшоте —
    // ранний гейт на deletedAt отдаёт NOT_FOUND, до проверки прав доступа.
    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("фото, не входящее в снапшот, GC не трогает при approve (нечего чистить)", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);
    await approveMasterProfile(MODERATOR, created.id);

    // Фото появилось и было удалено уже после первой публикации — оно никогда
    // не входило ни в один снапшот, поэтому deleteMasterImage (не через мок, а
    // напрямую в сторе, для простоты) должно было почистить storage сразу; GC
    // на approve просто не находит для него работы (уже нечего удалять).
    store.masterImages.push({
      id: "img-gc-2",
      profileId: created.id,
      itemId: null,
      storageKeyOriginal: null,
      storageKeyLarge: null,
      storageKeyMedium: null,
      storageKeyThumb: null,
      width: null,
      height: null,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      blurDataUrl: null,
      sortOrder: 0,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date()
    });

    await updateMasterProfile(USER.id, validInput({ summary: "Ещё правка" }));
    await submitForReview(USER.id);
    await approveMasterProfile(MODERATOR, created.id);

    expect(storageDeleteSpy).not.toHaveBeenCalled();
  });
});

// --- Фикс #2: живая загрузка блокирует отправку на модерацию --------------------
describe("submitForReview отклоняет при незавершённой загрузке фото (фикс #2)", () => {
  it("живой uploading-слот → UPLOAD_IN_PROGRESS", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    store.masterImages.push({
      id: "img-uploading-1",
      profileId: created.id,
      itemId: null,
      storageKeyOriginal: null,
      storageKeyLarge: null,
      storageKeyMedium: null,
      storageKeyThumb: null,
      width: null,
      height: null,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      blurDataUrl: null,
      sortOrder: 0,
      status: "uploading",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    });

    await expect(submitForReview(USER.id)).rejects.toThrow("UPLOAD_IN_PROGRESS");
  });

  it("deletedAt-uploading-слот не блокирует отправку (он уже не живой)", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    store.masterImages.push({
      id: "img-uploading-2",
      profileId: created.id,
      itemId: null,
      storageKeyOriginal: null,
      storageKeyLarge: null,
      storageKeyMedium: null,
      storageKeyThumb: null,
      width: null,
      height: null,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      blurDataUrl: null,
      sortOrder: 0,
      status: "uploading",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date()
    });

    await expect(submitForReview(USER.id)).resolves.toMatchObject({ reviewStatus: "pending" });
  });
});

// --- Фикс #3: TOCTOU-защита approve/reject ---------------------------------------
describe("approve/reject защищены от гонки с уходом из pending (фикс #3)", () => {
  it("approve после того, как профиль ушёл из pending (withdraw) → APPROVE_NOT_ALLOWED, снапшот не пишется", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);

    // Симулируем гонку: между тем, как модератор открыл заявку, и его approve
    // профиль успел выйти из pending (withdraw владельцем).
    await withdrawSubmission(USER.id);

    await expect(approveMasterProfile(MODERATOR, created.id)).rejects.toThrow("APPROVE_NOT_ALLOWED");

    const own = await getOwnMasterProfile(USER.id);
    expect(own?.profile.hasPublished).toBe(false);
    expect(own?.profile.publishedAt).toBeNull();
  });

  it("reject после того, как профиль ушёл из pending → REJECT_NOT_ALLOWED", async () => {
    const created = await createMasterProfile(USER.id, validInput());
    await submitForReview(USER.id);
    await withdrawSubmission(USER.id);

    await expect(rejectMasterProfile(MODERATOR, created.id, "неважно, профиль уже не pending")).rejects.toThrow(
      "REJECT_NOT_ALLOWED"
    );
  });
});

// --- Фикс #4: reorderMasterItems применяется атомарно ----------------------------
describe("reorderMasterItems применяется атомарно (фикс #4)", () => {
  it("новый sortOrder применяется ко всем элементам в одной транзакции", async () => {
    await createMasterProfile(USER.id, validInput());
    const a = await createMasterItem(USER.id, { title: "Изделие A", description: "" });
    const b = await createMasterItem(USER.id, { title: "Изделие B", description: "" });
    const c = await createMasterItem(USER.id, { title: "Изделие C", description: "" });

    const reordered = await reorderMasterItems(USER.id, [c.id, a.id, b.id]);
    expect(reordered.map((item) => ({ id: item.id, sortOrder: item.sortOrder }))).toEqual([
      { id: c.id, sortOrder: 0 },
      { id: a.id, sortOrder: 1 },
      { id: b.id, sortOrder: 2 }
    ]);
  });
});

// --- Фикс #13: невалидный uuid не долетает до БД ---------------------------------
describe("getMasterProfileForModeration защищён от мусорного id (фикс #13)", () => {
  it("невалидный uuid → NOT_FOUND (не 500 от Postgres)", async () => {
    await expect(getMasterProfileForModeration(MODERATOR, "not-a-uuid")).rejects.toThrow("NOT_FOUND");
  });

  it("валидный, но несуществующий uuid → NOT_FOUND", async () => {
    await expect(
      getMasterProfileForModeration(MODERATOR, "00000000-0000-4000-8000-000000000000")
    ).rejects.toThrow("NOT_FOUND");
  });
});

// --- Точечная модерация Маркета: скрытие товаров и фото ----------------------------
describe("hideMasterItem / hideMasterImage", () => {
  const seedItemImage = (profileId: string, itemId: string | null, overrides: Partial<Row> = {}): Row => {
    const row: Row = {
      id: `00000000-0000-4000-8000-1000000000${(++ids.counter).toString(16).padStart(2, "0")}`,
      profileId,
      itemId,
      storageKeyOriginal: "orig",
      storageKeyLarge: "large",
      storageKeyMedium: "medium",
      storageKeyThumb: "thumb",
      width: 800,
      height: 600,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      blurDataUrl: null,
      sortOrder: 0,
      status: "ready",
      hiddenAt: null,
      hiddenReason: null,
      hiddenByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides
    };
    store.masterImages.push(row);
    return row;
  };

  // Профиль с двумя товарами, у первого — своё фото, плюс фото общей галереи.
  const publishShowcase = async () => {
    const profile = await createMasterProfile(USER.id, validInput());
    const ckt = await createMasterItem(USER.id, { title: "ЦКТ 60 л", description: "Нержавейка" });
    const chiller = await createMasterItem(USER.id, { title: "Чиллер", description: "Титан" });

    const itemImage = seedItemImage(profile.id, ckt.id);
    const galleryImage = seedItemImage(profile.id, null, { sortOrder: 1 });

    await submitForReview(USER.id);
    const approved = await approveMasterProfile(MODERATOR, profile.id);

    return { profile: approved, ckt, chiller, itemImage, galleryImage };
  };

  it("скрытый товар исчезает из /market и из снапшота страницы мастера, unhide возвращает", async () => {
    const { profile, ckt, chiller } = await publishShowcase();

    expect(await listPublishedMarketItems()).toHaveLength(2);

    const hidden = await hideMasterItem(MODERATOR, ckt.id, "Реклама в описании");
    expect(hidden.item.hiddenAt).toBeInstanceOf(Date);
    expect(hidden.item.hiddenReason).toBe("Реклама в описании");
    expect(hidden.item.hiddenByUserId).toBe(MODERATOR.id);
    expect(hidden.masterSlug).toBe(profile.slug);

    const market = await listPublishedMarketItems();
    expect(market.map((card) => card.itemId)).toEqual([chiller.id]);

    const published = await getPublishedMasterBySlug(profile.slug!);
    expect(published?.snapshot.items.map((item) => item.id)).toEqual([chiller.id]);

    const restored = await unhideMasterItem(MODERATOR, ckt.id);
    expect(restored.item.hiddenAt).toBeNull();
    expect(restored.item.hiddenReason).toBeNull();
    expect(await listPublishedMarketItems()).toHaveLength(2);
  });

  it("скрытое фото уходит из галереи, из фото товара и перестаёт быть обложкой", async () => {
    const { profile, ckt, itemImage, galleryImage } = await publishShowcase();

    const beforeHide = await getPublishedMasterBySlug(profile.slug!);
    expect(beforeHide?.snapshot.gallery.map((ref) => ref.imageId)).toEqual([galleryImage.id]);
    expect(beforeHide?.snapshot.items.find((item) => item.id === ckt.id)?.images).toHaveLength(1);

    await hideMasterImage(MODERATOR, galleryImage.id, "Чужое фото из интернета");
    await hideMasterImage(MODERATOR, itemImage.id, "Не соответствует товару");

    const published = await getPublishedMasterBySlug(profile.slug!);
    expect(published?.snapshot.gallery).toHaveLength(0);

    const item = published?.snapshot.items.find((entry) => entry.id === ckt.id);
    expect(item?.images).toHaveLength(0);
    expect(item?.coverImageId).toBeNull();

    // Карточка маркета остаётся, но уже без обложки.
    const market = await listPublishedMarketItems();
    expect(market.find((card) => card.itemId === ckt.id)?.coverImage).toBeNull();

    await unhideMasterImage(MODERATOR, galleryImage.id);
    const afterUnhide = await getPublishedMasterBySlug(profile.slug!);
    expect(afterUnhide?.snapshot.gallery.map((ref) => ref.imageId)).toEqual([galleryImage.id]);
  });

  it("обложка мастера в списке не берётся из скрытого фото", async () => {
    const { galleryImage, itemImage } = await publishShowcase();

    const before = await listPublishedMasters();
    expect(before[0]?.coverImage?.imageId).toBe(galleryImage.id);

    await hideMasterImage(MODERATOR, galleryImage.id, "Чужое фото из интернета");

    const after = await listPublishedMasters();
    expect(after[0]?.coverImage?.imageId).toBe(itemImage.id);
  });

  it("скрытое фото недоступно публике по прямой ссылке, но остаётся у владельца и модератора", async () => {
    const { galleryImage } = await publishShowcase();

    await hideMasterImage(MODERATOR, galleryImage.id, "Чужое фото из интернета");

    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");

    await expect(
      getMasterImageAsset({ imageId: galleryImage.id, variant: "medium", viewer: { id: USER.id, role: USER.role } })
    ).resolves.toMatchObject({ cacheControl: "private, max-age=3600" });

    await expect(
      getMasterImageAsset({
        imageId: galleryImage.id,
        variant: "medium",
        viewer: { id: MODERATOR.id, role: MODERATOR.role }
      })
    ).resolves.toBeTruthy();
  });

  it("фото скрытого товара тоже перестаёт быть публичным", async () => {
    const { ckt, itemImage } = await publishShowcase();

    await expect(
      getMasterImageAsset({ imageId: itemImage.id, variant: "medium", viewer: null })
    ).resolves.toMatchObject({ cacheControl: "public, max-age=31536000, immutable" });

    await hideMasterItem(MODERATOR, ckt.id, "Реклама в описании");

    await expect(
      getMasterImageAsset({ imageId: itemImage.id, variant: "medium", viewer: null })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("не-модератор не может скрывать, причина обязательна, мусорный id → NOT_FOUND", async () => {
    const { ckt } = await publishShowcase();

    await expect(hideMasterItem(USER, ckt.id, "Реклама в описании")).rejects.toThrow("FORBIDDEN");
    await expect(unhideMasterItem(USER, ckt.id)).rejects.toThrow("FORBIDDEN");
    await expect(hideMasterItem(MODERATOR, ckt.id, "  ")).rejects.toThrow();
    await expect(hideMasterItem(MODERATOR, "not-a-uuid", "Реклама в описании")).rejects.toThrow("NOT_FOUND");
    await expect(
      hideMasterImage(MODERATOR, "00000000-0000-4000-8000-00000000dead", "Чужое фото")
    ).rejects.toThrow("NOT_FOUND");
  });
});
