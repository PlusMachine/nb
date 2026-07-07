"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { assertRateLimit } from "@nb/auth";

import {
  createMasterItem,
  createMasterProfile,
  deleteMasterItem,
  reorderMasterItems,
  setOwnListed,
  submitForReview,
  updateMasterItem,
  updateMasterProfile,
  withdrawSubmission,
  type MasterItemDto,
  type MasterProfileDto
} from "@/features/masters/service";
import {
  deleteMasterImage,
  reorderMasterImages,
  setMasterItemCover,
  type MasterImageDto,
  type MasterItemCoverDto
} from "@/features/masters/images";
import { requireUser } from "@/lib/auth";

// Server actions кабинета мастера (/app/master) — по образцу
// app/(admin)/admin/feedback/actions.ts (requireUser → сервис → revalidatePath →
// {ok:true}|{ok:false,error}) и app/(admin)/admin/articles/actions.ts (маппинг
// ZodError/NEXT_REDIRECT).

const firstZodMessage = (error: ZodError): string => error.issues[0]?.message ?? "Проверьте корректность данных.";

const ERROR_MESSAGES: Record<string, string> = {
  PROFILE_EXISTS: "У вас уже есть профиль мастера.",
  NOT_FOUND: "Не найдено — возможно, страницу нужно обновить.",
  PROFILE_LOCKED_PENDING: "Пока заявка на модерации, править нельзя.",
  ITEM_LIMIT_REACHED: "Можно добавить не больше 12 изделий.",
  ITEM_REORDER_MISMATCH: "Список изделий уже изменился — обновите страницу.",
  PROFILE_INCOMPLETE: "Заполните профиль полностью перед отправкой на модерацию.",
  SUBMIT_NOT_ALLOWED: "Заявка уже на модерации.",
  UPLOAD_IN_PROGRESS: "Дождитесь окончания загрузки фото, потом отправляйте на модерацию.",
  WITHDRAW_NOT_ALLOWED: "Заявка не на модерации — отзывать нечего.",
  IMAGE_LIMIT_REACHED: "Можно загрузить не больше 24 фотографий на витрину.",
  ITEM_IMAGE_LIMIT_REACHED: "У одного изделия — не больше 6 фотографий.",
  IMAGE_NOT_ELIGIBLE: "Это фото нельзя сделать обложкой этого изделия.",
  IMAGE_REORDER_MISMATCH: "Порядок фото уже изменился — обновите страницу.",
  RATE_LIMITED: "Слишком много попыток подряд. Попробуйте позже."
};

const mapMasterError = (error: unknown): { ok: false; error: string } => {
  // Пробрасываем редирект Next (requireUser → redirect на /login для гостя/
  // истёкшей сессии): его нельзя глотать как обычную ошибку.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }

  if (error instanceof ZodError) {
    return { ok: false, error: firstZodMessage(error) };
  }

  if (error instanceof Error && ERROR_MESSAGES[error.message]) {
    return { ok: false, error: ERROR_MESSAGES[error.message] };
  }

  return { ok: false, error: "Не удалось выполнить операцию." };
};

const revalidateMasterCabinet = () => revalidatePath("/app/master");

// --- Профиль ------------------------------------------------------------------------

export type MasterProfileActionResult =
  | { ok: true; profile: MasterProfileDto }
  | { ok: false; error: string };

export const createMasterProfileAction = async (input: unknown): Promise<MasterProfileActionResult> => {
  try {
    const user = await requireUser();
    const profile = await createMasterProfile(user.id, input);
    revalidateMasterCabinet();
    return { ok: true, profile };
  } catch (error) {
    return mapMasterError(error);
  }
};

export const updateMasterProfileAction = async (input: unknown): Promise<MasterProfileActionResult> => {
  try {
    const user = await requireUser();
    const profile = await updateMasterProfile(user.id, input);
    revalidateMasterCabinet();
    return { ok: true, profile };
  } catch (error) {
    return mapMasterError(error);
  }
};

