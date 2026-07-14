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
import { listBrewBatchesForUser } from "@/features/brew-batches/service";
import type { BrewBatchStatus } from "@/features/brew-batches/contracts";

import {
  MAX_STREAM_DEVICES_PER_USER,
  type AvailableStreamDeviceDto,
  type ConnectStreamDeviceInput,
  type CreateFermentSessionInput,
  type FermentSessionDto,
  type ManualFermentSessionEndReason,
  type RetroAttachPreview,
  type StreamHardwareKind
} from "./contracts";
import {
  createStreamDevice,
  deleteStreamDevice,
  getStreamDeviceDataCounts,
  renameStreamDevice,
  rotateStreamToken,
  setStreamDeviceKind
} from "./service";
import {
  createFermentSession,
  endActiveSessionsForBatch,
  endFermentSession,
  listAvailableStreamDevices,
  listSessionsForBatch,
  previewRetroAttach
} from "./sessions";

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

// =============================================================================
//  F2 — сеансы (sessions.ts). Отдельная карта ошибок: NOT_FOUND здесь может
//  означать и «чужое/не то устройство», и «чужая/несуществующая партия» —
//  делить с ERROR_MESSAGES выше (где NOT_FOUND строго про устройство) не стоит,
//  иначе текст «Устройство не найдено.» будет врать в случае с партией.
// =============================================================================

const SESSION_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Устройство или партия не найдены.",
  SESSION_INVALID_BATCH_STATUS: "Привязать ареометр можно только к партии в статусе «Варка» или «Брожение».",
  SESSION_DEVICE_BUSY: "У этого устройства уже есть активный сеанс. Сначала завершите его.",
  RATE_LIMITED: ERROR_MESSAGES.RATE_LIMITED
};

const toSessionActionError = (error: unknown): ActionError => {
  const code = error instanceof Error ? error.message : "";
  return { ok: false, message: SESSION_ERROR_MESSAGES[code] ?? "Не удалось выполнить действие. Попробуйте ещё раз." };
};

/** F2 «Привязать к партии» (все три точки входа §5): создать сеанс, опционально забрав ретро-данные. */
export async function createFermentSessionAction(
  input: CreateFermentSessionInput
): Promise<{ ok: true; session: FermentSessionDto } | ActionError> {
  const user = await requireUser();
  try {
    const session = await createFermentSession(user.id, input);
    revalidatePath(`/app/devices/${input.deviceId}`);
    revalidatePath(`/app/brew-batches/${input.brewBatchId}`);
    revalidatePath("/app/devices");
    revalidatePath("/app");
    return { ok: true, session };
  } catch (error) {
    return toSessionActionError(error);
  }
}

/** Промпт «Забрать данные с … (за N часов, M точек)?» — предпросмотр без побочных эффектов. */
export async function previewRetroAttachAction(
  deviceId: string
): Promise<{ ok: true; preview: RetroAttachPreview } | ActionError> {
  const user = await requireUser();
  try {
    const preview = await previewRetroAttach(user.id, deviceId);
    return { ok: true, preview };
  } catch (error) {
    return toSessionActionError(error);
  }
}

/** Завершить сеанс вручную (карточка устройства/партии) — идемпотентно. */
export async function endFermentSessionAction(
  sessionId: string,
  reason: ManualFermentSessionEndReason = "manual"
): Promise<{ ok: true; session: FermentSessionDto } | ActionError> {
  const user = await requireUser();
  try {
    const session = await endFermentSession(user.id, sessionId, reason);
    revalidatePath(`/app/devices/${session.deviceId}`);
    revalidatePath(`/app/brew-batches/${session.brewBatchId}`);
    revalidatePath("/app/devices");
    return { ok: true, session };
  } catch (error) {
    return toSessionActionError(error);
  }
}

/** Промпт «Завершить сеанс ареометра?» при переводе партии в «Завершена» — сеансов может быть несколько. */
export async function endActiveSessionsForBatchAction(
  brewBatchId: string,
  reason: ManualFermentSessionEndReason = "batch_completed"
): Promise<{ ok: true; sessions: FermentSessionDto[] } | ActionError> {
  const user = await requireUser();
  try {
    const sessions = await endActiveSessionsForBatch(user.id, brewBatchId, reason);
    revalidatePath(`/app/brew-batches/${brewBatchId}`);
    revalidatePath("/app/devices");
    return { ok: true, sessions };
  } catch (error) {
    return toSessionActionError(error);
  }
}

/** Шаг «Ареометр уже в сусле?» (перевод партии в «Брожение») и строка «Подключить ареометр». */
export async function listAvailableStreamDevicesAction(): Promise<
  { ok: true; devices: AvailableStreamDeviceDto[] } | ActionError
> {
  const user = await requireUser();
  try {
    const devices = await listAvailableStreamDevices(user.id);
    return { ok: true, devices };
  } catch (error) {
    return toActionError(error);
  }
}

/** Партия, к которой можно привязать сеанс («Привязать к партии», карточка устройства). */
export type AttachableBrewBatch = {
  id: string;
  name: string;
  recipeTitle: string;
  status: BrewBatchStatus;
};

/**
 * Партии пользователя в статусе fermenting/brewing («Привязать к партии», F2 вход №3),
 * свежие сверху — переиспользуем слим-проекцию listBrewBatchesForUser (features/
 * brew-batches/service.ts, чужой файл, только читаем), без новой выборки в БД.
 */
export async function listAttachableBrewBatchesAction(): Promise<
  { ok: true; batches: AttachableBrewBatch[] } | ActionError
> {
  const user = await requireUser();
  try {
    const all = await listBrewBatchesForUser(user.id);
    const attachable = all
      .filter((batch) => batch.status === "fermenting" || batch.status === "brewing")
      .sort((a, b) => (b.startedAt ?? b.createdAt).getTime() - (a.startedAt ?? a.createdAt).getTime())
      .map((batch) => ({ id: batch.id, name: batch.name, recipeTitle: batch.recipeTitle, status: batch.status }));
    return { ok: true, batches: attachable };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Активные сеансы партии (без завершения) — для мягкого промпта «Завершить сеанс
 * ареометра?» при переводе партии в «Завершена» (вход, где решаем, показывать ли
 * промпт вообще: нет активных сеансов → нет вопроса). Фильтруем listSessionsForBatch
 * на endedAt===null здесь же — отдельной выборки в sessions.ts не заводим ради этого.
 */
export async function listActiveSessionsForBatchAction(
  brewBatchId: string
): Promise<{ ok: true; sessions: FermentSessionDto[] } | ActionError> {
  const user = await requireUser();
  try {
    const sessions = await listSessionsForBatch(user.id, brewBatchId);
    return { ok: true, sessions: sessions.filter((session) => session.endedAt === null) };
  } catch (error) {
    return toSessionActionError(error);
  }
}
