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

/** Корректное закрытие пула при graceful shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
