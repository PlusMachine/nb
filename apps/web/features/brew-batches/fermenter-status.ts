// =============================================================================
//  features/brew-batches/fermenter-status.ts
//  Чистое ядро состояния «партия ↔ прибор-ферментер» НА СТОРОНЕ ПАРТИИ (§8.4
//  docs/brewforge-web-hmi.md, зона A, акт «Брожение»). Без БД/React — тестируется
//  юнитами (тот же приём, что fermenter-binding-core.ts рядом в features/devices).
//
//  ВАЖНО: «прибор сейчас в режиме ферментации?» решается по LAST-KNOWN кадру уже
//  загруженной истории (TelemetryHistoryPoint[] из getDeviceTelemetryHistory), а
//  НЕ по живой SSE-подписке — страница партии не держит подписку на прибор
//  неделями брожения (см. комментарий в app/(app)/app/brew-batches/[id]/page.tsx).
//  Правило «кадр → это ферментация?» переиспользуем из fermenter-binding-core.ts —
//  тот же isFermenterModeRow, что решает список кандидатов в пикере на этой же
//  странице: два места должны сходиться в одном ответе про один и тот же прибор.
// =============================================================================
import { isFermenterModeRow } from "@/features/devices/fermenter-binding-core";

import type { TelemetryHistoryPoint } from "./contracts";

export type FermenterBindingStatus =
  // Партия не привязана к прибору — живёт руками (привязка опциональна, §8.4).
  | { kind: "unbound" }
  // Привязана, но по этой партии ещё нет ни одного кадра телеметрии (только что
  // привязали / прибор пока молчит) — честно «данных пока нет», НЕ путать с
  // mode-mismatch (тот про ДОКАЗАННОЕ переключение режима, не про их отсутствие).
  | { kind: "no-data"; deviceId: string }
  // Привязана, last-known кадр говорит «сейчас ферментация» — штатный случай.
  | { kind: "fermenting"; deviceId: string; point: TelemetryHistoryPoint }
  // Граничный случай §8.4: прибор переключили из режима ферментации, партия
  // остаётся привязанной (снимается вручную, не молча) — история не пропадает.
  | { kind: "mode-mismatch"; deviceId: string; point: TelemetryHistoryPoint };

/**
 * Самая свежая точка истории по ts. История из getDeviceTelemetryHistory уже
 * идёт oldest→newest (последний элемент), но функция явно ищет максимум ts —
 * не полагается молча на порядок массива вызывающего.
 */
export function pickLatestTelemetryPoint(points: TelemetryHistoryPoint[]): TelemetryHistoryPoint | null {
  let latest: TelemetryHistoryPoint | null = null;
  for (const point of points) {
    if (!latest || point.ts > latest.ts) {
      latest = point;
    }
  }
  return latest;
}

/** Состояние привязки для блока «Бродит в приборе» на акте «Брожение» (§8.4). */
export function resolveFermenterBindingStatus(
  deviceId: string | null,
  history: TelemetryHistoryPoint[]
): FermenterBindingStatus {
  if (!deviceId) {
    return { kind: "unbound" };
  }
  const point = pickLatestTelemetryPoint(history);
  if (!point) {
    return { kind: "no-data", deviceId };
  }
  const fermenting = isFermenterModeRow(point.appMode ?? null, point.stage);
  return fermenting ? { kind: "fermenting", deviceId, point } : { kind: "mode-mismatch", deviceId, point };
}
