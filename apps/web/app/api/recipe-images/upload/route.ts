import { NextResponse } from "next/server";

import {
  recipeImageAcceptedMimeTypes,
  RECIPE_IMAGE_MAX_FILE_BYTES
} from "@/features/recipe-images/contracts";
import {
  buildRecipeImageAltFallback,
  buildRecipeImageStorageKeys,
  completeRecipeImageUpload,
  createRecipeDraftIfNeededForImageUpload,
  deleteRecipeImageObjects,
  markRecipeImageUploadFailed,
  requestRecipeImageUpload,
  retryRecipeImageUpload,
  uploadRecipeImageDerivatives
} from "@/features/recipe-images/service";
import { processRecipeImageUpload } from "@/features/recipe-images/image-processing";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

const acceptedMimeTypes = new Set<string>(recipeImageAcceptedMimeTypes);

const validateIncomingRecipeImageFile = (file: File) => {
  if (!acceptedMimeTypes.has(file.type)) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("INVALID_IMAGE_SIZE");
  }

  if (file.size > RECIPE_IMAGE_MAX_FILE_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
};

const mapUploadError = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message === "NOT_FOUND") {
      return { status: 404, message: "Рецепт не найден или недоступен." };
    }

    if (error.message === "RECIPE_IMAGES_SCHEMA_MISSING") {
      return { status: 503, message: "Фото временно недоступны. Попробуйте позже." };
    }

    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return { status: 400, message: "Поддерживаются только JPG, PNG и WEBP." };
    }

    if (error.message === "IMAGE_TOO_LARGE") {
      return { status: 400, message: "Размер файла превышает 10 МБ." };
    }

    if (error.message === "IMAGE_LIMIT_REACHED") {
      return { status: 400, message: "Можно загрузить не больше 8 фотографий." };
    }

    if (error.message === "IMAGE_TOTAL_SIZE_LIMIT_REACHED") {
      return { status: 400, message: "Суммарный лимит фотографий для рецепта — 40 МБ." };
    }

    if (error.message === "IMAGE_RETRY_NOT_ALLOWED") {
      return { status: 400, message: "Повторная загрузка для этого файла сейчас недоступна." };
    }

    if (["INVALID_IMAGE_SIZE", "IMAGE_DIMENSIONS_MISSING", "INVALID_IMAGE_FILE"].includes(error.message)) {
      return { status: 400, message: "Файл не похож на изображение." };
    }
  }

  return { status: 500, message: "Не удалось загрузить изображение." };
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Требуется авторизация." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const rawRecipeId = String(formData.get("recipeId") ?? "").trim();
  const rawImageId = String(formData.get("imageId") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Файл не найден." }, { status: 400 });
  }

  try {
    validateIncomingRecipeImageFile(file);
  } catch (error) {
    const mapped = mapUploadError(error);
    return NextResponse.json({ ok: false, message: mapped.message }, { status: mapped.status });
  }

  let uploadSlot:
    | {
      id: string;
      recipeId: string;
    }
    | null = null;
  let uploadedKeys: string[] = [];

  try {
    const recipe = await createRecipeDraftIfNeededForImageUpload(user.id, rawRecipeId || null);
    const slot = rawImageId
      ? await retryRecipeImageUpload({
        imageId: rawImageId,
        userId: user.id,
        mimeType: file.type,
        sizeBytes: file.size
      })
      : await requestRecipeImageUpload({
        recipeId: recipe.id,
        userId: user.id,
        mimeType: file.type,
        sizeBytes: file.size
      });

    uploadSlot = {
      id: slot.id,
      recipeId: slot.recipeId
    };

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const processed = await processRecipeImageUpload(imageBuffer, file.type);
    const storageKeys = buildRecipeImageStorageKeys({
      recipeId: slot.recipeId,
      imageId: slot.id,
      originalExtension: processed.originalExtension
    });
    uploadedKeys = Object.values(storageKeys);

    await uploadRecipeImageDerivatives({
      ...storageKeys,
      originalBuffer: processed.originalBuffer,
      originalContentType: processed.originalContentType,
      largeBuffer: processed.largeBuffer,
      mediumBuffer: processed.mediumBuffer,
      thumbBuffer: processed.thumbBuffer
    });

    const image = await completeRecipeImageUpload({
      imageId: slot.id,
      userId: user.id,
      mimeType: file.type,
      sizeBytes: file.size,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
      altText: buildRecipeImageAltFallback(recipe.title),
      ...storageKeys
    });

    return NextResponse.json({
      ok: true,
      image
    });
  } catch (error) {
    let failedImage = null;

    if (uploadSlot) {
      await deleteRecipeImageObjects(uploadedKeys);

      try {
        failedImage = await markRecipeImageUploadFailed(uploadSlot.id, user.id);
      } catch (markError) {
        console.error("[recipe-images] failed to mark upload as failed", markError);
      }
    }

    const mapped = mapUploadError(error);
    return NextResponse.json({
      ok: false,
      message: mapped.message,
      image: failedImage
    }, { status: mapped.status });
  }
}
