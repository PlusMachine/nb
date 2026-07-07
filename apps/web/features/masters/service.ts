import { z } from "zod";
import {
  and,
  asc,
  db,
  desc,
  eq,
  isNotNull,
  isNull,
  masterImages,
  masterItems,
  masterProfiles,
  sql
} from "@nb/db";
import type { UserRole } from "@nb/auth";

import { storageAdapter } from "@/lib/storage";

import { deleteMasterImageObjects } from "./images";
import { getMasterCapabilities } from "./permissions";
import { appendSlugSuffix, toMasterSlugBase } from "./slug";
import {
  buildMasterImageVariantUrl,
  MASTER_ITEM_MAX_COUNT,
  masterItemInputSchema,
  masterProfileInputSchema,
  type MasterImageStatus,
  type MasterImageVariant,
  type MasterPublishedSnapshot,
  type MasterPublishedSnapshotImageRef,
  type MasterPublishedSnapshotItem,
  type MasterReviewStatus
} from "./contracts";

export type MasterActor = { id: string; role: UserRole };

type MasterProfileRow = typeof masterProfiles.$inferSelect;
type MasterItemRow = typeof masterItems.$inferSelect;
type MasterImageRow = typeof masterImages.$inferSelect;

export type MasterProfileDto = {
  id: string;
  userId: string;
  slug: string | null;
  displayName: string;
  city: string;
  specializations: string[];
  summary: string;
  about: string;
  contactTelegram: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactWebsite: string | null;
  craftSince: number | null;
  reviewStatus: MasterReviewStatus;
  isListed: boolean;
  // Производное: снапшот уже есть (даже если сейчас draft/pending/rejected по
  // очередной правке) — см. модель «черновик + опубликованный снапшот».
  hasPublished: boolean;
  publishedAt: Date | null;
  submittedAt: Date | null;
  moderationNote: string | null;
  moderatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MasterItemDto = {
  id: string;
  profileId: string;
  title: string;
  description: string;
  priceNote: string | null;
  coverImageId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type MasterImageDto = {
  id: string;
  profileId: string;
  itemId: string | null;
  sortOrder: number;
  blurDataUrl: string | null;
  status: MasterImageStatus;
  thumbUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
  originalUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MasterOwnProfileDto = {
  profile: MasterProfileDto;
  items: MasterItemDto[];
  images: MasterImageDto[];
};

export type MasterCardDto = {
  id: string;
  slug: string;
  displayName: string;
  city: string;
  specializations: string[];
  summary: string;
  craftSince: number | null;
  coverImage: MasterPublishedSnapshotImageRef | null;
  publishedAt: Date;
};

// --- Маппинг строк БД → DTO ------------------------------------------------------

const mapMasterProfileRow = (profile: MasterProfileRow): MasterProfileDto => ({
  id: profile.id,
  userId: profile.userId,
  slug: profile.slug ?? null,
  displayName: profile.displayName,
  city: profile.city,
  specializations: [...profile.specializations],
  summary: profile.summary,
  about: profile.about,
  contactTelegram: profile.contactTelegram ?? null,
  contactPhone: profile.contactPhone ?? null,
  contactEmail: profile.contactEmail ?? null,
  contactWebsite: profile.contactWebsite ?? null,
  craftSince: profile.craftSince ?? null,
  reviewStatus: profile.reviewStatus as MasterReviewStatus,
  isListed: profile.isListed,
  hasPublished: profile.publishedJson != null,
  publishedAt: profile.publishedAt ?? null,
  submittedAt: profile.submittedAt ?? null,
  moderationNote: profile.moderationNote ?? null,
  moderatorId: profile.moderatorId ?? null,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt
});

const mapMasterItemRow = (item: MasterItemRow): MasterItemDto => ({
  id: item.id,
  profileId: item.profileId,
  title: item.title,
  description: item.description,
  priceNote: item.priceNote ?? null,
  coverImageId: item.coverImageId ?? null,
  sortOrder: item.sortOrder,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt
});

const mapMasterImageRow = (image: MasterImageRow): MasterImageDto => {
  const canPreview = image.status === "ready"
    && Boolean(image.storageKeyThumb && image.storageKeyMedium && image.storageKeyLarge && image.storageKeyOriginal);

  return {
    id: image.id,
    profileId: image.profileId,
    itemId: image.itemId ?? null,
    sortOrder: image.sortOrder,
    blurDataUrl: image.blurDataUrl ?? null,
    status: image.status as MasterImageStatus,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    thumbUrl: canPreview ? buildMasterImageVariantUrl(image.id, "thumb") : null,
    mediumUrl: canPreview ? buildMasterImageVariantUrl(image.id, "medium") : null,
    largeUrl: canPreview ? buildMasterImageVariantUrl(image.id, "large") : null,
    originalUrl: canPreview ? buildMasterImageVariantUrl(image.id, "original") : null
  };
};

// --- Общие приватные хелперы ------------------------------------------------------

const findOwnMasterProfileRow = async (userId: string): Promise<MasterProfileRow | null> => {
  const row = await db.query.masterProfiles.findFirst({ where: eq(masterProfiles.userId, userId) });
  return row ?? null;
};

const ensureOwnMasterProfileRow = async (userId: string): Promise<MasterProfileRow> => {
  const row = await findOwnMasterProfileRow(userId);
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  return row;
};

// Черновик заблокирован для правок, пока идёт модерация — читай только,
// «Отозвать» возвращает в draft без участия модератора.
const assertProfileEditable = (profile: MasterProfileRow) => {
  if (profile.reviewStatus === "pending") {
    throw new Error("PROFILE_LOCKED_PENDING");
  }
};

const assertModerator = (actor: MasterActor) => {
  if (!getMasterCapabilities(actor.role).canModerate) {
    throw new Error("FORBIDDEN");
  }
};

type MasterQueryExecutor = Pick<typeof db, "query">;
type MasterProfileMutationExecutor = Pick<typeof db, "execute" | "query" | "update" | "insert" | "delete">;

// Лочим строку профиля на время мутации (select ... for update) — локальная копия
// lockMasterProfileMutation из features/masters/images.ts (та не экспортируется,
// дублирование дешевле кросс-импорта приватной функции соседнего модуля).
const lockMasterProfileMutation = async (tx: MasterProfileMutationExecutor, profileId: string) => {
  await tx.execute(sql`select ${masterProfiles.id} from ${masterProfiles} where ${masterProfiles.id} = ${profileId} for update`);
};

const listMasterItemRows = async (
  profileId: string,
  executor: MasterQueryExecutor = db
): Promise<MasterItemRow[]> =>
  executor.query.masterItems.findMany({
    where: eq(masterItems.profileId, profileId),
    orderBy: [asc(masterItems.sortOrder), asc(masterItems.createdAt)]
  });

const listReadyMasterImageRows = async (
  profileId: string,
  executor: MasterQueryExecutor = db
): Promise<MasterImageRow[]> =>
  executor.query.masterImages.findMany({
    where: and(
      eq(masterImages.profileId, profileId),
      eq(masterImages.status, "ready"),
      isNull(masterImages.deletedAt)
    ),
    orderBy: [asc(masterImages.sortOrder), asc(masterImages.createdAt)]
  });

const ensureOwnMasterItemRow = async (
  userId: string,
  itemId: string
): Promise<{ profile: MasterProfileRow; item: MasterItemRow }> => {
  const profile = await ensureOwnMasterProfileRow(userId);
  const item = await db.query.masterItems.findFirst({ where: eq(masterItems.id, itemId) });

  if (!item || item.profileId !== profile.id) {
    throw new Error("NOT_FOUND");
  }

  return { profile, item };
};

const resolveUniqueMasterSlug = async (
  displayName: string,
  excludeProfileId?: string,
  executor: MasterQueryExecutor = db
): Promise<string> => {
  const base = toMasterSlugBase(displayName);
  let index = 1;

  while (index <= 1000) {
    const candidate = appendSlugSuffix(base, index);
    const existing = await executor.query.masterProfiles.findFirst({ where: eq(masterProfiles.slug, candidate) });

    if (!existing || existing.id === excludeProfileId) {
      return candidate;
    }

    index += 1;
  }

  throw new Error("SLUG_COLLISION");
};

const buildSnapshotImageRef = (image: MasterImageRow): MasterPublishedSnapshotImageRef => ({
  imageId: image.id,
  blurDataUrl: image.blurDataUrl ?? null
});

// Сборка денормализованного снапшота из текущего черновика: используется и при
// approve (пишется в published_json), и для превью модератора (без записи).
const assembleMasterSnapshot = (
  profile: MasterProfileRow,
  items: MasterItemRow[],
  images: MasterImageRow[],
  publishedAt: Date
): MasterPublishedSnapshot => {
  const sortedImages = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  const gallery = sortedImages.filter((image) => image.itemId === null).map(buildSnapshotImageRef);
  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  const itemsSnapshot: MasterPublishedSnapshotItem[] = sortedItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    priceNote: item.priceNote ?? null,
    coverImageId: item.coverImageId ?? null,
    images: sortedImages.filter((image) => image.itemId === item.id).map(buildSnapshotImageRef)
  }));

  return {
    version: 1,
    displayName: profile.displayName,
    city: profile.city,
    specializations: [...profile.specializations],
    summary: profile.summary,
    about: profile.about,
    contacts: {
      telegram: profile.contactTelegram ?? undefined,
      phone: profile.contactPhone ?? undefined,
      email: profile.contactEmail ?? undefined,
      website: profile.contactWebsite ?? undefined
    },
    craftSince: profile.craftSince ?? null,
    gallery,
    items: itemsSnapshot,
    publishedAt: publishedAt.toISOString()
  };
};

