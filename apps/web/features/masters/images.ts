import {
  and,
  asc,
  db,
  eq,
  isNull,
  masterImages,
  masterItems,
  masterProfiles,
  sql
} from "@nb/db";

import { storageAdapter } from "@/lib/storage";

import {
  buildMasterImageVariantUrl,
  MASTER_IMAGE_MAX_COUNT,
  MASTER_IMAGE_MAX_FILE_BYTES,
  MASTER_ITEM_IMAGE_MAX_COUNT,
  masterImageAcceptedMimeTypes,
  type MasterImageStatus,
  type MasterImageVariant,
  type MasterPublishedSnapshot
} from "./contracts";

// Тонкая обёртка над пайплайном фото мастера — по образцу features/recipe-images
// (contracts/image-processing/service). Обработку изображений (sharp: форматы,
// EXIF-rotate, деривативы original/large/medium/thumb, blurDataUrl) переиспользуем
// напрямую из features/recipe-images/image-processing.ts — там она не завязана на
// рецепты по сути (принимает только buffer+mimeType, ничего не знает про recipeId).
//
// Мапперы DTO (MasterImageDto/MasterItemDto) намеренно ПРОДУБЛИРОВАНЫ здесь, а не
// импортированы из ./service — тот модуль в парковке владения файлами M2 помечен
// «дополнять, не менять», а обе структуры private (не экспортируются), так что
// импорт потребовал бы правки чужой построчной структуры service.ts. Дублирование
// — 15-20 строк, тот же компромисс, что recipe-images/service.ts делает относительно
// features/recipes/service.ts (свой ensureOwnedRecipe вместо импорта чужого).

const acceptedMimeTypeSet = new Set<string>(masterImageAcceptedMimeTypes);

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

