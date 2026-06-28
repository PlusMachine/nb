"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { requireUser } from "@/lib/auth";
import {
  addBrewMeasurement,
  deleteBrewMeasurement,
  setBrewDayStepState,
  updateBrewBatchNotes,
  updateBrewBatchStatus
} from "@/features/brew-batches/service";
import {
  consumeBrewBatchInventory,
  restoreBrewBatchInventory
} from "@/features/brew-batches/inventory";
import {
  addBrewMeasurementSchema,
  brewBatchStatuses,
  brewDayStepStatePatchSchema,
  type BrewBatchInventoryView,
  type BrewBatchStatus,
  type BrewDayProgress
} from "@/features/brew-batches/contracts";

export type BrewActionResult = { ok: boolean; message: string };
export type BrewDayProgressResult = BrewActionResult & { progress?: BrewDayProgress };
export type BrewInventoryResult = BrewActionResult & { view?: BrewBatchInventoryView };

const revalidateBatch = (brewBatchId: string) => {
  revalidatePath(`/app/brew-batches/${brewBatchId}`);
  revalidatePath("/app/brew-batches");
};

const firstZodMessage = (error: ZodError): string =>
  error.issues[0]?.message ?? "Проверьте корректность данных.";

export const setBrewBatchStatusAction = async (
  brewBatchId: string,
  status: BrewBatchStatus
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    if (!brewBatchStatuses.includes(status)) {
      return { ok: false, message: "Неизвестный статус." };
    }
    await updateBrewBatchStatus(user.id, brewBatchId, status);
    // Отмена варки возвращает списанные на неё ингредиенты на склад (идемпотентно;
    // no-op, если ничего не списывалось). Откат — внутри транзакции restore.
    let restoredNote = "";
    if (status === "cancelled") {
      try {
        const { restoredItemCount } = await restoreBrewBatchInventory(user.id, brewBatchId);
        if (restoredItemCount > 0) {
          restoredNote = " Списанные ингредиенты возвращены на склад.";
        }
      } catch {
        // Возврат — best-effort; смену статуса не откатываем.
      }
    }
    revalidateBatch(brewBatchId);
    return { ok: true, message: `Статус обновлён.${restoredNote}` };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    return { ok: false, message: "Не удалось обновить статус." };
  }
};

export const addBrewMeasurementAction = async (
  brewBatchId: string,
  input: { gravitySg: string | number; takenAt?: string | null; note?: string | null }
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    const parsed = addBrewMeasurementSchema.parse({
      gravitySg: input.gravitySg,
      takenAt: input.takenAt?.trim() ? input.takenAt : undefined,
      note: input.note?.trim() || null
    });
    await addBrewMeasurement(user.id, brewBatchId, {
      gravitySg: parsed.gravitySg,
      takenAt: parsed.takenAt ?? null,
      note: parsed.note ?? null
    });
    revalidateBatch(brewBatchId);
    return { ok: true, message: "Замер добавлен." };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, message: firstZodMessage(error) };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    return { ok: false, message: "Не удалось добавить замер." };
  }
};

export const deleteBrewMeasurementAction = async (
  brewBatchId: string,
  measurementId: string
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    await deleteBrewMeasurement(user.id, brewBatchId, measurementId);
    revalidateBatch(brewBatchId);
    return { ok: true, message: "Замер удалён." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Замер не найден." };
    }
    return { ok: false, message: "Не удалось удалить замер." };
  }
};

export const updateBrewBatchNotesAction = async (
  brewBatchId: string,
  notes: string | null
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    await updateBrewBatchNotes(user.id, brewBatchId, notes);
    revalidateBatch(brewBatchId);
    return { ok: true, message: "Заметки сохранены." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    return { ok: false, message: "Не удалось сохранить заметки." };
  }
};

// --- Гид варочного дня -------------------------------------------------------

export const setBrewDayStepStateAction = async (
  brewBatchId: string,
  stepId: string,
  patch: { done?: boolean; timerStartedAt?: string | null }
): Promise<BrewDayProgressResult> => {
  try {
    const user = await requireUser();
    const parsed = brewDayStepStatePatchSchema.parse(patch);
    const progress = await setBrewDayStepState(user.id, brewBatchId, stepId, parsed);
    revalidateBatch(brewBatchId);
    return { ok: true, message: "Шаг обновлён.", progress };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, message: firstZodMessage(error) };
    }
    if (error instanceof Error && (error.message === "NOT_FOUND" || error.message === "UNKNOWN_STEP")) {
      return { ok: false, message: "Шаг варки не найден." };
    }
    return { ok: false, message: "Не удалось обновить шаг." };
  }
};

// --- Списание склада на варку ------------------------------------------------

export const consumeBrewBatchInventoryAction = async (
  brewBatchId: string
): Promise<BrewInventoryResult> => {
  try {
    const user = await requireUser();
    const view = await consumeBrewBatchInventory(user.id, brewBatchId);
    revalidateBatch(brewBatchId);
    if (!view.hasConsumed) {
      return { ok: false, message: "На складе нет сопоставленных позиций для списания.", view };
    }
    return { ok: true, message: "Ингредиенты списаны со склада.", view };
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_CONSUMED") {
      return { ok: false, message: "Ингредиенты рецепта уже списаны со склада." };
    }
    if (error instanceof Error && error.message === "INVALID_STATUS") {
      return { ok: false, message: "Списание доступно только для активной варки." };
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return { ok: false, message: "Недостаточно остатков на складе для списания." };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    return { ok: false, message: "Не удалось списать ингредиенты." };
  }
};

export const restoreBrewBatchInventoryAction = async (
  brewBatchId: string
): Promise<BrewInventoryResult> => {
  try {
    const user = await requireUser();
    const { view, restoredItemCount } = await restoreBrewBatchInventory(user.id, brewBatchId);
    revalidateBatch(brewBatchId);
    return {
      ok: true,
      message: restoredItemCount > 0 ? "Ингредиенты возвращены на склад." : "Возвращать нечего.",
      view
    };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    return { ok: false, message: "Не удалось вернуть ингредиенты." };
  }
};
