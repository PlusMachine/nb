import { assertRateLimit } from "@nb/auth";
import { and, brewDevices, count, db, desc, eq, fermentReadings, fermentSessions, inArray, isNull } from "@nb/db";

import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";
import { RAPT_PROVIDER_ID } from "@/features/brew-controller/rapt-cloud-provider";

import {
  INGEST_PERSIST_GATE_SECONDS,
  MAX_STREAM_DEVICES_PER_USER,
  RAPT_INGEST_RATE_LIMIT,
  RAPT_INGEST_RATE_WINDOW_SECONDS,
  type StreamHardwareKind
} from "./contracts";
import { findRaptIntegrationByToken } from "./integrations";
import { normalizeStreamPacket } from "./normalize-core";
import type { ParsedStreamPacket } from "./parse-core";
import { processIngestAlerts } from "./alerts";
import { track } from "./analytics";

// =============================================================================
//  features/device-streams — ingest-rapt.ts
//  Приём вебхука RAPT Cloud (§8.4, M4). Публичный, без сессии — вызывается
//  ТОЛЬКО из app/api/ingest/rapt/[token]/route.ts. Auth — по вебхук-токену
//  ПОДКЛЮЧЕНИЯ (user_integrations), а не по токену устройства: одно RAPT-
//  подключение кормит любое число устройств пользователя (Pill + камера +
//  BrewZilla одним вебхуком, автообнаружение по @device_id, §5 F1-RAPT).
//
//  Владелец этого файла (жёсткое разделение с параллельным исполнителем):
//  не трогает ingest.ts/service.ts/sessions.ts/corrections.ts/series.ts —
//  паттерны персист-гейта/дедупа/денормализации сеанса СКОПИРОВАНЫ из ingest.ts
//  (тот файл приватных хелперов наружу не отдаёт), а не импортированы.
// =============================================================================

/** Персист-гейт (§8.5): 1 точка/5 мин на устройство — тот же порог, что у generic ingest. */
const PERSIST_GATE_MS = INGEST_PERSIST_GATE_SECONDS * 1000;

/** Окно правдоподобия для `ts` (@created_date) — тот же принцип, что SOURCE_TS_WINDOW_MS в ingest.ts. */
const RAPT_TS_WINDOW_MS = 48 * 60 * 60 * 1000;

export type IngestRaptResult =
  | { kind: "stored"; created: boolean }
  /** Rate-limit на подключение ИЛИ квота устройств ИЛИ персист-гейт — наружу
   *  всё выглядит одинаково (200 ok, stored:false), различие важно только тестам. */
  | { kind: "throttled" }
  /** Токен неизвестен ИЛИ владелец подключения забанен/обезличен. */
  | { kind: "not_found" }
  /** Тело не объект ИЛИ device_id пустой/отсутствует. */
  | { kind: "bad_format" };

export type IngestRaptWebhookInput = {
  rawToken: string;
  body: unknown;
  clientIp: string | null;
  receivedAt?: Date;
};

// -----------------------------------------------------------------------------
//  Терпимое чтение полей шаблона (§8.4): RAPT подставляет @-переменные строками
//  ВСЕГДА (даже числовые), поэтому парсим терпимо — как parse-core.ts, но
//  локально: тот файл приватных хелперов (toNumberOrNull и т.п.) не экспортирует,
//  а сам файл — чужая зона (не трогаем).
// -----------------------------------------------------------------------------

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** ISO-строка (@created_date) → Date, терпимо; невалидная/отсутствующая → null (тогда используем receivedAt). */
const parseRaptTs = (value: unknown): Date | null => {
  const str = toStringOrNull(value);
  if (!str) return null;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
};

type RaptParsedPayload = {
  deviceId: string;
  deviceType: string | null;
  deviceName: string | null;
  temperatureRaw: number | null;
  gravityRaw: number | null;
  batteryRaw: number | null;
  rssi: number | null;
  sourceTs: Date | null;
};

/** Разобрать тело вебхука (§8.4 шаблон). null — не объект ИЛИ device_id пустой/отсутствует. */
const parseRaptBody = (body: unknown): RaptParsedPayload | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const deviceId = toStringOrNull(record.device_id);
  if (!deviceId) {
    return null;
  }
  return {
    deviceId,
    deviceType: toStringOrNull(record.device_type),
    deviceName: toStringOrNull(record.device_name),
    temperatureRaw: toNumberOrNull(record.temperature),
    gravityRaw: toNumberOrNull(record.gravity),
    batteryRaw: toNumberOrNull(record.battery),
    rssi: toNumberOrNull(record.rssi),
    sourceTs: parseRaptTs(record.ts)
  };
};

