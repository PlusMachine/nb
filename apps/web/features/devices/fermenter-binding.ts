// =============================================================================
//  features/devices — fermenter-binding.ts
//  Связка «партия ↔ прибор-ферментер» (§8.4 docs/brewforge-web-hmi.md): бродящая
//  партия видит живую температуру/график с привязанного прибора, пульт
//  ферментации показывает «В ферментере: партия …». Привязка ЗАДАЁТСЯ С ПАРТИИ
//  (акт «Брожение»), не с пульта — портал лишь предлагает приборы, чей
//  last-known режим сейчас ферментация (listFermenterCandidates).
//
//  Технически это переиспользование brew_batches.device_id — той же колонки,
//  которую варочный флоу (openSession, features/brew-controller/actions.ts)
//  проставляет при СТАРТЕ ВАРКИ. Здесь она обслуживает СЛЕДУЮЩИЙ этап жизни
//  партии: варка уже завершена (статус ушёл в fermenting), поэтому замена
//  deviceId на прибор-ферментер не теряет историю варочного дня — та уже лежит
//  в brew_telemetry, скоупленной по (deviceId, brewBatchId) на момент записи.
// =============================================================================
import { and, brewBatches, db, desc, eq, sql } from "@nb/db";

import { mapBrewBatchDto } from "@/features/brew-batches/service";
import type { BrewBatchDto } from "@/features/brew-batches/contracts";

import { isFermenterModeRow } from "./fermenter-binding-core";
import { getDeviceById, listUserDevices } from "./service";
import type { FermenterCandidate } from "./contracts";

/**
 * Приборы пользователя, чей last-known срез телеметрии говорит «сейчас
 * ферментация» (см. isFermenterModeRow) — источник для пикера «бродит в
 * приборе …» на акте «Брожение» партии. Тот же паттерн оконного запроса
 * (last-known по deviceId), что listDeviceTiles в tiles.ts, но без sparkline —
 * пикеру нужен только факт режима.
 */
export async function listFermenterCandidates(userId: string): Promise<FermenterCandidate[]> {
  const devices = await listUserDevices(userId);
  if (devices.length === 0) return [];

  const deviceIds = devices.map((d) => d.id);
  const idList = sql.join(
    deviceIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const result = await db.execute(sql`
    SELECT device_id,
           stage,
           (payload ->> 'appMode')::int AS app_mode
    FROM (
      SELECT device_id, stage, payload,
             row_number() OVER (PARTITION BY device_id ORDER BY ts DESC) AS rn
      FROM brew_telemetry
      WHERE device_id IN (${idList})
    ) ranked
    WHERE rn = 1
  `);
  const rows =
    (result as unknown as { rows: { device_id: string; stage: number | null; app_mode: number | null }[] }).rows ??
    [];

  const fermenting = new Set(
    rows.filter((row) => isFermenterModeRow(row.app_mode, row.stage)).map((row) => row.device_id),
  );

  return devices
    .filter((d) => fermenting.has(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      hardwareId: d.hardwareId,
      status: d.status,
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    }));
}

/**
 * Привязать/отвязать прибор-ферментер к бродящей партии. Ownership-checked с
 * ОБЕИХ сторон: партия должна принадлежать userId (getBrewBatchById), прибор —
 * тоже (getDeviceById). Партия обязана быть в статусе fermenting: до старта
 * брожения варочный deviceId ещё занят кубом/HERMS (см. header выше), а после
 * розлива (completed/cancelled) писать телеметрию в партию уже некому.
 * deviceId=null — явная отвязка (граничный случай §8.4: прибор переключили из
 * режима ферментации при привязанной партии — история остаётся, привязка
 * снимается вручную, не молча). Замена уже привязанного прибора разрешена
 * (переставили бродить в другой бак).
 */
export async function bindBatchFermenter(
  userId: string,
  batchId: string,
  deviceId: string | null,
): Promise<BrewBatchDto> {
  const batch = await db.query.brewBatches.findFirst({
    where: and(eq(brewBatches.id, batchId), eq(brewBatches.userId, userId)),
  });
  if (!batch) {
    throw new Error("BREW_BATCH_NOT_FOUND");
  }
  if (batch.status !== "fermenting") {
    throw new Error("BATCH_NOT_FERMENTING");
  }

  if (deviceId !== null) {
    const device = await getDeviceById(userId, deviceId);
    if (!device) {
      throw new Error("DEVICE_NOT_FOUND");
    }
  }

  const [updated] = await db
    .update(brewBatches)
    .set({ deviceId, updatedAt: new Date() })
    .where(and(eq(brewBatches.id, batchId), eq(brewBatches.userId, userId)))
    .returning();
  if (!updated) {
    throw new Error("BREW_BATCH_NOT_FOUND");
  }
  return mapBrewBatchDto(updated);
}

/**
 * Бродящая партия, привязанная к прибору — для «В ферментере: партия …» на
 * пульте ферментации (§8.4). Ownership-checked по userId прибора; партия сверена
 * явно (userId + status="fermenting" + deviceId), не полагаемся молча на то, что
 * bindBatchFermenter это уже гарантировал. null, если прибора нет/чужой, или к
 * нему сейчас не привязана бродящая партия этого пользователя.
 */
export async function findBatchForFermenter(userId: string, deviceId: string): Promise<BrewBatchDto | null> {
  const device = await getDeviceById(userId, deviceId);
  if (!device) return null;

  const row = await db.query.brewBatches.findFirst({
    where: and(
      eq(brewBatches.deviceId, deviceId),
      eq(brewBatches.userId, userId),
      eq(brewBatches.status, "fermenting"),
    ),
    orderBy: [desc(brewBatches.updatedAt)],
  });
  return row ? mapBrewBatchDto(row) : null;
}
