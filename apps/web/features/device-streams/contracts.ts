import { z } from "zod";

import { GRAVITY_SG_MAX, GRAVITY_SG_MIN, type BrewMeasurementDto } from "@/features/brew-batches/contracts";
import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";
import { RAPT_PROVIDER_ID } from "@/features/brew-controller/rapt-cloud-provider";

// =============================================================================
//  features/device-streams — контракты приёма телеметрии сторонних устройств
//  ферментации (iSpindel, GravityMon, Tilt, Floaty, BrewPiLess, RAPT…).
//  Спека: docs/specs/third-party-fermentation-devices.md §6.1, §8.5, §9.
//  providerId ('stream'/'rapt-cloud') задаётся в features/brew-controller —
//  здесь только STREAM_LIKE_PROVIDER_IDS (M4-B): оба provider'а «стрим-подобны»
//  (устройства кормятся из ferment_readings/ferment_sessions, владение
//  проверяется одинаково) — ownership-хелперы sessions.ts/service.ts/series.ts
//  фильтровали строго по STREAM_PROVIDER_ID, из-за чего RAPT-устройства не
//  проходили owned-проверку и не могли привязаться к партии/переименоваться/
//  удалиться (M4-B, точечный фикс).
// =============================================================================

/** brew_devices.hardware_kind для стрим-устройств (§6.1). Влияет только на UI. */
export const streamHardwareKinds = [
  "ispindel",
  "gravitymon",
  "tilt",
  "floaty",
  "brewpiless",
  "rapt-pill",
  "rapt-chamber",
  "rapt-brewzilla",
  "other"
] as const;
export type StreamHardwareKind = (typeof streamHardwareKinds)[number];

/** Русские лейблы видов устройств для визарда подключения и плиток. */
export const streamHardwareKindLabels: Record<StreamHardwareKind, string> = {
  ispindel: "iSpindel",
  gravitymon: "GravityMon",
  tilt: "Tilt",
  floaty: "Floaty",
  brewpiless: "BrewPiLess",
  "rapt-pill": "RAPT Pill",
  "rapt-chamber": "Камера RAPT",
  "rapt-brewzilla": "BrewZilla",
  other: "Другое"
};

/** Вход F1 «Поплавок/датчик»: имя + вид устройства (визард выбора). */
export const connectStreamDeviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(streamHardwareKinds)
});
export type ConnectStreamDeviceInput = z.infer<typeof connectStreamDeviceSchema>;

/**
 * Виды в визарде F1 (без rapt-* — RAPT подключается отдельным флоу F1-RAPT,
 * автообнаружением по первому пакету вебхука, M4; руками в этом визарде не заводится).
 */
export const streamWizardHardwareKinds: readonly StreamHardwareKind[] = streamHardwareKinds.filter(
  (kind): kind is StreamHardwareKind => !kind.startsWith("rapt-")
);

/** Вход renameStreamDevice (F8). */
export const renameStreamDeviceSchema = z.object({
  name: z.string().trim().min(1).max(80)
});
export type RenameStreamDeviceInput = z.infer<typeof renameStreamDeviceSchema>;

/** Вход setStreamDeviceKind (F8 «сменить вид»). */
export const setStreamDeviceKindSchema = z.object({
  kind: z.enum(streamHardwareKinds)
});
export type SetStreamDeviceKindInput = z.infer<typeof setStreamDeviceKindSchema>;

// =============================================================================
//  DTO сервис-слоя (service.ts). tokenHash/tokenEncrypted сюда не попадают —
//  зеркалит инвариант features/devices/contracts.ts deviceDtoSchema.
// =============================================================================

/** Статус связи — то же значение, что brew_devices.status (features/devices/contracts.ts). */
export type StreamDeviceConnectionStatus = "online" | "offline" | "unknown";

