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
  type SessionAlertsMutedResult,
  type SessionTempCorridorResult,
  type StreamHardwareKind,
  type UpdateSessionTempCorridorInput
} from "./contracts";
import { track } from "./analytics";
import {
  createDemoStreamDevice,
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
  previewRetroAttach,
  setSessionAlertsMuted,
  updateSessionTempCorridor
} from "./sessions";
import {
  applySessionCalibration,
  clearSessionCalibration,
  confirmGravityFromCurve,
  countSessionReadingsInRange,
  deleteSessionData,
  deleteSessionReadings,
  setReadingsExcluded,
  updateSessionBounds
} from "./corrections";
import type {
  ApplySessionCalibrationInput,
  ConfirmGravityFromCurveInput,
  ConfirmGravityFromCurveResult,
  DeleteSessionDataResult,
  DeleteSessionReadingsInput,
  DeleteSessionReadingsResult,
  RaptIntegrationDeleteResult,
  RaptIntegrationDto,
  SessionBoundsResult,
  SessionCalibrationResult,
  SetReadingsExcludedInput,
  SetReadingsExcludedResult,
  UpdateSessionBoundsInput
} from "./contracts";
import {
  createOrGetRaptIntegration,
  deleteRaptIntegration,
  getRaptIntegration,
  rotateRaptWebhookToken
} from "./integrations";

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
    track("device_connected", { kind: input.kind, provider: "stream" });
    revalidatePath("/app/devices");
    revalidatePath("/app");
    return { ok: true, deviceId: result.device.id, ingestUrl: result.ingestUrl };
  } catch (error) {
    return toActionError(error);
  }
}

/** «Демо-ареометр» (F1 «Демо-режим», §5): создать демо-стрим-устройство → редирект на его страницу (клиент), как и обычное подключение. Кормит apps/bridge/src/demo-stream-feeder.ts. */
export async function createDemoStreamDeviceAction(): Promise<
  { ok: true; deviceId: string; ingestUrl: string } | ActionError
> {
  const user = await requireUser();
  try {
    const result = await createDemoStreamDevice(user.id);
    track("device_connected", { kind: "ispindel", provider: "stream", demo: true });
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
  SESSION_NOT_FOUND: "Сеанс не найден.",
  SESSION_TEMP_CORRIDOR_INCOMPLETE: "Заполните обе границы коридора (или обе очистите).",
  SESSION_TEMP_CORRIDOR_INVALID_RANGE: "Нижняя граница коридора должна быть меньше верхней.",
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
    track("session_started", { retro: Boolean(input.retroAttach) });
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

/**
 * «Изменить коридор» (§5 F6) — оба числа (min<max) либо оба null (снять коридор).
 * revalidatePath — напрямую (не revalidateSessionPaths из F4-секции ниже: та же пара
 * путей, но эта функция ещё не объявлена в порядке файла на момент объявления этой —
 * порядок вызова на рантайме не важен, порядок объявления в файле важен для читаемости).
 */
export async function updateSessionTempCorridorAction(
  sessionId: string,
  input: UpdateSessionTempCorridorInput
): Promise<{ ok: true; result: SessionTempCorridorResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await updateSessionTempCorridor(user.id, sessionId, input);
    revalidatePath(`/app/devices/${result.deviceId}`);
    revalidatePath(`/app/brew-batches/${result.brewBatchId}`);
    return { ok: true, result };
  } catch (error) {
    return toSessionActionError(error);
  }
}

/** Тумблер «Уведомления» (§5 F6) на активном сеансе. */
export async function setSessionAlertsMutedAction(
  sessionId: string,
  muted: boolean
): Promise<{ ok: true; result: SessionAlertsMutedResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await setSessionAlertsMuted(user.id, sessionId, muted);
    revalidatePath(`/app/devices/${result.deviceId}`);
    revalidatePath(`/app/brew-batches/${result.brewBatchId}`);
    return { ok: true, result };
  } catch (error) {
    return toSessionActionError(error);
  }
}

