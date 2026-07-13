"use server";

import { revalidatePath } from "next/cache";

import { deletePushSubscriptionById } from "@/features/notifications/admin";
import { requireRole } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Подписка не найдена — обновите страницу."
};

export type PushSubscriptionActionResult = { ok: true } | { ok: false; error: string };

export const deletePushSubscriptionAction = async (
  subscriptionId: string
): Promise<PushSubscriptionActionResult> => {
  try {
    await requireRole("admin");
    await deletePushSubscriptionById(subscriptionId);
    revalidatePath("/admin/push");
    return { ok: true };
  } catch (error) {
    if (error instanceof Error) {
      const digest = (error as Error & { digest?: unknown }).digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        throw error;
      }

      if (ERROR_MESSAGES[error.message]) {
        return { ok: false, error: ERROR_MESSAGES[error.message] };
      }
    }

    return { ok: false, error: "Не удалось удалить подписку." };
  }
};
