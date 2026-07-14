import { assertRateLimit } from "@nb/auth";
import { and, brewDevices, db, desc, eq, fermentReadings, fermentSessions, isNull } from "@nb/db";

import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";
import { findDeviceByToken } from "@/features/devices/service";

import {
  INGEST_PERSIST_GATE_SECONDS,
  INGEST_RATE_LIMIT,
  INGEST_RATE_WINDOW_SECONDS
} from "./contracts";
import { parseStreamPacket } from "./parse-core";
import { normalizeStreamPacket } from "./normalize-core";
import { processIngestAlerts } from "./alerts";
import { track } from "./analytics";

// =============================================================================
//  features/device-streams — ingest.ts
//  Приём одного пуш-пакета телеметрии стороннего устройства ферментации (§8.5).
//  Публичный, без сессии — вызывается ТОЛЬКО из app/api/ingest/[token]/route.ts.
//  Владелец этого файла (жёсткое разделение с параллельным исполнителем): не
//  трогает contracts.ts/parse-core.ts/normalize-core.ts/service.ts/actions.ts —
//  только читает их.
// =============================================================================

/** Персист-гейт применяется реже rate-limit'а: 1 точка/5 мин на устройство. */
const PERSIST_GATE_MS = INGEST_PERSIST_GATE_SECONDS * 1000;

/**
 * Окно правдоподобия для sourceTs (Tilt Timepoint): битый Excel-serial (эпоха
 * 1899, испорченный конфиг телефона, будущее время) не должен создавать точку
 * с абсурдной датой — используем время приёма вместо него. ±48ч соответствует
 * реалистичному дрейфу часов TiltPi/приложения относительно нашего сервера.
 */
const SOURCE_TS_WINDOW_MS = 48 * 60 * 60 * 1000;

export type IngestResult =
  | { kind: "stored" }
  /** Rate-limit на устройство ИЛИ персист-гейт — наружу оба выглядят одинаково
   *  (200 ok, stored:false), различаем только во внутренних тестах. */
  | { kind: "throttled" }
  /** Токен неизвестен ИЛИ принадлежит не стрим-устройству (BrewForge и т.п.). */
  | { kind: "not_found" }
  | { kind: "bad_format"; error: "unknown_format" | "invalid_body" };

export type IngestStreamPacketInput = {
  rawToken: string;
  body: unknown;
  clientIp: string | null;
  receivedAt?: Date;
};

/** Обновить присутствие устройства: и на успешной записи, и на throttle/gate. */
const touchDeviceOnline = async (deviceId: string, at: Date): Promise<void> => {
  await db
    .update(brewDevices)
    .set({ lastSeenAt: at, status: "online", updatedAt: new Date() })
    .where(eq(brewDevices.id, deviceId));
};

/**
 * Время точки: sourceTs пакета (сейчас — только у Tilt, см. parse-core), если
 * оно в разумном окне вокруг receivedAt; иначе — время приёма. Без hint'а
 * (iSpindel/Brewfather native — без sourceTs) — всегда receivedAt.
 */
const resolveReadingTs = (sourceTs: Date | null, receivedAt: Date): Date => {
  if (!sourceTs) return receivedAt;
  const driftMs = Math.abs(sourceTs.getTime() - receivedAt.getTime());
  return driftMs <= SOURCE_TS_WINDOW_MS ? sourceTs : receivedAt;
};

/** Активный (ещё не завершённый) сеанс устройства — для денормализации sessionId. */
const findActiveSessionId = async (deviceId: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: fermentSessions.id })
    .from(fermentSessions)
    .where(and(eq(fermentSessions.deviceId, deviceId), isNull(fermentSessions.endedAt)))
    .limit(1);
  return row?.id ?? null;
};

/** max(ts) существующих показаний устройства — сравнение персист-гейта (§8.5). */
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
 * Принять один пуш-пакет телеметрии (§8.5, порядок шагов см. в ТЗ):
 * auth → provider-гейт → rate-limit → парс → нормализация → выбор ts →
 * персист-гейт → денормализация сеанса → INSERT (дедуп) → presence-апдейт.
 *
 * Наружу (route.ts) throttled/gated неотличимы (везде `stored:false`) — так и
 * задумано (§8.5: молчаливый 200 при перегрузке), различие важно только тестам.
 */
export const ingestStreamPacket = async (input: IngestStreamPacketInput): Promise<IngestResult> => {
  const receivedAt = input.receivedAt ?? new Date();

  const device = await findDeviceByToken(input.rawToken);
  if (!device || device.providerId !== STREAM_PROVIDER_ID) {
    // Токены BrewForge-устройств намеренно не принимаются здесь (RAPT — своя
    // волна M4) — и то, и другое наружу выглядит как "нет такого токена" (404),
    // чтобы не раскрывать существование/тип чужих токенов.
    return { kind: "not_found" };
  }

  try {
    await assertRateLimit(`device:${device.id}`, "stream_ingest", INGEST_RATE_LIMIT, INGEST_RATE_WINDOW_SECONDS);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "RATE_LIMITED") {
      throw error;
    }
    // Устройство реально на связи (шлёт слишком часто) — presence обновляем,
    // строку не пишем.
    await touchDeviceOnline(device.id, receivedAt);
    return { kind: "throttled" };
  }

  const parsed = parseStreamPacket(input.body);
  if (!parsed.ok) {
    // Неизвестный формат может быть чужим мусором (не наше устройство вообще) —
    // lastSeenAt НЕ трогаем, в отличие от всех остальных веток.
    return { kind: "bad_format", error: parsed.error };
  }

  const normalized = normalizeStreamPacket(parsed.packet);
  const ts = resolveReadingTs(parsed.packet.sourceTs, receivedAt);

  const latestTs = await findLatestReadingTs(device.id);
  if (latestTs && ts.getTime() - latestTs.getTime() < PERSIST_GATE_MS) {
    await touchDeviceOnline(device.id, receivedAt);
    return { kind: "throttled" };
  }
  if (!latestTs) {
    // Первая точка устройства (до этого показаний не было вовсе) — §11 M5 PostHog first_packet.
    track("first_packet", { provider: "stream" });
  }

  const sessionId = await findActiveSessionId(device.id);

  await db
    .insert(fermentReadings)
    .values({
      deviceId: device.id,
      sessionId,
      ts,
      gravitySg: normalized.gravitySg,
      tempC: normalized.tempC,
      pressureKpa: normalized.pressureKpa,
      batteryV: normalized.batteryV,
      batteryPct: normalized.batteryPct,
      rssi: normalized.rssi,
      // Сырое тело как пришло (отладка, будущие поля angle/ph/bpm) — body уже
      // прошёл parseStreamPacket, т.е. гарантированно непустой объект.
      payload: input.body as Record<string, unknown>
    })
    // Дедуп ретраев (§8.5): точное совпадение (deviceId, ts) — не более 1 строки.
    .onConflictDoNothing({ target: [fermentReadings.deviceId, fermentReadings.ts] });

  await touchDeviceOnline(device.id, receivedAt);

  // F6 (M5-A): алерты считаются на ingest, ПОСЛЕ записи точки, только при активном
  // сеансе — processIngestAlerts сама no-op'ает на sessionId=null и глотает свои
  // ошибки (console.error), поэтому падение алертов никогда не портит ingest-ответ.
  // await, а не fire-and-forget: в serverless-роуте фоновый промис может не дожить
  // до завершения функции после отправки ответа — см. отчёт по M5-A.
  await processIngestAlerts({ deviceId: device.id, sessionId, receivedAt });

  return { kind: "stored" };
};
