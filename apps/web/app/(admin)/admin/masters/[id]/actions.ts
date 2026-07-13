"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { recordAuditEvent } from "@/features/audit/service";
import {
  hideMasterImage,
  hideMasterItem,
  unhideMasterImage,
  unhideMasterItem
} from "@/features/masters/service";
import { requireRole } from "@/lib/auth";

// Точечная модерация Маркета: скрыть/показать отдельный товар или фото, не
// отправляя всю витрину мастера обратно на модерацию. Форма результата и
// маппинг ошибок — как в соседнем ../actions.ts.

const firstZodMessage = (error: ZodError): string => error.issues[0]?.message ?? "Проверьте корректность данных.";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Не найдено — возможно, страницу нужно обновить.",
  FORBIDDEN: "Недостаточно прав."
};

const mapMasterContentModerationError = (error: unknown): { ok: false; error: string } => {
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

// /market и /masters/[slug] отдаются с revalidate=300 — без явной ревалидации
// скрытие было бы видно публике только через 5 минут.
const revalidatePublicMasterPages = (slug: string | null) => {
  revalidatePath("/market");
  if (slug) {
    revalidatePath(`/masters/${slug}`);
  }
};

export type MasterContentModerationResult = { ok: true } | { ok: false; error: string };

export const hideMasterItemAction = async (
  itemId: string,
  reason: string
): Promise<MasterContentModerationResult> => {
  try {
    const user = await requireRole("moderator");
    const { item, masterSlug } = await hideMasterItem({ id: user.id, role: user.role }, itemId, reason);

    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "master.item_hide",
      entityType: "master_item",
      entityId: item.id,
      summary: `Товар скрыт: «${item.title}»`,
      payload: { profileId: item.profileId, reason: item.hiddenReason }
    });

    revalidatePath("/admin/masters");
    revalidatePublicMasterPages(masterSlug);
    return { ok: true };
  } catch (error) {
    return mapMasterContentModerationError(error);
  }
};

export const unhideMasterItemAction = async (itemId: string): Promise<MasterContentModerationResult> => {
  try {
    const user = await requireRole("moderator");
    const { item, masterSlug } = await unhideMasterItem({ id: user.id, role: user.role }, itemId);

    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "master.item_unhide",
      entityType: "master_item",
      entityId: item.id,
      summary: `Товар возвращён: «${item.title}»`,
      payload: { profileId: item.profileId }
    });

    revalidatePath("/admin/masters");
    revalidatePublicMasterPages(masterSlug);
    return { ok: true };
  } catch (error) {
    return mapMasterContentModerationError(error);
  }
};

// Фото — часть карточки товара, поэтому пишем те же события журнала
// (master.item_hide / master.item_unhide), отличая их entityType.
export const hideMasterImageAction = async (
  imageId: string,
  reason: string
): Promise<MasterContentModerationResult> => {
  try {
    const user = await requireRole("moderator");
    const { image, masterSlug } = await hideMasterImage({ id: user.id, role: user.role }, imageId, reason);

    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "master.item_hide",
      entityType: "master_image",
      entityId: image.id,
      summary: "Фото скрыто",
      payload: { profileId: image.profileId, itemId: image.itemId, reason: image.hiddenReason }
    });

    revalidatePath("/admin/masters");
    revalidatePublicMasterPages(masterSlug);
    return { ok: true };
  } catch (error) {
    return mapMasterContentModerationError(error);
  }
};

export const unhideMasterImageAction = async (imageId: string): Promise<MasterContentModerationResult> => {
  try {
    const user = await requireRole("moderator");
    const { image, masterSlug } = await unhideMasterImage({ id: user.id, role: user.role }, imageId);

    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "master.item_unhide",
      entityType: "master_image",
      entityId: image.id,
      summary: "Фото возвращено",
      payload: { profileId: image.profileId, itemId: image.itemId }
    });

    revalidatePath("/admin/masters");
    revalidatePublicMasterPages(masterSlug);
    return { ok: true };
  } catch (error) {
    return mapMasterContentModerationError(error);
  }
};
