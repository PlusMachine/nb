import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Coins,
  Cpu,
  FlaskConical,
  GitMerge,
  MessageSquare,
  Package,
  ScrollText,
  Store,
  Users
} from "lucide-react";
import type { UserRole } from "@nb/auth";

// Единый источник разделов админки: сайдбар, мобильный drawer и карточки
// дашборда читают отсюда, чтобы имена и состав не расходились между ними.

export type AdminNavGroupKey = "catalog" | "community" | "content" | "devices" | "system";

export type AdminNavItem = {
  href: string;
  label: string;
  // Только когда одного названия недостаточно, чтобы понять содержимое раздела.
  description?: string;
  icon: LucideIcon;
  requiredRole: UserRole;
  group: AdminNavGroupKey;
};

export type AdminNavGroup = {
  key: AdminNavGroupKey;
  label: string;
  items: AdminNavItem[];
};

const adminGroupLabels: Record<AdminNavGroupKey, string> = {
  catalog: "Каталог",
  community: "Сообщество",
  content: "Контент",
  devices: "Устройства",
  system: "Система"
};

const adminGroupOrder: AdminNavGroupKey[] = ["catalog", "community", "content", "devices", "system"];

export const adminNavItems: AdminNavItem[] = [
  { href: "/admin/ingredients", label: "Ингредиенты", icon: Boxes, requiredRole: "admin", group: "catalog" },
  {
    href: "/admin/ingredients/moderation",
    label: "Модерация ингредиентов",
    icon: ClipboardCheck,
    requiredRole: "moderator",
    group: "catalog"
  },
  {
    href: "/admin/ingredients/merge",
    label: "Объединение дублей",
    icon: GitMerge,
    requiredRole: "moderator",
    group: "catalog"
  },
  { href: "/admin/users", label: "Пользователи", icon: Users, requiredRole: "admin", group: "community" },
  { href: "/admin/recipes", label: "Рецепты", icon: FlaskConical, requiredRole: "moderator", group: "community" },
  { href: "/admin/feedback", label: "Обратная связь", icon: MessageSquare, requiredRole: "moderator", group: "community" },
  // Раздел живёт по /admin/masters (папку не переименовываем), но публично
  // витрина называется «Маркет» — имя пункта следует за публичным.
  { href: "/admin/masters", label: "Маркет", icon: Store, requiredRole: "moderator", group: "community" },
  { href: "/admin/articles", label: "Статьи", icon: BookOpen, requiredRole: "editor", group: "content" },
  { href: "/admin/devices", label: "Устройства", icon: Cpu, requiredRole: "admin", group: "devices" },
  { href: "/admin/firmware", label: "Прошивки", icon: Package, requiredRole: "admin", group: "devices" },
  { href: "/admin/push", label: "Пуш-уведомления", icon: Bell, requiredRole: "admin", group: "devices" },
  { href: "/admin/audit", label: "Журнал действий", icon: ScrollText, requiredRole: "admin", group: "system" },
  { href: "/admin/settings/currency", label: "Курсы валют", icon: Coins, requiredRole: "admin", group: "system" }
];

// Порядок ролей повторяет roleWeights из lib/auth намеренно: этот модуль читают
// клиентские компоненты (сайдбар), а lib/auth тянет next/headers и в клиентский
// бандл не попадает.
const adminRoleRank: Record<UserRole, number> = { user: 1, editor: 2, moderator: 3, admin: 4 };

export const canSeeAdminNavItem = (role: UserRole, item: AdminNavItem): boolean =>
  adminRoleRank[role] >= adminRoleRank[item.requiredRole];

/** Разделы, доступные роли, сгруппированные; пустые группы схлопываются. */
export const resolveAdminNavGroups = (role: UserRole): AdminNavGroup[] =>
  adminGroupOrder
    .map((key) => ({
      key,
      label: adminGroupLabels[key],
      items: adminNavItems.filter((item) => item.group === key && canSeeAdminNavItem(role, item))
    }))
    .filter((group) => group.items.length > 0);

/**
 * Активный пункт — самое длинное совпадение по префиксу пути: иначе на
 * /admin/ingredients/moderation подсветились бы сразу два пункта.
 */
export const resolveActiveAdminNavHref = (pathname: string, items: AdminNavItem[]): string | null => {
  const matched = items.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (matched.length === 0) {
    return null;
  }

  return matched.reduce((longest, item) => (item.href.length > longest.href.length ? item : longest)).href;
};
