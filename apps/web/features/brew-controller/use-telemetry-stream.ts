"use client";

// =============================================================================
//  features/brew-controller/use-telemetry-stream.ts
//  SSE-подписка на живую телеметрию устройства/партии + производные (свежесть,
//  «в эфире», локальный обратный отсчёт). Вынесена из LiveDashboard, чтобы владелец
//  (пульт L2) мог поднять ЕДИНУЮ подписку и кормить и sticky-хедер (StatusPill), и
//  тело дашборда из одного источника — без второго EventSource (редизайн L2 §5–6).
//
//  Источник (batch|device) задаёт лишь URL стрима (см. telemetry-source.ts);
//  остальная логика общая для зон A/B.
// =============================================================================
import { useEffect, useState } from "react";

import { TelemetrySchema, type Telemetry } from "@nb/brewforge-protocol";

import { telemetryEndpoints, type TelemetrySource } from "@/features/brew-controller/telemetry-source";
import type { ConnState } from "@/features/brew-controller/components/status-pill";

// Сколько секунд без свежего кадра считаем телеметрию устаревшей (poll ~1.5 с).
const STALE_AFTER_MS = 6000;

export type TelemetryStream = {
  telemetry: Telemetry | null;
  conn: ConnState;
  /** Есть кадр, но давно (> STALE_AFTER_MS) — данные несвежие. */
  isStale: boolean;
  /** online + есть кадр + не устарел → можно доверять состоянию/рулить. */
  isLive: boolean;
  lastError: string | null;
  /** Плавный локальный обратный отсчёт оставшегося времени текущей стадии (сек). */
  remaining: number;
};

/**
 * Открывает EventSource на SSE-стрим источника (batch|device) и держит состояние
 * соединения/свежести + производные. EventSource сам переподключается; кадры:
 *   message        → валидный снимок Telemetry
 *   event: offline → устройство не отдало валидной телеметрии
 *   event: error   → ошибка транспорта/провайдера (серверный кадр с .data)
 */
export function useTelemetryStream(source: TelemetrySource, hasDevice: boolean): TelemetryStream {
  const streamUrl = telemetryEndpoints(source).stream;

  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  // Момент прихода последнего валидного кадра («настенные» часы клиента).
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Локальный тикер раз в секунду: плавный обратный отсчёт + детект устаревания.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!hasDevice) {
      return;
    }

    const es = new EventSource(streamUrl);

    es.onopen = () => {
      setConn((prev) => (prev === "online" ? prev : "connecting"));
    };

    es.onmessage = (event) => {
      try {
        const parsed = TelemetrySchema.safeParse(JSON.parse(event.data));
        if (parsed.success) {
          setTelemetry(parsed.data);
          setLastFrameAt(Date.now());
          setConn("online");
          setLastError(null);
        }
      } catch {
        // битый кадр игнорируем — следующий poll исправит
      }
    };

    es.addEventListener("offline", () => {
      setConn("offline");
    });

    // Кастомный server-sent «error» приходит сюда же, что и сетевые ошибки
    // EventSource: серверный кадр имеет .data, сетевой — нет.
    es.addEventListener("error", (event) => {
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data.length > 0) {
        try {
          const payload = JSON.parse(data) as { error?: string };
          setLastError(payload.error ?? "Ошибка телеметрии");
        } catch {
          setLastError("Ошибка телеметрии");
        }
        setConn("error");
      } else {
        // сетевой обрыв — EventSource переподключится сам
        setConn((prev) => (prev === "online" ? "connecting" : prev));
      }
    });

    return () => es.close();
  }, [streamUrl, hasDevice]);

  const sinceFrameMs = lastFrameAt === null ? Infinity : now - lastFrameAt;
  const isStale = telemetry !== null && sinceFrameMs > STALE_AFTER_MS;
  const isLive = conn === "online" && telemetry !== null && !isStale;
  const remaining = telemetry
    ? Math.max(0, telemetry.stageRemainingSec - Math.floor(Math.max(0, sinceFrameMs) / 1000))
    : 0;

  return { telemetry, conn, isStale, isLive, lastError, remaining };
}