// =============================================================================
//  F4 — коррекция данных (corrections.ts, «сердце ТЗ»). Отдельная карта ошибок:
//  SESSION_NOT_FOUND здесь однозначно про сеанс (в отличие от NOT_FOUND у
//  sessions.ts, который мог означать и устройство, и партию) — сообщение точнее.
// =============================================================================

const CORRECTIONS_ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: "Сеанс не найден.",
  NOT_FOUND: "Партия не найдена.",
  CALIBRATION_NO_NEARBY_POINT: "Рядом с этим замером нет показаний устройства (в пределах 2 часов). Калибровка невозможна.",
  SESSION_BOUNDS_INVALID_RANGE: "Начало сеанса должно быть раньше конца.",
  SESSION_BOUNDS_END_IN_FUTURE: "Дата окончания не может быть в будущем.",
  CURVE_INSUFFICIENT_POINTS: "Недостаточно показаний устройства для оценки (нужно минимум 3 точки).",
  CURVE_NOT_STABLE: "Плотность на кривой ещё не стабилизировалась — рано считать брожение завершённым.",
  RATE_LIMITED: ERROR_MESSAGES.RATE_LIMITED,
  BREW_MEASUREMENT_QUOTA_REACHED: "Достигнут предел числа замеров для этой партии (300)."
};

const toCorrectionsActionError = (error: unknown): ActionError => {
  const code = error instanceof Error ? error.message : "";
  return { ok: false, message: CORRECTIONS_ERROR_MESSAGES[code] ?? "Не удалось выполнить действие. Попробуйте ещё раз." };
};

const revalidateSessionPaths = (deviceId: string, brewBatchId: string): void => {
  revalidatePath(`/app/devices/${deviceId}`);
  revalidatePath(`/app/brew-batches/${brewBatchId}`);
};

