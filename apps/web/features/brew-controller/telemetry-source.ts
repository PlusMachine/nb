// =============================================================================
//  features/brew-controller/telemetry-source.ts
//  Transport-агностичный источник телеметрии для дашборда/графика. Единственное
//  различие зон A (варка партии) и B (пульт устройства) — ОТКУДА берём телеметрию:
//  по batchId (партия) или по deviceId (устройство напрямую). Остальной UX общий.
//
//  Чистый модуль без серверных импортов — безопасно тянуть в client-компоненты.
//  Билдер URL держит контракт роутов в одном месте (batch: /api/brew-batches/…,
//  device: /api/devices/…), чтобы компоненты не хардкодили пути.
// =============================================================================

/** Источник телеметрии: партия (зона A) либо устройство напрямую (зона B). */
export type TelemetrySource =
  | { kind: "batch"; brewBatchId: string }
  | { kind: "device"; deviceId: string };

/**
 * Канал связи портала с устройством (честная индикация, Phase 6c):
 *  - "lan"   — прямой LAN-REST по localUrl (низкая латентность);
 *  - "cloud" — через брокер/мост (зависит от интернета, выше латентность);
 *  - "demo"  — in-process стаб (демо без железа).
 * Тип client-safe (без серверных импортов) — решение о канале считает сервер
 * (brewforge-provider.deviceChannel), а дашборд лишь отображает.
 */
export type DeviceChannel = "lan" | "cloud" | "demo";

/** Набор эндпоинтов для источника: SSE-стрим, отправка команды, история графика. */
export type TelemetryEndpoints = {
  /** SSE-стрим живой телеметрии (text/event-stream). */
  stream: string;
  /** POST команды на устройство (тело { command, sessionId }). */
  command: string;
  /** GET исторических точек для графика ({ points }). */
  history: string;
  /** POST операций control-lease ({ action, sessionId }) → LeaseStatus. */
  lease: string;
};

/** Базовый префикс роутов для источника. */
function basePath(source: TelemetrySource): string {
  return source.kind === "batch"
    ? `/api/brew-batches/${encodeURIComponent(source.brewBatchId)}`
    : `/api/devices/${encodeURIComponent(source.deviceId)}`;
}

/** Собрать эндпоинты телеметрии/команд/истории для источника (зона A или B). */
export function telemetryEndpoints(source: TelemetrySource): TelemetryEndpoints {
  const base = basePath(source);
  return {
    stream: `${base}/telemetry`,
    command: `${base}/command`,
    history: `${base}/telemetry/history`,
    lease: `${base}/control-lease`,
  };
}