export type StreamDeviceDto = {
  id: string;
  userId: string;
  name: string;
  hardwareId: string;
  /** NULL — теоретически возможно для старых/ручных строк; UI откатывается на «Другое». */
  hardwareKind: StreamHardwareKind | null;
  status: StreamDeviceConnectionStatus;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Итог createStreamDevice: DTO + URL для вставки в устройство (rawToken показывается сразу). */
export type ConnectStreamDeviceResult = {
  device: StreamDeviceDto;
  ingestUrl: string;
};

/** Последняя точка устройства — для шапки страницы/живой зоны/плитки. */
export type StreamLatestReadingDto = {
  ts: Date;
  gravitySg: number | null;
  tempC: number | null;
  batteryV: number | null;
  batteryPct: number | null;
  rssi: number | null;
};

/** Статус приёма (getStreamDeviceStatus) — живая зона F1 + поллинг-роут. */
export type StreamDeviceStatusDto = {
  lastSeenAt: Date | null;
  latestReading: StreamLatestReadingDto | null;
  readingsCount: number;
  isStale: boolean;
};

/** Точки/сеансы устройства — для описания в ConfirmActionDialog ДО удаления (F8). */
export type StreamDeviceDataCounts = {
  readingsCount: number;
  sessionsCount: number;
};

// =============================================================================
//  Лимиты и дисциплина приёма (§8.5).
// =============================================================================

/** Квота стрим-устройств на пользователя (анти-абьюз, открытый вопрос §14.4). */
export const MAX_STREAM_DEVICES_PER_USER = 10;

/** Rate limit создания стрим-устройства (анти-скрипт-флуд, по образцу brew_batch_create). */
export const STREAM_DEVICE_CREATE_RATE_LIMIT = 10;
export const STREAM_DEVICE_CREATE_RATE_WINDOW_SECONDS = 3600;

/** Максимальный размер тела ingest-запроса, байт. */
export const INGEST_BODY_MAX_BYTES = 4096;

/** Персист-гейт: пишем не чаще одной точки на этот интервал (секунды) на устройство. */
export const INGEST_PERSIST_GATE_SECONDS = 300;

/** Rate limit на токен/устройство: burst-потолок пакетов за окно. */
export const INGEST_RATE_LIMIT = 12;
export const INGEST_RATE_WINDOW_SECONDS = 60;

/** Общий потолок пакетов на IP (защита от перебора/спама чужими токенами). */
export const INGEST_IP_RATE_LIMIT = 240;
export const INGEST_IP_RATE_WINDOW_SECONDS = 60;

// =============================================================================
//  F2 — сеансы (ferment_sessions): привязка устройства к партии. Спека §5 F2, §6.2.
//  Владелец: features/device-streams/sessions.ts.
// =============================================================================

/**
 * ferment_sessions.end_reason (§6.2). 'auto_silence' — автозавершение по молчанию
 * устройства 7 дней, M5 (периодический скан в apps/bridge) — в M2 не запускается,
 * значение зарезервировано в типе ради полноты домена/чтения старых строк.
 */
export const fermentSessionEndReasons = ["manual", "batch_completed", "auto_silence"] as const;
export type FermentSessionEndReason = (typeof fermentSessionEndReasons)[number];

/** Поводы, которые сервис принимает от UI/actions в M2 (без bridge-скана). */
export type ManualFermentSessionEndReason = Extract<FermentSessionEndReason, "manual" | "batch_completed">;

/** Вход createFermentSession (F2, все три точки входа §5). */
export const createFermentSessionSchema = z.object({
  deviceId: z.string().min(1),
  brewBatchId: z.string().min(1),
  /** «Забрать данные с …» — доприсвоить непривязанные показания устройства (см. §5 «Ретро-привязка»). */
  retroAttach: z.boolean().optional(),
  /** Ручной старт сеанса; игнорируется, если retroAttach нашёл более раннюю точку. */
  startedAt: z.date().optional()
});
export type CreateFermentSessionInput = z.infer<typeof createFermentSessionSchema>;

/** Сеанс с именем/видом устройства (для истории на карточке устройства/партии) и счётчиком точек. */
export type FermentSessionDto = {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceHardwareKind: StreamHardwareKind | null;
  brewBatchId: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: FermentSessionEndReason | null;
  calibrationOffsetSg: number;
  tempMinC: number | null;
  tempMaxC: number | null;
  alertsMuted: boolean;
  readingsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Итог previewRetroAttach — для промпта «Забрать данные с … (за N часов, M точек)?». */
export type RetroAttachPreview = {
  count: number;
  oldestTs: Date | null;
  newestTs: Date | null;
};

/** Свободное (без активного сеанса) стрим-устройство — шаг «Ареометр уже в сусле?» / «Подключить ареометр». */
export type AvailableStreamDeviceDto = {
  id: string;
  name: string;
  hardwareKind: StreamHardwareKind | null;
  lastSeenAt: Date | null;
  /** Есть непривязанные показания за последние RETRO_ATTACH_WINDOW_DAYS — бейдж ретро-привязки. */
  hasRetroReadings: boolean;
};

/** Окно ретро-привязки (§5 F2): «непривязанные показания за последние 7 дней». */
export const RETRO_ATTACH_WINDOW_DAYS = 7;
export const RETRO_ATTACH_WINDOW_MS = RETRO_ATTACH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Rate limit создания сеанса (анти-скрипт-флуд, по образцу stream_device_create). */
export const FERMENT_SESSION_CREATE_RATE_LIMIT = 30;
export const FERMENT_SESSION_CREATE_RATE_WINDOW_SECONDS = 3600;

// =============================================================================
//  F4 — коррекция данных (§5 F4, §3 П2/П3). Спека — сердце ТЗ: офсет-калибровка,
//  исключение точек, границы сеанса, подтверждение OG/FG с кривой, удаления.
//  Владелец: features/device-streams/corrections.ts. Пороги — доменные константы,
//  в UI не настраиваются (по аналогии с verdict-core, MVP).
// =============================================================================

/** F4.1: если замер вне диапазона точек сеанса — берём ближайшую точку не дальше этого окна. */
export const CALIBRATION_NEARBY_WINDOW_MS = 2 * 60 * 60 * 1000;

/** F4.4: «OG с кривой» — медиана первых N часов сеанса. */
export const OG_CONFIRM_WINDOW_HOURS = 6;

/** F4.4: «FG с кривой» — медиана последних N часов (при условии стабильности). */
export const FG_CONFIRM_WINDOW_HOURS = 48;

/** F4.4: минимум точек в окне, иначе оценка недостаточно надёжна (CURVE_INSUFFICIENT_POINTS). */
export const CURVE_CONFIRM_MIN_POINTS = 3;

/** F4.4/F5: «стабильна» — размах (max−min) в окне не больше этого значения SG. */
export const FG_STABILITY_THRESHOLD_SG = 0.0015;

/** Вход applySessionCalibration (F4.1) — «Выровнять по моему замеру». */
export const applySessionCalibrationSchema = z.object({
  sessionId: z.string().min(1),
  measurementTs: z.date(),
  measurementSg: z.number().min(GRAVITY_SG_MIN).max(GRAVITY_SG_MAX)
});
export type ApplySessionCalibrationInput = z.infer<typeof applySessionCalibrationSchema>;

/**
 * Итог applySessionCalibration/clearSessionCalibration: offsetSg — новая
 * актуальная величина (перезапись, не накопление, §5 F4.1); previousOffsetSg —
 * для бейджа «Кривая скорректирована на …» и его отмены. sessionId/deviceId/
 * brewBatchId — для точечного revalidatePath на стороне actions.ts (тот же
 * принцип, что у FermentSessionDto из sessions.ts).
 */
export type SessionCalibrationResult = {
  sessionId: string;
  deviceId: string;
  brewBatchId: string;
  offsetSg: number;
  previousOffsetSg: number;
};

/** Вход setReadingsExcluded (F4.2) — выделение диапазона на графике → исключить/вернуть. */
export const setReadingsExcludedSchema = z.object({
  sessionId: z.string().min(1),
  fromTs: z.date(),
  toTs: z.date(),
  excluded: z.boolean()
});
export type SetReadingsExcludedInput = z.infer<typeof setReadingsExcludedSchema>;

export type SetReadingsExcludedResult = {
  sessionId: string;
  deviceId: string;
  brewBatchId: string;
  /** Число точек, у которых изменился excluded. */
  affected: number;
};

/** Вход updateSessionBounds (F4.3) — обрезка начала/конца сеанса задним числом. */
export const updateSessionBoundsSchema = z.object({
  startedAt: z.date().optional(),
  endedAt: z.date().optional()
});
export type UpdateSessionBoundsInput = z.infer<typeof updateSessionBoundsSchema>;

/**
 * Итог updateSessionBounds: точки за новыми границами ОТВЯЗАНЫ от сеанса
 * (session_id=NULL — «обрезать шум», обратимо ретро-привязкой), не удалены.
 * detachedReadingsCount — для тоста-квитанции.
 */
export type SessionBoundsResult = {
  sessionId: string;
  deviceId: string;
  brewBatchId: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: FermentSessionEndReason | null;
  detachedReadingsCount: number;
};

/** Вход confirmGravityFromCurve (F4.4) — «Записать OG/FG с ареометра?». */
export const confirmGravityFromCurveSchema = z.object({
  sessionId: z.string().min(1),
  kind: z.enum(["og", "fg"])
});
export type ConfirmGravityFromCurveInput = z.infer<typeof confirmGravityFromCurveSchema>;

/** Итог confirmGravityFromCurve: обычный ручной замер (features/brew-batches), созданный по подтверждению. */
export type ConfirmGravityFromCurveResult = {
  measurement: BrewMeasurementDto;
  gravitySg: number;
};

/**
 * Итог previewGravityFromCurve (M3-C, §5 F4.4) — ПРЕДПРОСМОТР без записи для строки-
 * предложения «Записать OG/FG с ареометра?» в блоке «Брожение». Та же математика и
 * входная схема, что confirmGravityFromCurveSchema (sessionId+kind) — недостаточно
 * точек/нестабильная кривая здесь не ошибка, а просто null (строка-предложение не
 * показывается).
 */
export type PreviewGravityFromCurveResult = number | null;

/** Вход deleteSessionReadings (F4.5) — диапазон или все точки сеанса. */
export const deleteSessionReadingsSchema = z.object({
  sessionId: z.string().min(1),
  fromTs: z.date().optional(),
  toTs: z.date().optional()
});
export type DeleteSessionReadingsInput = z.infer<typeof deleteSessionReadingsSchema>;

export type DeleteSessionReadingsResult = {
  sessionId: string;
  deviceId: string;
  brewBatchId: string;
  deletedCount: number;
};

/** Итог deleteSessionData — сеанс и все его точки удалены целиком. */
export type DeleteSessionDataResult = {
  sessionId: string;
  deviceId: string;
  brewBatchId: string;
  deletedReadingsCount: number;
};

// =============================================================================
//  M4 — RAPT Cloud (§5 F1-RAPT, §8.4, §6.2 user_integrations). Владелец:
//  features/device-streams/integrations.ts (подключение, одно на пользователя)
//  и ingest-rapt.ts (приём вебхука). providerId устройств RAPT — 'rapt-cloud'
//  (RAPT_PROVIDER_ID, features/brew-controller/rapt-cloud-provider.ts).
// =============================================================================

/**
 * providerId'ы «стрим-подобных» устройств (M4-B): generic-стрим (iSpindel и
 * т.п., STREAM_PROVIDER_ID) и RAPT Cloud (RAPT_PROVIDER_ID) — оба ведут себя
 * одинаково для владения/сеансов/чтения серии. Массив — для `inArray` в SQL
 * (расшивать спредом на месте использования, `[...STREAM_LIKE_PROVIDER_IDS]`,
 * см. ACTIVE_BATCH_STATUSES в device-telemetry-cache.ts); предикат — для
 * сравнений вне SQL (клиентские плитки, фильтры).
 */
export const STREAM_LIKE_PROVIDER_IDS = [STREAM_PROVIDER_ID, RAPT_PROVIDER_ID] as const;
export const isStreamLikeProviderId = (providerId: string): boolean =>
  providerId === STREAM_PROVIDER_ID || providerId === RAPT_PROVIDER_ID;

/** `user_integrations.kind` — сейчас единственное значение (§6.2, волна 2.5 не добавляет новых). */
export const RAPT_INTEGRATION_KIND = "rapt" as const;

/**
 * Готовый шаблон payload вебхука (§8.4) — пользователь копирует его as-is в поле
 * «Тело запроса» на портале RAPT (Integrations → Web Hooks → New), @-переменные
 * подставляет их портал. Держим одну строку — источник истины для UI (визард
 * подключения) И для parseRaptBody (ingest-rapt.ts, те же имена полей).
 */
export const RAPT_PAYLOAD_TEMPLATE = JSON.stringify(
  {
    device_id: "@device_id",
    device_type: "@device_type",
    device_name: "@device_name",
    temperature: "@temperature",
    gravity: "@gravity",
    battery: "@battery",
    rssi: "@rssi",
    ts: "@created_date"
  },
  null,
  2
);

/** RAPT-подключение пользователя — вебхук-URL + шаблон для копирования (F1-RAPT). */
export type RaptIntegrationDto = {
  id: string;
  userId: string;
  /** null — ключ шифрования (BREWFORGE_DEVICE_TOKEN_ENC_KEY) не настроен ИЛИ
   *  значение повреждено; UI в этом случае предлагает «Перевыпустить URL». */
  webhookUrl: string | null;
  payloadTemplate: string;
  createdAt: Date;
};

/** Итог deleteRaptIntegration: RAPT-устройства пользователя НЕ удаляются (данные ценны) — только счётчик для сведения. */
export type RaptIntegrationDeleteResult = {
  deviceCount: number;
};

/** Итог findRaptIntegrationByToken — минимум, нужный ingest-rapt.ts для авторизации и денормализации. */
export type RaptIntegrationAuth = {
  id: string;
  userId: string;
};

/** Rate limit создания RAPT-подключения (анти-скрипт-флуд); идемпотентный повторный фетч существующего подключения в лимит НЕ попадает. */
export const RAPT_INTEGRATION_CREATE_RATE_LIMIT = 5;
export const RAPT_INTEGRATION_CREATE_RATE_WINDOW_SECONDS = 3600;

/** Rate limit приёма вебхука на ОДНО RAPT-подключение (может кормить сразу несколько устройств — лимит щедрее, чем per-device generic ingest). */
export const RAPT_INGEST_RATE_LIMIT = 60;
export const RAPT_INGEST_RATE_WINDOW_SECONDS = 60;