export type MasterItemCoverDto = {
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

type MasterProfileRow = typeof masterProfiles.$inferSelect;
type MasterItemRow = typeof masterItems.$inferSelect;
type MasterImageRow = typeof masterImages.$inferSelect;
type MasterImageMutationExecutor = Pick<typeof db, "execute" | "query" | "update" | "insert">;

const buildMasterImageDto = (image: MasterImageRow): MasterImageDto => {
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

const buildMasterItemCoverDto = (item: MasterItemRow): MasterItemCoverDto => ({
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

// --- Приватные хелперы -------------------------------------------------------------

const ensureOwnProfileRow = async (userId: string): Promise<MasterProfileRow> => {
  const profile = await db.query.masterProfiles.findFirst({ where: eq(masterProfiles.userId, userId) });
  if (!profile) {
    throw new Error("NOT_FOUND");
  }
  return profile;
};

// Фото — часть черновика: пока профиль на модерации (pending), любые правки
// галереи заблокированы, как и правки самого профиля/изделий (service.ts).
const assertProfileImagesEditable = (profile: MasterProfileRow) => {
  if (profile.reviewStatus === "pending") {
    throw new Error("PROFILE_LOCKED_PENDING");
  }
};

const ensureOwnMasterImageRow = async (
  userId: string,
  imageId: string
): Promise<{ profile: MasterProfileRow; image: MasterImageRow }> => {
  const profile = await ensureOwnProfileRow(userId);
  const image = await db.query.masterImages.findFirst({ where: eq(masterImages.id, imageId) });

  if (!image || image.profileId !== profile.id) {
    throw new Error("NOT_FOUND");
  }

  return { profile, image };
};

const ensureOwnMasterItemRow = async (
  profile: MasterProfileRow,
  itemId: string
): Promise<MasterItemRow> => {
  const item = await db.query.masterItems.findFirst({ where: eq(masterItems.id, itemId) });
  if (!item || item.profileId !== profile.id) {
    throw new Error("NOT_FOUND");
  }
  return item;
};

const validateMasterImageUploadInput = ({
  mimeType,
  sizeBytes
}: {
  mimeType: string;
  sizeBytes: number;
}) => {
  if (!acceptedMimeTypeSet.has(mimeType)) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("INVALID_IMAGE_SIZE");
  }

  if (sizeBytes > MASTER_IMAGE_MAX_FILE_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
};

const buildMasterImageStorageKey = ({
  profileId,
  imageId,
  variant,
  extension
}: {
  profileId: string;
  imageId: string;
  variant: MasterImageVariant;
  extension: string;
}) => `masters/${profileId}/images/${imageId}/${variant}.${extension}`;

// Лочим строку профиля на время мутации галереи — та же техника, что
// lockRecipeImageMutation в recipe-images/service.ts (select ... for update),
// чтобы параллельные загрузки не перепрыгивали лимиты/sortOrder.
const lockMasterProfileMutation = async (tx: MasterImageMutationExecutor, profileId: string) => {
  await tx.execute(sql`select ${masterProfiles.id} from ${masterProfiles} where ${masterProfiles.id} = ${profileId} for update`);
};

const countActiveImages = async (
  tx: MasterImageMutationExecutor,
  profileId: string
): Promise<MasterImageRow[]> =>
  tx.query.masterImages.findMany({
    where: and(eq(masterImages.profileId, profileId), isNull(masterImages.deletedAt))
  });

// Локальная копия snapshotContainsImage из features/masters/service.ts (та не
// экспортируется — дублирование 3 строк дешевле кросс-импорта приватного
// хелпера соседнего модуля, тот же компромисс, что уже принят в этом файле).
const snapshotContainsImage = (snapshot: MasterPublishedSnapshot, imageId: string): boolean => {
  if (snapshot.gallery.some((ref) => ref.imageId === imageId)) {
    return true;
  }
  return snapshot.items.some((item) => item.images.some((ref) => ref.imageId === imageId));
};

// --- Публичные операции: аплоад -----------------------------------------------------

export const requestMasterImageUpload = async ({
  userId,
  itemId,
  mimeType,
  sizeBytes
}: {
  userId: string;
  itemId?: string | null;
  mimeType: string;
  sizeBytes: number;
}): Promise<MasterImageRow> => {
  validateMasterImageUploadInput({ mimeType, sizeBytes });

  const profile = await ensureOwnProfileRow(userId);
  assertProfileImagesEditable(profile);

  if (itemId) {
    await ensureOwnMasterItemRow(profile, itemId);
  }

  return db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const activeImages = await countActiveImages(tx, profile.id);
    if (activeImages.length >= MASTER_IMAGE_MAX_COUNT) {
      throw new Error("IMAGE_LIMIT_REACHED");
    }

    const siblingImages = activeImages.filter((image) => (image.itemId ?? null) === (itemId ?? null));

    if (itemId && siblingImages.length >= MASTER_ITEM_IMAGE_MAX_COUNT) {
      throw new Error("ITEM_IMAGE_LIMIT_REACHED");
    }

    const nextSortOrder = siblingImages.reduce((max, image) => Math.max(max, image.sortOrder), -1) + 1;

    const [created] = await tx.insert(masterImages).values({
      profileId: profile.id,
      itemId: itemId ?? null,
      mimeType,
      sizeBytes,
      sortOrder: nextSortOrder,
      status: "uploading"
    }).returning();

    if (!created) {
      throw new Error("IMAGE_UPLOAD_SLOT_NOT_CREATED");
    }

    return created;
  });
};

export const retryMasterImageUpload = async ({
  imageId,
  userId,
  mimeType,
  sizeBytes
}: {
  imageId: string;
  userId: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<MasterImageRow> => {
  validateMasterImageUploadInput({ mimeType, sizeBytes });

  const { profile, image } = await ensureOwnMasterImageRow(userId, imageId);
  assertProfileImagesEditable(profile);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  if (image.status !== "failed") {
    throw new Error("IMAGE_RETRY_NOT_ALLOWED");
  }

  return db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const [updated] = await tx.update(masterImages).set({
      storageKeyOriginal: null,
      storageKeyLarge: null,
      storageKeyMedium: null,
      storageKeyThumb: null,
      width: null,
      height: null,
      blurDataUrl: null,
      mimeType,
      sizeBytes,
      status: "uploading",
      updatedAt: new Date()
    }).where(eq(masterImages.id, imageId)).returning();

    if (!updated) {
      throw new Error("NOT_FOUND");
    }

    return updated;
  });
};

export const completeMasterImageUpload = async ({
  imageId,
  userId,
  mimeType,
  sizeBytes,
  width,
  height,
  blurDataUrl,
  storageKeyOriginal,
  storageKeyLarge,
  storageKeyMedium,
  storageKeyThumb
}: {
  imageId: string;
  userId: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  blurDataUrl: string;
  storageKeyOriginal: string;
  storageKeyLarge: string;
  storageKeyMedium: string;
  storageKeyThumb: string;
}): Promise<MasterImageDto> => {
  const { profile, image } = await ensureOwnMasterImageRow(userId, imageId);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  // Аплоад мог стартовать в draft и «доехать» сюда уже после того, как мастер
  // отправил профиль на модерацию (submitForReview теперь отклоняет это в
  // большинстве случаев, но окно между его проверкой и UPDATE в pending
  // остаётся) — перечитываем профиль ПОД ЛОКОМ и, если он pending, не даём
  // слоту стать ready: модератор ещё не видел это фото (фикс #2 ревью). Роут
  // upload на PROFILE_LOCKED_PENDING уже реагирует 409 + чистит storage +
  // помечает слот failed через markMasterImageUploadFailed.
  return db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const freshProfile = await tx.query.masterProfiles.findFirst({ where: eq(masterProfiles.id, profile.id) });
    if (!freshProfile) {
      throw new Error("NOT_FOUND");
    }

    if (freshProfile.reviewStatus === "pending") {
      throw new Error("PROFILE_LOCKED_PENDING");
    }

    const [updated] = await tx.update(masterImages).set({
      storageKeyOriginal,
      storageKeyLarge,
      storageKeyMedium,
      storageKeyThumb,
      width,
      height,
      mimeType,
      sizeBytes,
      blurDataUrl,
      status: "ready",
      updatedAt: new Date()
    }).where(eq(masterImages.id, imageId)).returning();

    if (!updated) {
      throw new Error("NOT_FOUND");
    }

    return buildMasterImageDto(updated);
  });
};