const snapshotContainsImage = (snapshot: MasterPublishedSnapshot, imageId: string): boolean => {
  if (snapshot.gallery.some((ref) => ref.imageId === imageId)) {
    return true;
  }
  return snapshot.items.some((item) => item.images.some((ref) => ref.imageId === imageId));
};

// --- Владелец: профиль -----------------------------------------------------------

export const getOwnMasterProfile = async (userId: string): Promise<MasterOwnProfileDto | null> => {
  const profile = await findOwnMasterProfileRow(userId);
  if (!profile) {
    return null;
  }

  const [items, images] = await Promise.all([
    listMasterItemRows(profile.id),
    listReadyMasterImageRows(profile.id)
  ]);

  return {
    profile: mapMasterProfileRow(profile),
    items: items.map(mapMasterItemRow),
    images: images.map(mapMasterImageRow)
  };
};

export const createMasterProfile = async (userId: string, input: unknown): Promise<MasterProfileDto> => {
  const existing = await findOwnMasterProfileRow(userId);
  if (existing) {
    throw new Error("PROFILE_EXISTS");
  }

  const parsed = masterProfileInputSchema.parse(input);

  const [created] = await db.insert(masterProfiles).values({
    userId,
    displayName: parsed.displayName,
    city: parsed.city,
    specializations: parsed.specializations,
    summary: parsed.summary,
    about: parsed.about,
    contactTelegram: parsed.contactTelegram ?? null,
    contactPhone: parsed.contactPhone ?? null,
    contactEmail: parsed.contactEmail ?? null,
    contactWebsite: parsed.contactWebsite ?? null,
    craftSince: parsed.craftSince ?? null
  }).returning();

  if (!created) {
    throw new Error("CREATE_FAILED");
  }

  return mapMasterProfileRow(created);
};

