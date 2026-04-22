import {
  and,
  asc,
  db,
  eq,
  inArray,
  isNull,
  recipeImages,
  recipes,
  sql
} from "@nb/db";

import type { RecipeEditorPayload } from "@/app/(app)/app/recipes/actions";
import { storageAdapter } from "@/lib/storage";
import { createRecipe, getNextDefaultRecipeTitle, getOwnedRecipeById } from "@/features/recipes/service";
import { createRecipePayloadSchema } from "@/features/recipes/contracts";

import {
  buildRecipeImageVariantUrl,
  recipeImageAcceptedMimeTypes,
  RECIPE_IMAGE_MAX_COUNT,
  RECIPE_IMAGE_MAX_FILE_BYTES,
  RECIPE_IMAGE_MAX_TOTAL_BYTES,
  type RecipeImageAcceptedMimeType,
  type RecipeImageDto,
  type RecipeImageVariant
} from "./contracts";

const acceptedMimeTypeSet = new Set<string>(recipeImageAcceptedMimeTypes);

const isRecipeImagesRelationMissingError = (error: unknown) => (
  error instanceof Error
  && "code" in error
  && (error as Error & { code?: string }).code === "42P01"
);

const rethrowRecipeImagesSchemaMissing = (error: unknown): never => {
  if (isRecipeImagesRelationMissingError(error)) {
    throw new Error("RECIPE_IMAGES_SCHEMA_MISSING");
  }

  throw error;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const normalizeRecipeImageMimeType = (mimeType: string): RecipeImageAcceptedMimeType => {
  if (!acceptedMimeTypeSet.has(mimeType)) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }

  return mimeType as RecipeImageAcceptedMimeType;
};

const validateRecipeImageUploadInput = ({
  mimeType,
  sizeBytes
}: {
  mimeType: string;
  sizeBytes: number;
}) => {
  normalizeRecipeImageMimeType(mimeType);

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("INVALID_IMAGE_SIZE");
  }

  if (sizeBytes > RECIPE_IMAGE_MAX_FILE_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
};

const buildRecipeImageStorageKey = ({
  recipeId,
  imageId,
  variant,
  extension
}: {
  recipeId: string;
  imageId: string;
  variant: RecipeImageVariant;
  extension: string;
}) => `recipes/${recipeId}/images/${imageId}/${variant}.${extension}`;

export const buildRecipeImageAltFallback = (recipeTitle: string) => `Фото рецепта «${recipeTitle.trim() || "Без названия"}»`;

const buildRecipeImageDto = (
  image: typeof recipeImages.$inferSelect,
  recipeTitle: string
): RecipeImageDto => {
  const canPreview = image.status === "ready"
    && Boolean(image.storageKeyThumb && image.storageKeyMedium && image.storageKeyLarge && image.storageKeyOriginal);

  return {
    id: image.id,
    recipeId: image.recipeId,
    width: image.width ?? null,
    height: image.height ?? null,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    blurDataUrl: image.blurDataUrl ?? null,
    caption: image.caption ?? null,
    altText: image.altText ?? null,
    effectiveAltText: image.altText?.trim() || buildRecipeImageAltFallback(recipeTitle),
    sortOrder: image.sortOrder,
    isCover: image.isCover,
    status: image.status,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    thumbUrl: canPreview ? buildRecipeImageVariantUrl(image.id, "thumb") : null,
    mediumUrl: canPreview ? buildRecipeImageVariantUrl(image.id, "medium") : null,
    largeUrl: canPreview ? buildRecipeImageVariantUrl(image.id, "large") : null,
    originalUrl: canPreview ? buildRecipeImageVariantUrl(image.id, "original") : null
  };
};

type RecipeImageMutationExecutor = Pick<typeof db, "execute" | "query" | "update">;
type RecipeImageRow = typeof recipeImages.$inferSelect;
type RecipeImageWithRecipe = RecipeImageRow & {
  recipe: typeof recipes.$inferSelect;
};

const ensureOwnedRecipe = async (userId: string, recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.authorId, userId))
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  return recipe;
};

const ensureOwnedRecipeImage = async (userId: string, imageId: string): Promise<RecipeImageWithRecipe> => {
  let image: RecipeImageWithRecipe | undefined;

  try {
    image = await db.query.recipeImages.findFirst({
      where: eq(recipeImages.id, imageId),
      with: {
        recipe: true
      }
    }) as RecipeImageWithRecipe | undefined;
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }

  if (!image || !image.recipe || image.recipe.authorId !== userId) {
    throw new Error("NOT_FOUND");
  }

  return image;
};

