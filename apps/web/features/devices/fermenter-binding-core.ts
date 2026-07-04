// =============================================================================
//  features/devices — fermenter-binding-core.ts
//  Чистое ядро «прибор сейчас в режиме ферментации?» для listFermenterCandidates
//  (fermenter-binding.ts). Вынесено ОТДЕЛЬНО от DB-обвязки — колокированные
//  тесты features/** идут без БД (см. apps/web/vitest.config.ts), тот же приём,
//  что tile-snapshot.ts рядом с tiles.ts.
// =============================================================================
import { APP_MODE_NUM, STAGE_NUM } from "@nb/brewforge-protocol";

/**
 * true, если last-known срез устройства говорит «сейчас ферментация».
 * appMode===ferment — авторитетно там, где прошивка его шлёт (v11+, §13).
 * appMode отсутствует (null, старая прошивка) → падаем на stage===FERMENT (21):
 * стадия сама по себе авторитетна для running-режимов даже без appMode (см.
 * комментарий у appMode в packages/brewforge-protocol/src/telemetry.ts).
 * Устройство без истории телеметрии (оба null) — не кандидат: режим неизвестен,
 * честнее не предлагать, чем угадывать.
 */
export function isFermenterModeRow(appMode: number | null, stage: number | null): boolean {
  if (appMode !== null) return appMode === APP_MODE_NUM.ferment;
  return stage === STAGE_NUM.FERMENT;
}
