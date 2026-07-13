import { and, count, db, desc, eq, systemEvents, users } from "@nb/db";

import {
  AUDIT_PAGE_SIZE_DEFAULT,
  AUDIT_PAGE_SIZE_MAX,
  SYSTEM_ACTOR_NAME,
  auditActionLabel,
  type AuditAction,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditLogPage
} from "./contracts";

export type RecordAuditEventInput = {
  /** null = действие системы или CLI-скрипта, а не живого пользователя. */
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
};

const clamp = (value: string | null | undefined, maxLength: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

/**
 * Запись в журнал. Никогда не бросает: аудит не имеет права уронить действие,
 * которое он фиксирует (модерация важнее записи о ней).
 * IP и User-Agent сюда не пишутся сознательно — это ПДн (152-ФЗ).
 */
export const recordAuditEvent = async (input: RecordAuditEventInput): Promise<void> => {
  try {
    await db.insert(systemEvents).values({
      actorUserId: input.actorUserId ?? null,
      actorEmail: clamp(input.actorEmail, 320),
      action: input.action,
      entityType: clamp(input.entityType, 40),
      entityId: clamp(input.entityId, 64),
      summary: clamp(input.summary, 2000),
      payload: input.payload ?? null
    });
  } catch (error) {
    console.error("[audit] событие не записано", { action: input.action, error });
  }
};

/** `db` либо транзакция вызывающего — см. AuthWriteExecutor в packages/auth. */
export type AuditWriteExecutor = Pick<typeof db, "update">;

/**
 * Обезличивание аккаунта: снимок e-mail в журнале — те же ПДн, что и users.email,
 * поэтому он стирается вместе с аккаунтом. actor_user_id остаётся: журнал сохраняет
 * связность «кто что делал», а имя актора берётся из обезличенной строки users.
 *
 * Зовётся на транзакции обезличивания: отдельной записью после коммита она могла бы
 * упасть на уже обезличенном аккаунте и оставить снимки почты в журнале навсегда.
 */
export const scrubActorEmails = async (
  userId: string,
  executor: AuditWriteExecutor = db
): Promise<void> => {
  await executor.update(systemEvents).set({ actorEmail: null }).where(eq(systemEvents.actorUserId, userId));
};

type AuditRow = {
  id: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
  actorDisplayName: string | null;
  actorAnonymizedAt: Date | null;
};

const resolveActorName = (row: AuditRow, anonymized: boolean): string => {
  const displayName = row.actorDisplayName?.trim() || null;
  if (anonymized) {
    return displayName ?? SYSTEM_ACTOR_NAME;
  }
  const email = row.actorEmail?.trim() || null;
  return displayName ?? email ?? SYSTEM_ACTOR_NAME;
};

const mapEntry = (row: AuditRow): AuditLogEntry => {
  const anonymized = row.actorAnonymizedAt !== null;
  return {
    id: row.id,
    action: row.action,
    actionLabel: auditActionLabel(row.action),
    actorUserId: row.actorUserId,
    // Снапшот почты обезличенного не отдаём наружу даже из старых строк.
    actorEmail: anonymized ? null : row.actorEmail,
    actorName: resolveActorName(row, anonymized),
    actorAnonymized: anonymized,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.createdAt
  };
};

const normalizePage = (page: number | undefined): number => {
  if (typeof page !== "number" || !Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.floor(page);
};

const normalizePageSize = (pageSize: number | undefined): number => {
  if (typeof pageSize !== "number" || !Number.isFinite(pageSize) || pageSize < 1) {
    return AUDIT_PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.floor(pageSize), AUDIT_PAGE_SIZE_MAX);
};

export const listAuditEvents = async (filters: AuditLogFilters = {}): Promise<AuditLogPage> => {
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);

  const conditions: ReturnType<typeof eq>[] = [];
  if (filters.action) {
    conditions.push(eq(systemEvents.action, filters.action));
  }
  if (filters.entityType) {
    conditions.push(eq(systemEvents.entityType, filters.entityType));
  }
  if (filters.entityId) {
    conditions.push(eq(systemEvents.entityId, filters.entityId));
  }
  if (filters.actorUserId) {
    conditions.push(eq(systemEvents.actorUserId, filters.actorUserId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totals] = await db.select({ value: count() }).from(systemEvents).where(where);
  const total = totals?.value ?? 0;
  if (total === 0) {
    return { items: [], total: 0, page, pageSize };
  }

  const rows = await db
    .select({
      id: systemEvents.id,
      action: systemEvents.action,
      actorUserId: systemEvents.actorUserId,
      actorEmail: systemEvents.actorEmail,
      entityType: systemEvents.entityType,
      entityId: systemEvents.entityId,
      summary: systemEvents.summary,
      payload: systemEvents.payload,
      createdAt: systemEvents.createdAt,
      actorDisplayName: users.displayName,
      actorAnonymizedAt: users.anonymizedAt
    })
    .from(systemEvents)
    .leftJoin(users, eq(users.id, systemEvents.actorUserId))
    .where(where)
    // id вторым ключом: массовая правка пишет события в одну миллисекунду,
    // и без него страницы пагинации перетасовываются между запросами.
    .orderBy(desc(systemEvents.createdAt), desc(systemEvents.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items: rows.map(mapEntry), total, page, pageSize };
};
