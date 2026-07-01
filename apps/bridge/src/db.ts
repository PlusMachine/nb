// =============================================================================
//  apps/bridge — db.ts
//  Drizzle-клиент для длительного процесса-моста (НЕ Next.js).
//
//  Переиспользуем паттерн пула из packages/db: `@nb/db` создаёт единственный
//  `pg.Pool` по `DATABASE_URL` (с авто-загрузкой корневого .env через
//  parseServerEnv) и `drizzle(pool, { schema })`. Мост импортирует тот же
//  клиент — отдельный пул нам не нужен, а схема/операторы тянутся из @nb/db.
//
//  Здесь же — узкие хелперы резолва устройства и активной партии, общие для
//  mqtt.ts (телеметрия/лог) и ws.ts (аудит команд).
// =============================================================================
import {
  and,
  brewBatches,
  brewDevices,
  db,
  desc,
  deviceControlLeases,
  eq,
  inArray,
  pool,
} from "@nb/db";

export * from "@nb/db";

/** Строка устройства, найденная по заводскому hardwareId (deviceId из топика). */
export interface DeviceRow {
  id: string;
  userId: string;
  hardwareId: string;
  name: string;
}

/**
 * Найти зарегистрированное устройство по hardwareId (это `deviceId` в топиках
 * brewforge/<deviceId>/*). Возвращает null, если устройство не привязано —
 * тогда сообщение тихо отбрасывается (мост никогда не падает).
 */
export async function resolveDeviceByHardwareId(
  hardwareId: string,
): Promise<DeviceRow | null> {
  const [row] = await db
    .select({
      id: brewDevices.id,
      userId: brewDevices.userId,
      hardwareId: brewDevices.hardwareId,
      name: brewDevices.name,
    })
    .from(brewDevices)
    .where(eq(brewDevices.hardwareId, hardwareId))
    .limit(1);
  return row ?? null;
}

// Партия считается «активной» (привязанной к живой варке) в этих статусах.
const ACTIVE_BATCH_STATUSES = ["brewing", "fermenting"] as const;

/**
 * Самая свежая активная партия, привязанная к устройству (brew_batches.deviceId).
 * Используется, чтобы проставить brewBatchId в телеметрии/логах/командах.
 */
export async function resolveActiveBatchId(
  deviceRowId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: brewBatches.id })
    .from(brewBatches)
    .where(
      and(
        eq(brewBatches.deviceId, deviceRowId),
        inArray(brewBatches.status, [...ACTIVE_BATCH_STATUSES]),
      ),
    )
    .orderBy(desc(brewBatches.startedAt))
    .limit(1);
  return row?.id ?? null;
}

/** Состояние control-lease устройства (для cloud-плеча dead-man, Phase 6b). */
export type LeaseState = "none" | "valid" | "expired";

/**
 * Есть ли активная аренда управления устройством.
 *  - "none"    — строки нет (портал устройством не управлял / отпустил чисто);
 *  - "valid"   — аренда не истекла (оператор на связи, heartbeat идёт);
 *  - "expired" — строка есть, но expiresAt в прошлом (портал управлял и пропал).
 * «expired» — сигнал «управляющий сеанс потерян» для cloud-плеча dead-man.
 */
export async function getLeaseStateForDevice(deviceId: string): Promise<LeaseState> {
  const [row] = await db
    .select({ expiresAt: deviceControlLeases.expiresAt })
    .from(deviceControlLeases)
    .where(eq(deviceControlLeases.deviceId, deviceId))
    .limit(1);
  if (!row) return "none";
  return row.expiresAt.getTime() > Date.now() ? "valid" : "expired";
}

/** Корректное закрытие пула при graceful shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
