import {
  and,
  asc,
  brewBatches,
  brewDevices,
  count,
  db,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  masterProfiles,
  or,
  recipes,
  sql,
  userIngredients,
  users
} from "@nb/db";
import { anonymizeUser, blockUser, setRole, unblockUser, type UserRole } from "@nb/auth";

import { recordAuditEvent, scrubActorEmails } from "@/features/audit/service";
import { purgeMasterProfileForUser, unlistMasterProfileForUser } from "@/features/masters/service";
import { isUuid } from "@/lib/uuid";

import {
  ADMIN_USERS_PAGE_SIZE_DEFAULT,
  ADMIN_USERS_PAGE_SIZE_MAX,
  resolveAdminUserStatus,
  userRoleLabels,
  type AdminUserActivity,
  type AdminUserDetail,
  type AdminUserFilters,
  type AdminUserListItem,
  type AdminUserListPage
} from "./contracts";
import {
  checkAnonymize,
  checkBlock,
  checkRoleChange,
  checkUnblock,
  type AdminUserTarget
} from "./permissions";

export type AdminActor = { id: string; email: string | null };

// Слаг витрины, которую задело действие над аккаунтом: публичные страницы мастера
// отдаются с revalidate=300, поэтому слой actions обязан их ревалидировать сразу.
export type AdminUserAccountEffect = { masterSlug: string | null };

const normalizePage = (page: number | undefined): number =>
  typeof page === "number" && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

const normalizePageSize = (pageSize: number | undefined): number => {
  if (typeof pageSize !== "number" || !Number.isFinite(pageSize) || pageSize < 1) {
    return ADMIN_USERS_PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.floor(pageSize), ADMIN_USERS_PAGE_SIZE_MAX);
};

