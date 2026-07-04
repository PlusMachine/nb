// =============================================================================
//  apps/bridge — persist-gate.ts
//  Обёртка над чистым shouldPersistTelemetry (@nb/brewforge-protocol/persist-gate,
//  §14 docs/brewforge-web-hmi.md): держит in-memory память гейта на устройство —
//  тот же паттерн, что notify.ts (lastState) и cloud-deadman.ts (alerted): Map по
//  deviceId (db-id), один инстанс моста, память живёт, пока жив процесс.
//
//  ВАЖНО: gatePersist решает только "писать ли эту строку в brew_telemetry"
//  (даунсэмпл истории). Живость устройства (brew_devices.status/lastSeenAt) и
//  пуш-детекторы (dispatchPushForTelemetry/runCloudDeadman) вызываются мостом
//  ДО/НЕЗАВИСИМО от этого гейта — видят КАЖДЫЙ кадр без исключений.
// =============================================================================
import { shouldPersistTelemetry, type PersistGateState } from "@nb/brewforge-protocol";

const gateState = new Map<string, PersistGateState>();

/**
 * Нужно ли писать этот кадр в brew_telemetry (режимный даунсэмпл §14). Мутирует
 * память гейта устройства ДАЖЕ при отказе (false) — иначе следующая смена
 * стадии/авария не распознается как граница относительно "throttled"-кадра.
 */
export function gatePersist(
  deviceId: string,
  frame: { nowMs: number; stage: number; faultMask: number },
): boolean {
  const prev = gateState.get(deviceId) ?? null;
  const { persist, nextState } = shouldPersistTelemetry(prev, frame);
  gateState.set(deviceId, nextState);
  return persist;
}