export const markMasterImageUploadFailed = async (
  imageId: string,
  userId: string
): Promise<MasterImageDto> => {
  const { profile, image } = await ensureOwnMasterImageRow(userId, imageId);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  // В отличие от complete — «failed» безвреден, даже если профиль успел уйти
  // в pending, пока файл обрабатывался: failed-слот никогда не попадает в
  // listReadyMasterImageRows и не может просочиться в снапшот. Лок профиля
  // здесь только для консистентности с complete (та же транзакционная форма),
  // отдельного гейта на reviewStatus намеренно нет (фикс #2 ревью).
  return db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const [updated] = await tx.update(masterImages).set({
      storageKeyOriginal: null,
      storageKeyLarge: null,
      storageKeyMedium: null,
      storageKeyThumb: null,
      width: null,
      height: null,
      blurDataUrl: null,
      status: "failed",
      updatedAt: new Date()
    }).where(eq(masterImages.id, imageId)).returning();

    if (!updated) {
      throw new Error("NOT_FOUND");
    }

    return buildMasterImageDto(updated);
  });
};

// --- Чтение для кабинета -------------------------------------------------------------

// В отличие от getOwnMasterProfile (features/masters/service.ts), которая для
// публикации/превью отдаёт только status="ready", кабинету нужны ВСЕ живые фото
// (uploading/failed тоже) — иначе зависший failed-слот после перезагрузки страницы
// станет невидимым, хотя по-прежнему занимает место в лимите MASTER_IMAGE_MAX_COUNT.
export const listOwnMasterImages = async (userId: string): Promise<MasterImageDto[]> => {
  const profile = await ensureOwnProfileRow(userId);

  const images = await db.query.masterImages.findMany({
    where: and(eq(masterImages.profileId, profile.id), isNull(masterImages.deletedAt)),
    orderBy: [asc(masterImages.sortOrder), asc(masterImages.createdAt)]
  });

  return images.map(buildMasterImageDto);
};

// --- Удаление / перенос / обложка / порядок -----------------------------------------