export const updateMasterProfile = async (userId: string, input: unknown): Promise<MasterProfileDto> => {
  const profile = await ensureOwnMasterProfileRow(userId);
  assertProfileEditable(profile);

  const parsed = masterProfileInputSchema.parse(input);

  // Правка черновика НЕ меняет reviewStatus (в т.ч. rejected → остаётся
  // rejected) — единая точка перехода в draft/pending теперь только
  // submitForReview (он же чистит заметку модератора). Раньше rejected→draft
  // срабатывал только здесь, а правки изделий/фото его не трогали —
  // непоследовательная машина состояний (фикс #12 ревью).
  const [updated] = await db.update(masterProfiles).set({
    displayName: parsed.displayName,
    city: parsed.city,
    specializations: parsed.specializations,
    summary: parsed.summary,
    about: parsed.about,
    contactTelegram: parsed.contactTelegram ?? null,
    contactPhone: parsed.contactPhone ?? null,
    contactEmail: parsed.contactEmail ?? null,
    contactWebsite: parsed.contactWebsite ?? null,
    craftSince: parsed.craftSince ?? null,
    updatedAt: new Date()
  }).where(eq(masterProfiles.id, profile.id)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapMasterProfileRow(updated);
};

// --- Владелец: изделия -------------------------------------------------------------

export const createMasterItem = async (userId: string, input: unknown): Promise<MasterItemDto> => {
  const profile = await ensureOwnMasterProfileRow(userId);
  assertProfileEditable(profile);

  const parsed = masterItemInputSchema.parse(input);

  // Лимит + insert + sortOrder — под локом профиля в одной транзакции, иначе
  // параллельные запросы могут читать одинаковый items.length ДО чужого insert
  // и оба пройти проверку лимита (фикс #10 ревью).
  const created = await db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const items = await listMasterItemRows(profile.id, tx);
    if (items.length >= MASTER_ITEM_MAX_COUNT) {
      throw new Error("ITEM_LIMIT_REACHED");
    }

    const nextSortOrder = items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;

    const [row] = await tx.insert(masterItems).values({
      profileId: profile.id,
      title: parsed.title,
      description: parsed.description,
      priceNote: parsed.priceNote ?? null,
      sortOrder: nextSortOrder
    }).returning();

    if (!row) {
      throw new Error("CREATE_FAILED");
    }

    return row;
  });

  return mapMasterItemRow(created);
};

