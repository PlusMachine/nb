// =============================================================================
//  features/brew-controller/control-lease.ts
//  Single-writer control-lease: одно активное УПРАВЛЯЮЩЕЕ соединение на устройство
//  (см. docs/brewery-command-center.md §«Single-writer control-lease»). Закрывает
//  last-write-wins между телефоном и планшетом: держатель = (userId, sessionId),
//  где sessionId различает вкладки/приборы ОДНОГО пользователя.
//
//  Модель:
//   - аренда валидна, пока expiresAt > now (TTL продлевается heartbeat'ом);
//   - acquireOrRenew берёт СВОБОДНУЮ/ПРОСРОЧЕННУЮ аренду или продлевает СВОЮ, но
//     НЕ крадёт чужую валидную (кооперативная модель);
//   - «Запросить перехват» (requestTakeover) метит запрос; держатель видит его и
//     отдаёт (release) — или, если он оффлайн, аренда истекает по TTL и запросивший
//     берёт её сам на следующем heartbeat.
//
//  Тот же heartbeat, что продлевает аренду, в Phase 3/6 кормит firmware dead-man —
//  ушёл оператор → аренда истекла И нагрев OFF на плате. Поэтому TTL согласован с
//  dead-man TTL симулятора (45с).
//
//  Гонки телефон/планшет сериализуются транзакцией + SELECT … FOR UPDATE на строке
//  устройства (deviceId — первичный ключ). Ownership устройства проверяет вызывающий
//  (роут через getDeviceById) ДО вызова сюда.
// =============================================================================
import { and, db, deviceControlLeases, eq } from "@nb/db";

/** Идентичность держателя: пользователь + сессия-вкладка (crypto.randomUUID на клиенте). */
export type LeaseIdentity = { userId: string; sessionId: string };

/** Публичный статус аренды для клиента (даты — ISO-строки). */
export type LeaseStatus = {
  /** Есть ли валидная (непросроченная) аренда у кого-либо. */
  held: boolean;
  /** Держу ли аренду именно я (эта identity). */
  heldByMe: boolean;
  /** sessionId текущего держателя (или null, если аренда свободна). */
  holderSessionId: string | null;
  /** Когда истекает текущая аренда (ISO), либо null. */
  expiresAt: string | null;
  /** Запрошен ли перехват у текущего держателя (актуальный запрос). */
  takeoverRequested: boolean;
  /** Исходит ли запрос перехвата от меня. */
  takeoverByMe: boolean;
};

// TTL аренды: согласован с sim dead-man MANUAL_HEAT_TTL (45с). Клиент heartbeat'ит
// заметно чаще (≈каждые 15с), чтобы аренда не истекала при живом операторе.
const LEASE_TTL_MS = 45_000;
// Запрос перехвата «протухает», если запросивший ушёл, — держатель не видит его вечно.
const TAKEOVER_TTL_MS = 60_000;

type LeaseRow = typeof deviceControlLeases.$inferSelect;

function toStatus(row: LeaseRow | undefined, me: LeaseIdentity, now: number): LeaseStatus {
  if (!row || row.expiresAt.getTime() <= now) {
    return {
      held: false,
      heldByMe: false,
      holderSessionId: null,
      expiresAt: null,
      takeoverRequested: false,
      takeoverByMe: false,
    };
  }
  const heldByMe = row.holderUserId === me.userId && row.holderSessionId === me.sessionId;
  const takeoverActive =
    Boolean(row.takeoverBySessionId) &&
    row.takeoverAt !== null &&
    now - row.takeoverAt.getTime() < TAKEOVER_TTL_MS;
  const takeoverByMe =
    takeoverActive &&
    row.takeoverByUserId === me.userId &&
    row.takeoverBySessionId === me.sessionId;
  return {
    held: true,
    heldByMe,
    holderSessionId: row.holderSessionId,
    expiresAt: row.expiresAt.toISOString(),
    takeoverRequested: takeoverActive,
    takeoverByMe,
  };
}

/** Текущий статус аренды устройства (без изменений состояния). */
export async function getLeaseStatus(deviceId: string, me: LeaseIdentity): Promise<LeaseStatus> {
  const [row] = await db
    .select()
    .from(deviceControlLeases)
    .where(eq(deviceControlLeases.deviceId, deviceId))
    .limit(1);
  return toStatus(row, me, Date.now());
}

/**
 * Взять свободную/просроченную аренду или продлить свою (НЕ крадёт чужую валидную).
 * Это же — операция heartbeat: ждущий перехвата клиент возьмёт аренду, как только
 * она освободится/истечёт.
 */
