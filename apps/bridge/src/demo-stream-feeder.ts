// =============================================================================
//  apps/bridge — demo-stream-feeder.ts
//  M5-C (docs/specs/third-party-fermentation-devices.md §5 F1 «Демо-режим»,
//  §11 M5): периодическая кормилка демо-стрим-устройств («Демо-ареометр»,
//  hardwareId `st-demo-<hex>`, apps/web features/device-streams/service.ts
//  createDemoStreamDevice). Точка — ЧИСТАЯ функция возраста устройства
//  (elapsed = now − createdAt): та же кривая, что apps/web/scripts/
//  sim-ispindel.ts (лаг → экспоненциальный спуск OG→FG → хвост на уровне FG),
//  сжатая ×6 (лаг 2ч, спад 16ч) и БЕЗ Math.random — вся «рябь»/выбросы
//  детерминированы elapsed'ом, поэтому рестарт моста не меняет уже
//  сложившуюся историю и не плодит скачков при повторных тиках одного и того
//  же 5-минутного окна. Никакого in-memory состояния: вся кривая в любой
//  момент восстановима из одного brew_devices.created_at.
//
//  Прямой INSERT в ferment_readings (дедуп по (deviceId, ts), onConflictDoNothing)
//  + touch lastSeenAt/status устройства — тот же паттерн присутствия, что
//  apps/web features/device-streams/ingest.ts (там же — источник констант
//  персист-гейта/сетки: 5 минут). sessionId резолвится так же, как в ingest.ts
//  (активный сеанс устройства, если есть) — если демо-ареометр привязать к
//  партии (F2), его «живой» график продолжит обновляться после привязки, а не
//  замрёт на моменте ретро-привязки.
// =============================================================================
import { and, brewDevices, db, eq, fermentReadings, fermentSessions, ilike, isNull, sql } from "./db.js";

const DEMO_HARDWARE_ID_PREFIX = "st-demo-";

/** Сетка точек — совпадает с персист-гейтом ingest.ts (§8.5): 1 точка/5 мин на устройство. */
const READING_INTERVAL_MS = 5 * 60 * 1000;

// ---- параметры кривой (§12 sim-ispindel.ts, сжатие ×6) ---------------------

export const DEMO_OG_SG = 1.052;
export const DEMO_FG_SG = 1.014;
const LAG_HOURS = 2; // было 12ч в sim-ispindel.ts, /6
const DECAY_HOURS = 16; // было 96ч, /6

const BASE_TEMP_C = 19.5;
const TEMP_DAILY_AMPLITUDE_C = 0.8;

// Детерминированная «рябь» вместо Math.random-шума — быстрый период (не кратен
// сетке точек), маленькая амплитуда: кривая не идеально гладкая, но полностью
// воспроизводима по elapsed.
const RIPPLE_SG = 0.0004;
const RIPPLE_PERIOD_HOURS = 23 / 60;

// Редкие выбросы — тот же интервал «~каждый 40-й пакет», что в sim-ispindel.ts,
// но привязаны к номеру 5-минутного тика (детерминировано elapsed'ом, не Math.random).
const OUTLIER_EVERY_N_TICKS = 40;
const OUTLIER_GRAVITY_OFFSET_SG = 0.03;

/** Плотность (SG) без выброса — экспоненциальный спуск OG→FG после лага, дальше хвост на уровне FG. Чистая функция. */
export function demoGravitySgAt(elapsedHours: number): number {
  const clamped = Math.max(0, elapsedHours);
  const span = DEMO_OG_SG - DEMO_FG_SG;
  const ripple = RIPPLE_SG * Math.sin((2 * Math.PI * clamped) / RIPPLE_PERIOD_HOURS);

  if (clamped < LAG_HOURS) {
    return DEMO_OG_SG + ripple;
  }

  const decayElapsed = Math.min(clamped - LAG_HOURS, DECAY_HOURS);
  // На decayElapsed=DECAY_HOURS остаётся ~2% исходного разрыва (та же константа,
  // что в sim-ispindel.ts) — дальше (хвост) elapsed зажат, значение не меняется.
  const k = -Math.log(0.02) / DECAY_HOURS;
  const decayed = DEMO_FG_SG + span * Math.exp(-k * decayElapsed);
  return decayed + ripple;
}

/** Температура — суточная синусоида вокруг BASE_TEMP_C. Чистая функция. */
export function demoTempCAt(elapsedHours: number): number {
  return BASE_TEMP_C + TEMP_DAILY_AMPLITUDE_C * Math.sin((2 * Math.PI * elapsedHours) / 24);
}

