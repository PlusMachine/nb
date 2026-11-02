"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUser } from "@/lib/auth";
import { manualTransferInputSchema, type ManualTransferInput } from "@/features/brew-batches/manual-transfer";
import { saveManualBrewTransfer } from "@/features/brew-batches/service";
import type { BrewDayProgressResult } from "./actions";

export async function saveManualBrewTransferAction(batchId: string, input: ManualTransferInput): Promise<BrewDayProgressResult> {
  try {
    const user = await requireUser();
    const parsed = manualTransferInputSchema.parse(input);
    const progress = await saveManualBrewTransfer(user.id, batchId, parsed);
    revalidatePath(`/app/brew-batches/${batchId}`);
    revalidatePath("/app/brew-batches");
    return { ok: true, message: "Замеры сохранены.", progress };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, message: error.issues[0]?.message ?? "Проверьте замеры." };
    const messages: Record<string, string> = { NOT_FOUND: "Партия не найдена.", INVALID_STAGE: "Этап партии изменился. Обновите страницу.", BREW_MEASUREMENT_QUOTA_REACHED: "Для партии уже записано 300 замеров.", RATE_LIMITED: "Слишком часто. Повторите сохранение чуть позже." };
    const code = error instanceof Error ? error.message : "";
    return { ok: false, message: messages[code] ?? "Не удалось сохранить замеры. Повторите отправку.", retryable: !messages[code] || code === "RATE_LIMITED" };
  }
}