// В ilike служебные % и _ — часть шаблона: без экранирования поиск по «100%»
// или «a_b» превращался бы в маску.
const likePattern = (query: string): string => `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

const buildWhere = (filters: AdminUserFilters) => {
  const conditions = [];

  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(
      or(ilike(users.displayName, pattern), ilike(users.email, pattern), ilike(users.phone, pattern))
    );
  }

  if (filters.role) {
    conditions.push(eq(users.role, filters.role));
  }

  if (filters.status === "active") {
    conditions.push(and(isNull(users.blockedAt), isNull(users.anonymizedAt)));
  } else if (filters.status === "blocked") {
    conditions.push(and(isNotNull(users.blockedAt), isNull(users.anonymizedAt)));
  } else if (filters.status === "anonymized") {
    conditions.push(isNotNull(users.anonymizedAt));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
};

const buildOrderBy = (filters: AdminUserFilters) => {
  switch (filters.sort) {
    case "oldest":
      return [asc(users.createdAt), asc(users.id)];
    case "name":
      return [asc(users.displayName), asc(users.id)];
    // role — pgEnum, порядок значений в типе идёт от user к admin, поэтому desc
    // поднимает администраторов наверх.
    case "role":
      return [desc(users.role), asc(users.displayName)];
    default:
      return [desc(users.createdAt), desc(users.id)];
  }
};

const countByUser = async (
  table: typeof recipes | typeof brewBatches,
  column: typeof recipes.authorId | typeof brewBatches.userId,
  userIds: string[]
): Promise<Map<string, number>> => {
  const rows = await db
    .select({ userId: column, value: count() })
    .from(table)
    .where(inArray(column, userIds))
    .groupBy(column);

  return new Map(rows.map((row) => [row.userId, row.value]));
};

export const listAdminUsers = async (filters: AdminUserFilters = {}): Promise<AdminUserListPage> => {
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);
  const where = buildWhere(filters);

  const [totals] = await db.select({ value: count() }).from(users).where(where);
  const total = totals?.value ?? 0;
  if (total === 0) {
    return { items: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      phone: users.phone,
      role: users.role,
      blockedAt: users.blockedAt,
      blockedReason: users.blockedReason,
      anonymizedAt: users.anonymizedAt,
      createdAt: users.createdAt
    })
    .from(users)
    .where(where)
    .orderBy(...buildOrderBy(filters))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const userIds = rows.map((row) => row.id);
  const [recipesByUser, batchesByUser] = userIds.length
    ? await Promise.all([
        countByUser(recipes, recipes.authorId, userIds),
        countByUser(brewBatches, brewBatches.userId, userIds)
      ])
    : [new Map<string, number>(), new Map<string, number>()];

  const items: AdminUserListItem[] = rows.map((row) => ({
    ...row,
    status: resolveAdminUserStatus(row),
    recipesCount: recipesByUser.get(row.id) ?? 0,
    batchesCount: batchesByUser.get(row.id) ?? 0
  }));

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
};

const loadActivity = async (userId: string): Promise<AdminUserActivity> => {
  const [recipesTotal, publishedTotal, batchesTotal, inventoryTotal, devicesTotal, masterRows] = await Promise.all([
    db.select({ value: count() }).from(recipes).where(eq(recipes.authorId, userId)),
    db
      .select({ value: count() })
      .from(recipes)
      .where(and(eq(recipes.authorId, userId), eq(recipes.publicationState, "published"))),
    db.select({ value: count() }).from(brewBatches).where(eq(brewBatches.userId, userId)),
    db.select({ value: count() }).from(userIngredients).where(eq(userIngredients.userId, userId)),
    db.select({ value: count() }).from(brewDevices).where(eq(brewDevices.userId, userId)),
    db
      .select({
        id: masterProfiles.id,
        displayName: masterProfiles.displayName,
        slug: masterProfiles.slug,
        reviewStatus: masterProfiles.reviewStatus,
        isListed: masterProfiles.isListed
      })
      .from(masterProfiles)
      .where(eq(masterProfiles.userId, userId))
      .limit(1)
  ]);

  return {
    recipesCount: recipesTotal[0]?.value ?? 0,
    publishedRecipesCount: publishedTotal[0]?.value ?? 0,
    batchesCount: batchesTotal[0]?.value ?? 0,
    inventoryCount: inventoryTotal[0]?.value ?? 0,
    devicesCount: devicesTotal[0]?.value ?? 0,
    masterProfile: masterRows[0] ?? null
  };
};

export const getAdminUserDetail = async (userId: string): Promise<AdminUserDetail | null> => {
  if (!isUuid(userId)) {
    return null;
  }

  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) {
    return null;
  }

  const activity = await loadActivity(row.id);

  let blockedByName: string | null = null;
  if (row.blockedByUserId) {
    const [actor] = await db
      .select({ displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, row.blockedByUserId));
    blockedByName = actor?.displayName ?? actor?.email ?? null;
  }

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: resolveAdminUserStatus(row),
    blockedAt: row.blockedAt,
    blockedReason: row.blockedReason,
    anonymizedAt: row.anonymizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    emailVerified: row.emailVerified,
    phoneVerified: row.phoneVerified,
    blockedByName,
    recipesCount: activity.recipesCount,
    batchesCount: activity.batchesCount,
    activity
  };
};

type AdminUsersTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Живые администраторы: заблокированный или обезличенный админ площадку не спасёт. */
const activeAdminWhere = () => and(eq(users.role, "admin"), isNull(users.blockedAt), isNull(users.anonymizedAt));

/**
 * Берёт под `FOR UPDATE` строку цели и строки всех живых администраторов, и только
 * потом считает их. Отдельный `count(*)` до мутации — это TOCTOU: два параллельных
 * разжалования читают «админов двое», каждое считает себя безопасным, и площадка
 * остаётся без единственного пути управления ролями. Под блокировкой второй запрос
 * досчитывает админов уже после коммита первого и упирается в LAST_ADMIN.
 *
 * Порядок захвата задан `order by id`: параллельные действия выстраиваются в
 * очередь на одних и тех же строках, а не в дедлок из-за разного порядка.
 */
const lockAccounts = async (
  tx: AdminUsersTx,
  userId: string
): Promise<{ target: AdminUserTarget | null; activeAdminCount: number }> => {
  const rows = await tx
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      role: users.role,
      blockedAt: users.blockedAt,
      anonymizedAt: users.anonymizedAt
    })
    .from(users)
    .where(or(eq(users.id, userId), activeAdminWhere()))
    .orderBy(asc(users.id))
    .for("update");

  const activeAdminCount = rows.filter(
    (row) => row.role === "admin" && row.blockedAt === null && row.anonymizedAt === null
  ).length;

  const row = rows.find((item) => item.id === userId);

  return {
    target: row
      ? { id: row.id, email: row.email, phone: row.phone, role: row.role, status: resolveAdminUserStatus(row) }
      : null,
    activeAdminCount
  };
};

/**
 * Общий каркас действий над аккаунтом: проверка правил и запись живут в ОДНОЙ
 * транзакции на заблокированных строках. Отказ (`throw`) откатывает транзакцию,
 * поэтому частично применённых действий не бывает.
 */
const withLockedAccount = async <T>(
  userId: string,
  run: (tx: AdminUsersTx, locked: { target: AdminUserTarget; activeAdminCount: number }) => Promise<T>
): Promise<T> => {
  // Невалидный uuid до сравнения в SQL: иначе Postgres упадёт на разборе литерала.
  if (!isUuid(userId)) {
    throw new Error("USER_NOT_FOUND");
  }

  return db.transaction(async (tx) => {
    const { target, activeAdminCount } = await lockAccounts(tx, userId);
    if (!target) {
      throw new Error("USER_NOT_FOUND");
    }
    return run(tx, { target, activeAdminCount });
  });
};

const loadTarget = async (userId: string): Promise<(AdminUserTarget & { displayName: string }) | null> => {
  if (!isUuid(userId)) {
    return null;
  }

  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      phone: users.phone,
      role: users.role,
      blockedAt: users.blockedAt,
      anonymizedAt: users.anonymizedAt
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: resolveAdminUserStatus(row)
  };
};

const requireTarget = async (userId: string) => {
  const target = await loadTarget(userId);
  if (!target) {
    throw new Error("USER_NOT_FOUND");
  }
  return target;
};

export const changeUserRole = async ({
  actor,
  userId,
  role
}: {
  actor: AdminActor;
  userId: string;
  role: UserRole;
}): Promise<void> => {
  const target = await withLockedAccount(userId, async (tx, locked) => {
    const error = checkRoleChange({
      actorId: actor.id,
      target: locked.target,
      nextRole: role,
      activeAdminCount: locked.activeAdminCount
    });
    if (error) {
      throw new Error(error);
    }

    await setRole({ userId, role }, tx);
    return locked.target;
  });

  // Сессии не гасим: getUserBySessionToken читает роль из users на каждом
  // запросе, поэтому новая роль действует со следующего же запроса.
  await recordAuditEvent({
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: "user.role_change",
    entityType: "user",
    entityId: userId,
    summary: `Роль: ${userRoleLabels[target.role]} → ${userRoleLabels[role]}`,
    payload: { from: target.role, to: role }
  });
};

export const blockUserAccount = async ({
  actor,
  userId,
  reason
}: {
  actor: AdminActor;
  userId: string;
  reason: string;
}): Promise<AdminUserAccountEffect> => {
  const trimmed = reason.trim();

  await withLockedAccount(userId, async (tx, locked) => {
    const error = checkBlock({
      actorId: actor.id,
      target: locked.target,
      reason,
      activeAdminCount: locked.activeAdminCount
    });
    if (error) {
      throw new Error(error);
    }

    await blockUser({ userId, reason: trimmed, byUserId: actor.id }, tx);
  });

  // Витрина публикуется из снапшота master_profiles и про блокировку владельца не
  // узнает сама: без этого товары забаненного остаются на /market вместе с
  // контактами для связи в обход площадки.
  const master = await unlistMasterProfileForUser(userId);
  await recordAuditEvent({
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: "user.block",
    entityType: "user",
    entityId: userId,
    summary: `Блокировка: ${trimmed}`,
    payload: { reason: trimmed, masterUnlisted: master !== null }
  });

  return { masterSlug: master?.slug ?? null };
};

export const unblockUserAccount = async ({
  actor,
  userId
}: {
  actor: AdminActor;
  userId: string;
}): Promise<void> => {
  const target = await requireTarget(userId);

  const error = checkUnblock({ target });
  if (error) {
    throw new Error(error);
  }

  await unblockUser({ userId });
  await recordAuditEvent({
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: "user.unblock",
    entityType: "user",
    entityId: userId,
    summary: "Блокировка снята"
  });
};

/**
 * «Удалить» = обезличить. В аудит намеренно не попадают ни e-mail, ни телефон
 * обезличенного: журнал переживёт аккаунт, а ПДн в нём свели бы обезличивание на нет.
 * По той же причине затираем снапшоты почты в его прошлых действиях модератора.
 *
 * ПДн лежат в трёх таблицах (users, system_events.actor_email, master_profiles), и все
 * три чистятся ОДНОЙ транзакцией: иначе падение любой из чисток после коммита оставило
 * бы аккаунт обезличенным, а почту в журнале и контакты мастера — живыми. Инвариант:
 * либо обезличено всё разом, либо ничего.
 */
export const anonymizeUserAccount = async ({
  actor,
  userId,
  confirmation
}: {
  actor: AdminActor;
  userId: string;
  confirmation: string;
}): Promise<AdminUserAccountEffect> => {
  const { target, master } = await withLockedAccount(userId, async (tx, locked) => {
    const error = checkAnonymize({
      actorId: actor.id,
      target: locked.target,
      confirmation,
      activeAdminCount: locked.activeAdminCount
    });
    if (error) {
      throw new Error(error);
    }

    await anonymizeUser({ userId, byUserId: actor.id }, tx);
    await scrubActorEmails(userId, tx);
    // anonymizeUser чистит только users, а контакты мастера лежат в master_profiles
    // и в опубликованном снапшоте: без этого /masters/<slug> и /market продолжали бы
    // отдавать настоящие телефон и почту «удалённого пользователя».
    const purged = await purgeMasterProfileForUser(userId, tx);

    return { target: locked.target, master: purged };
  });

  // Запись о самом обезличивании — уже после коммита: актором тут всегда админ (себя
  // обезличить нельзя, ANONYMIZE_SELF), поэтому под scrubActorEmails она не попадает.
  await recordAuditEvent({
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: "user.anonymize",
    entityType: "user",
    entityId: userId,
    summary: "Аккаунт обезличен",
    payload: {
      hadEmail: target.email !== null,
      hadPhone: target.phone !== null,
      role: target.role,
      masterProfilePurged: master !== null
    }
  });

  return { masterSlug: master?.slug ?? null };
};
