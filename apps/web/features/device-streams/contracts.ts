import { z } from "zod";

// =============================================================================
//  features/device-streams — контракты приёма телеметрии сторонних устройств
//  ферментации (iSpindel, GravityMon, Tilt, Floaty, BrewPiLess, RAPT…).
//  Спека: docs/specs/third-party-fermentation-devices.md §6.1, §8.5, §9.
//  providerId ('stream') задаётся в features/brew-controller/contracts.ts —
//  здесь его нет намеренно (отдельная задача/исполнитель).
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
