import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие пайплайна фото витрины мастеров (docs/masters-showcase.md, M2):
// features/masters/images.ts тестируется БЕЗ реальной БД — `@nb/db` мокается
// in-memory (vi.hoisted + vi.mock), структура мок-харнесса скопирована со стиля
// tests/coverage-masters-lifecycle.test.ts (M1), расширена под master_images/
// master_items (execute-заглушка для "for update"-лока, sql-тег).

vi.mock("server-only", () => ({}));

type Row = Record<string, any>;

const { store, ids } = vi.hoisted(() => ({
  store: {
    masterProfiles: [] as Row[],
    masterItems: [] as Row[],
    masterImages: [] as Row[]
  },
  ids: { counter: 0, clock: 0 }
}));

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

  const genId = () => `id-${++ids.counter}`;
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
      base.reviewStatus = base.reviewStatus ?? "draft";
      base.isListed = base.isListed ?? true;
      base.publishedJson = base.publishedJson ?? null;
      base.publishedAt = base.publishedAt ?? null;
      base.submittedAt = base.submittedAt ?? null;
      base.moderatorId = base.moderatorId ?? null;
      base.moderationNote = base.moderationNote ?? null;
    }
    if (tableName === "masterItems") {
      base.description = base.description ?? "";
      base.priceNote = base.priceNote ?? null;
      base.coverImageId = base.coverImageId ?? null;
      base.sortOrder = base.sortOrder ?? 0;
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

  const findMany = (tableName: string) => async (arg: any) => {
    let rows = store[tableName as keyof typeof store].filter((r: Row) => matchWhere(r, arg?.where)).map(clone);
    if (arg?.orderBy) {
      rows = sortRows(rows, arg.orderBy);
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

  const db: any = {
    query: {
      masterProfiles: { findFirst: findFirst("masterProfiles"), findMany: findMany("masterProfiles") },
      masterItems: { findFirst: findFirst("masterItems"), findMany: findMany("masterItems") },
      masterImages: { findFirst: findFirst("masterImages"), findMany: findMany("masterImages") }
    },
    insert,
    update,
    execute: async () => {},
    transaction: async (cb: any) => cb(db)
  };

  return {
    db,
    and: (...conds: any[]) => ({ kind: "and", conds }),
    eq: (col: any, value: any) => ({ kind: "eq", col, value }),
    isNull: (col: any) => ({ kind: "isNull", col }),
    asc: (col: any) => ({ kind: "order", dir: "asc", col }),
    desc: (col: any) => ({ kind: "order", dir: "desc", col }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    masterProfiles: ref("masterProfiles", ["id", "userId", "reviewStatus"]),
    masterItems: ref("masterItems", [
      "id", "profileId", "title", "description", "priceNote", "coverImageId", "sortOrder", "createdAt", "updatedAt"
    ]),
    masterImages: ref("masterImages", [
      "id", "profileId", "itemId", "storageKeyOriginal", "storageKeyLarge", "storageKeyMedium", "storageKeyThumb",
      "width", "height", "mimeType", "sizeBytes", "blurDataUrl", "sortOrder", "status",
      "createdAt", "updatedAt", "deletedAt"
    ])
  };
});

const { storageDeleteSpy, storageUploadSpy } = vi.hoisted(() => ({
  storageDeleteSpy: vi.fn(async (_key: string) => {}),
  storageUploadSpy: vi.fn(async () => {})
}));

vi.mock("@/lib/storage", () => ({
  storageAdapter: {
    upload: storageUploadSpy,
    getObject: vi.fn(async () => null),
    delete: (key: string) => storageDeleteSpy(key)
  }
}));

import {
  buildMasterImageStorageKeys,
  completeMasterImageUpload,
  deleteMasterImage,
  deleteMasterImageObjects,
  listOwnMasterImages,
  markMasterImageUploadFailed,
  moveMasterImage,
  requestMasterImageUpload,
  reorderMasterImages,
  retryMasterImageUpload,
  setMasterItemCover,
  uploadMasterImageDerivatives
} from "@/features/masters/images";
import { MASTER_IMAGE_MAX_COUNT, MASTER_ITEM_IMAGE_MAX_COUNT } from "@/features/masters/contracts";

const OWNER = "user-1";
const OTHER = "user-2";

const seedProfile = (partial: Partial<Row> = {}): Row => {
  const now = new Date(Date.UTC(2026, 0, 1) + ++ids.clock * 1000);
  const row: Row = {
    id: `profile-${++ids.counter}`,
    userId: OWNER,
    reviewStatus: "draft",
    createdAt: now,
    updatedAt: now,
    ...partial
  };
  store.masterProfiles.push(row);
  return row;
};

const seedItem = (profileId: string, partial: Partial<Row> = {}): Row => {
  const now = new Date(Date.UTC(2026, 0, 1) + ++ids.clock * 1000);
  const row: Row = {
    id: `item-${++ids.counter}`,
    profileId,
    title: "Изделие",
    description: "",
    priceNote: null,
    coverImageId: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...partial
  };
  store.masterItems.push(row);
  return row;
};

const seedImage = (profileId: string, partial: Partial<Row> = {}): Row => {
  const now = new Date(Date.UTC(2026, 0, 1) + ++ids.clock * 1000);
  const row: Row = {
    id: `img-${++ids.counter}`,
    profileId,
    itemId: null,
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
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...partial
  };
  store.masterImages.push(row);
  return row;
};

beforeEach(() => {
  store.masterProfiles = [];
  store.masterItems = [];
  store.masterImages = [];
  ids.counter = 0;
  ids.clock = 0;
  storageDeleteSpy.mockClear();
});

describe("requestMasterImageUpload", () => {
  it("создаёт слот uploading с нарастающим sortOrder внутри своего скоупа", async () => {
    const profile = seedProfile();

    const first = await requestMasterImageUpload({ userId: OWNER, mimeType: "image/jpeg", sizeBytes: 1000 });
    const second = await requestMasterImageUpload({ userId: OWNER, mimeType: "image/png", sizeBytes: 2000 });

    expect(first.status).toBe("uploading");
    expect(first.profileId).toBe(profile.id);
    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);
  });

  it("отклоняет неподдерживаемый MIME и слишком большой файл", async () => {
    seedProfile();

    await expect(
      requestMasterImageUpload({ userId: OWNER, mimeType: "image/gif", sizeBytes: 1000 })
    ).rejects.toThrow("UNSUPPORTED_IMAGE_TYPE");

    await expect(
      requestMasterImageUpload({ userId: OWNER, mimeType: "image/jpeg", sizeBytes: 11 * 1024 * 1024 })
    ).rejects.toThrow("IMAGE_TOO_LARGE");
  });

  it("без профиля — NOT_FOUND", async () => {
    await expect(
      requestMasterImageUpload({ userId: OWNER, mimeType: "image/jpeg", sizeBytes: 1000 })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("пока профиль pending — PROFILE_LOCKED_PENDING", async () => {
    seedProfile({ reviewStatus: "pending" });

    await expect(
      requestMasterImageUpload({ userId: OWNER, mimeType: "image/jpeg", sizeBytes: 1000 })
    ).rejects.toThrow("PROFILE_LOCKED_PENDING");
  });

  it("itemId с чужим/несуществующим изделием — NOT_FOUND", async () => {
    seedProfile();
    await expect(
      requestMasterImageUpload({ userId: OWNER, itemId: "ghost-item", mimeType: "image/jpeg", sizeBytes: 1000 })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("лимит MASTER_IMAGE_MAX_COUNT (24) на профиль суммарно", async () => {
    seedProfile();

    for (let i = 0; i < MASTER_IMAGE_MAX_COUNT; i += 1) {
      await requestMasterImageUpload({ userId: OWNER, mimeType: "image/jpeg", sizeBytes: 1000 });
    }

    await expect(
      requestMasterImageUpload({ userId: OWNER, mimeType: "image/jpeg", sizeBytes: 1000 })
    ).rejects.toThrow("IMAGE_LIMIT_REACHED");
  });

  it("лимит MASTER_ITEM_IMAGE_MAX_COUNT (6) на изделие", async () => {
    const profile = seedProfile();
    const item = seedItem(profile.id);

    for (let i = 0; i < MASTER_ITEM_IMAGE_MAX_COUNT; i += 1) {
      await requestMasterImageUpload({ userId: OWNER, itemId: item.id, mimeType: "image/jpeg", sizeBytes: 1000 });
    }

    await expect(
      requestMasterImageUpload({ userId: OWNER, itemId: item.id, mimeType: "image/jpeg", sizeBytes: 1000 })
    ).rejects.toThrow("ITEM_IMAGE_LIMIT_REACHED");

    // Общий профильный лимит (24) при этом ещё далеко не исчерпан — упёрлись
    // именно в лимит изделия, а не в общий.
    const galleryUpload = await requestMasterImageUpload({ userId: OWNER, mimeType: "image/jpeg", sizeBytes: 1000 });
    expect(galleryUpload.itemId).toBeNull();
  });
});

describe("retryMasterImageUpload / completeMasterImageUpload / markMasterImageUploadFailed", () => {
  it("retry сбрасывает failed-слот обратно в uploading с новыми метаданными файла", async () => {
    const profile = seedProfile();
    const failed = seedImage(profile.id, { status: "failed", mimeType: "image/png", sizeBytes: 500 });

    const retried = await retryMasterImageUpload({
      imageId: failed.id,
      userId: OWNER,
      mimeType: "image/jpeg",
      sizeBytes: 4000
    });

    expect(retried.status).toBe("uploading");
    expect(retried.mimeType).toBe("image/jpeg");
    expect(retried.sizeBytes).toBe(4000);
    expect(retried.storageKeyOriginal).toBeNull();
  });

  it("retry не-failed слота → IMAGE_RETRY_NOT_ALLOWED", async () => {
    const profile = seedProfile();
    const ready = seedImage(profile.id, { status: "ready" });

    await expect(
      retryMasterImageUpload({ imageId: ready.id, userId: OWNER, mimeType: "image/jpeg", sizeBytes: 1000 })
    ).rejects.toThrow("IMAGE_RETRY_NOT_ALLOWED");
  });

  it("retry чужого фото → NOT_FOUND", async () => {
    const profile = seedProfile();
    const failed = seedImage(profile.id, { status: "failed" });

    await expect(
      retryMasterImageUpload({ imageId: failed.id, userId: OTHER, mimeType: "image/jpeg", sizeBytes: 1000 })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("complete переводит слот в ready и заполняет деривативы/размеры", async () => {
    const profile = seedProfile();
    const uploading = seedImage(profile.id, { status: "uploading", storageKeyOriginal: null, storageKeyLarge: null, storageKeyMedium: null, storageKeyThumb: null, width: null, height: null, blurDataUrl: null });

    const dto = await completeMasterImageUpload({
      imageId: uploading.id,
      userId: OWNER,
      mimeType: "image/webp",
      sizeBytes: 3000,
      width: 1200,
      height: 800,
      blurDataUrl: "data:image/webp;base64,xyz",
      storageKeyOriginal: "o",
      storageKeyLarge: "l",
      storageKeyMedium: "m",
      storageKeyThumb: "t"
    });

    expect(dto.status).toBe("ready");
    expect(dto.thumbUrl).toContain(uploading.id);
    expect(dto.blurDataUrl).toBe("data:image/webp;base64,xyz");
  });

  it("markMasterImageUploadFailed переводит в failed и обнуляет storage-ключи", async () => {
    const profile = seedProfile();
    const uploading = seedImage(profile.id, { status: "uploading" });

    const dto = await markMasterImageUploadFailed(uploading.id, OWNER);

    expect(dto.status).toBe("failed");
    expect(dto.thumbUrl).toBeNull();
  });
});

// Фикс #2 ревью: аплоад мог стартовать в draft и "доехать" до complete уже
// после того, как профиль ушёл в pending (окно между проверкой submitForReview
// и его UPDATE) — модератор ещё не видел это фото, доводить до ready нельзя.
describe("complete/markFailed при reviewStatus=pending (фикс #2)", () => {
  it("complete НЕ переводит слот в ready при pending — PROFILE_LOCKED_PENDING", async () => {
    const profile = seedProfile({ reviewStatus: "pending" });
    const uploading = seedImage(profile.id, {
      status: "uploading",
      storageKeyOriginal: null,
      storageKeyLarge: null,
      storageKeyMedium: null,
      storageKeyThumb: null,
      width: null,
      height: null,
      blurDataUrl: null
    });

    await expect(completeMasterImageUpload({
      imageId: uploading.id,
      userId: OWNER,
      mimeType: "image/webp",
      sizeBytes: 3000,
      width: 1200,
      height: 800,
      blurDataUrl: "data:image/webp;base64,xyz",
      storageKeyOriginal: "o",
      storageKeyLarge: "l",
      storageKeyMedium: "m",
      storageKeyThumb: "t"
    })).rejects.toThrow("PROFILE_LOCKED_PENDING");

    const stored = store.masterImages.find((row) => row.id === uploading.id);
    expect(stored?.status).toBe("uploading");
    expect(stored?.storageKeyOriginal).toBeNull();
  });

  it("markMasterImageUploadFailed при pending всё равно применяется (failed безвреден)", async () => {
    const profile = seedProfile({ reviewStatus: "pending" });
    const uploading = seedImage(profile.id, { status: "uploading" });

    const dto = await markMasterImageUploadFailed(uploading.id, OWNER);
    expect(dto.status).toBe("failed");
  });
});

describe("listOwnMasterImages", () => {
  it("возвращает ВСЕ живые фото (uploading/ready/failed), но не удалённые, по sortOrder", async () => {
    const profile = seedProfile();
    seedImage(profile.id, { sortOrder: 1, status: "ready" });
    seedImage(profile.id, { sortOrder: 0, status: "uploading" });
    seedImage(profile.id, { sortOrder: 2, status: "failed" });
    seedImage(profile.id, { sortOrder: 3, status: "ready", deletedAt: new Date() });

    const images = await listOwnMasterImages(OWNER);

    expect(images).toHaveLength(3);
    expect(images.map((image) => image.status)).toEqual(["uploading", "ready", "failed"]);
  });
});

describe("deleteMasterImage", () => {
  it("soft-delete + вызывает storageAdapter.delete по всем ключам + обнуляет coverImageId изделий", async () => {
    const profile = seedProfile();
    const item = seedItem(profile.id);
    const image = seedImage(profile.id, { itemId: item.id });
    await setMasterItemCover(OWNER, item.id, image.id);

    const result = await deleteMasterImage(OWNER, image.id);
    expect(result.ok).toBe(true);

    const images = await listOwnMasterImages(OWNER);
    expect(images).toHaveLength(0);

    expect(storageDeleteSpy).toHaveBeenCalledWith("orig");
    expect(storageDeleteSpy).toHaveBeenCalledWith("large");
    expect(storageDeleteSpy).toHaveBeenCalledWith("medium");
    expect(storageDeleteSpy).toHaveBeenCalledWith("thumb");

    const refreshedItem = store.masterItems.find((row) => row.id === item.id);
    expect(refreshedItem?.coverImageId).toBeNull();
  });

  it("пока профиль pending — PROFILE_LOCKED_PENDING", async () => {
    const profile = seedProfile();
    const image = seedImage(profile.id);
    store.masterProfiles = store.masterProfiles.map((row) => (row.id === profile.id ? { ...row, reviewStatus: "pending" } : row));

    await expect(deleteMasterImage(OWNER, image.id)).rejects.toThrow("PROFILE_LOCKED_PENDING");
  });

  it("чужое фото → NOT_FOUND", async () => {
    const profile = seedProfile();
    const image = seedImage(profile.id);

    await expect(deleteMasterImage(OTHER, image.id)).rejects.toThrow("NOT_FOUND");
  });

  // Фикс #1 ревью: пока опубликованный снапшот ссылается на фото, storage
  // обязан пережить soft-delete — иначе живая витрина ломается до approve.
  const buildSnapshot = (galleryImageIds: string[]) => ({
    version: 1 as const,
    displayName: "Мастер",
    city: "Город",
    specializations: ["vessels"],
    summary: "s",
    about: "a",
    contacts: {},
    craftSince: null,
    gallery: galleryImageIds.map((imageId) => ({ imageId, blurDataUrl: null })),
    items: [],
    publishedAt: new Date().toISOString()
  });

  it("фото из текущего publishedJson: soft-delete есть, storage НЕ трогаем", async () => {
    const profile = seedProfile();
    const image = seedImage(profile.id);
    store.masterProfiles = store.masterProfiles.map((row) =>
      row.id === profile.id ? { ...row, publishedJson: buildSnapshot([image.id]) } : row
    );

    const result = await deleteMasterImage(OWNER, image.id);
    expect(result.ok).toBe(true);

    expect(storageDeleteSpy).not.toHaveBeenCalled();

    const images = await listOwnMasterImages(OWNER);
    expect(images).toHaveLength(0); // soft-delete скрывает фото из кабинета как обычно
  });

  it("фото НЕ входит в publishedJson (правки после публикации): storage удаляется сразу", async () => {
    const profile = seedProfile();
    const image = seedImage(profile.id);
    // Снапшот существует (профиль был опубликован), но НЕ ссылается на это
    // фото — оно появилось в черновике уже после публикации.
    store.masterProfiles = store.masterProfiles.map((row) =>
      row.id === profile.id ? { ...row, publishedJson: buildSnapshot([]) } : row
    );

    await deleteMasterImage(OWNER, image.id);

    expect(storageDeleteSpy).toHaveBeenCalledWith("orig");
    expect(storageDeleteSpy).toHaveBeenCalledWith("large");
    expect(storageDeleteSpy).toHaveBeenCalledWith("medium");
    expect(storageDeleteSpy).toHaveBeenCalledWith("thumb");
  });
});

describe("setMasterItemCover", () => {
  it("назначает обложку только своим ready-фото этого же изделия", async () => {
    const profile = seedProfile();
    const item = seedItem(profile.id);
    const otherItem = seedItem(profile.id);
    const ownImage = seedImage(profile.id, { itemId: item.id, status: "ready" });
    const foreignItemImage = seedImage(profile.id, { itemId: otherItem.id, status: "ready" });
    const notReadyImage = seedImage(profile.id, { itemId: item.id, status: "uploading" });

    const updated = await setMasterItemCover(OWNER, item.id, ownImage.id);
    expect(updated.coverImageId).toBe(ownImage.id);

    await expect(setMasterItemCover(OWNER, item.id, foreignItemImage.id)).rejects.toThrow("IMAGE_NOT_ELIGIBLE");
    await expect(setMasterItemCover(OWNER, item.id, notReadyImage.id)).rejects.toThrow("IMAGE_NOT_ELIGIBLE");

    const cleared = await setMasterItemCover(OWNER, item.id, null);
    expect(cleared.coverImageId).toBeNull();
  });

  it("чужой userId → NOT_FOUND", async () => {
    const profile = seedProfile();
    const item = seedItem(profile.id);

    await expect(setMasterItemCover(OTHER, item.id, null)).rejects.toThrow("NOT_FOUND");
  });
});

describe("reorderMasterImages", () => {
  it("переставляет sortOrder внутри своего скоупа (галерея отдельно от изделия)", async () => {
    const profile = seedProfile();
    const item = seedItem(profile.id);
    const galleryA = seedImage(profile.id, { itemId: null, sortOrder: 0 });
    const galleryB = seedImage(profile.id, { itemId: null, sortOrder: 1 });
    const itemPhoto = seedImage(profile.id, { itemId: item.id, sortOrder: 0 });

    const reorderedGallery = await reorderMasterImages(OWNER, { itemId: null, imageIds: [galleryB.id, galleryA.id] });
    expect(reorderedGallery.map((image) => image.id)).toEqual([galleryB.id, galleryA.id]);

    // Фото изделия не затронуто чужим (галерейным) reorder.
    const stillThere = await listOwnMasterImages(OWNER);
    const untouched = stillThere.find((image) => image.id === itemPhoto.id);
    expect(untouched?.sortOrder).toBe(0);
  });

  it("несовпадающий набор id → IMAGE_REORDER_MISMATCH", async () => {
    const profile = seedProfile();
    const galleryA = seedImage(profile.id, { itemId: null, sortOrder: 0 });
    seedImage(profile.id, { itemId: null, sortOrder: 1 });

    await expect(reorderMasterImages(OWNER, { itemId: null, imageIds: [galleryA.id] })).rejects.toThrow(
      "IMAGE_REORDER_MISMATCH"
    );
  });
});

describe("moveMasterImage", () => {
  it("переносит фото из галереи в изделие и обратно, сбрасывая обложку изделия при переезде", async () => {
    const profile = seedProfile();
    const item = seedItem(profile.id);
    const image = seedImage(profile.id, { itemId: null, status: "ready" });
    await setMasterItemCover(OWNER, item.id, null);

    const moved = await moveMasterImage(OWNER, image.id, item.id);
    expect(moved.itemId).toBe(item.id);

    await setMasterItemCover(OWNER, item.id, image.id);
    const movedBack = await moveMasterImage(OWNER, image.id, null);
    expect(movedBack.itemId).toBeNull();

    const refreshedItem = store.masterItems.find((row) => row.id === item.id);
    expect(refreshedItem?.coverImageId).toBeNull();
  });

  it("уважает лимит 6 фото на изделие при переносе", async () => {
    const profile = seedProfile();
    const item = seedItem(profile.id);
    for (let i = 0; i < MASTER_ITEM_IMAGE_MAX_COUNT; i += 1) {
      seedImage(profile.id, { itemId: item.id, status: "ready" });
    }
    const galleryImage = seedImage(profile.id, { itemId: null, status: "ready" });

    await expect(moveMasterImage(OWNER, galleryImage.id, item.id)).rejects.toThrow("ITEM_IMAGE_LIMIT_REACHED");
  });
});

describe("storage-хелперы для API-роута", () => {
  it("buildMasterImageStorageKeys собирает ключи по паттерну masters/{profileId}/images/{imageId}/{variant}", () => {
    const keys = buildMasterImageStorageKeys({ profileId: "p1", imageId: "i1", originalExtension: "jpg" });

    expect(keys.storageKeyOriginal).toBe("masters/p1/images/i1/original.jpg");
    expect(keys.storageKeyLarge).toBe("masters/p1/images/i1/large.webp");
    expect(keys.storageKeyMedium).toBe("masters/p1/images/i1/medium.webp");
    expect(keys.storageKeyThumb).toBe("masters/p1/images/i1/thumb.webp");
  });

  it("uploadMasterImageDerivatives и deleteMasterImageObjects зовут storageAdapter по всем ключам", async () => {
    storageUploadSpy.mockClear();

    await uploadMasterImageDerivatives({
      storageKeyOriginal: "o",
      storageKeyLarge: "l",
      storageKeyMedium: "m",
      storageKeyThumb: "t",
      originalBuffer: Buffer.from("a"),
      originalContentType: "image/jpeg",
      largeBuffer: Buffer.from("b"),
      mediumBuffer: Buffer.from("c"),
      thumbBuffer: Buffer.from("d")
    });
    expect(storageUploadSpy).toHaveBeenCalledTimes(4);

    await deleteMasterImageObjects(["o", "l", null, undefined]);
    expect(storageDeleteSpy).toHaveBeenCalledWith("o");
    expect(storageDeleteSpy).toHaveBeenCalledWith("l");
  });
});
