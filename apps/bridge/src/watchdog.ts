// =============================================================================
//  apps/bridge — watchdog.ts
//  Офлайн-watchdog ферментации (§12.2/§14 docs/brewforge-web-hmi.md): недельный
//  процесс, оператор далеко — молчание прибора в режиме ферментации > 30 мин
//  это ЧП. Обёртка над чистым checkFermentWatchdog (@nb/brewforge-protocol) —
//  тот же паттерн, что persist-gate.ts/notify.ts: in-memory Map по deviceId
//  (db-id), память живёт, пока жив процесс моста.
//
//  Два входа:
//   - trackFermentFrame(...) — вызывается на КАЖДОМ кадре телеметрии (mqtt.ts),
//     обновляет last-known режим/время устройства. БД не трогает — состояние
//     копится только из живых кадров (после рестарта моста — с нуля, "БД не
//     сканировать агрессивно", решение оркестратора).
//   - runFermentWatchdog(...) — вызывается периодически (main.ts, раз в 5 мин),
//     прогоняет checkFermentWatchdog по отслеживаемым устройствам и шлёт пуши.
// =============================================================================
import {
  checkFermentWatchdog,
  isFermentFrame,
  type Telemetry,
  type WatchdogState,
} from "@nb/brewforge-protocol";
import { fermentWatchdogNotification, sendPushToUser } from "@nb/push";

import type { DeviceRow } from "./db.js";

interface TrackedDevice {
  device: DeviceRow;
  state: WatchdogState;
}

// deviceId (db-id) → устройство + состояние watchdog.
const tracked = new Map<string, TrackedDevice>();

/**
 * Обновить last-known режим/время устройства по свежему кадру телеметрии.
 * Вызывать на КАЖДОМ кадре (независимо от гейта персиста/детекторов пушей —
 * watchdog должен видеть живость устройства без даунсэмпла).
 */
export function trackFermentFrame(device: DeviceRow, telemetry: Telemetry, nowMs: number = Date.now()): void {
  const prev = tracked.get(device.id);
  tracked.set(device.id, {
    device,
    state: {
      isFerment: isFermentFrame(telemetry),
      lastSeenAtMs: nowMs,
      alerted: prev?.state.alerted ?? false,
    },
  });
}

/**
 * Периодическая проверка (раз в 5 мин, §14): среди отслеживаемых устройств —
 * те, чей last-known режим ферментация и кто молчит дольше порога, получают
 * one-shot пуш «Прибор молчит N мин». Best-effort: ошибка пуша не роняет мост.
 */
export async function runFermentWatchdog(nowMs: number = Date.now()): Promise<void> {
  for (const [deviceId, entry] of tracked) {
    const result = checkFermentWatchdog(entry.state, nowMs);
    tracked.set(deviceId, { device: entry.device, state: result.nextState });
    if (!result.shouldPush) continue;

    try {
      const sent = await sendPushToUser(
        entry.device.userId,
        fermentWatchdogNotification({ deviceId: entry.device.id, deviceName: entry.device.name }, result.silentMinutes),
      );
      console.log(`[watchdog] ${entry.device.hardwareId}: молчит ${result.silentMinutes} мин → push x${sent}`);
    } catch (err) {
      console.error("[watchdog] сбой отправки пуша:", err instanceof Error ? err.message : String(err));
    }
  }
}
