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
  fermentSessions,
  inArray,
  isNull,
  pool,
  sql,
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

// =============================================================================
//  M5-B (docs/specs/third-party-fermentation-devices.md §5 F6 «Поплавок молчит»,
//  F2 автозавершение по молчанию): выборка активных сеансов стрим/RAPT-устройств
//  для периодического скана (apps/bridge/src/stream-silence.ts).
// =============================================================================

// providerId «стрим-подобных» устройств (§6.1). Источник истины — apps/web
// features/brew-controller/contracts.ts (STREAM_PROVIDER_ID) и rapt-cloud-provider.ts
// (RAPT_PROVIDER_ID) — bridge на apps/web не завязан, поэтому строки продублированы
// здесь как узкий локальный контракт (только для скана молчания).
const STREAM_LIKE_PROVIDER_IDS = ["stream", "rapt-cloud"] as const;

/** Кандидат на скан «молчит»/автозавершение — один активный сеанс + его устройство/партия. */
export interface StreamSilenceCandidateRow {
  sessionId: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  brewBatchId: string;
  batchName: string;
  alertsMuted: boolean;
  /** epoch ms старта сеанса — фолбэк для расчёта молчания, если lastSeenAtMs ещё null. */
  sessionStartedAtMs: number;
  /** epoch ms brew_devices.last_seen_at; null — от устройства ещё не было ни одного пакета. */
  lastSeenAtMs: number | null;
  /** payload.interval (сек) последней точки ferment_readings устройства; null — неизвестен. */
  intervalSeconds: number | null;
}

/**
 * Активные сеансы (ended_at is null) стрим/RAPT-устройств с данными, нужными
 * для решения «молчит»/«автозавершить» (stream-silence.ts decideSilenceActions).
 * Один SQL-проход: сеанс × устройство × партия + LATERAL последней точки ferment_readings
 * (для payload.interval). Тот же паттерн, что loadStreamTileData (apps/web
 * features/devices/tiles.ts): сырой db.execute отдаёт timestamptz строкой, поэтому
 * время считаем в SQL как epoch-мс (double precision), а не парсим строку в JS.
 */
export async function getActiveStreamSilenceCandidates(): Promise<StreamSilenceCandidateRow[]> {
  const providerList = sql.join(
    STREAM_LIKE_PROVIDER_IDS.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    SELECT
      fs.id AS session_id,
      fs.user_id AS user_id,
      fs.device_id AS device_id,
      bd.name AS device_name,
      fs.brew_batch_id AS brew_batch_id,
      bb.name AS batch_name,
      fs.alerts_muted AS alerts_muted,
      (extract(epoch from fs.started_at) * 1000)::double precision AS started_at_ms,
      (extract(epoch from bd.last_seen_at) * 1000)::double precision AS last_seen_at_ms,
      lr.interval_seconds AS interval_seconds
    FROM ferment_sessions fs
    JOIN brew_devices bd ON bd.id = fs.device_id
    JOIN brew_batches bb ON bb.id = fs.brew_batch_id
    LEFT JOIN LATERAL (
      SELECT (payload ->> 'interval')::double precision AS interval_seconds
      FROM ferment_readings fr
      WHERE fr.device_id = fs.device_id
      ORDER BY fr.ts DESC
      LIMIT 1
    ) lr ON true
    WHERE fs.ended_at IS NULL
      AND bd.provider_id IN (${providerList})
  `);

  const rows =
    (
      result as unknown as {
        rows: Array<{
          session_id: string;
          user_id: string;
          device_id: string;
          device_name: string;
          brew_batch_id: string;
          batch_name: string;
          alerts_muted: boolean;
          started_at_ms: number;
          last_seen_at_ms: number | null;
          interval_seconds: number | null;
        }>;
      }
    ).rows ?? [];

  return rows.map((row) => ({
    sessionId: row.session_id,
    userId: row.user_id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    brewBatchId: row.brew_batch_id,
    batchName: row.batch_name,
    alertsMuted: row.alerts_muted,
    sessionStartedAtMs: row.started_at_ms,
    lastSeenAtMs: row.last_seen_at_ms,
    intervalSeconds: row.interval_seconds,
  }));
}

/**
 * Автозавершить сеанс по молчанию (§5 F2): ended_at=now(), end_reason='auto_silence'.
 * Guard `ended_at is null` — сеанс мог быть завершён между сканом и апдейтом (ручное
 * завершение владельцем); в этом случае UPDATE молча не задевает строку (0 affected).
 */
export async function endStreamSessionBySilence(sessionId: string): Promise<void> {
  await db
    .update(fermentSessions)
    .set({ endedAt: sql`now()`, endReason: "auto_silence", updatedAt: sql`now()` })
    .where(and(eq(fermentSessions.id, sessionId), isNull(fermentSessions.endedAt)));
}

/** Корректное закрытие пула при graceful shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
