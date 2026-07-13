"use server";

import { revalidatePath } from "next/cache";

import { recordAuditEvent } from "@/features/audit/service";
import {
  archiveCatalogIngredients,
  deleteCatalogIngredients,
  normalizeBulkIds
} from "@/features/ingredients/admin-bulk";
import {
  countCatalogBulkFailures,
  describeCatalogBulkFailures,
  groupCatalogBulkFailures,
  type CatalogBulkFailureGroup
} from "@/features/ingredients/admin-page-model";
import { invalidateIngredientsCatalogCache } from "@/features/ingredients/service";
import { requireRole } from "@/lib/auth";

/**
 * Частичный отказ — штатный исход: часть позиций обработана, часть нет.
 * Поэтому `failed` едет и в успешном варианте — иначе упавшие позиции
 * потерялись бы за зелёным {ok:true}.
 */
export type CatalogBulkActionResult =
  | { ok: true; processed: number; archived: number; deleted: number; failed: CatalogBulkFailureGroup[] }
  | { ok: false; error: string; failed?: CatalogBulkFailureGroup[] };

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Недостаточно прав.",
  NOT_FOUND: "Не найдено — возможно, страницу нужно обновить."
};

const mapCatalogBulkError = (error: unknown): { ok: false; error: string } => {
  // requireRole уводит гостя редиректом — «редирект-как-ошибку» проглатывать
  // нельзя, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }

    if (ERROR_MESSAGES[error.message]) {
      return { ok: false, error: ERROR_MESSAGES[error.message] };
    }
  }

  return { ok: false, error: "Не удалось выполнить операцию." };
};

const refreshCatalog = () => {
  invalidateIngredientsCatalogCache();
  revalidatePath("/admin/ingredients");
  revalidatePath("/catalog");
};

const withReasons = (message: string, failed: CatalogBulkFailureGroup[]): string => (
  failed.length > 0 ? `${message}: ${describeCatalogBulkFailures(failed)}.` : `${message}.`
);

export const archiveCatalogIngredientsAction = async (ids: string[]): Promise<CatalogBulkActionResult> => {
  try {
    const user = await requireRole("admin");
    const targetIds = normalizeBulkIds(ids);
    if (targetIds.length === 0) {
      return { ok: false, error: "Не выбрано ни одного ингредиента." };
    }

    const result = await archiveCatalogIngredients(targetIds, user.id);
    refreshCatalog();

    const failed = groupCatalogBulkFailures(result.failures);

    if (result.archivedIds.length > 0) {
      await recordAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "ingredient.update",
        entityType: "ingredient",
        entityId: result.archivedIds.length === 1 ? result.archivedIds[0] : null,
        summary: `Архивация ингредиентов: ${result.archivedIds.length}`
          + (failed.length > 0 ? `, не прошло: ${countCatalogBulkFailures(failed)}` : ""),
        payload: { mode: "archive", ids: result.archivedIds, failed }
      });

      return {
        ok: true,
        processed: result.archivedIds.length,
        archived: result.archivedIds.length,
        deleted: 0,
        failed
      };
    }

    return {
      ok: false,
      error: withReasons("Не удалось архивировать выбранные позиции", failed),
      failed
    };
  } catch (error) {
    return mapCatalogBulkError(error);
  }
};

export const deleteCatalogIngredientsAction = async (ids: string[]): Promise<CatalogBulkActionResult> => {
  try {
    const user = await requireRole("admin");
    const targetIds = normalizeBulkIds(ids);
    if (targetIds.length === 0) {
      return { ok: false, error: "Не выбрано ни одного ингредиента." };
    }

    const result = await deleteCatalogIngredients(targetIds, user.id);
    refreshCatalog();

    const failed = groupCatalogBulkFailures(result.failures);
    const processed = result.deletedIds.length + result.archivedIds.length;

    if (processed > 0) {
      await recordAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "ingredient.delete",
        entityType: "ingredient",
        entityId: processed === 1 ? (result.deletedIds[0] ?? result.archivedIds[0] ?? null) : null,
        summary: `Удаление ингредиентов: ${result.deletedIds.length}, в архив: ${result.archivedIds.length}`
          + (failed.length > 0 ? `, не прошло: ${countCatalogBulkFailures(failed)}` : ""),
        payload: {
          deletedIds: result.deletedIds,
          archivedIds: result.archivedIds,
          failed
        }
      });

      return {
        ok: true,
        processed,
        archived: result.archivedIds.length,
        deleted: result.deletedIds.length,
        failed
      };
    }

    return {
      ok: false,
      error: withReasons("Не удалось удалить выбранные позиции", failed),
      failed
    };
  } catch (error) {
    return mapCatalogBulkError(error);
  }
};