/** F4.1 «Выровнять по моему замеру» (офсет-калибровка сеанса). */
export async function applySessionCalibrationAction(
  input: ApplySessionCalibrationInput
): Promise<{ ok: true; result: SessionCalibrationResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await applySessionCalibration(user.id, input);
    track("calibration_applied", { sessionId: result.sessionId });
    revalidateSessionPaths(result.deviceId, result.brewBatchId);
    return { ok: true, result };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

/** Отмена калибровки («сбросить офсет» рядом с бейджем «Кривая скорректирована на …»). */
export async function clearSessionCalibrationAction(
  sessionId: string
): Promise<{ ok: true; result: SessionCalibrationResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await clearSessionCalibration(user.id, sessionId);
    revalidateSessionPaths(result.deviceId, result.brewBatchId);
    return { ok: true, result };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

/** F4.2 «Исключить точки» (или вернуть — тем же вызовом с excluded=false). */
export async function setReadingsExcludedAction(
  input: SetReadingsExcludedInput
): Promise<{ ok: true; result: SetReadingsExcludedResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await setReadingsExcluded(user.id, input);
    revalidateSessionPaths(result.deviceId, result.brewBatchId);
    return { ok: true, result };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

/** F4.3 «Границы сеанса» — обрезать начало/конец задним числом. */
export async function updateSessionBoundsAction(
  sessionId: string,
  input: UpdateSessionBoundsInput
): Promise<{ ok: true; result: SessionBoundsResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await updateSessionBounds(user.id, sessionId, input);
    revalidateSessionPaths(result.deviceId, result.brewBatchId);
    revalidatePath("/app/devices");
    return { ok: true, result };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

/** F4.4 «Записать OG/FG с ареометра?» — единственный путь, которым коррекции пишут в brew_measurements. */
export async function confirmGravityFromCurveAction(
  input: ConfirmGravityFromCurveInput
): Promise<{ ok: true; result: ConfirmGravityFromCurveResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await confirmGravityFromCurve(user.id, input);
    revalidatePath(`/app/brew-batches/${result.measurement.brewBatchId}`);
    return { ok: true, result };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

/** Предзагрузка счётчика для ConfirmActionDialog перед удалением точек/диапазона (F4.5). */
export async function countSessionReadingsInRangeAction(
  sessionId: string,
  fromTs?: Date,
  toTs?: Date
): Promise<{ ok: true; count: number } | ActionError> {
  const user = await requireUser();
  try {
    const value = await countSessionReadingsInRange(user.id, sessionId, fromTs, toTs);
    return { ok: true, count: value };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

/** F4.5 «Удалить точки» — диапазон или все точки сеанса (сам сеанс остаётся). */
export async function deleteSessionReadingsAction(
  input: DeleteSessionReadingsInput
): Promise<{ ok: true; result: DeleteSessionReadingsResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await deleteSessionReadings(user.id, input);
    revalidateSessionPaths(result.deviceId, result.brewBatchId);
    return { ok: true, result };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

/** F4.5 «Удалить данные сеанса» — точки сеанса + сам сеанс (устройство остаётся). */
export async function deleteSessionDataAction(
  sessionId: string
): Promise<{ ok: true; result: DeleteSessionDataResult } | ActionError> {
  const user = await requireUser();
  try {
    const result = await deleteSessionData(user.id, sessionId);
    revalidateSessionPaths(result.deviceId, result.brewBatchId);
    revalidatePath("/app/devices");
    return { ok: true, result };
  } catch (error) {
    return toCorrectionsActionError(error);
  }
}

// =============================================================================
//  M4 — RAPT Cloud (integrations.ts, §5 F1-RAPT). Отдельная карта ошибок:
//  NOT_FOUND здесь ВСЕГДА про ПОДКЛЮЧЕНИЕ (в отличие от ERROR_MESSAGES.NOT_FOUND
//  выше, которое про устройство) — общая карта дала бы вводящее в заблуждение
//  сообщение «Устройство не найдено» там, где нет устройства вовсе.
// =============================================================================

const RAPT_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Подключение RAPT не найдено.",
  RATE_LIMITED: ERROR_MESSAGES.RATE_LIMITED,
  RAPT_INTEGRATION_CREATE_FAILED: "Не удалось создать подключение. Попробуйте ещё раз."
};

const toRaptActionError = (error: unknown): ActionError => {
  const code = error instanceof Error ? error.message : "";
  return { ok: false, message: RAPT_ERROR_MESSAGES[code] ?? "Не удалось выполнить действие. Попробуйте ещё раз." };
};

/** F1-RAPT шаг 1: идемпотентно получить/создать RAPT-подключение — экран показывает URL вебхука + шаблон payload. */
export async function getOrCreateRaptIntegrationAction(): Promise<
  { ok: true; integration: RaptIntegrationDto } | ActionError
> {
  const user = await requireUser();
  try {
    const integration = await createOrGetRaptIntegration(user.id);
    return { ok: true, integration };
  } catch (error) {
    return toRaptActionError(error);
  }
}

/** Повторное чтение подключения (карточка устройства/настройки) — без побочных эффектов, null если ещё не создано. */
export async function getRaptIntegrationAction(): Promise<
  { ok: true; integration: RaptIntegrationDto | null } | ActionError
> {
  const user = await requireUser();
  try {
    const integration = await getRaptIntegration(user.id);
    return { ok: true, integration };
  } catch (error) {
    return toRaptActionError(error);
  }
}

/** «Перевыпустить URL вебхука» (F8): старый токен умирает сразу — подтверждение на клиенте (ConfirmActionDialog). */
export async function rotateRaptWebhookTokenAction(): Promise<
  { ok: true; integration: RaptIntegrationDto } | ActionError
> {
  const user = await requireUser();
  try {
    const integration = await rotateRaptWebhookToken(user.id);
    revalidatePath("/app/devices");
    return { ok: true, integration };
  } catch (error) {
    return toRaptActionError(error);
  }
}

/** «Удалить подключение RAPT» (F8): RAPT-устройства пользователя остаются — просто перестают пополняться. */
export async function deleteRaptIntegrationAction(): Promise<
  { ok: true; result: RaptIntegrationDeleteResult } | ActionError
> {
  const user = await requireUser();
  try {
    const result = await deleteRaptIntegration(user.id);
    revalidatePath("/app/devices");
    return { ok: true, result };
  } catch (error) {
    return toRaptActionError(error);
  }
}