export const updateMasterItem = async (userId: string, itemId: string, input: unknown): Promise<MasterItemDto> => {
  const { profile, item } = await ensureOwnMasterItemRow(userId, itemId);
  assertProfileEditable(profile);

  const parsed = masterItemInputSchema.parse(input);

  const [updated] = await db.update(masterItems).set({
    title: parsed.title,
    description: parsed.description,
    priceNote: parsed.priceNote ?? null,
    updatedAt: new Date()
  }).where(eq(masterItems.id, item.id)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapMasterItemRow(updated);
};

// Фото изделия НЕ удаляются вместе с ним — отвязываются (itemId → null) и
// уходят в общую галерею, так дешевле и ничего не теряется.
export const deleteMasterItem = async (userId: string, itemId: string): Promise<{ ok: true }> => {
  const { profile, item } = await ensureOwnMasterItemRow(userId, itemId);
  assertProfileEditable(profile);

  // Отвязка фото + удаление изделия — одной транзакцией с локом профиля, чтобы
  // не оставлять окно между двумя стейтментами (фикс #11 ревью).
  await db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    await tx.update(masterImages).set({
      itemId: null,
      updatedAt: new Date()
    }).where(eq(masterImages.itemId, item.id));

    await tx.delete(masterItems).where(eq(masterItems.id, item.id));
  });

  return { ok: true };
};

