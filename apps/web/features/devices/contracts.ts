import { z } from "zod";

// =============================================================================
//  features/devices — DTO/контракты управления устройствами BrewForge и пэйринга.
//  Инвариант безопасности: tokenHash НИКОГДА не покидает сервис (нет в DTO),
//  plaintext bearer-токен возвращается ровно один раз из claimDevice и нигде
//  не хранится и не логируется.
// =============================================================================

export const deviceStatusSchema = z.enum(["online", "offline", "unknown"]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

/** Публичный DTO устройства. Зеркалит brew_devices БЕЗ tokenHash. */
export const deviceDtoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  providerId: z.string(),
  name: z.string(),
  hardwareId: z.string(),
  fw: z.string().nullable(),
  capabilities: z.array(z.string()),
  status: deviceStatusSchema,
  localUrl: z.string().nullable(),
  mqttPrefix: z.string().nullable(),
  lastSeenAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type DeviceDto = z.infer<typeof deviceDtoSchema>;

/**
 * Вход claimDevice. Два сценария:
 *  - облачный (по умолчанию): пользователь вводит одноразовый claimCode (с LCD/AP
 *    устройства) — это proof-of-possession;
 *  - LAN-bench: прямая привязка по hardwareId + localUrl без кода.
 *
 * ВАЖНО: hardwareId — это заводской идентификатор ('bf-xxxx'), он НЕ является
 * секретом/учёткой и легко угадывается. Поэтому форма допускает hardwareId без
 * кода (для совместимости/бенча), но ПОЛИТИКА в service.ts требует claimCode по
 * умолчанию: «голый» LAN-путь без кода работает лишь под флагом
 * BREWFORGE_ALLOW_UNVERIFIED_LAN_CLAIM. Схема намеренно не «ужесточается» здесь,
 * чтобы решение оставалось одним местом (service.ts) и не дублировалось.
 */
export const claimDeviceSchema = z
  .object({
    claimCode: z.string().trim().min(1).max(64).optional(),
    hardwareId: z.string().trim().min(1).max(128).optional(),
    name: z.string().trim().min(1).max(180).optional(),
    localUrl: z.string().trim().url().max(512).optional()
  })
  .refine((value) => Boolean(value.claimCode) || Boolean(value.hardwareId), {
    message: "CLAIM_CODE_OR_HARDWARE_ID_REQUIRED"
  });
export type ClaimDeviceInput = z.infer<typeof claimDeviceSchema> & { userId: string };

/**
 * Итог попытки АВТОМАТИЧЕСКИ доставить токен устройству по LAN сразу при клейме
 * (P4, POST {localUrl}/pair). Не влияет на успех claimDevice самого по себе —
 * устройство/токен уже созданы в БД независимо от того, удалось ли достучаться.
 *  - delivered:true            — устройство приняло токен, сопряжение завершено.
 *  - "NO_LOCAL_URL"            — localUrl не указан при клейме (доставить нечем).
 *  - "ALREADY_PAIRED"          — устройство уже сопряжено (см. текст в pairing-error-text.ts).
 *  - "UNREACHABLE"             — сеть/устройство недоступны (offline, не в этой LAN).
 *  - "REJECTED"                — устройство ответило отказом (битый токен/иной сбой).
 */
export type PairingDeliveryStatus =
  | { delivered: true }
  | { delivered: false; reason: "NO_LOCAL_URL" | "ALREADY_PAIRED" | "UNREACHABLE" | "REJECTED" };

/** Результат пэйринга: DTO устройства + plaintext-токен (отдаётся ОДИН раз). */
export type ClaimDeviceResult = {
  device: DeviceDto;
  /** Plaintext bearer-токен. Доставить устройству; на сервере хранится только хэш/шифротекст. */
  token: string;
  /** Итог попытки автодоставки токена устройству по LAN (см. PairingDeliveryStatus). */
  pairing: PairingDeliveryStatus;
};

/** Вход createPairingCode (облачный поток выпуска одноразового кода). */
export const createPairingCodeSchema = z.object({
  userId: z.string().uuid().optional(),
  hardwareId: z.string().trim().min(1).max(128).optional()
});
export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;

export type PairingCodeResult = {
  claimCode: string;
  expiresAt: Date;
};

// =============================================================================
//  Плитки L1 командного центра (грид пивоварен → статус → пульт).
//  Плитка берёт LAST-KNOWN из brew_telemetry + lastSeenAt (без SSE-петли на
//  плитку — см. docs/brewery-command-center.md §«Архитектура телеметрии»):
//  N плиток × M клиентов не должны плодить N×M опросов слабого ESP32.
// =============================================================================

/** Последний известный срез телеметрии для плитки (raw-поля, декод — на клиенте). */
export type DeviceTileSnapshot = {
  /** epoch-мс последнего исторического кадра (для расчёта свежести на клиенте). */
  ts: number;
  stage: number | null;
  primaryC: number | null;
  setpointC: number | null;
  heatDutyPct: number | null;
  faultMask: number;
  /** bf_app_mode_t из payload телеметрии (§14); null — старая прошивка/пустая история. */
  appMode: number | null;
  /** bf_stage_t, из которой ушли в PAUSED/FAULT — для честного бейджа плитки на паузе/аварии (§4.2). */
  pausedFrom: number | null;
};

/** Плитка устройства для L1-грида: метаданные + last-known срез + sparkline. */
export type DeviceTile = {
  id: string;
  name: string;
  hardwareId: string;
  status: DeviceStatus;
  fw: string | null;
  isDemo: boolean;
  lastSeenAt: string | null; // ISO
  /** Last-known срез телеметрии; null — истории ещё нет (никто не открывал пульт). */
  snapshot: DeviceTileSnapshot | null;
  /** Недавняя температура (oldest→newest), nulls отброшены — для sparkline. */
  spark: number[];
};

// Пороги свежести last-known среза плитки (клиентский расчёт по snapshot.ts).
// Телеметрия персистится даунсэмплом ~раз в 10с ТОЛЬКО пока кто-то подписан —
// поэтому «recent» широкий, а не 6с, как онлайн-детект дашборда. Держим здесь
// (client-safe контракт, без серверных импортов): плитка — клиентский компонент.
export const TILE_LIVE_WITHIN_MS = 20_000;
export const TILE_STALE_AFTER_MS = 120_000;

/** Классификация свежести last-known среза плитки по возрасту, мс. */
export function classifyTileFreshness(ageMs: number): "live" | "recent" | "stale" {
  if (ageMs <= TILE_LIVE_WITHIN_MS) return "live";
  if (ageMs <= TILE_STALE_AFTER_MS) return "recent";
  return "stale";
}

// =============================================================================
//  Связка «партия ↔ прибор-ферментер» (§8.4 docs/brewforge-web-hmi.md). Привязка
//  задаётся с партии (акт «Брожение»), не с пульта — портал лишь предлагает
//  приборы, чей last-known режим сейчас ферментация. См. features/devices/
//  fermenter-binding.ts.
// =============================================================================

/** Прибор-кандидат в пикер «бродит в приборе …» на акте «Брожение» партии. */
export type FermenterCandidate = {
  id: string;
  name: string;
  hardwareId: string;
  status: DeviceStatus;
  lastSeenAt: string | null; // ISO
};

/** Вход bindBatchFermenter — привязка/отвязка прибора-ферментера к партии. */
export const bindBatchFermenterSchema = z.object({
  deviceId: z.string().uuid().nullable()
});
export type BindBatchFermenterInput = z.infer<typeof bindBatchFermenterSchema>;

/** Вход updateDeviceStatus (вызывает мост/бридж при коннекте/телеметрии). */
export const updateDeviceStatusSchema = z.object({
  hardwareId: z.string().trim().min(1).max(128),
  status: deviceStatusSchema,
  fw: z.string().trim().max(64).nullable().optional(),
  lastSeenAt: z.date().optional()
});
export type UpdateDeviceStatusInput = z.infer<typeof updateDeviceStatusSchema>;