/** Номер 5-минутного тика от начала (elapsedHours=0 → 0, 5мин → 1, …) — детерминированный «номер пакета» для выбросов. */
function tickIndex(elapsedHours: number): number {
  return Math.round((elapsedHours * 60 * 60 * 1000) / READING_INTERVAL_MS);
}

/** true — этот тик выброс (каждый OUTLIER_EVERY_N_TICKS-й, кроме самого нулевого). Детерминировано elapsed'ом, без Math.random. */
export function isDemoOutlierTick(elapsedHours: number): boolean {
  const idx = tickIndex(elapsedHours);
  return idx > 0 && idx % OUTLIER_EVERY_N_TICKS === 0;
}

export interface DemoReading {
  gravitySg: number;
  tempC: number;
}

/**
 * Точка кривой демо-ареометра в момент elapsedMs (возраст устройства с
 * created_at) — единственный источник истины для кормилки: ЧИСТАЯ функция,
 * без побочных эффектов и без Math.random, поэтому одинаковый elapsedMs
 * (в т.ч. после рестарта моста) всегда даёт одно и то же значение.
 */
export function demoReadingAt(elapsedMs: number): DemoReading {
  const elapsedHours = Math.max(0, elapsedMs) / (60 * 60 * 1000);
  const base = demoGravitySgAt(elapsedHours);
  const gravitySg = isDemoOutlierTick(elapsedHours) ? base + OUTLIER_GRAVITY_OFFSET_SG : base;
  return {
    gravitySg: Number(gravitySg.toFixed(4)),
    tempC: Number(demoTempCAt(elapsedHours).toFixed(2))
  };
}

/** Текущий момент, округлённый до 5-минутной сетки — общий ts для всех демо-устройств в этом тике (совпадает с сеткой ingest.ts). */
function roundToGrid(nowMs: number): Date {
  return new Date(Math.round(nowMs / READING_INTERVAL_MS) * READING_INTERVAL_MS);
}

interface DemoDeviceRow {
  id: string;
  createdAt: Date;
}

async function findDemoDevices(): Promise<DemoDeviceRow[]> {
  return db
    .select({ id: brewDevices.id, createdAt: brewDevices.createdAt })
    .from(brewDevices)
    .where(ilike(brewDevices.hardwareId, `${DEMO_HARDWARE_ID_PREFIX}%`));
}

/** Активный (незавершённый) сеанс устройства — та же денормализация sessionId, что в ingest.ts, чтобы привязка к партии (F2) продолжала обновляться после ретро-привязки. */
async function findActiveSessionId(deviceId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: fermentSessions.id })
    .from(fermentSessions)
    .where(and(eq(fermentSessions.deviceId, deviceId), isNull(fermentSessions.endedAt)));
  return row?.id ?? null;
}

/**
 * Периодическая кормилка демо-ареометров (main.ts, раз в 5 мин, §5 F1): для
 * каждого `st-demo-*` устройства считает точку кривой по возрасту и пишет её
 * напрямую в ferment_readings (дедуп по (deviceId, ts) — повторный тик в ту же
 * 5-минутную ячейку молча не создаёт вторую строку), плюс touch lastSeenAt/
 * status устройства (та же «на связи», что у реальных ingest-путей). Никакого
 * in-memory состояния между тиками. Best-effort: ошибка одного устройства не
 * должна останавливать обработку остальных, ошибка самой выборки — не роняет мост.
 */
export async function runDemoStreamFeeder(nowMs: number = Date.now()): Promise<void> {
  let devices: DemoDeviceRow[];
  try {
    devices = await findDemoDevices();
  } catch (err) {
    console.error("[demo-stream-feeder] сбой выборки устройств:", err instanceof Error ? err.message : String(err));
    return;
  }
  if (devices.length === 0) return;

  const ts = roundToGrid(nowMs);

  for (const device of devices) {
    try {
      const elapsedMs = ts.getTime() - device.createdAt.getTime();
      const reading = demoReadingAt(elapsedMs);
      const sessionId = await findActiveSessionId(device.id);

      await db
        .insert(fermentReadings)
        .values({
          deviceId: device.id,
          sessionId,
          ts,
          gravitySg: reading.gravitySg,
          tempC: reading.tempC,
          pressureKpa: null,
          batteryV: null,
          batteryPct: null,
          rssi: null,
          payload: { demo: true, interval: READING_INTERVAL_MS / 1000 }
        })
        .onConflictDoNothing({ target: [fermentReadings.deviceId, fermentReadings.ts] });

      await db
        .update(brewDevices)
        .set({ lastSeenAt: ts, status: "online", updatedAt: sql`now()` })
        .where(eq(brewDevices.id, device.id));
    } catch (err) {
      console.error("[demo-stream-feeder] сбой записи точки:", err instanceof Error ? err.message : String(err));
    }
  }
}
