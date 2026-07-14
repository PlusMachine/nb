"use server";

// =============================================================================
//  features/device-streams/actions.ts
//  Серверные экшены визарда подключения (F1) и карточки стрим-устройства (F8):
//  тонкая обёртка над service.ts — requireUser() (клиент не передаёт userId),
//  доменные ошибки сервиса маппятся в понятные сообщения (паттерн brew-actions.ts
//  из app/(public)/recipes/[slug]/brew-actions.ts), а не эхоятся сырым .message.
// =============================================================================
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";

import { MAX_STREAM_DEVICES_PER_USER, type ConnectStreamDeviceInput, type StreamHardwareKind } from "./contracts";
import {
  createStreamDevice,
  deleteStreamDevice,
  getStreamDeviceDataCounts,
  renameStreamDevice,
  rotateStreamToken,
  setStreamDeviceKind
} from "./service";

type ActionError = { ok: false; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Устройство не найдено.",
  RATE_LIMITED: "Слишком часто. Подождите немного и попробуйте снова.",
  STREAM_DEVICE_QUOTA_REACHED: `Достигнут предел числа устройств (${MAX_STREAM_DEVICES_PER_USER}).`
};

const toActionError = (error: unknown): ActionError => {
  const code = error instanceof Error ? error.message : "";
  return { ok: false, message: ERROR_MESSAGES[code] ?? "Не удалось выполнить действие. Попробуйте ещё раз." };
};

/** F1 «Поплавок/датчик»: создать устройство → редирект на его страницу (клиент). */
export async function createStreamDeviceAction(
  input: ConnectStreamDeviceInput
): Promise<{ ok: true; deviceId: string; ingestUrl: string } | ActionError> {
  const user = await requireUser();
  try {
    const result = await createStreamDevice(user.id, input);
    revalidatePath("/app/devices");
    revalidatePath("/app");
    return { ok: true, deviceId: result.device.id, ingestUrl: result.ingestUrl };
  } catch (error) {
    return toActionError(error);
  }
}

/** «Перевыпустить URL» (F8): старый умирает сразу — подтверждение на клиенте (ConfirmActionDialog). */
export async function rotateStreamTokenAction(
  deviceId: string
): Promise<{ ok: true; ingestUrl: string } | ActionError> {
  const user = await requireUser();
  try {
    const ingestUrl = await rotateStreamToken(user.id, deviceId);
    revalidatePath(`/app/devices/${deviceId}`);
    return { ok: true, ingestUrl };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renameStreamDeviceAction(
  deviceId: string,
  name: string
): Promise<{ ok: true; name: string } | ActionError> {
  const user = await requireUser();
  try {
    const device = await renameStreamDevice(user.id, deviceId, name);
    revalidatePath(`/app/devices/${deviceId}`);
    revalidatePath("/app/devices");
    revalidatePath("/app");
    return { ok: true, name: device.name };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStreamDeviceKindAction(
  deviceId: string,
  kind: StreamHardwareKind
): Promise<{ ok: true; kind: StreamHardwareKind } | ActionError> {
  const user = await requireUser();
  try {
    const device = await setStreamDeviceKind(user.id, deviceId, kind);
    revalidatePath(`/app/devices/${deviceId}`);
    revalidatePath("/app/devices");
    return { ok: true, kind: device.hardwareKind ?? kind };
  } catch (error) {
    return toActionError(error);
  }
}

/** Точки/сеансы устройства — предзагрузка описания для ConfirmActionDialog («Удалить устройство»). */
export async function getStreamDeviceDataCountsAction(
  deviceId: string
): Promise<{ ok: true; readingsCount: number; sessionsCount: number } | ActionError> {
  const user = await requireUser();
  try {
    const counts = await getStreamDeviceDataCounts(user.id, deviceId);
    return { ok: true, ...counts };
  } catch (error) {
    return toActionError(error);
  }
}

/** «Удалить устройство» (F8): каскад БД сносит точки/сеансы; счётчики — для тоста-квитанции. */
export async function deleteStreamDeviceAction(
  deviceId: string
): Promise<{ ok: true; readingsCount: number; sessionsCount: number } | ActionError> {
  const user = await requireUser();
  try {
    const counts = await deleteStreamDevice(user.id, deviceId);
    revalidatePath("/app/devices");
    revalidatePath("/app");
    return { ok: true, ...counts };
  } catch (error) {
    return toActionError(error);
  }
}
