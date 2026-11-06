import { assertRateLimit } from "@nb/auth";

import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";
import { findDeviceByToken } from "@/features/devices/service";

import {
  INGEST_RATE_LIMIT,
  INGEST_RATE_WINDOW_SECONDS
} from "./contracts";
import { parseStreamPacket } from "./parse-core";
import { normalizeStreamPacket } from "./normalize-core";
import { processIngestAlerts } from "./alerts";
import { track } from "./analytics";
import { persistStreamReading, resolveStreamReadingTs, touchStreamDeviceOnline } from "./persist-reading";

// =============================================================================
//  features/device-streams — ingest.ts
//  Приём одного пуш-пакета телеметрии стороннего устройства ферментации (§8.5).
//  Публичный, без сессии — вызывается ТОЛЬКО из app/api/ingest/[token]/route.ts.
//  Владелец этого файла (жёсткое разделение с параллельным исполнителем): не
//  трогает contracts.ts/parse-core.ts/normalize-core.ts/service.ts/actions.ts —
//  только читает их.
// =============================================================================

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
    await touchStreamDeviceOnline(device.id, receivedAt);
    return { kind: "throttled" };
  }

  const parsed = parseStreamPacket(input.body);
  if (!parsed.ok) {
    // Неизвестный формат может быть чужим мусором (не наше устройство вообще) —
    // lastSeenAt НЕ трогаем, в отличие от всех остальных веток.
    return { kind: "bad_format", error: parsed.error };
  }

  const result = await persistStreamReading({
    deviceId: device.id,
    receivedAt,
    ts: resolveStreamReadingTs(parsed.packet.sourceTs, receivedAt),
    reading: normalizeStreamPacket(parsed.packet),
    payload: input.body as Record<string, unknown>
  });
  if (result.kind !== "stored") return { kind: result.kind };

  if (result.firstReading) track("first_packet", { provider: "stream" });
  await processIngestAlerts({ deviceId: device.id, sessionId: result.sessionId, receivedAt });

  return { kind: "stored" };
};
