// =============================================================================
//  @nb/brewforge-protocol — watchdog.ts
//  Чистое решение «пора ли пушить офлайн-watchdog ферментации» (§12.2/§14
//  docs/brewforge-web-hmi.md): недельный процесс, оператор далеко — молчание
//  прибора > 30 мин в режиме ферментации это ЧП, а не «клиент закрыл вкладку».
//  Проверка СЕРВЕРНАЯ (мост, always-on) по конструкции: браузерная вкладка
//  закрыта неделями, клиентский таймер такую проверку сделать не может.
//
//  Тот же приём, что persist-gate.ts: чистая функция здесь (тестируется
//  юнитами), память per-device (Map по deviceId) держит ВЫЗЫВАЮЩИЙ — мост,
//  apps/bridge (там нет vitest). checkFermentWatchdog решает только «пушить ли
//  сейчас»; накопление lastSeenAtMs/isFerment по кадрам телеметрии — отдельная
//  забота вызывающего (apps/bridge/src/watchdog.ts).
// =============================================================================
import { APP_MODE_NUM, STAGE_NUM } from "./enums.js";

/** Порог молчания прибора в режиме ферментации, мс (решение оркестратора). */
export const FERMENT_WATCHDOG_THRESHOLD_MS = 30 * 60_000; // 30 мин

/** Память watchdog на одно устройство между проверками. */
export interface WatchdogState {
  /** true, если last-known срез устройства — режим ферментации. */
  isFerment: boolean;
  /** wall-clock мс последнего полученного кадра телеметрии. */
  lastSeenAtMs: number;
  /** Пуш «прибор молчит» уже отправлен за текущий эпизод офлайна (one-shot). */
  alerted: boolean;
}

export interface WatchdogCheckResult {
  /** Нужно ли послать пуш «прибор молчит N мин» прямо сейчас. */
  shouldPush: boolean;
  /** Сколько минут прибор молчит — только когда shouldPush===true. */
  silentMinutes: number;
  nextState: WatchdogState;
}

/**
 * Проверить, не пора ли пушить владельцу «прибор молчит» — вызывается
 * периодически (раз в 5 мин, §14) для каждого отслеживаемого устройства.
 *
 * one-shot: пуш шлётся один раз на эпизод офлайна. Как только приходит свежий
 * кадр (silentMs падает ниже порога — это фиксирует вызывающий, обновляя
 * lastSeenAtMs при каждой телеметрии), флаг alerted снимается ЭТОЙ функцией
 * при следующей проверке — эпизод закрыт, следующее молчание снова даст пуш.
 * Устройства не в режиме ферментации — не watchdog-ятся вовсе.
 */
export function checkFermentWatchdog(state: WatchdogState, nowMs: number): WatchdogCheckResult {
  if (!state.isFerment) {
    return { shouldPush: false, silentMinutes: 0, nextState: state };
  }

  const silentMs = nowMs - state.lastSeenAtMs;
  if (silentMs < FERMENT_WATCHDOG_THRESHOLD_MS) {
    // На связи (или ещё рано) — если предыдущий эпизод молчания был закрыт
    // пушем, снимаем one-shot флаг: следующее молчание должно пушить заново.
    if (state.alerted) return { shouldPush: false, silentMinutes: 0, nextState: { ...state, alerted: false } };
    return { shouldPush: false, silentMinutes: 0, nextState: state };
  }

  if (state.alerted) {
    // Уже оповестили за этот эпизод офлайна — не спамим на каждой проверке.
    return { shouldPush: false, silentMinutes: 0, nextState: state };
  }

  return {
    shouldPush: true,
    silentMinutes: Math.floor(silentMs / 60_000),
    nextState: { ...state, alerted: true },
  };
}

/**
 * last-known режим кадра — ферментация? Решение оркестратора: appMode===ferment
 * ИЛИ stage===FERMENT (объединение, не приоритет одного над другим) — прибор,
 * который прошивка уже пометила ferment (appMode), watch-ится даже в IDLE
 * («профиль не задан, держит N°», §12.1); прибор старой прошивки без appMode,
 * но с stage=FERMENT — тоже. Чистая функция, отдельно тестируется.
 */
export function isFermentFrame(frame: { appMode?: number; stage: number }): boolean {
  return frame.appMode === APP_MODE_NUM.ferment || frame.stage === STAGE_NUM.FERMENT;
}