export const reorderMasterItems = async (userId: string, itemIds: string[]): Promise<MasterItemDto[]> => {
  const profile = await ensureOwnMasterProfileRow(userId);
  assertProfileEditable(profile);

  // Транзакция + лок профиля — как в reorderMasterImages (images.ts), иначе
  // цикл отдельных UPDATE может частично примениться и попасть в снапшот с
  // дублирующимися sortOrder (фикс #4 ревью).
  return db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const items = await listMasterItemRows(profile.id, tx);
    const currentIds = items.map((item) => item.id);

    if (itemIds.length !== currentIds.length || currentIds.some((id) => !itemIds.includes(id))) {
      throw new Error("ITEM_REORDER_MISMATCH");
    }

    for (const [index, id] of itemIds.entries()) {
      await tx.update(masterItems).set({
        sortOrder: index,
        updatedAt: new Date()
      }).where(eq(masterItems.id, id));
    }

    const reordered = await listMasterItemRows(profile.id, tx);
    return reordered.map(mapMasterItemRow);
  });
};

// --- Владелец: жизненный цикл модерации --------------------------------------------

export const submitForReview = async (userId: string): Promise<MasterProfileDto> => {
  const profile = await ensureOwnMasterProfileRow(userId);

  if (profile.reviewStatus === "pending") {
    throw new Error("SUBMIT_NOT_ALLOWED");
  }

  // Аплоад стартовал в draft и ещё не завершился (status="uploading") — нельзя
  // уходить в pending, иначе complete/markFailed доведут фото до ready уже
  // после того, как модератор увидел (или не увидел) превью (фикс #2 ревью).
  const uploadingImages = await db.query.masterImages.findMany({
    where: and(
      eq(masterImages.profileId, profile.id),
      eq(masterImages.status, "uploading"),
      isNull(masterImages.deletedAt)
    ),
    columns: { id: true }
  });

  if (uploadingImages.length > 0) {
    throw new Error("UPLOAD_IN_PROGRESS");
  }

  const candidate = {
    displayName: profile.displayName,
    city: profile.city,
    specializations: profile.specializations,
    summary: profile.summary,
    about: profile.about,
    contactTelegram: profile.contactTelegram ?? undefined,
    contactPhone: profile.contactPhone ?? undefined,
    contactEmail: profile.contactEmail ?? undefined,
    contactWebsite: profile.contactWebsite ?? undefined,
    craftSince: profile.craftSince ?? undefined
  };

  const validation = masterProfileInputSchema.safeParse(candidate);
  if (!validation.success) {
    throw new Error("PROFILE_INCOMPLETE");
  }

  const [updated] = await db.update(masterProfiles).set({
    reviewStatus: "pending",
    submittedAt: new Date(),
    moderationNote: null,
    updatedAt: new Date()
  }).where(eq(masterProfiles.id, profile.id)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapMasterProfileRow(updated);
};

export const withdrawSubmission = async (userId: string): Promise<MasterProfileDto> => {
  const profile = await ensureOwnMasterProfileRow(userId);

  if (profile.reviewStatus !== "pending") {
    throw new Error("WITHDRAW_NOT_ALLOWED");
  }

  const [updated] = await db.update(masterProfiles).set({
    reviewStatus: "draft",
    submittedAt: null,
    updatedAt: new Date()
  }).where(eq(masterProfiles.id, profile.id)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapMasterProfileRow(updated);
};

export const setOwnListed = async (userId: string, isListed: boolean): Promise<MasterProfileDto> => {
  const profile = await ensureOwnMasterProfileRow(userId);

  const [updated] = await db.update(masterProfiles).set({
    isListed,
    updatedAt: new Date()
  }).where(eq(masterProfiles.id, profile.id)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapMasterProfileRow(updated);
};

// --- Модератор ---------------------------------------------------------------------

export const listMasterModerationQueue = async (
  actor: MasterActor,
  filter: { status: "pending" | "published" | "rejected" }
): Promise<MasterProfileDto[]> => {
  assertModerator(actor);

  if (filter.status === "pending") {
    const rows = await db.query.masterProfiles.findMany({
      where: eq(masterProfiles.reviewStatus, "pending"),
      orderBy: [asc(masterProfiles.submittedAt)]
    });
    return rows.map(mapMasterProfileRow);
  }

  if (filter.status === "rejected") {
    const rows = await db.query.masterProfiles.findMany({
      where: eq(masterProfiles.reviewStatus, "rejected"),
      orderBy: [desc(masterProfiles.updatedAt)]
    });
    return rows.map(mapMasterProfileRow);
  }

  const rows = await db.query.masterProfiles.findMany({
    where: isNotNull(masterProfiles.publishedJson),
    orderBy: [desc(masterProfiles.publishedAt)]
  });
  return rows.map(mapMasterProfileRow);
};

export const getMasterProfileForModeration = async (
  actor: MasterActor,
  profileId: string
): Promise<MasterOwnProfileDto & { previewSnapshot: MasterPublishedSnapshot }> => {
  assertModerator(actor);

  // Мусорный id (не uuid) иначе долетает до Postgres как 22P02 → 500 вместо
  // ожидаемого «не найдено» (фикс #13 ревью, частично — роуты/admin-страница
  // гардятся отдельно другими агентами).
  if (!z.string().uuid().safeParse(profileId).success) {
    throw new Error("NOT_FOUND");
  }

  const profile = await db.query.masterProfiles.findFirst({ where: eq(masterProfiles.id, profileId) });
  if (!profile) {
    throw new Error("NOT_FOUND");
  }

  const [items, images] = await Promise.all([
    listMasterItemRows(profile.id),
    listReadyMasterImageRows(profile.id)
  ]);

  return {
    profile: mapMasterProfileRow(profile),
    items: items.map(mapMasterItemRow),
    images: images.map(mapMasterImageRow),
    previewSnapshot: assembleMasterSnapshot(profile, items, images, new Date())
  };
};

export const approveMasterProfile = async (actor: MasterActor, profileId: string): Promise<MasterProfileDto> => {
  assertModerator(actor);

  return db.transaction(async (tx) => {
    // Лок + предикат reviewStatus='pending' в самом UPDATE закрывают TOCTOU:
    // без этого чтение→проверка→UPDATE-по-id могли разъехаться с параллельным
    // withdraw/повторным approve и опубликовать немодерированную версию
    // (фикс #3 ревью).
    await lockMasterProfileMutation(tx, profileId);

    const profile = await tx.query.masterProfiles.findFirst({ where: eq(masterProfiles.id, profileId) });
    if (!profile) {
      throw new Error("NOT_FOUND");
    }

    if (profile.reviewStatus !== "pending") {
      throw new Error("APPROVE_NOT_ALLOWED");
    }

    const [items, images] = await Promise.all([
      listMasterItemRows(profile.id, tx),
      listReadyMasterImageRows(profile.id, tx)
    ]);

    const publishedAt = new Date();
    // Слаг генерится один раз, при первой публикации, и дальше остаётся стабильным.
    const slug = profile.slug ?? await resolveUniqueMasterSlug(profile.displayName, profile.id, tx);
    const snapshot = assembleMasterSnapshot(profile, items, images, publishedAt);

    const [updated] = await tx.update(masterProfiles).set({
      slug,
      publishedJson: snapshot,
      publishedAt,
      // Черновик снова редактируем сразу после публикации — следующая правка
      // потребует нового submitForReview.
      reviewStatus: "draft",
      submittedAt: null,
      moderationNote: null,
      moderatorId: actor.id,
      updatedAt: publishedAt
    }).where(and(eq(masterProfiles.id, profile.id), eq(masterProfiles.reviewStatus, "pending"))).returning();

    if (!updated) {
      // Профиль ушёл из pending между локом и этим UPDATE — конфликт, а не
      // «профиль не найден».
      throw new Error("APPROVE_NOT_ALLOWED");
    }

    // GC осиротевших фото (фикс #1 ревью): мягко удалённые (deletedAt) фото
    // никогда не входят ни в один снапшот (assembleMasterSnapshot строится
    // только из listReadyMasterImageRows, а та фильтрует isNull(deletedAt)) —
    // значит после перезаписи published_json они гарантированно осиротели.
    // deleteMasterImage сохраняет их storage-объекты, пока на imageId ссылался
    // СТАРЫЙ снапшот; теперь снапшот новый, ссылки больше нет — самое время
    // физически почистить storage. Ошибки удаления не должны ронять approve.
    const deletedImageRows = await tx.query.masterImages.findMany({
      where: and(eq(masterImages.profileId, profile.id), isNotNull(masterImages.deletedAt))
    });
    const orphanImageRows = deletedImageRows.filter((image) => !snapshotContainsImage(snapshot, image.id));

    if (orphanImageRows.length > 0) {
      await deleteMasterImageObjects(orphanImageRows.flatMap((image) => [
        image.storageKeyOriginal,
        image.storageKeyLarge,
        image.storageKeyMedium,
        image.storageKeyThumb
      ]));
    }

    return mapMasterProfileRow(updated);
  });
};

const rejectNoteSchema = z
  .string()
  .trim()
  .min(3, "Заметка — минимум 3 символа.")
  .max(1000, "Заметка — максимум 1000 символов.");

export const rejectMasterProfile = async (
  actor: MasterActor,
  profileId: string,
  note: string
): Promise<MasterProfileDto> => {
  assertModerator(actor);
  const trimmedNote = rejectNoteSchema.parse(note);

  return db.transaction(async (tx) => {
    // Тот же TOCTOU-паттерн, что approveMasterProfile (фикс #3 ревью): лок +
    // reviewStatus='pending' в WHERE самого UPDATE.
    await lockMasterProfileMutation(tx, profileId);

    const profile = await tx.query.masterProfiles.findFirst({ where: eq(masterProfiles.id, profileId) });
    if (!profile) {
      throw new Error("NOT_FOUND");
    }

    if (profile.reviewStatus !== "pending") {
      throw new Error("REJECT_NOT_ALLOWED");
    }

    const [updated] = await tx.update(masterProfiles).set({
      reviewStatus: "rejected",
      moderationNote: trimmedNote,
      moderatorId: actor.id,
      updatedAt: new Date()
    }).where(and(eq(masterProfiles.id, profile.id), eq(masterProfiles.reviewStatus, "pending"))).returning();

    if (!updated) {
      throw new Error("REJECT_NOT_ALLOWED");
    }

    return mapMasterProfileRow(updated);
  });
};

export const setMasterListed = async (
  actor: MasterActor,
  profileId: string,
  isListed: boolean
): Promise<MasterProfileDto> => {
  assertModerator(actor);

  const [updated] = await db.update(masterProfiles).set({
    isListed,
    updatedAt: new Date()
  }).where(eq(masterProfiles.id, profileId)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapMasterProfileRow(updated);
};

export const countPendingMasters = async (): Promise<number> => {
  const rows = await db.query.masterProfiles.findMany({
    where: eq(masterProfiles.reviewStatus, "pending"),
    columns: { id: true }
  });
  return rows.length;
};

// --- Публично (без авторизации) -----------------------------------------------------

const pickSnapshotCoverImage = (snapshot: MasterPublishedSnapshot): MasterPublishedSnapshotImageRef | null => {
  if (snapshot.gallery.length > 0) {
    return snapshot.gallery[0];
  }
  for (const item of snapshot.items) {
    if (item.images.length > 0) {
      return item.images[0];
    }
  }
  return null;
};

const toMasterCardDto = (profile: MasterProfileRow): MasterCardDto | null => {
  if (!profile.slug || !profile.publishedJson || !profile.publishedAt) {
    return null;
  }

  const snapshot = profile.publishedJson as MasterPublishedSnapshot;
  return {
    id: profile.id,
    slug: profile.slug,
    displayName: snapshot.displayName,
    city: snapshot.city,
    specializations: snapshot.specializations,
    summary: snapshot.summary,
    craftSince: snapshot.craftSince,
    coverImage: pickSnapshotCoverImage(snapshot),
    publishedAt: profile.publishedAt
  };
};

export const listPublishedMasters = async (): Promise<MasterCardDto[]> => {
  const rows = await db.query.masterProfiles.findMany({
    where: and(eq(masterProfiles.isListed, true), isNotNull(masterProfiles.publishedJson)),
    orderBy: [desc(masterProfiles.publishedAt)]
  });

  return rows
    .map(toMasterCardDto)
    .filter((dto): dto is MasterCardDto => dto !== null);
};

export const getPublishedMasterBySlug = async (
  slug: string
): Promise<{ slug: string; snapshot: MasterPublishedSnapshot } | null> => {
  const profile = await db.query.masterProfiles.findFirst({
    where: and(
      eq(masterProfiles.slug, slug),
      eq(masterProfiles.isListed, true),
      isNotNull(masterProfiles.publishedJson)
    )
  });

  if (!profile || !profile.publishedJson) {
    return null;
  }

  return { slug, snapshot: profile.publishedJson as MasterPublishedSnapshot };
};

export const listMasterSitemapEntries = async (): Promise<Array<{ slug: string; publishedAt: Date }>> => {
  const rows = await db.query.masterProfiles.findMany({
    where: and(eq(masterProfiles.isListed, true), isNotNull(masterProfiles.publishedJson)),
    columns: { slug: true, publishedAt: true }
  });

  return rows.filter(
    (row): row is { slug: string; publishedAt: Date } => Boolean(row.slug && row.publishedAt)
  );
};

// --- Доступ к изображению (для будущего GET /api/master-images/[id]/[variant], M2) --

export const getMasterImageAsset = async ({
  imageId,
  variant,
  viewer
}: {
  imageId: string;
  variant: MasterImageVariant;
  viewer: { id: string; role: UserRole } | null;
}) => {
  const image = await db.query.masterImages.findFirst({ where: eq(masterImages.id, imageId) });
  if (!image) {
    throw new Error("NOT_FOUND");
  }

  const profile = await db.query.masterProfiles.findFirst({ where: eq(masterProfiles.id, image.profileId) });
  if (!profile) {
    throw new Error("NOT_FOUND");
  }

  const snapshot = profile.publishedJson as MasterPublishedSnapshot | null;
  const isPublic = Boolean(profile.isListed && snapshot && snapshotContainsImage(snapshot, imageId));

  // Мягко удалённое (deletedAt) фото видно ТОЛЬКО публике — и только пока
  // опубликованный снапшот всё ещё на него ссылается (см. deleteMasterImage в
  // images.ts: storage-объекты в этом случае физически не удаляются). Владельцу
  // и модератору такое фото не показываем — в черновике его уже нет (фикс #1
  // ревью). Не-удалённое фото по-прежнему обязано быть ready.
  if (image.deletedAt) {
    if (!isPublic) {
      throw new Error("NOT_FOUND");
    }
  } else if (image.status !== "ready") {
    throw new Error("NOT_FOUND");
  }

  const isOwner = Boolean(viewer && viewer.id === profile.userId);
  const isModerator = Boolean(viewer && getMasterCapabilities(viewer.role).canModerate);

  if (!isOwner && !isModerator && !isPublic) {
    throw new Error("FORBIDDEN");
  }

  const storageKey = variant === "original"
    ? image.storageKeyOriginal
    : variant === "large"
      ? image.storageKeyLarge
      : variant === "medium"
        ? image.storageKeyMedium
        : image.storageKeyThumb;

  if (!storageKey) {
    throw new Error("NOT_FOUND");
  }

  const object = await storageAdapter.getObject(storageKey);
  if (!object) {
    throw new Error("NOT_FOUND");
  }

  return {
    body: object.body,
    contentType: object.contentType ?? (variant === "original" ? image.mimeType : "image/webp"),
    cacheControl: isPublic
      ? "public, max-age=31536000, immutable"
      : "private, max-age=3600"
  };
};
