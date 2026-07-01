// =============================================================================
//  apps/bridge — notify.ts
//  Диспетчер web-push (Phase 6): на каждом кадре телеметрии выделяет фронты
//  (новый промпт / вновь поднятая авария) и шлёт пуш владельцу устройства через
//  @nb/push. Мост — always-on консьюмер, поэтому пуши работают, даже когда портал
//  закрыт (браузерная SSE-петля этого не даёт — см. docs §Пуши/фон).
//
//  Память фронтов — in-memory Map по deviceId (db-id). ПЕРВЫЙ кадр устройства
//  только сидирует память (detectTelemetryEdges при prev===null не даёт событий):
//  рестарт моста среди варки не должен породить ложный пуш по текущему состоянию.
//  Один инстанс моста ⇒ память корректна (мульти-инстанс — future, §хардненинг).
// =============================================================================
import {
  detectTelemetryEdges,
  edgeStateOf,
  type EdgeState,
  type Telemetry,
} from "@nb/brewforge-protocol";
import { notificationFor, sendPushToUser } from "@nb/push";

import type { DeviceRow } from "./db.js";

// deviceId (db-id) → последний срез для детекта фронтов.
const lastState = new Map<string, EdgeState>();

/**
 * Обработать кадр телеметрии на предмет уведомлений и разослать пуши владельцу.
 * Best-effort: ошибка отправки не роняет мост (§оборонительность mqtt.ts).
 */
export async function dispatchPushForTelemetry(device: DeviceRow, telemetry: Telemetry): Promise<void> {
  const prev = lastState.get(device.id) ?? null;
  const edges = detectTelemetryEdges(prev, telemetry);
  lastState.set(device.id, edgeStateOf(telemetry));

  if (edges.length === 0) return;

  for (const edge of edges) {
    const payload = notificationFor(edge, { deviceId: device.id, deviceName: device.name });
    try {
      const sent = await sendPushToUser(device.userId, payload);
      console.log(`[notify] ${device.hardwareId} ${edge.kind} → push x${sent}`);
    } catch (err) {
      console.error("[notify] сбой отправки пуша:", err instanceof Error ? err.message : String(err));
    }
  }
}
