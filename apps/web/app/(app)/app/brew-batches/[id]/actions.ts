"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { requireUser } from "@/lib/auth";
import {
  addBrewMeasurement,
  deleteBrewMeasurement,
  updateBrewBatchNotes,
  updateBrewBatchStatus
} from "@/features/brew-batches/service";
import {
  addBrewMeasurementSchema,
  brewBatchStatuses,
  type BrewBatchStatus
} from "@/features/brew-batches/contracts";

export type BrewActionResult = { ok: boolean; message: string };

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
    revalidateBatch(brewBatchId);
    return { ok: true, message: "Статус обновлён." };
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
