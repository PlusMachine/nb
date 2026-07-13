"use server";

import { revalidatePath } from "next/cache";

import {
  anonymizeUserAccount,
  blockUserAccount,
  changeUserRole,
  unblockUserAccount
} from "@/features/admin-users/service";
import { adminUserErrorMessages, type AdminUserError } from "@/features/admin-users/permissions";
import { isUserRole } from "@/features/admin-users/contracts";
import { requireRole } from "@/lib/auth";

export type AdminUserActionResult = { ok: true } | { ok: false; error: string };

const isKnownError = (message: string): message is AdminUserError =>
  Object.prototype.hasOwnProperty.call(adminUserErrorMessages, message);

const mapAdminUserError = (error: unknown): { ok: false; error: string } => {
  // requireRole делает redirect гостю и роли ниже admin — такой «редирект-как-
  // ошибка» нельзя проглатывать, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }

    if (isKnownError(error.message)) {
      return { ok: false, error: adminUserErrorMessages[error.message] };
    }
  }

  return { ok: false, error: "Не удалось выполнить операцию." };
};

const revalidateUser = (userId: string) => {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
};

// Блокировка и обезличивание снимают витрину мастера с публикации, а /market и
// /masters/[slug] отдаются с revalidate=300 — без этого страница ещё пять минут
// показывала бы контакты из кэша.
const revalidateMasterShowcase = (slug: string | null) => {
  if (!slug) {
    return;
  }
  revalidatePath("/market");
  revalidatePath(`/masters/${slug}`);
};

export const changeUserRoleAction = async (userId: string, role: string): Promise<AdminUserActionResult> => {
  try {
    const actor = await requireRole("admin");
    if (!isUserRole(role)) {
      return { ok: false, error: "Неизвестная роль." };
    }

    await changeUserRole({ actor: { id: actor.id, email: actor.email }, userId, role });
    revalidateUser(userId);
    return { ok: true };
  } catch (error) {
    return mapAdminUserError(error);
  }
};

export const blockUserAction = async (userId: string, reason: string): Promise<AdminUserActionResult> => {
  try {
    const actor = await requireRole("admin");
    const { masterSlug } = await blockUserAccount({ actor: { id: actor.id, email: actor.email }, userId, reason });
    revalidateUser(userId);
    revalidateMasterShowcase(masterSlug);
    return { ok: true };
  } catch (error) {
    return mapAdminUserError(error);
  }
};

export const unblockUserAction = async (userId: string): Promise<AdminUserActionResult> => {
  try {
    const actor = await requireRole("admin");
    await unblockUserAccount({ actor: { id: actor.id, email: actor.email }, userId });
    revalidateUser(userId);
    return { ok: true };
  } catch (error) {
    return mapAdminUserError(error);
  }
};

export const anonymizeUserAction = async (
  userId: string,
  confirmation: string
): Promise<AdminUserActionResult> => {
  try {
    const actor = await requireRole("admin");
    const { masterSlug } = await anonymizeUserAccount({
      actor: { id: actor.id, email: actor.email },
      userId,
      confirmation
    });
    revalidateUser(userId);
    revalidateMasterShowcase(masterSlug);
    return { ok: true };
  } catch (error) {
    return mapAdminUserError(error);
  }
};
