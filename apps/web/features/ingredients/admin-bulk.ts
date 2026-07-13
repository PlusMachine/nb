import { ZodError } from "zod";

import type { CatalogBulkFailure } from "./admin-page-model";
import { deleteIngredient, getIngredientById, updateIngredient } from "./service";

export type BulkArchiveResult = {
  archivedIds: string[];
  failures: CatalogBulkFailure[];
};

export type BulkDeleteResult = {
  /** Удалены из каталога полностью. */
  deletedIds: string[];
  /** На карточку есть ссылки (склад/рецепты) — переведены в архив вместо удаления. */
  archivedIds: string[];
  failures: CatalogBulkFailure[];
};

const MAX_BULK_SIZE = 200;

export const normalizeBulkIds = (ids: string[]): string[] => (
  [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_BULK_SIZE)
);

const resolveFailureReason = (error: unknown): CatalogBulkFailure["reason"] => (
  error instanceof ZodError ? "invalid" : "failed"
);

/**
 * Архив = isActive: false. Пометка `_catalog_status: "draft"` в атрибутах
 * перекрывает флаг активности (см. buildCatalogStatus), поэтому её снимаем —
 * иначе черновик после архивации остался бы черновиком.
 */
export const archiveCatalogIngredients = async (
  ids: string[],
  actorId: string
): Promise<BulkArchiveResult> => {
  const archivedIds: string[] = [];
  const failures: CatalogBulkFailure[] = [];

  for (const id of normalizeBulkIds(ids)) {
    const current = await getIngredientById(id);
    if (!current) {
      failures.push({ id, reason: "missing" });
      continue;
    }

    if (current.status === "merged") {
      failures.push({ id, reason: "merged" });
      continue;
    }

    const attributes = { ...current.attributes };
    if (attributes._catalog_status === "draft") {
      delete attributes._catalog_status;
    }

    try {
      // updateIngredient отдаёт null, если строки уже нет: между чтением и записью
      // карточку могли удалить, и без этой проверки позиция попала бы в «архивировано».
      const updated = await updateIngredient(id, { isActive: false, attributes }, actorId);
      if (!updated) {
        failures.push({ id, reason: "missing" });
        continue;
      }

      archivedIds.push(id);
    } catch (error) {
      failures.push({ id, reason: resolveFailureReason(error) });
    }
  }

  return { archivedIds, failures };
};

export const deleteCatalogIngredients = async (
  ids: string[],
  actorId: string
): Promise<BulkDeleteResult> => {
  const deletedIds: string[] = [];
  const archivedIds: string[] = [];
  const failures: CatalogBulkFailure[] = [];

  for (const id of normalizeBulkIds(ids)) {
    try {
      const result = await deleteIngredient(id, actorId);
      if (!result) {
        failures.push({ id, reason: "missing" });
        continue;
      }

      if (result.archived) {
        archivedIds.push(id);
      } else {
        deletedIds.push(id);
      }
    } catch (error) {
      failures.push({ id, reason: resolveFailureReason(error) });
    }
  }

  return { deletedIds, archivedIds, failures };
};
