import "server-only";

import { getServerEnv } from "./env";
import { LEGAL_DOC_EFFECTIVE_LABEL, LEGAL_DOC_VERSION } from "./legal-meta";

// Единый источник реквизитов оператора персональных данных для правовых страниц и
// футера. Значения берутся из env (см. serverEnvSchema в @nb/shared). Пока реальные
// реквизиты не заданы — подставляются явные плейсхолдеры в квадратных скобках, чтобы
// незаполненное поле нельзя было принять за настоящие данные.
//
// Серверный модуль (импортирует getServerEnv) — использовать только в серверных
// компонентах. Клиентам версия/дата доступны из ./legal-meta.

export type OperatorType = "individual" | "self_employed" | "ip" | "ooo";

const TYPE_LABEL: Record<OperatorType, string> = {
  individual: "Физическое лицо",
  self_employed: "Самозанятый (плательщик налога на профессиональный доход)",
  ip: "Индивидуальный предприниматель",
  ooo: "Общество с ограниченной ответственностью"
};

// Нужны ли оператору данного типа реквизиты регистрации (ИНН/ОГРН). У физлица их нет.
const TYPE_HAS_REGISTRY: Record<OperatorType, boolean> = {
  individual: false,
  self_employed: true,
  ip: true,
  ooo: true
};

export type OperatorInfo = {
  type: OperatorType;
  typeLabel: string;
  hasRegistryIds: boolean;
  siteName: string;
  name: string;
  nameProvided: boolean;
  email: string;
  emailProvided: boolean;
  inn?: string;
  ogrn?: string;
  address?: string;
  /** Все обязательные для публикации поля заполнены. */
  complete: boolean;
};

const PLACEHOLDER_NAME = "[указать ФИО / наименование оператора]";
const PLACEHOLDER_EMAIL = "[указать контактный e-mail]";

export const getOperator = (): OperatorInfo => {
  const env = getServerEnv();
  const type = env.OPERATOR_TYPE as OperatorType;
  const name = env.OPERATOR_NAME?.trim() || "";
  const email = env.OPERATOR_EMAIL?.trim() || "";
  const hasRegistryIds = TYPE_HAS_REGISTRY[type];

  return {
    type,
    typeLabel: TYPE_LABEL[type],
    hasRegistryIds,
    siteName: env.SITE_NAME?.trim() || "NB",
    name: name || PLACEHOLDER_NAME,
    nameProvided: Boolean(name),
    email: email || PLACEHOLDER_EMAIL,
    emailProvided: Boolean(email),
    inn: env.OPERATOR_INN?.trim() || undefined,
    ogrn: env.OPERATOR_OGRN?.trim() || undefined,
    address: env.OPERATOR_ADDRESS?.trim() || undefined,
    complete: Boolean(name) && Boolean(email)
  };
};

export { LEGAL_DOC_VERSION, LEGAL_DOC_EFFECTIVE_LABEL };
