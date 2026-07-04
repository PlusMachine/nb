// =============================================================================
//  apps/bridge — notify.ts
//  Диспетчер web-push (Phase 6): на каждом кадре телеметрии выделяет фронты
//  (новый промпт / вновь поднятая авария / H2: смена приёмной ёмкости и конец
//  фракции в дистилляции / H3: отклонение уставки и конец ступени в
//  ферментации) и шлёт пуш владельцу устройства через @nb/push. Мост —
//  always-on консьюмер, поэтому пуши работают, даже когда портал закрыт
//  (браузерная SSE-петля этого не даёт — см. docs §Пуши/фон).
//
//  Дистилляция (H2) отдельной памяти НЕ заводит: её детектор внутри
//  detectTelemetryEdges/EdgeState (см. notify.ts пакета) — та же lastState
//  Map ниже, что уже несёт промпт/аварию, несёт и её.
//
//  Память фронтов — in-memory Map по deviceId (db-id), отдельная на каждый
//  детектор с собственной временной семантикой (тот же паттерн, что
//  persist-gate.ts/watchdog.ts). ПЕРВЫЙ кадр устройства только сидирует
//  память (детекторы при prev===null не дают событий): рестарт моста среди
//  варки/брожения не должен породить ложный пуш по текущему состоянию. Один
//  инстанс моста ⇒ память корректна (мульти-инстанс — future, §хардненинг).
// =============================================================================
import {
  detectFermentEdges,
  detectTelemetryEdges,
  edgeStateOf,
  type EdgeState,
  type FermentEdgeState,
  type Telemetry,
} from "@nb/brewforge-protocol";
import { notificationFor, sendPushToUser } from "@nb/push";

import type { DeviceRow } from "./db.js";

// deviceId (db-id) → последний срез для детекта фронтов (промпт/авария).
const lastState = new Map<string, EdgeState>();
// deviceId (db-id) → память детектора ферментации (отклонение/ступень, H3).
const fermentState = new Map<string, FermentEdgeState>();

/**
 * Обработать кадр телеметрии на предмет уведомлений и разослать пуши владельцу.
 * nowMs — монотонное время кадра на стороне моста (не device ts/SNTP — окно
 * отклонения ферментации должно считаться по часам моста). Best-effort: ошибка
 * отправки не роняет мост (§оборонительность mqtt.ts).
 */
export async function dispatchPushForTelemetry(
  device: DeviceRow,
  telemetry: Telemetry,
  nowMs: number = Date.now(),
): Promise<void> {
  const prev = lastState.get(device.id) ?? null;
  const edges = detectTelemetryEdges(prev, telemetry);
  lastState.set(device.id, edgeStateOf(telemetry));

  const prevFerment = fermentState.get(device.id) ?? null;
  const fermentResult = detectFermentEdges(prevFerment, telemetry, nowMs);
  fermentState.set(device.id, fermentResult.nextState);
  edges.push(...fermentResult.edges);

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