const listActiveRecipeImages = async (recipeId: string): Promise<RecipeImageRow[]> => {
  try {
    return await db.query.recipeImages.findMany({
      where: and(
        eq(recipeImages.recipeId, recipeId),
        isNull(recipeImages.deletedAt)
      ),
      orderBy: [asc(recipeImages.sortOrder), asc(recipeImages.createdAt)]
    });
  } catch (error) {
    return rethrowRecipeImagesSchemaMissing(error);
  }
};

const lockRecipeImageMutation = async (tx: RecipeImageMutationExecutor, recipeId: string) => {
  await tx.execute(sql`select ${recipes.id} from ${recipes} where ${recipes.id} = ${recipeId} for update`);
};

const syncRecipeCoverImage = async (tx: RecipeImageMutationExecutor, recipeId: string) => {
  const activeImages = await tx.query.recipeImages.findMany({
    where: and(
      eq(recipeImages.recipeId, recipeId),
      isNull(recipeImages.deletedAt)
    ),
    orderBy: [asc(recipeImages.sortOrder), asc(recipeImages.createdAt)]
  });

  const readyImages = activeImages.filter((image) => image.status === "ready");
  const currentReadyCover = readyImages.find((image) => image.isCover) ?? null;
  const nextCover = currentReadyCover ?? readyImages[0] ?? null;

  await tx.update(recipeImages)
    .set({
      isCover: false,
      updatedAt: new Date()
    })
    .where(and(
      eq(recipeImages.recipeId, recipeId),
      isNull(recipeImages.deletedAt)
    ));

  if (nextCover) {
    await tx.update(recipeImages)
      .set({
        isCover: true,
        updatedAt: new Date()
      })
      .where(eq(recipeImages.id, nextCover.id));
  }

  await tx.update(recipes)
    .set({
      heroImageId: nextCover?.id ?? null,
      updatedAt: new Date()
    })
    .where(eq(recipes.id, recipeId));
};

const buildDraftPayloadForImageUpload = async (
  userId: string,
  payload: Partial<RecipeEditorPayload> | null | undefined
) => {
  const record = isRecord(payload) ? payload : {};
  const fallbackTitle = await getNextDefaultRecipeTitle(userId);
  const candidate = {
    publicationState: "private" as const,
    title: typeof record.title === "string" && record.title.trim() ? record.title : fallbackTitle,
    styleId: typeof record.styleId === "string" ? record.styleId : null,
    batchSizeEnteredQuantity: typeof record.batchSizeEnteredQuantity === "number" && record.batchSizeEnteredQuantity > 0
      ? record.batchSizeEnteredQuantity
      : 20,
    batchSizeEnteredUnit: typeof record.batchSizeEnteredUnit === "string" ? record.batchSizeEnteredUnit : "l",
    efficiency: typeof record.efficiency === "number" && record.efficiency > 0 && record.efficiency <= 100
      ? record.efficiency
      : null,
    boilTimeMinutes: typeof record.boilTimeMinutes === "number" && Number.isInteger(record.boilTimeMinutes) && record.boilTimeMinutes > 0
      ? record.boilTimeMinutes
      : 60,
    description: typeof record.description === "string" ? record.description : null,
    authorNotes: typeof record.authorNotes === "string" ? record.authorNotes : null,
    processMeta: isRecord(record.processMeta) ? record.processMeta : undefined,
    calculationMeta: isRecord(record.calculationMeta) ? record.calculationMeta : undefined,
    equipmentProfileId: typeof record.equipmentProfileId === "string" ? record.equipmentProfileId : null,
    equipmentProfileSnapshot: isRecord(record.equipmentProfileSnapshot) ? record.equipmentProfileSnapshot : undefined,
    waterPlanMeta: isRecord(record.waterPlanMeta) ? record.waterPlanMeta : undefined,
    ingredients: Array.isArray(record.ingredients) ? record.ingredients : []
  };

  const parsed = createRecipePayloadSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  return createRecipePayloadSchema.parse({
    publicationState: "private",
    title: fallbackTitle,
    batchSizeEnteredQuantity: 20,
    batchSizeEnteredUnit: "l",
    boilTimeMinutes: 60,
    ingredients: []
  });
};