export const deleteMasterImage = async (userId: string, imageId: string): Promise<{ ok: true }> => {
  const { profile, image } = await ensureOwnMasterImageRow(userId, imageId);
  assertProfileImagesEditable(profile);

  // Модель «черновик + опубликованный снапшот»: пока публичная страница
  // рендерится по СТАРОМУ published_json и он ссылается на это фото, storage
  // обязан продолжать отдаваться — иначе живая витрина ломается ДО очередного
  // approve. Soft-delete (ниже) скрывает фото из черновика/кабинета всегда;
  // физическое удаление storage — только если снапшот на него не ссылается
  // (фикс #1 ревью). Осиротевшие после правки фото подчищает GC в
  // approveMasterProfile при следующей публикации.
  const publishedSnapshot = profile.publishedJson as MasterPublishedSnapshot | null;
  const isReferencedInPublishedSnapshot = Boolean(
    publishedSnapshot && snapshotContainsImage(publishedSnapshot, imageId)
  );

  await db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    await tx.update(masterImages).set({
      deletedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(masterImages.id, imageId));

    // Изделия, у которых это фото было обложкой, теряют обложку (не удаляются).
    await tx.update(masterItems).set({
      coverImageId: null,
      updatedAt: new Date()
    }).where(eq(masterItems.coverImageId, imageId));
  });

  if (!isReferencedInPublishedSnapshot) {
    const storageKeys = [
      image.storageKeyOriginal,
      image.storageKeyLarge,
      image.storageKeyMedium,
      image.storageKeyThumb
    ].filter((key): key is string => Boolean(key));

    await Promise.all(storageKeys.map(async (key) => {
      try {
        await storageAdapter.delete(key);
      } catch (error) {
        console.error("[masters/images] failed to delete storage object", { key, error });
      }
    }));
  }

  return { ok: true };
};

export const setMasterItemCover = async (
  userId: string,
  itemId: string,
  imageId: string | null
): Promise<MasterItemCoverDto> => {
  const profile = await ensureOwnProfileRow(userId);
  assertProfileImagesEditable(profile);

  const item = await ensureOwnMasterItemRow(profile, itemId);

  if (imageId) {
    const image = await db.query.masterImages.findFirst({ where: eq(masterImages.id, imageId) });
    if (!image || image.profileId !== profile.id || image.itemId !== item.id || image.status !== "ready" || image.deletedAt) {
      throw new Error("IMAGE_NOT_ELIGIBLE");
    }
  }

  const [updated] = await db.update(masterItems).set({
    coverImageId: imageId,
    updatedAt: new Date()
  }).where(eq(masterItems.id, itemId)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return buildMasterItemCoverDto(updated);
};

export const reorderMasterImages = async (
  userId: string,
  { itemId, imageIds }: { itemId: string | null; imageIds: string[] }
): Promise<MasterImageDto[]> => {
  const profile = await ensureOwnProfileRow(userId);
  assertProfileImagesEditable(profile);

  if (itemId) {
    await ensureOwnMasterItemRow(profile, itemId);
  }

  return db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const scopeCondition = itemId ? eq(masterImages.itemId, itemId) : isNull(masterImages.itemId);
    const activeImages = await tx.query.masterImages.findMany({
      where: and(eq(masterImages.profileId, profile.id), scopeCondition, isNull(masterImages.deletedAt)),
      orderBy: [asc(masterImages.sortOrder), asc(masterImages.createdAt)]
    });
    const activeIds = activeImages.map((image) => image.id);

    if (imageIds.length !== activeIds.length || activeIds.some((id) => !imageIds.includes(id))) {
      throw new Error("IMAGE_REORDER_MISMATCH");
    }

    for (const [index, id] of imageIds.entries()) {
      await tx.update(masterImages).set({
        sortOrder: index,
        updatedAt: new Date()
      }).where(eq(masterImages.id, id));
    }

    const reordered = await tx.query.masterImages.findMany({
      where: and(eq(masterImages.profileId, profile.id), scopeCondition, isNull(masterImages.deletedAt)),
      orderBy: [asc(masterImages.sortOrder), asc(masterImages.createdAt)]
    });

    return reordered.map(buildMasterImageDto);
  });
};

