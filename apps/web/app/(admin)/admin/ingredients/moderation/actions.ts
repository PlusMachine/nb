"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import type { AuditAction } from "@/features/audit/contracts";
import { recordAuditEvent } from "@/features/audit/service";
import { applyModerationAction } from "@/features/ingredients/service";
import { requireRole } from "@/lib/auth";

export type IngredientProposalAction = "approve" | "reject" | "merge";

export type IngredientProposalActionResult = { ok: true } | { ok: false; error: string };

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Заявка не найдена — обновите страницу.",
  FORBIDDEN: "Недостаточно прав."
};

const mapProposalError = (error: unknown): { ok: false; error: string } => {
  // requireRole делает redirect для гостя/недостаточной роли — проглотить его
  // нельзя, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }

  if (error instanceof ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Проверьте корректность данных." };
  }

  if (error instanceof Error && ERROR_MESSAGES[error.message]) {
    return { ok: false, error: ERROR_MESSAGES[error.message] };
  }

  return { ok: false, error: "Не удалось обработать заявку." };
};

const auditActionByProposalAction: Record<IngredientProposalAction, AuditAction> = {
  approve: "ingredient.proposal_approve",
  reject: "ingredient.proposal_reject",
  merge: "ingredient.merge"
};

const auditSummaryByProposalAction: Record<IngredientProposalAction, string> = {
  approve: "Заявка принята",
  reject: "Заявка отклонена",
  merge: "Заявка объединена с ингредиентом каталога"
};

export const resolveIngredientProposalAction = async (input: {
  id: string;
  action: IngredientProposalAction;
  resolutionNote?: string;
  targetIngredientId?: string;
}): Promise<IngredientProposalActionResult> => {
  try {
    const user = await requireRole("moderator");

    const resolutionNote = input.resolutionNote?.trim() || undefined;
    const targetIngredientId = input.targetIngredientId?.trim() || undefined;

    if (input.action === "merge" && !targetIngredientId) {
      return { ok: false, error: "Выберите ингредиент, с которым объединить заявку." };
    }

    const updated = await applyModerationAction(
      input.id,
      { action: input.action, resolutionNote, targetIngredientId },
      user.id
    );

    if (!updated) {
      return { ok: false, error: ERROR_MESSAGES.NOT_FOUND };
    }

    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: auditActionByProposalAction[input.action],
      entityType: "ingredient_proposal",
      entityId: updated.id,
      summary: `${auditSummaryByProposalAction[input.action]}: «${updated.sourceDisplayName}»`,
      payload: {
        targetIngredientId: targetIngredientId ?? null,
        resolutionNote: resolutionNote ?? null
      }
    });

    revalidatePath("/admin/ingredients/moderation");
    return { ok: true };
  } catch (error) {
    return mapProposalError(error);
  }
};
