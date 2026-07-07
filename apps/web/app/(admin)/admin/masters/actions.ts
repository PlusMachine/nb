"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import {
  approveMasterProfile,
  rejectMasterProfile,
  setMasterListed
} from "@/features/masters/service";
import { requireRole } from "@/lib/auth";

// Server actions модерации витрины мастеров (/admin/masters) — по образцу
// app/(admin)/admin/feedback/actions.ts (requireRole → сервис → revalidatePath →
// {ok:true}|{ok:false,error}) и маппинга ошибок из app/(app)/app/master/actions.ts
// (ZodError → первое сообщение, NEXT_REDIRECT пробрасывается наружу).

const firstZodMessage = (error: ZodError): string => error.issues[0]?.message ?? "Проверьте корректность данных.";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Не найдено — возможно, страницу нужно обновить.",
  FORBIDDEN: "Недостаточно прав.",
  APPROVE_NOT_ALLOWED: "Опубликовать можно только заявку, которая ожидает модерации.",
  REJECT_NOT_ALLOWED: "Отклонить можно только заявку, которая ожидает модерации."
};

const mapMasterModerationError = (error: unknown): { ok: false; error: string } => {
  // requireRole делает redirect для гостя/недостаточной роли — такой «редирект-как-
  // ошибка» нельзя проглатывать, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }

  if (error instanceof ZodError) {
    return { ok: false, error: firstZodMessage(error) };
  }

  if (error instanceof Error && ERROR_MESSAGES[error.message]) {
    return { ok: false, error: ERROR_MESSAGES[error.message] };
  }

  return { ok: false, error: "Не удалось выполнить операцию." };
};

// /masters и /masters/[slug] отдаются с revalidate=300 (TTL-страховка) — после
// approve/setListed их нужно обновить сразу, а не ждать до 5 минут.
const revalidatePublicMasterPages = (slug: string | null) => {
  revalidatePath("/masters");
  if (slug) {
    revalidatePath(`/masters/${slug}`);
  }
};

export type MasterModerationActionResult = { ok: true } | { ok: false; error: string };

export const approveMasterProfileAction = async (profileId: string): Promise<MasterModerationActionResult> => {
  try {
    const user = await requireRole("moderator");
    const profile = await approveMasterProfile({ id: user.id, role: user.role }, profileId);
    revalidatePath("/admin/masters");
    revalidatePublicMasterPages(profile.slug);
    return { ok: true };
  } catch (error) {
    return mapMasterModerationError(error);
  }
};

export const rejectMasterProfileAction = async (
  profileId: string,
  note: string
): Promise<MasterModerationActionResult> => {
  try {
    const user = await requireRole("moderator");
    await rejectMasterProfile({ id: user.id, role: user.role }, profileId, note);
    revalidatePath("/admin/masters");
    return { ok: true };
  } catch (error) {
    return mapMasterModerationError(error);
  }
};

export const setMasterListedAction = async (
  profileId: string,
  isListed: boolean
): Promise<MasterModerationActionResult> => {
  try {
    const user = await requireRole("moderator");
    const profile = await setMasterListed({ id: user.id, role: user.role }, profileId, isListed);
    revalidatePath("/admin/masters");
    revalidatePublicMasterPages(profile.slug);
    return { ok: true };
  } catch (error) {
    return mapMasterModerationError(error);
  }
};
