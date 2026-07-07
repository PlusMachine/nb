import { NextResponse } from "next/server";
import { z } from "zod";

import { assertRateLimit } from "@nb/auth";

import {
  MASTER_IMAGE_MAX_FILE_BYTES,
  masterImageAcceptedMimeTypes
} from "@/features/masters/contracts";
import {
  buildMasterImageStorageKeys,
  completeMasterImageUpload,
  deleteMasterImageObjects,
  markMasterImageUploadFailed,
  requestMasterImageUpload,
  retryMasterImageUpload,
  uploadMasterImageDerivatives
} from "@/features/masters/images";
import { processRecipeImageUpload } from "@/features/recipe-images/image-processing";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

const acceptedMimeTypes = new Set<string>(masterImageAcceptedMimeTypes);

// rawImageId/rawItemId идут напрямую в сервисный слой (drizzle eq(id, ...)) →
// мусорный uuid роняет Postgres с 22P02 вместо понятного 4xx. Пустая строка —
// легитимное «не задан» (новый слот/без изделия), не ошибка.
const masterImageUuidSchema = z.string().uuid();

const validateIncomingMasterImageFile = (file: File) => {
  if (!acceptedMimeTypes.has(file.type)) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("INVALID_IMAGE_SIZE");
  }

  if (file.size > MASTER_IMAGE_MAX_FILE_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
};

const mapUploadError = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message === "NOT_FOUND") {
      return { status: 404, message: "Профиль мастера или изделие не найдены." };
    }

    if (error.message === "PROFILE_LOCKED_PENDING") {
      return { status: 409, message: "Пока заявка на модерации, фото менять нельзя." };
    }

    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return { status: 400, message: "Поддерживаются только JPG, PNG и WEBP." };
    }

    if (error.message === "IMAGE_TOO_LARGE") {
      return { status: 400, message: "Размер файла превышает 10 МБ." };
    }

    if (error.message === "IMAGE_LIMIT_REACHED") {
      return { status: 400, message: "Можно загрузить не больше 24 фотографий на витрину." };
    }

    if (error.message === "ITEM_IMAGE_LIMIT_REACHED") {
      return { status: 400, message: "У одного изделия — не больше 6 фотографий." };
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

  try {
    await assertRateLimit(user.id, "master_image_upload", 30, 60 * 60);
  } catch {
    return NextResponse.json({ ok: false, message: "Слишком много загрузок подряд. Попробуйте позже." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const rawItemId = String(formData.get("itemId") ?? "").trim();
  const rawImageId = String(formData.get("imageId") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Файл не найден." }, { status: 400 });
  }

  if (rawItemId && !masterImageUuidSchema.safeParse(rawItemId).success) {
    return NextResponse.json({ ok: false, message: "Некорректный идентификатор изделия." }, { status: 400 });
  }

  if (rawImageId && !masterImageUuidSchema.safeParse(rawImageId).success) {
    return NextResponse.json({ ok: false, message: "Некорректный идентификатор фото." }, { status: 400 });
  }

  try {
    validateIncomingMasterImageFile(file);
  } catch (error) {
    const mapped = mapUploadError(error);
    return NextResponse.json({ ok: false, message: mapped.message }, { status: mapped.status });
  }

  let uploadSlot: { id: string; profileId: string } | null = null;
  let uploadedKeys: string[] = [];

  try {
    const slot = rawImageId
      ? await retryMasterImageUpload({
        imageId: rawImageId,
        userId: user.id,
        mimeType: file.type,
        sizeBytes: file.size
      })
      : await requestMasterImageUpload({
        userId: user.id,
        itemId: rawItemId || null,
        mimeType: file.type,
        sizeBytes: file.size
      });

    uploadSlot = { id: slot.id, profileId: slot.profileId };

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const processed = await processRecipeImageUpload(imageBuffer, file.type);
    const storageKeys = buildMasterImageStorageKeys({
      profileId: slot.profileId,
      imageId: slot.id,
      originalExtension: processed.originalExtension
    });
    uploadedKeys = Object.values(storageKeys);

    await uploadMasterImageDerivatives({
      ...storageKeys,
      originalBuffer: processed.originalBuffer,
      originalContentType: processed.originalContentType,
      largeBuffer: processed.largeBuffer,
      mediumBuffer: processed.mediumBuffer,
      thumbBuffer: processed.thumbBuffer
    });

    const image = await completeMasterImageUpload({
      imageId: slot.id,
      userId: user.id,
      mimeType: file.type,
      sizeBytes: file.size,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
      ...storageKeys
    });

    return NextResponse.json({ ok: true, image });
  } catch (error) {
    let failedImage = null;

    if (uploadSlot) {
      await deleteMasterImageObjects(uploadedKeys);

      try {
        failedImage = await markMasterImageUploadFailed(uploadSlot.id, user.id);
      } catch (markError) {
        console.error("[master-images] failed to mark upload as failed", markError);
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
