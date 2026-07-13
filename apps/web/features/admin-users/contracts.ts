import type { UserRole } from "@nb/auth";

// Только type-импорт из @nb/auth: значение (ROLES) утащило бы в клиентский бандл
// весь пакет — он тянет @nb/db и pg, а этот файл читают клиентские компоненты.
// Record<UserRole, …> держит список полным: новая роль в @nb/auth уронит сборку здесь.
export const userRoleLabels: Record<UserRole, string> = {
  user: "Пользователь",
  editor: "Редактор",
  moderator: "Модератор",
  admin: "Администратор"
};

export const userRoles = Object.keys(userRoleLabels) as readonly UserRole[];

export const adminUserStatuses = ["active", "blocked", "anonymized"] as const;
export type AdminUserStatus = (typeof adminUserStatuses)[number];

export const adminUserStatusLabels: Record<AdminUserStatus, string> = {
  active: "Активен",
  blocked: "Заблокирован",
  anonymized: "Обезличен"
};

export const adminUserSortOptions = ["recent", "oldest", "name", "role"] as const;
export type AdminUserSortOption = (typeof adminUserSortOptions)[number];

export const defaultAdminUserSortOption: AdminUserSortOption = "recent";

export const adminUserSortLabels: Record<AdminUserSortOption, string> = {
  recent: "Сначала новые",
  oldest: "Сначала старые",
  name: "По имени",
  role: "По роли"
};

export const BLOCK_REASON_MIN = 3;
export const BLOCK_REASON_MAX = 1000;

export const ADMIN_USERS_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_USERS_PAGE_SIZE_MAX = 100;

export type AdminUserFilters = {
  q?: string;
  role?: UserRole;
  status?: AdminUserStatus;
  sort?: AdminUserSortOption;
  page?: number;
  pageSize?: number;
};

export type AdminUserListItem = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: AdminUserStatus;
  blockedAt: Date | null;
  blockedReason: string | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  recipesCount: number;
  batchesCount: number;
};

export type AdminUserListPage = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminUserMasterProfile = {
  id: string;
  displayName: string;
  slug: string | null;
  reviewStatus: string;
  isListed: boolean;
};

export type AdminUserActivity = {
  recipesCount: number;
  publishedRecipesCount: number;
  batchesCount: number;
  inventoryCount: number;
  devicesCount: number;
  masterProfile: AdminUserMasterProfile | null;
};

export type AdminUserDetail = AdminUserListItem & {
  emailVerified: boolean;
  phoneVerified: boolean;
  blockedByName: string | null;
  updatedAt: Date;
  activity: AdminUserActivity;
};

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && (userRoles as readonly string[]).includes(value);

export const isAdminUserStatus = (value: unknown): value is AdminUserStatus =>
  typeof value === "string" && (adminUserStatuses as readonly string[]).includes(value);

export const parseAdminUserSort = (value: string | undefined): AdminUserSortOption =>
  (adminUserSortOptions as readonly string[]).includes(value as AdminUserSortOption)
    ? (value as AdminUserSortOption)
    : defaultAdminUserSortOption;

export const parseAdminUserPage = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
};

export const parseAdminUserPageSize = (value: string | undefined): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return ADMIN_USERS_PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.floor(parsed), ADMIN_USERS_PAGE_SIZE_MAX);
};

/**
 * Разбор строки запроса раздела. Мусор в параметрах не должен ронять страницу:
 * неизвестные значения просто отбрасываются к дефолтам.
 */
export const parseAdminUserFilters = (searchParams: Record<string, string | undefined>): AdminUserFilters => {
  const q = searchParams.q?.trim();
  return {
    q: q ? q : undefined,
    role: isUserRole(searchParams.role) ? searchParams.role : undefined,
    status: isAdminUserStatus(searchParams.status) ? searchParams.status : undefined,
    sort: parseAdminUserSort(searchParams.sort),
    page: parseAdminUserPage(searchParams.page),
    pageSize: parseAdminUserPageSize(searchParams.pageSize)
  };
};

type AdminUsersToolbarState = {
  q?: string;
  role?: UserRole | "all";
  status?: AdminUserStatus | "all";
  sort?: AdminUserSortOption;
  pageSize?: number;
};

/** Ссылка тулбара: пустые/дефолтные значения в URL не попадают, page сбрасывается. */
export const buildAdminUsersHref = (
  pathname: string,
  {
    q = "",
    role = "all",
    status = "all",
    sort = defaultAdminUserSortOption,
    pageSize = ADMIN_USERS_PAGE_SIZE_DEFAULT
  }: AdminUsersToolbarState
): string => {
  const params = new URLSearchParams();
  const trimmed = q.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }
  if (role !== "all") {
    params.set("role", role);
  }
  if (status !== "all") {
    params.set("status", status);
  }
  if (sort !== defaultAdminUserSortOption) {
    params.set("sort", sort);
  }
  if (pageSize !== ADMIN_USERS_PAGE_SIZE_DEFAULT) {
    params.set("pageSize", String(pageSize));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

/** Статус аккаунта: обезличивание перекрывает блокировку (оно её включает). */
export const resolveAdminUserStatus = (user: {
  blockedAt: Date | null;
  anonymizedAt: Date | null;
}): AdminUserStatus => {
  if (user.anonymizedAt !== null) {
    return "anonymized";
  }
  return user.blockedAt !== null ? "blocked" : "active";
};

/**
 * Что администратор вводит в подтверждение обезличивания: e-mail аккаунта, а если
 * его нет (телефонная регистрация) — номер. Обезличенный аккаунт подтверждать
 * нечем — его и обезличивать повторно незачем.
 */
export const anonymizeConfirmationValue = (user: { email: string | null; phone: string | null }): string | null =>
  user.email ?? user.phone ?? null;
