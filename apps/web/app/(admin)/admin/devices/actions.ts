"use server";

import { revalidatePath } from "next/cache";

import { revokeDeviceAsAdmin } from "@/features/devices/admin";
import { requireRole } from "@/lib/auth";

// Server actions админского раздела устройств (/admin/devices).
// ⚠ Отвязка НЕ пишется в журнал: в AuditAction нет действия про устройства
// (features/audit/contracts.ts), а его список — не наш файл. См. issues.

export type DeviceAdminActionResult = { ok: true } | { ok: false; error: string };

const mapError = (error: unknown): DeviceAdminActionResult => {
  // requireRole редиректит гостя/недостаточную роль — редирект нельзя проглатывать.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    if (error.message === "NOT_FOUND") {
      return { ok: false, error: "Устройство не найдено — обновите страницу." };
    }
  }

  return { ok: false, error: "Не удалось выполнить операцию." };
};

export const revokeDeviceAction = async (deviceId: string): Promise<DeviceAdminActionResult> => {
  try {
    await requireRole("admin");
    await revokeDeviceAsAdmin(deviceId);
    revalidatePath("/admin/devices");
    revalidatePath(`/admin/devices/${deviceId}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
};