// Перенос фото между общей галереей (itemId=null) и конкретным изделием.
// Пригодится кабинету (перетащить фото из галереи в карточку изделия и обратно);
// если для MVP-верстки не понадобится — просто не используем из UI.
export const moveMasterImage = async (
  userId: string,
  imageId: string,
  itemId: string | null
): Promise<MasterImageDto> => {
  const { profile, image } = await ensureOwnMasterImageRow(userId, imageId);
  assertProfileImagesEditable(profile);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  if (itemId) {
    await ensureOwnMasterItemRow(profile, itemId);
  }

  return db.transaction(async (tx) => {
    await lockMasterProfileMutation(tx, profile.id);

    const scopeCondition = itemId ? eq(masterImages.itemId, itemId) : isNull(masterImages.itemId);

    if (itemId) {
      const itemImages = await tx.query.masterImages.findMany({
        where: and(scopeCondition, isNull(masterImages.deletedAt))
      });
      if (itemImages.length >= MASTER_ITEM_IMAGE_MAX_COUNT) {
        throw new Error("ITEM_IMAGE_LIMIT_REACHED");
      }
    }

    const siblings = await tx.query.masterImages.findMany({
      where: and(eq(masterImages.profileId, profile.id), scopeCondition, isNull(masterImages.deletedAt))
    });
    const nextSortOrder = siblings.reduce((max, sibling) => Math.max(max, sibling.sortOrder), -1) + 1;

    const [updated] = await tx.update(masterImages).set({
      itemId,
      sortOrder: nextSortOrder,
      updatedAt: new Date()
    }).where(eq(masterImages.id, imageId)).returning();

    if (!updated) {
      throw new Error("NOT_FOUND");
    }

    // Фото уехало из-под изделия, у которого было обложкой — обложка сбрасывается.
    await tx.update(masterItems).set({
      coverImageId: null,
      updatedAt: new Date()
    }).where(eq(masterItems.coverImageId, imageId));

    return buildMasterImageDto(updated);
  });
};

// --- Storage: ключи и деривативы (для API-роута upload) ----------------------------

export const buildMasterImageStorageKeys = ({
  profileId,
  imageId,
  originalExtension
}: {
  profileId: string;
  imageId: string;
  originalExtension: string;
}) => ({
  storageKeyOriginal: buildMasterImageStorageKey({ profileId, imageId, variant: "original", extension: originalExtension }),
  storageKeyLarge: buildMasterImageStorageKey({ profileId, imageId, variant: "large", extension: "webp" }),
  storageKeyMedium: buildMasterImageStorageKey({ profileId, imageId, variant: "medium", extension: "webp" }),
  storageKeyThumb: buildMasterImageStorageKey({ profileId, imageId, variant: "thumb", extension: "webp" })
});

export const uploadMasterImageDerivatives = async ({
  storageKeyOriginal,
  storageKeyLarge,
  storageKeyMedium,
  storageKeyThumb,
  originalBuffer,
  originalContentType,
  largeBuffer,
  mediumBuffer,
  thumbBuffer
}: {
  storageKeyOriginal: string;
  storageKeyLarge: string;
  storageKeyMedium: string;
  storageKeyThumb: string;
  originalBuffer: Buffer;
  originalContentType: string;
  largeBuffer: Buffer;
  mediumBuffer: Buffer;
  thumbBuffer: Buffer;
}) => {
  await Promise.all([
    storageAdapter.upload({ key: storageKeyOriginal, body: originalBuffer, contentType: originalContentType }),
    storageAdapter.upload({ key: storageKeyLarge, body: largeBuffer, contentType: "image/webp" }),
    storageAdapter.upload({ key: storageKeyMedium, body: mediumBuffer, contentType: "image/webp" }),
    storageAdapter.upload({ key: storageKeyThumb, body: thumbBuffer, contentType: "image/webp" })
  ]);
};

export const deleteMasterImageObjects = async (keys: Array<string | null | undefined>) => {
  await Promise.all(keys.filter((key): key is string => Boolean(key)).map(async (key) => {
    try {
      await storageAdapter.delete(key);
    } catch (error) {
      console.error("[masters/images] failed to delete uploaded derivative", { key, error });
    }
  }));
};
