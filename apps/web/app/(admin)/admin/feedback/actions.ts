"use server";

import { revalidatePath } from "next/cache";

import { feedbackStatuses, type FeedbackStatus } from "@/features/feedback/contracts";
import { updateFeedbackStatus } from "@/features/feedback/service";
import { requireRole } from "@/lib/auth";

export const updateFeedbackStatusAction = async (input: {
  id: string;
  status: FeedbackStatus;
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const user = await requireRole("moderator");

  if (!feedbackStatuses.includes(input.status)) {
    return { ok: false, error: "INVALID_STATUS" };
  }

  try {
    await updateFeedbackStatus({ id: user.id, role: user.role }, input.id, input.status, input.note);
    revalidatePath("/admin/feedback");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};
