"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { requireUser } from "@/lib/auth";
import { addBatchTask, changeBatchTask, saveBatchVolumes, updateEquipmentFromBatch } from "@/features/brew-batches/records-service";
import { batchTaskInputSchema, calibrationSchema, volumeMeasurementsSchema } from "@/features/brew-batches/records";

const uuid = z.string().uuid("Партия не найдена.");
const run = async (id: string, work: (userId: string) => Promise<unknown>) => {
  try {
    const user = await requireUser();
    uuid.parse(id);
    await work(user.id);
    revalidatePath(`/app/brew-batches/${id}`);
    revalidatePath("/app/brew-batches");
    revalidatePath("/app");
    revalidatePath("/app/equipment");
    return { ok: true as const, message: "Сохранено" };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false as const, message: error.issues[0]?.message ?? "Проверьте данные." };
    const messages: Record<string, string> = {
      NOT_FOUND: "Партия или задача не найдена.",
      NO_PROFILE: "Профиль пивоварни удалён или недоступен.",
      STALE_PREVIEW: "Замеры или настройки изменились. Обновите страницу и проверьте значения.",
      INVALID_VOLUMES: "Для расчёта нужны объёмы до и после кипячения, а также в ферментере. Проверьте значения.",
      TASK_QUOTA: "Можно сохранить не больше 1000 задач. Удалите ненужные.",
      RATE_LIMITED: "Вы добавляете задачи слишком часто. Попробуйте чуть позже."
    };
    return { ok: false as const, message: messages[error instanceof Error ? error.message : ""] ?? "Не удалось сохранить. Попробуйте ещё раз." };
  }
};
export const saveBatchVolumesAction = async (id: string, input: unknown) => run(id, userId => saveBatchVolumes(userId, id, input));
export const calibrateBatchEquipmentAction = async (id: string, input: unknown) => run(id, userId => {
  const parsed = calibrationSchema.extend({ profileUpdatedAt: z.string().datetime(), volumes: volumeMeasurementsSchema }).parse(input);
  return updateEquipmentFromBatch(userId, id, parsed);
});
export const addBatchTaskAction = async (id: string, input: unknown) => run(id, userId => addBatchTask(userId, id, batchTaskInputSchema.parse(input)));
export const changeBatchTaskAction = async (id: string, taskId: string, input: unknown) => run(id, userId => {
  uuid.parse(taskId);
  const parsed = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("complete"), completed: z.boolean() }),
    z.object({ kind: z.literal("edit"), input: batchTaskInputSchema }),
    z.object({ kind: z.literal("remove") })
  ]).parse(input);
  return changeBatchTask(userId, id, taskId, parsed.kind === "remove" ? { remove: true } : parsed.kind === "edit" ? { input: parsed.input } : { completed: parsed.completed });
});