export const createRecipeDraftIfNeededForImageUpload = async (
  userId: string,
  maybeRecipeId?: string | null,
  draftSeed?: Partial<RecipeEditorPayload> | null
) => {
  if (maybeRecipeId) {
    return await getOwnedRecipeById(userId, maybeRecipeId);
  }

  const payload = await buildDraftPayloadForImageUpload(userId, draftSeed);
  return await createRecipe(userId, payload);
};

export const requestRecipeImageUpload = async ({
  recipeId,
  userId,
  mimeType,
  sizeBytes
}: {
  recipeId: string;
  userId: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<RecipeImageRow> => {
  validateRecipeImageUploadInput({ mimeType, sizeBytes });
  await ensureOwnedRecipe(userId, recipeId);

  try {
    return await db.transaction(async (tx) => {
      await lockRecipeImageMutation(tx, recipeId);

      const activeImages = await tx.query.recipeImages.findMany({
        where: and(eq(recipeImages.recipeId, recipeId), isNull(recipeImages.deletedAt)),
        orderBy: [asc(recipeImages.sortOrder), asc(recipeImages.createdAt)]
      });

      const activeCount = activeImages.length;

      if (activeCount >= RECIPE_IMAGE_MAX_COUNT) {
        throw new Error("IMAGE_LIMIT_REACHED");
      }

      const totalSizeBytes = activeImages
        .reduce((sum, image) => sum + image.sizeBytes, 0);

      if (totalSizeBytes + sizeBytes > RECIPE_IMAGE_MAX_TOTAL_BYTES) {
        throw new Error("IMAGE_TOTAL_SIZE_LIMIT_REACHED");
      }

      const nextSortOrder = activeImages.reduce((max, image) => Math.max(max, image.sortOrder), -1) + 1;

      const [created] = await tx.insert(recipeImages).values({
        recipeId,
        mimeType,
        sizeBytes,
        sortOrder: nextSortOrder,
        isCover: activeCount === 0,
        status: "uploading"
      }).returning();

      if (!created) {
        throw new Error("IMAGE_UPLOAD_SLOT_NOT_CREATED");
      }

      return created;
    });
  } catch (error) {
    return rethrowRecipeImagesSchemaMissing(error);
  }
};

export const retryRecipeImageUpload = async ({
  imageId,
  userId,
  mimeType,
  sizeBytes
}: {
  imageId: string;
  userId: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<RecipeImageRow> => {
  validateRecipeImageUploadInput({ mimeType, sizeBytes });
  const image = await ensureOwnedRecipeImage(userId, imageId);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  if (image.status !== "failed") {
    throw new Error("IMAGE_RETRY_NOT_ALLOWED");
  }

  try {
    return await db.transaction(async (tx) => {
      await lockRecipeImageMutation(tx, image.recipeId);

      const activeImages = await tx.query.recipeImages.findMany({
        where: and(eq(recipeImages.recipeId, image.recipeId), isNull(recipeImages.deletedAt)),
        orderBy: [asc(recipeImages.sortOrder), asc(recipeImages.createdAt)]
      });

      const totalSizeBytes = activeImages
        .filter((candidate) => candidate.id !== imageId)
        .reduce((sum, candidate) => sum + candidate.sizeBytes, 0);

      if (totalSizeBytes + sizeBytes > RECIPE_IMAGE_MAX_TOTAL_BYTES) {
        throw new Error("IMAGE_TOTAL_SIZE_LIMIT_REACHED");
      }

      const [updated] = await tx.update(recipeImages).set({
        storageKeyOriginal: null,
        storageKeyLarge: null,
        storageKeyMedium: null,
        storageKeyThumb: null,
        width: null,
        height: null,
        blurDataUrl: null,
        mimeType,
        sizeBytes,
        isCover: false,
        status: "uploading",
        updatedAt: new Date()
      }).where(eq(recipeImages.id, imageId)).returning();

      if (!updated) {
        throw new Error("NOT_FOUND");
      }

      await syncRecipeCoverImage(tx, image.recipeId);
      return updated;
    });
  } catch (error) {
    return rethrowRecipeImagesSchemaMissing(error);
  }
};

export const completeRecipeImageUpload = async ({
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
  storageKeyThumb,
  altText
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
  altText?: string | null;
}) => {
  const image = await ensureOwnedRecipeImage(userId, imageId);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  try {
    await db.transaction(async (tx) => {
      await lockRecipeImageMutation(tx, image.recipeId);

      await tx.update(recipeImages).set({
        storageKeyOriginal,
        storageKeyLarge,
        storageKeyMedium,
        storageKeyThumb,
        width,
        height,
        mimeType,
        sizeBytes,
        blurDataUrl,
        altText: altText?.trim() || null,
        status: "ready",
        updatedAt: new Date()
      }).where(eq(recipeImages.id, imageId));

      await syncRecipeCoverImage(tx, image.recipeId);
    });
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }

  return await getOwnedRecipeImageDto(userId, imageId);
};

export const markRecipeImageUploadFailed = async (
  imageId: string,
  userId: string
) => {
  const image = await ensureOwnedRecipeImage(userId, imageId);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  try {
    await db.transaction(async (tx) => {
      await lockRecipeImageMutation(tx, image.recipeId);

      await tx.update(recipeImages).set({
        storageKeyOriginal: null,
        storageKeyLarge: null,
        storageKeyMedium: null,
        storageKeyThumb: null,
        width: null,
        height: null,
        blurDataUrl: null,
        isCover: false,
        status: "failed",
        updatedAt: new Date()
      }).where(eq(recipeImages.id, imageId));

      await syncRecipeCoverImage(tx, image.recipeId);
    });
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }

  return await getOwnedRecipeImageDto(userId, imageId);
};

export const listRecipeImages = async (
  recipeId: string,
  userId: string
) => {
  const recipe = await ensureOwnedRecipe(userId, recipeId);
  let images: Awaited<ReturnType<typeof listActiveRecipeImages>>;

  try {
    images = await listActiveRecipeImages(recipeId);
  } catch (error) {
    if (error instanceof Error && error.message === "RECIPE_IMAGES_SCHEMA_MISSING") {
      return [];
    }

    throw error;
  }

  return images.map((image) => buildRecipeImageDto(image, recipe.title));
};

const getOwnedRecipeImageDto = async (userId: string, imageId: string) => {
  const image = await ensureOwnedRecipeImage(userId, imageId);
  return buildRecipeImageDto(image, image.recipe.title);
};

export const deleteRecipeImage = async (
  imageId: string,
  userId: string
) => {
  const image = await ensureOwnedRecipeImage(userId, imageId);
  const storageKeys = [
    image.storageKeyOriginal,
    image.storageKeyLarge,
    image.storageKeyMedium,
    image.storageKeyThumb
  ].filter((key): key is string => Boolean(key));

  try {
    await db.transaction(async (tx) => {
      await lockRecipeImageMutation(tx, image.recipeId);

      await tx.update(recipeImages).set({
        deletedAt: new Date(),
        isCover: false,
        updatedAt: new Date()
      }).where(eq(recipeImages.id, imageId));

      await syncRecipeCoverImage(tx, image.recipeId);
    });
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }

  await Promise.all(storageKeys.map(async (key) => {
    try {
      await storageAdapter.delete(key);
    } catch (error) {
      console.error("[recipe-images] failed to delete storage object", { key, error });
    }
  }));

  return {
    ok: true,
    recipeId: image.recipeId
  };
};

export const setRecipeCoverImage = async (
  imageId: string,
  userId: string
) => {
  const image = await ensureOwnedRecipeImage(userId, imageId);

  if (image.deletedAt) {
    throw new Error("NOT_FOUND");
  }

  if (image.status !== "ready") {
    throw new Error("IMAGE_NOT_READY");
  }

  try {
    await db.transaction(async (tx) => {
      await lockRecipeImageMutation(tx, image.recipeId);

      await tx.update(recipeImages).set({
        isCover: false,
        updatedAt: new Date()
      }).where(and(
        eq(recipeImages.recipeId, image.recipeId),
        isNull(recipeImages.deletedAt)
      ));

      await tx.update(recipeImages).set({
        isCover: true,
        updatedAt: new Date()
      }).where(eq(recipeImages.id, imageId));

      await tx.update(recipes).set({
        heroImageId: imageId,
        updatedAt: new Date()
      }).where(eq(recipes.id, image.recipeId));
    });
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }

  return await getOwnedRecipeImageDto(userId, imageId);
};

export const reorderRecipeImages = async (
  recipeId: string,
  orderedImageIds: string[],
  userId: string
) => {
  await ensureOwnedRecipe(userId, recipeId);

  try {
    await db.transaction(async (tx) => {
      await lockRecipeImageMutation(tx, recipeId);

      const activeImages = await tx.query.recipeImages.findMany({
        where: and(
          eq(recipeImages.recipeId, recipeId),
          isNull(recipeImages.deletedAt)
        ),
        orderBy: [asc(recipeImages.sortOrder), asc(recipeImages.createdAt)]
      });
      const activeImageIds = activeImages.map((image) => image.id);

      if (
        orderedImageIds.length !== activeImageIds.length
        || activeImageIds.some((id) => !orderedImageIds.includes(id))
      ) {
        throw new Error("IMAGE_REORDER_MISMATCH");
      }

      for (const [index, imageId] of orderedImageIds.entries()) {
        await tx.update(recipeImages).set({
          sortOrder: index,
          updatedAt: new Date()
        }).where(eq(recipeImages.id, imageId));
      }

      await syncRecipeCoverImage(tx, recipeId);
    });
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }

  return await listRecipeImages(recipeId, userId);
};

export const getRecipeImageAsset = async ({
  imageId,
  variant,
  viewerId
}: {
  imageId: string;
  variant: RecipeImageVariant;
  viewerId: string | null;
}) => {
  let image: RecipeImageWithRecipe | undefined;

  try {
    image = await db.query.recipeImages.findFirst({
      where: eq(recipeImages.id, imageId),
      with: {
        recipe: true
      }
    }) as RecipeImageWithRecipe | undefined;
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }

  if (!image || !image.recipe || image.deletedAt || image.status !== "ready") {
    throw new Error("NOT_FOUND");
  }

  const isOwner = viewerId === image.recipe.authorId;
  if (!isOwner && image.recipe.publicationState !== "published") {
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

  const isPublished = image.recipe.publicationState === "published";

  return {
    body: object.body,
    contentType: object.contentType ?? (variant === "original" ? image.mimeType : "image/webp"),
    cacheControl: isPublished
      ? "public, max-age=31536000, immutable"
      : "private, max-age=3600"
  };
};

export const buildRecipeImageStorageKeys = ({
  recipeId,
  imageId,
  originalExtension
}: {
  recipeId: string;
  imageId: string;
  originalExtension: string;
}) => ({
  storageKeyOriginal: buildRecipeImageStorageKey({
    recipeId,
    imageId,
    variant: "original",
    extension: originalExtension
  }),
  storageKeyLarge: buildRecipeImageStorageKey({
    recipeId,
    imageId,
    variant: "large",
    extension: "webp"
  }),
  storageKeyMedium: buildRecipeImageStorageKey({
    recipeId,
    imageId,
    variant: "medium",
    extension: "webp"
  }),
  storageKeyThumb: buildRecipeImageStorageKey({
    recipeId,
    imageId,
    variant: "thumb",
    extension: "webp"
  })
});

export const uploadRecipeImageDerivatives = async ({
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
    storageAdapter.upload({
      key: storageKeyOriginal,
      body: originalBuffer,
      contentType: originalContentType
    }),
    storageAdapter.upload({
      key: storageKeyLarge,
      body: largeBuffer,
      contentType: "image/webp"
    }),
    storageAdapter.upload({
      key: storageKeyMedium,
      body: mediumBuffer,
      contentType: "image/webp"
    }),
    storageAdapter.upload({
      key: storageKeyThumb,
      body: thumbBuffer,
      contentType: "image/webp"
    })
  ]);
};

export const deleteRecipeImageObjects = async (
  keys: Array<string | null | undefined>
) => {
  await Promise.all(keys.filter((key): key is string => Boolean(key)).map(async (key) => {
    try {
      await storageAdapter.delete(key);
    } catch (error) {
      console.error("[recipe-images] failed to delete uploaded derivative", { key, error });
    }
  }));
};

export const listRecipeImagesByIds = async (imageIds: string[]) => {
  if (!imageIds.length) {
    return [];
  }

  try {
    return await db.query.recipeImages.findMany({
      where: inArray(recipeImages.id, imageIds)
    });
  } catch (error) {
    rethrowRecipeImagesSchemaMissing(error);
  }
};
