import { isUuid } from "@/lib/uuid";

import {
  AUDIT_PAGE_SIZE_DEFAULT,
  AUDIT_PAGE_SIZE_MAX,
  isAuditAction,
  type AuditLogFilters
} from "./contracts";

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const parsePositiveInt = (value: string | undefined, fallback: number, max: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
};

export const parseAuditLogQuery = (
  searchParams: Record<string, string | string[] | undefined>
): AuditLogFilters => {
  const action = firstValue(searchParams.action);
  const entityType = firstValue(searchParams.entityType)?.trim();
  const entityId = firstValue(searchParams.entityId)?.trim();
  const actorUserId = firstValue(searchParams.actorUserId)?.trim();

  return {
    action: isAuditAction(action) ? action : undefined,
    entityType: entityType ? entityType : undefined,
    entityId: entityId ? entityId : undefined,
    // actorUserId уходит в условие по uuid-колонке: мусор из адресной строки
    // просто игнорируется как фильтр, иначе журнал падает целиком.
    actorUserId: actorUserId && isUuid(actorUserId) ? actorUserId : undefined,
    page: parsePositiveInt(firstValue(searchParams.page), 1, Number.MAX_SAFE_INTEGER),
    pageSize: parsePositiveInt(firstValue(searchParams.pageSize), AUDIT_PAGE_SIZE_DEFAULT, AUDIT_PAGE_SIZE_MAX)
  };
};

export const buildAuditLogHref = (query: AuditLogFilters, patch: Partial<AuditLogFilters> = {}) => {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();

  if (next.action) {
    params.set("action", next.action);
  }
  if (next.entityType) {
    params.set("entityType", next.entityType);
  }
  if (next.entityId) {
    params.set("entityId", next.entityId);
  }
  if (next.actorUserId) {
    params.set("actorUserId", next.actorUserId);
  }
  if (next.pageSize && next.pageSize !== AUDIT_PAGE_SIZE_DEFAULT) {
    params.set("pageSize", String(next.pageSize));
  }
  // Смена фильтра всегда возвращает на первую страницу: иначе выборка сузится,
  // а пользователь останется на несуществующей странице и увидит пустоту.
  if (next.page && next.page > 1 && !("action" in patch || "entityType" in patch || "actorUserId" in patch)) {
    params.set("page", String(next.page));
  }

  const search = params.toString();
  return search ? `/admin/audit?${search}` : "/admin/audit";
};
