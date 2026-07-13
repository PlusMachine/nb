"use server";

import { revalidatePath } from "next/cache";

import { recordAuditEvent } from "@/features/audit/service";
import { feedbackStatusLabels, feedbackStatuses, type FeedbackStatus } from "@/features/feedback/contracts";
import { updateFeedbackStatus } from "@/features/feedback/service";
import { requireRole } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Обращение не найдено — обновите страницу.",
  FORBIDDEN: "Недостаточно прав.",
  INVALID_STATUS: "Неизвестный статус обращения."
};

const mapFeedbackError = (error: unknown): { ok: false; error: string } => {
  // requireRole делает redirect для гостя/недостаточной роли — проглотить его
  // нельзя, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }

  if (error instanceof Error && ERROR_MESSAGES[error.message]) {
    return { ok: false, error: ERROR_MESSAGES[error.message] };
  }

  return { ok: false, error: "Не удалось обновить статус." };
};

export const updateFeedbackStatusAction = async (input: {
  id: string;
  status: FeedbackStatus;
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const user = await requireRole("moderator");

    if (!feedbackStatuses.includes(input.status)) {
      return { ok: false, error: ERROR_MESSAGES.INVALID_STATUS };
    }

    const updated = await updateFeedbackStatus({ id: user.id, role: user.role }, input.id, input.status, input.note);

    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "feedback.resolve",
      entityType: "feedback",
      entityId: updated.id,
      summary: `Статус: ${feedbackStatusLabels[input.status]}`,
      payload: {
        status: input.status,
        resolutionNote: updated.resolutionNote
      }
    });

    revalidatePath("/admin/feedback");
    return { ok: true };
  } catch (error) {
    return mapFeedbackError(error);
  }
};
