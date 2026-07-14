// =============================================================================
//  features/device-streams/stream-device-core.ts
//  Чистые кусочки service.ts вынесены сюда, чтобы колокированный тест не тянул
//  @nb/db/@nb/auth (конвенция *-core.ts — см. parse-core.ts, normalize-core.ts,
//  features/devices/tile-snapshot.ts). Без побочных импортов — safe и на клиенте.
// =============================================================================

/** `${APP_URL}/api/ingest/<rawToken>` — URL для вставки в устройство (§5 F1). */
export const buildIngestUrl = (appUrl: string, rawToken: string): string =>
  `${appUrl.replace(/\/+$/, "")}/api/ingest/${rawToken}`;

/**
 * interval (сек) из сырого payload последней точки (§П4 — порог «молчит» = 3×
 * интервал, см. normalize-core.ts staleThresholdMs). Терпимо: число или числовая
 * строка; отсутствует/мусор/≤0 → null (откат на дефолтный интервал ядра).
 */
export const extractIntervalSeconds = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = (payload as Record<string, unknown>).interval;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) && num > 0 ? num : null;
};
