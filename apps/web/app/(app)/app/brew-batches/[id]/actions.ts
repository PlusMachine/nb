"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";

import { requireUser } from "@/lib/auth";
import {
  addBrewMeasurement,
  deleteBrewMeasurement,
  setBrewDayStepState,
  setBrewMeasurementFinal,
  updateBrewBatchNotes,
  updateBrewBatchPlannedFor,
  updateBrewBatchStatus,
  updateBrewBatchTastingNotes
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
import { bindBatchFermenter } from "@/features/devices/fermenter-binding";
import { bindBatchFermenterSchema } from "@/features/devices/contracts";

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
  input: { gravitySg: string | number; takenAt?: string | null; note?: string | null; isFinal?: boolean }
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    const parsed = addBrewMeasurementSchema.parse({
      gravitySg: input.gravitySg,
      takenAt: input.takenAt?.trim() ? input.takenAt : undefined,
      note: input.note?.trim() || null,
      isFinal: input.isFinal ?? false
    });
    await addBrewMeasurement(user.id, brewBatchId, {
      gravitySg: parsed.gravitySg,
      takenAt: parsed.takenAt ?? null,
      note: parsed.note ?? null,
      isFinal: parsed.isFinal ?? false
    });
    revalidateBatch(brewBatchId);
    return { ok: true, message: parsed.isFinal ? "Финальный замер (FG) добавлен." : "Замер добавлен." };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, message: firstZodMessage(error) };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return { ok: false, message: "Слишком часто. Подождите немного и попробуйте снова." };
    }
    if (error instanceof Error && error.message === "BREW_MEASUREMENT_QUOTA_REACHED") {
      return { ok: false, message: "Достигнут предел числа замеров для этой партии (300)." };
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

export const setBrewMeasurementFinalAction = async (
  brewBatchId: string,
  measurementId: string,
  isFinal: boolean
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    await setBrewMeasurementFinal(user.id, brewBatchId, measurementId, isFinal);
    revalidateBatch(brewBatchId);
    return { ok: true, message: isFinal ? "Замер отмечен как финальный (FG)." : "Отметка FG снята." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Замер не найден." };
    }
    return { ok: false, message: "Не удалось изменить отметку." };
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

export const updateBrewBatchTastingNotesAction = async (
  brewBatchId: string,
  tastingNotes: string | null
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    await updateBrewBatchTastingNotes(user.id, brewBatchId, tastingNotes);
    revalidateBatch(brewBatchId);
    return { ok: true, message: "Дегустация сохранена." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    return { ok: false, message: "Не удалось сохранить дегустацию." };
  }
};

// --- Дата варки (акт «Подготовка») -------------------------------------------

const plannedForInputSchema = z.string().datetime().nullable();

export const setBrewBatchPlannedForAction = async (
  brewBatchId: string,
  plannedForIso: string | null
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    const parsed = plannedForInputSchema.safeParse(plannedForIso);
    if (!parsed.success) {
      return { ok: false, message: "Некорректная дата." };
    }
    await updateBrewBatchPlannedFor(user.id, brewBatchId, parsed.data ? new Date(parsed.data) : null);
    revalidateBatch(brewBatchId);
    return { ok: true, message: parsed.data ? "Дата варки обновлена." : "Дата варки сброшена." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    if (error instanceof Error && error.message === "INVALID_STATUS") {
      return { ok: false, message: "Дату можно менять только у запланированной варки." };
    }
    return { ok: false, message: "Не удалось сохранить дату." };
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
    // Дрожжей на складе меньше, чем требует рецепт: списание не падает, а ужимается
    // до остатка (см. inventory.ts). Молчать об этом нельзя — «Списано» без оговорки
    // читается как «всё по рецепту».
    const short = view.consumed.filter((line) => line.requiredQuantityNormalized != null);
    if (short.length > 0) {
      const names = short.map((line) => line.ingredientDisplayName?.trim() || "ингредиент").join(", ");
      return { ok: true, message: `Ингредиенты списаны. На складе не хватило: ${names} — списали остаток.`, view };
    }
    return { ok: true, message: "Ингредиенты списаны со склада.", view };
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_CONSUMED") {
      return { ok: false, message: "По этой партии ингредиенты уже списаны со склада." };
    }
    if (error instanceof Error && error.message === "INVALID_STATUS") {
      return { ok: false, message: "Списание доступно только для активной варки." };
    }
    if (error instanceof Error && error.message === "RECIPE_UNAVAILABLE") {
      return { ok: false, message: "Рецепт-источник больше недоступен — авто-списание невозможно." };
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

// --- Привязка прибора-ферментера (§8.4) --------------------------------------

/**
 * Привязать/отвязать прибор-ферментер к бродящей партии — акт «Брожение».
 * deviceId=null — явная отвязка (граничный случай §8.4: прибор больше не в
 * режиме ферментации; данные истории остаются, привязка снимается вручную).
 */
export const bindBatchFermenterAction = async (
  brewBatchId: string,
  deviceId: string | null
): Promise<BrewActionResult> => {
  try {
    const user = await requireUser();
    const parsed = bindBatchFermenterSchema.parse({ deviceId });
    await bindBatchFermenter(user.id, brewBatchId, parsed.deviceId);
    revalidateBatch(brewBatchId);
    return { ok: true, message: parsed.deviceId ? "Прибор привязан." : "Прибор отвязан." };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, message: firstZodMessage(error) };
    }
    if (error instanceof Error && error.message === "BREW_BATCH_NOT_FOUND") {
      return { ok: false, message: "Варка не найдена." };
    }
    if (error instanceof Error && error.message === "BATCH_NOT_FERMENTING") {
      return { ok: false, message: "Привязать прибор можно только во время брожения." };
    }
    if (error instanceof Error && error.message === "DEVICE_NOT_FOUND") {
      return { ok: false, message: "Прибор не найден." };
    }
    return { ok: false, message: "Не удалось обновить привязку." };
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
