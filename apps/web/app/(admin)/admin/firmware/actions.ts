"use server";

import { revalidatePath } from "next/cache";

import { mapFirmwareAdminError, yankFirmwareRelease } from "@/features/firmware/admin";
import { requireRole } from "@/lib/auth";

// Server actions реестра прошивок (/admin/firmware). Публикация сюда НЕ входит:
// образ ~2 МБ не пролезает в лимит тела server actions, она идёт через
// POST /api/admin/firmware/upload.

export type FirmwareActionResult = { ok: true } | { ok: false; error: string };

const mapError = (error: unknown, version: string): FirmwareActionResult => {
  // requireRole редиректит гостя/недостаточную роль — такой «редирект-как-ошибка»
  // нельзя проглатывать, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    if (error.message === "YANK_REASON_REQUIRED") {
      return { ok: false, error: "Укажите причину отзыва." };
    }
  }

  return { ok: false, error: mapFirmwareAdminError(error, version) };
};

export const yankFirmwareReleaseAction = async (
  version: string,
  reason: string
): Promise<FirmwareActionResult> => {
  try {
    const user = await requireRole("admin");
    await yankFirmwareRelease({ version, reason, actor: { id: user.id, email: user.email } });
    revalidatePath("/admin/firmware");
    return { ok: true };
  } catch (error) {
    return mapError(error, version);
  }
};