/**
 * Пакет в форме ParsedStreamPacket — переиспользуем normalize-core (клампы
 * плаузибилити, эвристика батареи В/%, а не дублируем эти пороги здесь).
 * RAPT шлёт gravity уже в SG и temperature уже в °C (§8.4) — hint'ы фиксированы,
 * без автодетекта unit. `format`/`name`/`intervalSeconds` не используются
 * normalizeStreamPacket (см. normalize-core.ts) — значения-заглушки корректны.
 */
const toNormalizeInput = (parsed: RaptParsedPayload): ParsedStreamPacket => ({
  format: "brewfather",
  name: parsed.deviceName,
  gravityRaw: parsed.gravityRaw,
  gravityUnitHint: "sg",
  temperatureRaw: parsed.temperatureRaw,
  temperatureUnitHint: "c",
  pressureRaw: null,
  pressureUnitHint: null,
  batteryRaw: parsed.batteryRaw,
  rssi: parsed.rssi,
  intervalSeconds: null,
  sourceTs: parsed.sourceTs
});

/** hardware_kind по device_type (§8.4): текст свободной формы от RAPT — маппинг по вхождению ключевых слов. */
const mapDeviceTypeToHardwareKind = (deviceType: string | null): StreamHardwareKind => {
  if (!deviceType) return "other";
  const normalized = deviceType.toLowerCase();
  if (normalized.includes("pill")) return "rapt-pill";
  if (normalized.includes("chamber") || normalized.includes("fridge") || normalized.includes("temperature controller")) {
    return "rapt-chamber";
  }
  if (normalized.includes("brewzilla")) return "rapt-brewzilla";
  return "other";
};

const buildRaptHardwareId = (deviceId: string): string => `rapt-${deviceId}`;

/** Время точки: sourceTs (@created_date), если в разумном окне вокруг receivedAt; иначе — время приёма. */
const resolveReadingTs = (sourceTs: Date | null, receivedAt: Date): Date => {
  if (!sourceTs) return receivedAt;
  const driftMs = Math.abs(sourceTs.getTime() - receivedAt.getTime());
  return driftMs <= RAPT_TS_WINDOW_MS ? sourceTs : receivedAt;
};

const touchDeviceOnline = async (deviceId: string, at: Date): Promise<void> => {
  await db
    .update(brewDevices)
    .set({ lastSeenAt: at, status: "online", updatedAt: new Date() })
    .where(eq(brewDevices.id, deviceId));
};

const findActiveSessionId = async (deviceId: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: fermentSessions.id })
    .from(fermentSessions)
    .where(and(eq(fermentSessions.deviceId, deviceId), isNull(fermentSessions.endedAt)))
    .limit(1);
  return row?.id ?? null;
};

const findLatestReadingTs = async (deviceId: string): Promise<Date | null> => {
  const [row] = await db
    .select({ ts: fermentReadings.ts })
    .from(fermentReadings)
    .where(eq(fermentReadings.deviceId, deviceId))
    .orderBy(desc(fermentReadings.ts))
    .limit(1);
  return row?.ts ?? null;
};

/**
 * Найти существующее RAPT-устройство пользователя (hardwareId=`rapt-<device_id>`
 * И userId владельца интеграции) либо создать новое (автообнаружение, §5 F1-RAPT
 * шаг 2). Квота — СУММАРНО стрим+RAPT устройств пользователя (§8.5,
 * MAX_STREAM_DEVICES_PER_USER=10): превышение → null, вебхук отвечает 200 без
 * записи (throttled-подобно), не блокирует существующие устройства.
 *
 * hardwareId глобально уникален (brew_devices_hardware_id_uidx) — конфликт на
 * INSERT (тот же физический device_id уже привязан к ДРУГОМУ аккаунту, крайне
 * маловероятный edge-case перепривязки чужого Pill) не должен валить вебхук
 * 500: перечитываем строку, и если она правда чужая — тихо не создаём (null).
 */
