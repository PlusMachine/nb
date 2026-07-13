export const auditActions = [
  "user.role_change",
  "user.block",
  "user.unblock",
  "user.anonymize",
  "recipe.hide",
  "recipe.unhide",
  "recipe.delete",
  "recipe.editors_choice",
  "ingredient.create",
  "ingredient.update",
  "ingredient.delete",
  "ingredient.merge",
  "ingredient.proposal_approve",
  "ingredient.proposal_reject",
  "article.publish",
  "article.delete",
  "article.feature",
  "feedback.resolve",
  "master.approve",
  "master.reject",
  "master.item_hide",
  "master.item_unhide",
  "firmware.publish",
  "firmware.yank",
  "currency.update"
] as const;

export type AuditAction = (typeof auditActions)[number];

export const auditActionLabels: Record<AuditAction, string> = {
  "user.role_change": "Смена роли",
  "user.block": "Блокировка пользователя",
  "user.unblock": "Разблокировка пользователя",
  "user.anonymize": "Обезличивание пользователя",
  "recipe.hide": "Скрытие рецепта",
  "recipe.unhide": "Возврат рецепта",
  "recipe.delete": "Удаление рецепта",
  "recipe.editors_choice": "Выбор редакции",
  "ingredient.create": "Создание ингредиента",
  "ingredient.update": "Правка ингредиента",
  "ingredient.delete": "Удаление ингредиента",
  "ingredient.merge": "Слияние ингредиентов",
  "ingredient.proposal_approve": "Заявка на ингредиент принята",
  "ingredient.proposal_reject": "Заявка на ингредиент отклонена",
  "article.publish": "Публикация статьи",
  "article.delete": "Удаление статьи",
  "article.feature": "Избранная статья",
  "feedback.resolve": "Обработка обратной связи",
  "master.approve": "Одобрение мастера",
  "master.reject": "Отклонение мастера",
  "master.item_hide": "Скрытие изделия",
  "master.item_unhide": "Возврат изделия",
  "firmware.publish": "Публикация прошивки",
  "firmware.yank": "Отзыв прошивки",
  "currency.update": "Обновление курсов валют"
};

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === "string" && (auditActions as readonly string[]).includes(value);

/**
 * Журнал хранит action строкой (varchar), поэтому в старых записях может лежать код,
 * которого больше нет в union: лейбл в таком случае — сам код, а не пустота.
 */
export const auditActionLabel = (action: string): string =>
  isAuditAction(action) ? auditActionLabels[action] : action;

/** Имя актора, когда действие совершил не живой пользователь, а система или CLI-скрипт. */
export const SYSTEM_ACTOR_NAME = "Система";

export type AuditLogEntry = {
  id: string;
  action: string;
  actionLabel: string;
  actorUserId: string | null;
  /** Снимок e-mail на момент действия: остаётся читаемым после обезличивания актора. */
  actorEmail: string | null;
  actorName: string;
  actorAnonymized: boolean;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

export type AuditLogFilters = {
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogPage = {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export const AUDIT_PAGE_SIZE_DEFAULT = 50;
export const AUDIT_PAGE_SIZE_MAX = 200;