export async function acquireOrRenewLease(
  deviceId: string,
  me: LeaseIdentity,
): Promise<LeaseStatus> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const nowMs = now.getTime();
    const expiresAt = new Date(nowMs + LEASE_TTL_MS);

    const [row] = await tx
      .select()
      .from(deviceControlLeases)
      .where(eq(deviceControlLeases.deviceId, deviceId))
      .for("update");

    if (!row) {
      await tx
        .insert(deviceControlLeases)
        .values({
          deviceId,
          holderUserId: me.userId,
          holderSessionId: me.sessionId,
          acquiredAt: now,
          heartbeatAt: now,
          expiresAt,
        })
        .onConflictDoNothing({ target: deviceControlLeases.deviceId });
      const [created] = await tx
        .select()
        .from(deviceControlLeases)
        .where(eq(deviceControlLeases.deviceId, deviceId));
      return toStatus(created, me, nowMs);
    }

    const isMine = row.holderUserId === me.userId && row.holderSessionId === me.sessionId;
    const isExpired = row.expiresAt.getTime() <= nowMs;

    if (isMine) {
      // Продление своей аренды: takeover-поля НЕ трогаем — держатель должен увидеть
      // чужой запрос перехвата и решить, отдавать ли.
      const [updated] = await tx
        .update(deviceControlLeases)
        .set({ heartbeatAt: now, expiresAt })
        .where(eq(deviceControlLeases.deviceId, deviceId))
        .returning();
      return toStatus(updated, me, nowMs);
    }

    if (isExpired) {
      // Кража просроченной аренды: сбрасываем takeover (новый владелец — с чистого листа).
      const [updated] = await tx
        .update(deviceControlLeases)
        .set({
          holderUserId: me.userId,
          holderSessionId: me.sessionId,
          acquiredAt: now,
          heartbeatAt: now,
          expiresAt,
          takeoverByUserId: null,
          takeoverBySessionId: null,
          takeoverAt: null,
        })
        .where(eq(deviceControlLeases.deviceId, deviceId))
        .returning();
      return toStatus(updated, me, nowMs);
    }

    // Держит другой валидный сеанс — ничего не меняем.
    return toStatus(row, me, nowMs);
  });
}

/** Освободить аренду (только если держу её я). Идемпотентно. */
export async function releaseLease(deviceId: string, me: LeaseIdentity): Promise<void> {
  await db
    .delete(deviceControlLeases)
    .where(
      and(
        eq(deviceControlLeases.deviceId, deviceId),
        eq(deviceControlLeases.holderUserId, me.userId),
        eq(deviceControlLeases.holderSessionId, me.sessionId),
      ),
    );
}

/**
 * Запросить перехват. Если аренда свободна/просрочена/моя — просто беру её. Если
 * держит другой валидный сеанс — метим запрос (держатель увидит и решит отдать).
 */
export async function requestTakeover(deviceId: string, me: LeaseIdentity): Promise<LeaseStatus> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const nowMs = now.getTime();

    const [row] = await tx
      .select()
      .from(deviceControlLeases)
      .where(eq(deviceControlLeases.deviceId, deviceId))
      .for("update");

    const isMine =
      row && row.holderUserId === me.userId && row.holderSessionId === me.sessionId;
    const isExpired = !row || row.expiresAt.getTime() <= nowMs;

    if (!row || isExpired || isMine) {
      // Нечего перехватывать — беру аренду сам (та же логика, что acquireOrRenew).
      const expiresAt = new Date(nowMs + LEASE_TTL_MS);
      if (!row) {
        await tx
          .insert(deviceControlLeases)
          .values({
            deviceId,
            holderUserId: me.userId,
            holderSessionId: me.sessionId,
            acquiredAt: now,
            heartbeatAt: now,
            expiresAt,
          })
          .onConflictDoNothing({ target: deviceControlLeases.deviceId });
      } else {
        await tx
          .update(deviceControlLeases)
          .set({
            holderUserId: me.userId,
            holderSessionId: me.sessionId,
            acquiredAt: now,
            heartbeatAt: now,
            expiresAt,
            takeoverByUserId: null,
            takeoverBySessionId: null,
            takeoverAt: null,
          })
          .where(eq(deviceControlLeases.deviceId, deviceId));
      }
      const [after] = await tx
        .select()
        .from(deviceControlLeases)
        .where(eq(deviceControlLeases.deviceId, deviceId));
      return toStatus(after, me, nowMs);
    }

    // Держит другой валидный сеанс — метим запрос перехвата.
    const [updated] = await tx
      .update(deviceControlLeases)
      .set({ takeoverByUserId: me.userId, takeoverBySessionId: me.sessionId, takeoverAt: now })
      .where(eq(deviceControlLeases.deviceId, deviceId))
      .returning();
    return toStatus(updated, me, nowMs);
  });
}

/** Держит ли аренду именно этот сеанс (для hard lease-гейта команд). */
export async function holdsValidLease(deviceId: string, me: LeaseIdentity): Promise<boolean> {
  const status = await getLeaseStatus(deviceId, me);
  return status.heldByMe;
}

/** Действия control-lease поверх одного POST-роута. */
export const LEASE_ACTIONS = ["acquire", "heartbeat", "release", "request-takeover", "status"] as const;
export type LeaseAction = (typeof LEASE_ACTIONS)[number];

export function isLeaseAction(value: unknown): value is LeaseAction {
  return typeof value === "string" && (LEASE_ACTIONS as readonly string[]).includes(value);
}

/**
 * Единый диспетчер действий аренды для роутов (device и batch делят его). Владение
 * устройством и валидность deviceId проверяет вызывающий ДО вызова сюда.
 */
export async function runLeaseAction(
  deviceId: string,
  me: LeaseIdentity,
  action: LeaseAction,
): Promise<LeaseStatus> {
  switch (action) {
    case "acquire":
    case "heartbeat":
      return acquireOrRenewLease(deviceId, me);
    case "request-takeover":
      return requestTakeover(deviceId, me);
    case "release":
      await releaseLease(deviceId, me);
      return getLeaseStatus(deviceId, me);
    case "status":
      return getLeaseStatus(deviceId, me);
  }
}