const getOrCreateRaptDevice = async (
  userId: string,
  parsed: RaptParsedPayload
): Promise<{ deviceId: string; created: boolean } | null> => {
  const hardwareId = buildRaptHardwareId(parsed.deviceId);

  const [existing] = await db
    .select({ id: brewDevices.id })
    .from(brewDevices)
    .where(and(eq(brewDevices.hardwareId, hardwareId), eq(brewDevices.userId, userId)));
  if (existing) {
    return { deviceId: existing.id, created: false };
  }

  const [countRow] = await db
    .select({ value: count() })
    .from(brewDevices)
    .where(and(eq(brewDevices.userId, userId), inArray(brewDevices.providerId, [STREAM_PROVIDER_ID, RAPT_PROVIDER_ID])));
  if ((countRow?.value ?? 0) >= MAX_STREAM_DEVICES_PER_USER) {
    return null;
  }

  const name = parsed.deviceName ?? `RAPT ${parsed.deviceType ?? "устройство"}`;

  try {
    const [device] = await db
      .insert(brewDevices)
      .values({
        userId,
        providerId: RAPT_PROVIDER_ID,
        name,
        hardwareId,
        hardwareKind: mapDeviceTypeToHardwareKind(parsed.deviceType),
        // RAPT-устройство не имеет собственного токена — приём только через
        // вебхук интеграции (findRaptIntegrationByToken), не через findDeviceByToken.
        tokenHash: null,
        tokenEncrypted: null,
        capabilities: ["fermentation_logging"],
        status: "unknown"
      })
      .returning({ id: brewDevices.id });
    if (!device) return null;
    return { deviceId: device.id, created: true };
  } catch {
    const [row] = await db
      .select({ id: brewDevices.id, userId: brewDevices.userId })
      .from(brewDevices)
      .where(eq(brewDevices.hardwareId, hardwareId));
    if (row && row.userId === userId) {
      return { deviceId: row.id, created: false };
    }
    return null;
  }
};

/**
 * Принять один пуш-пакет вебхука RAPT (§8.4/§8.5, порядок шагов см. в ТЗ):
 * auth по токену подключения → rate-limit на подключение → парс шаблона →
 * найти/создать устройство (квота) → нормализация → выбор ts → персист-гейт →
 * денормализация сеанса → INSERT (дедуп) → presence-апдейт.
 */
export const ingestRaptWebhook = async (input: IngestRaptWebhookInput): Promise<IngestRaptResult> => {
  const receivedAt = input.receivedAt ?? new Date();

  const integration = await findRaptIntegrationByToken(input.rawToken);
  if (!integration) {
    return { kind: "not_found" };
  }

  try {
    await assertRateLimit(`rapt:${integration.id}`, "rapt_ingest", RAPT_INGEST_RATE_LIMIT, RAPT_INGEST_RATE_WINDOW_SECONDS);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "RATE_LIMITED") {
      throw error;
    }
    return { kind: "throttled" };
  }

  const parsed = parseRaptBody(input.body);
  if (!parsed) {
    return { kind: "bad_format" };
  }

  const deviceResult = await getOrCreateRaptDevice(integration.userId, parsed);
  if (!deviceResult) {
    // Квота исчерпана ИЛИ hardwareId занят другим аккаунтом — вебхук всё равно 200.
    return { kind: "throttled" };
  }
  const { deviceId, created } = deviceResult;
  if (created) {
    // Автообнаружение по первому пакету вебхука — это одновременно и device_connected,
    // и first_packet (устройство только что появилось) — §11 M5 PostHog-события.
    track("device_connected", { kind: mapDeviceTypeToHardwareKind(parsed.deviceType), provider: RAPT_PROVIDER_ID });
    track("first_packet", { provider: RAPT_PROVIDER_ID });
  }

  const normalized = normalizeStreamPacket(toNormalizeInput(parsed));
  const ts = resolveReadingTs(parsed.sourceTs, receivedAt);

  const latestTs = await findLatestReadingTs(deviceId);
  if (latestTs && ts.getTime() - latestTs.getTime() < PERSIST_GATE_MS) {
    await touchDeviceOnline(deviceId, receivedAt);
    return { kind: "throttled" };
  }

  const sessionId = await findActiveSessionId(deviceId);

  await db
    .insert(fermentReadings)
    .values({
      deviceId,
      sessionId,
      ts,
      gravitySg: normalized.gravitySg,
      tempC: normalized.tempC,
      pressureKpa: normalized.pressureKpa,
      batteryV: normalized.batteryV,
      batteryPct: normalized.batteryPct,
      rssi: normalized.rssi,
      payload: input.body as Record<string, unknown>
    })
    // Дедуп ретраев вебхука (§8.5): точное совпадение (deviceId, ts) — не более 1 строки.
    .onConflictDoNothing({ target: [fermentReadings.deviceId, fermentReadings.ts] });

  await touchDeviceOnline(deviceId, receivedAt);

  // F6 (M5-A): те же алерты на ingest, что и generic-стрим (ingest.ts) — см. комментарий
  // там про await vs fire-and-forget.
  await processIngestAlerts({ deviceId, sessionId, receivedAt });

  return { kind: "stored", created };
};