export const submitMasterForReviewAction = async (): Promise<MasterProfileActionResult> => {
  try {
    const user = await requireUser();
    await assertRateLimit(user.id, "master_submit", 10, 60 * 60);
    const profile = await submitForReview(user.id);
    revalidateMasterCabinet();
    return { ok: true, profile };
  } catch (error) {
    return mapMasterError(error);
  }
};

export const withdrawMasterSubmissionAction = async (): Promise<MasterProfileActionResult> => {
  try {
    const user = await requireUser();
    const profile = await withdrawSubmission(user.id);
    revalidateMasterCabinet();
    return { ok: true, profile };
  } catch (error) {
    return mapMasterError(error);
  }
};

export const setOwnMasterListedAction = async (isListed: boolean): Promise<MasterProfileActionResult> => {
  try {
    const user = await requireUser();
    const profile = await setOwnListed(user.id, isListed);
    revalidateMasterCabinet();
    return { ok: true, profile };
  } catch (error) {
    return mapMasterError(error);
  }
};

// --- Изделия ------------------------------------------------------------------------

export type MasterItemActionResult =
  | { ok: true; item: MasterItemDto }
  | { ok: false; error: string };

export const createMasterItemAction = async (input: unknown): Promise<MasterItemActionResult> => {
  try {
    const user = await requireUser();
    const item = await createMasterItem(user.id, input);
    revalidateMasterCabinet();
    return { ok: true, item };
  } catch (error) {
    return mapMasterError(error);
  }
};

export const updateMasterItemAction = async (itemId: string, input: unknown): Promise<MasterItemActionResult> => {
  try {
    const user = await requireUser();
    const item = await updateMasterItem(user.id, itemId, input);
    revalidateMasterCabinet();
    return { ok: true, item };
  } catch (error) {
    return mapMasterError(error);
  }
};

export const deleteMasterItemAction = async (itemId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const user = await requireUser();
    await deleteMasterItem(user.id, itemId);
    revalidateMasterCabinet();
    return { ok: true };
  } catch (error) {
    return mapMasterError(error);
  }
};

export type MasterItemsActionResult =
  | { ok: true; items: MasterItemDto[] }
  | { ok: false; error: string };

export const reorderMasterItemsAction = async (itemIds: string[]): Promise<MasterItemsActionResult> => {
  try {
    const user = await requireUser();
    const items = await reorderMasterItems(user.id, itemIds);
    revalidateMasterCabinet();
    return { ok: true, items };
  } catch (error) {
    return mapMasterError(error);
  }
};

// --- Фото ---------------------------------------------------------------------------

export const deleteMasterImageAction = async (imageId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const user = await requireUser();
    await deleteMasterImage(user.id, imageId);
    revalidateMasterCabinet();
    return { ok: true };
  } catch (error) {
    return mapMasterError(error);
  }
};

export type MasterItemCoverActionResult =
  | { ok: true; item: MasterItemCoverDto }
  | { ok: false; error: string };

export const setMasterItemCoverAction = async (
  itemId: string,
  imageId: string | null
): Promise<MasterItemCoverActionResult> => {
  try {
    const user = await requireUser();
    const item = await setMasterItemCover(user.id, itemId, imageId);
    revalidateMasterCabinet();
    return { ok: true, item };
  } catch (error) {
    return mapMasterError(error);
  }
};

export type MasterImagesActionResult =
  | { ok: true; images: MasterImageDto[] }
  | { ok: false; error: string };

export const reorderMasterImagesAction = async (
  scope: { itemId: string | null; imageIds: string[] }
): Promise<MasterImagesActionResult> => {
  try {
    const user = await requireUser();
    const images = await reorderMasterImages(user.id, scope);
    revalidateMasterCabinet();
    return { ok: true, images };
  } catch (error) {
    return mapMasterError(error);
  }
};

