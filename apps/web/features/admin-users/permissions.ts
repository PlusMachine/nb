import type { UserRole } from "@nb/auth";

import {
  BLOCK_REASON_MAX,
  BLOCK_REASON_MIN,
  anonymizeConfirmationValue,
  type AdminUserStatus
} from "./contracts";

/**
 * Коды отказов раздела «Пользователи». Чистые проверки живут отдельно от сервиса,
 * потому что это и есть правила домена: их надо уметь прогнать без БД.
 */
export const adminUserErrors = [
  "USER_NOT_FOUND",
  "ROLE_SELF",
  "LAST_ADMIN",
  "ROLE_UNCHANGED",
  "BLOCK_SELF",
  "ALREADY_BLOCKED",
  "NOT_BLOCKED",
  "ANONYMIZE_SELF",
  "ALREADY_ANONYMIZED",
  "REASON_TOO_SHORT",
  "REASON_TOO_LONG",
  "CONFIRMATION_MISMATCH"
] as const;

export type AdminUserError = (typeof adminUserErrors)[number];

export const adminUserErrorMessages: Record<AdminUserError, string> = {
  USER_NOT_FOUND: "Пользователь не найден — возможно, страницу нужно обновить.",
  ROLE_SELF: "Свою роль сменить нельзя — попросите другого администратора.",
  LAST_ADMIN: "Это последний администратор. Сначала назначьте другого.",
  ROLE_UNCHANGED: "У пользователя уже эта роль.",
  BLOCK_SELF: "Заблокировать себя нельзя.",
  ALREADY_BLOCKED: "Пользователь уже заблокирован.",
  NOT_BLOCKED: "Пользователь не заблокирован.",
  ANONYMIZE_SELF: "Удалить свой аккаунт отсюда нельзя.",
  ALREADY_ANONYMIZED: "Аккаунт уже обезличен.",
  REASON_TOO_SHORT: `Причина — от ${BLOCK_REASON_MIN} символов.`,
  REASON_TOO_LONG: `Причина — не длиннее ${BLOCK_REASON_MAX} символов.`,
  CONFIRMATION_MISMATCH: "Подтверждение не совпадает с данными аккаунта."
};

export type AdminUserTarget = {
  id: string;
  role: UserRole;
  status: AdminUserStatus;
  email: string | null;
  phone: string | null;
};

/**
 * Смена роли. Себе роль не меняют (иначе администратор одним кликом лишает себя
 * доступа), и последнего администратора не понижают — площадка осталась бы без
 * единственного прод-пути управления ролями.
 */
export const checkRoleChange = ({
  actorId,
  target,
  nextRole,
  activeAdminCount
}: {
  actorId: string;
  target: AdminUserTarget;
  nextRole: UserRole;
  activeAdminCount: number;
}): AdminUserError | null => {
  if (target.id === actorId) {
    return "ROLE_SELF";
  }
  if (target.status === "anonymized") {
    return "ALREADY_ANONYMIZED";
  }
  if (target.role === nextRole) {
    return "ROLE_UNCHANGED";
  }
  if (target.role === "admin" && nextRole !== "admin" && activeAdminCount <= 1) {
    return "LAST_ADMIN";
  }
  return null;
};

export const checkBlockReason = (reason: string): AdminUserError | null => {
  const trimmed = reason.trim();
  if (trimmed.length < BLOCK_REASON_MIN) {
    return "REASON_TOO_SHORT";
  }
  if (trimmed.length > BLOCK_REASON_MAX) {
    return "REASON_TOO_LONG";
  }
  return null;
};

export const checkBlock = ({
  actorId,
  target,
  reason,
  activeAdminCount
}: {
  actorId: string;
  target: AdminUserTarget;
  reason: string;
  activeAdminCount: number;
}): AdminUserError | null => {
  if (target.id === actorId) {
    return "BLOCK_SELF";
  }
  if (target.status === "anonymized") {
    return "ALREADY_ANONYMIZED";
  }
  if (target.status === "blocked") {
    return "ALREADY_BLOCKED";
  }
  if (target.role === "admin" && activeAdminCount <= 1) {
    return "LAST_ADMIN";
  }
  return checkBlockReason(reason);
};

export const checkUnblock = ({ target }: { target: AdminUserTarget }): AdminUserError | null => {
  if (target.status === "anonymized") {
    return "ALREADY_ANONYMIZED";
  }
  if (target.status !== "blocked") {
    return "NOT_BLOCKED";
  }
  return null;
};

/**
 * Обезличивание необратимо, поэтому кроме обычных защит требуется точный ввод
 * e-mail (или телефона) аккаунта — случайный клик по кнопке ничего не сотрёт.
 */
export const checkAnonymize = ({
  actorId,
  target,
  confirmation,
  activeAdminCount
}: {
  actorId: string;
  target: AdminUserTarget;
  confirmation: string;
  activeAdminCount: number;
}): AdminUserError | null => {
  if (target.id === actorId) {
    return "ANONYMIZE_SELF";
  }
  if (target.status === "anonymized") {
    return "ALREADY_ANONYMIZED";
  }
  if (target.role === "admin" && activeAdminCount <= 1) {
    return "LAST_ADMIN";
  }

  const expected = anonymizeConfirmationValue(target);
  const provided = confirmation.trim().toLowerCase();
  if (!expected || provided !== expected.toLowerCase()) {
    return "CONFIRMATION_MISMATCH";
  }

  return null;
};
