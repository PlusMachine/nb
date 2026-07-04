// =============================================================================
//  @nb/brewforge-protocol — persist-gate.ts
//  Чистое решение "писать ли этот кадр в brew_telemetry" для режимного
//  даунсэмпла персиста моста (§14 docs/brewforge-web-hmi.md): FERMENT — не чаще
//  раза в 300 с (недельный процесс, много кадров не нужно), остальные режимы —
//  как раньше, раз в 10 с. Границы процессов НЕ должны теряться в даунсэмпле:
//  смена стадии и вновь поднятая авария (faultMask) пишутся немедленно, минуя
//  интервал — иначе график «план vs факт» и журнал аварий получают дыры ровно
//  там, где важнее всего.
//
//  Без I/O — тестируется юнитами. Память гейта (последний персист/стадия/маска
//  на устройство) хранит ВЫЗЫВАЮЩИЙ (мост, apps/bridge — там нет vitest, поэтому
//  чистая логика живёт здесь, как detectTelemetryEdges/notify.ts) в Map по
//  deviceId — тот же паттерн, что notify.ts/cloud-deadman.ts.
//
//  ВАЖНО: гейт решает только персист ИСТОРИИ (INSERT в brew_telemetry). Живость
//  устройства (brew_devices.status/lastSeenAt) и пуш-детекторы
//  (dispatchPushForTelemetry/runCloudDeadman) должны видеть КАЖДЫЙ кадр — они
//  вызываются мостом независимо от этого гейта, не через него.
// =============================================================================
import { STAGE_NUM } from "./enums.js";

/** Память гейта на одно устройство между кадрами. */
export interface PersistGateState {
  /** wall-clock мс последнего фактического персиста (для интервального гейта). */
  lastPersistedAtMs: number;
  /** Стадия предыдущего кадра — для детекта границы «сменилась стадия». */
  lastStage: number;
  /** faultMask предыдущего кадра — для детекта «вновь поднятая авария». */
  lastFaultMask: number;
}

const FERMENT_INTERVAL_MS = 300_000; // 5 мин — FERMENT (§14)
const DEFAULT_INTERVAL_MS = 10_000; // 10 с — остальные режимы (как было до §14)

function intervalForStage(stage: number): number {
  return stage === STAGE_NUM.FERMENT ? FERMENT_INTERVAL_MS : DEFAULT_INTERVAL_MS;
}

/** Причина решения — для логов/отладки диспетчера, не влияет на поведение. */
export type PersistGateReason = "first" | "stage-change" | "fault-raised" | "interval" | "throttled";

export interface PersistGateDecision {
  persist: boolean;
  reason: PersistGateReason;
  /** Обязателен к сохранению вызывающим в свою Map — ДАЖЕ если persist===false
   *  (иначе следующая смена стадии/маски не распознается как граница). */
  nextState: PersistGateState;
}

/**
 * Решить, писать ли кадр в brew_telemetry. prev===null (первый кадр устройства
 * в памяти моста — например, после рестарта) ВСЕГДА пишет: без стартовой точки
 * график «план vs факт» и дедуп-логика границ ниже не имеют опоры.
 */
export function shouldPersistTelemetry(
  prev: PersistGateState | null,
  frame: { nowMs: number; stage: number; faultMask: number },
): PersistGateDecision {
  if (prev === null) {
    return {
      persist: true,
      reason: "first",
      nextState: { lastPersistedAtMs: frame.nowMs, lastStage: frame.stage, lastFaultMask: frame.faultMask },
    };
  }

  const stageChanged = frame.stage !== prev.lastStage;
  if (stageChanged) {
    return {
      persist: true,
      reason: "stage-change",
      nextState: { lastPersistedAtMs: frame.nowMs, lastStage: frame.stage, lastFaultMask: frame.faultMask },
    };
  }

  // Только НОВЫЕ биты (raised edge) — не спамим персист каждым кадром активной аварии.
  const faultRaised = (frame.faultMask & ~prev.lastFaultMask) !== 0;
  if (faultRaised) {
    return {
      persist: true,
      reason: "fault-raised",
      nextState: { lastPersistedAtMs: frame.nowMs, lastStage: frame.stage, lastFaultMask: frame.faultMask },
    };
  }

  const interval = intervalForStage(frame.stage);
  if (frame.nowMs - prev.lastPersistedAtMs >= interval) {
    return {
      persist: true,
      reason: "interval",
      nextState: { lastPersistedAtMs: frame.nowMs, lastStage: frame.stage, lastFaultMask: frame.faultMask },
    };
  }

  return {
    persist: false,
    reason: "throttled",
    // lastPersistedAtMs НЕ двигаем (ждём интервал от последнего реального персиста);
    // стадию/маску обновляем — они уже сверены выше как "не изменились".
    nextState: { lastPersistedAtMs: prev.lastPersistedAtMs, lastStage: frame.stage, lastFaultMask: frame.faultMask },
  };
}
