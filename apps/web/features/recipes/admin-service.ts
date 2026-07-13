import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  recipeImages,
  recipes,
  sql,
  users
} from "@nb/db";
import { getBeerStyleById } from "@nb/brewing-core";
import { z } from "zod";

import { recordAuditEvent } from "../audit/service";
import { deleteRecipeImageObjects } from "../recipe-images/service";

import {
  HIDE_REASON_MAX_LENGTH,
  HIDE_REASON_MIN_LENGTH,
  resolveAdminRecipeStatus,
  type AdminRecipeListItem,
  type AdminRecipeStatusCounts,
  type AdminRecipesPage,
  type AdminRecipesQuery,
  type RecipeBulkFailure
} from "./admin-page-model";

// Админ-запросы и мутации модерации рецептов. В отличие от features/recipes/service.ts
// (весь author-scoped), здесь выборки идут по ВСЕМ рецептам — доступ гейтится ролью
// moderator+ в server action. Правило публичной видимости — в ./visibility.ts.

export type Moderator = { id: string; email: string | null };

export const hideReasonSchema = z
  .string()
  .trim()
  .min(HIDE_REASON_MIN_LENGTH, "Укажите причину скрытия.")
  .max(HIDE_REASON_MAX_LENGTH, `Причина не длиннее ${HIDE_REASON_MAX_LENGTH} символов.`);

const buildSearchCondition = (q: string) => {
  if (!q) {
    return undefined;
  }
  const term = `%${q}%`;
  return or(ilike(recipes.title, term), ilike(users.displayName, term), ilike(users.email, term));
};

const buildStatusCondition = (status: AdminRecipesQuery["status"]) => {
  if (status === "all") {
    return undefined;
  }
  if (status === "hidden") {
    return isNotNull(recipes.hiddenAt);
  }
  // Скрытый рецепт выпадает из статусных вкладок: для модератора он «Скрыт»,
  // а не «Опубликован»/«Черновик» (см. resolveAdminRecipeStatus).
  return and(isNull(recipes.hiddenAt), eq(recipes.publicationState, status));
};

// id последним ключом в каждой сортировке: рейтинга нет у большинства рецептов,
// а сид и массовый импорт кладут десятки рецептов с одним updated_at — без
// уникального ключа строки с равной сортировкой перетасовываются между
// запросами, и рецепт пропадает из очереди модерации между страницами.
const resolveOrderBy = (sort: AdminRecipesQuery["sort"]) => {
  switch (sort) {
    case "created":
      return [desc(recipes.createdAt), desc(recipes.id)];
    case "rating":
      return [sql`${recipes.ratingAvg} desc nulls last`, desc(recipes.ratingCount), desc(recipes.id)];
    case "title":
      return [asc(recipes.title), asc(recipes.id)];
    case "updated":
    default:
      return [desc(recipes.updatedAt), desc(recipes.id)];
  }
};

const resolveModeratorNames = async (userIds: Array<string | null>): Promise<Map<string, string>> => {
  const ids = [...new Set(userIds.filter((id): id is string => id != null))];
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));

  return new Map(rows.map((row) => [row.id, row.displayName?.trim() || row.email || "—"]));
};

/**
 * Список рецептов для модерации: все авторы, любой статус. Поиск — по названию
 * рецепта и имени/почте автора, счётчики вкладок считаются по тому же поиску
 * (но без фильтра статуса), чтобы вкладки не спорили со строкой поиска.
 */
export const listAdminRecipes = async (query: AdminRecipesQuery): Promise<AdminRecipesPage> => {
  const searchCondition = buildSearchCondition(query.q);
  const statusCondition = buildStatusCondition(query.status);
  const whereClause = and(searchCondition, statusCondition);

  const [countsRow] = await db
    .select({
      all: count(),
      hidden: sql<number>`count(*) filter (where ${recipes.hiddenAt} is not null)`,
      published: sql<number>`count(*) filter (where ${recipes.hiddenAt} is null and ${recipes.publicationState} = 'published')`,
      private: sql<number>`count(*) filter (where ${recipes.hiddenAt} is null and ${recipes.publicationState} = 'private')`,
      draft: sql<number>`count(*) filter (where ${recipes.hiddenAt} is null and ${recipes.publicationState} = 'draft')`
    })
    .from(recipes)
    .leftJoin(users, eq(users.id, recipes.authorId))
    .where(searchCondition);

  const counts: AdminRecipeStatusCounts = {
    all: Number(countsRow?.all ?? 0),
    published: Number(countsRow?.published ?? 0),
    private: Number(countsRow?.private ?? 0),
    draft: Number(countsRow?.draft ?? 0),
    hidden: Number(countsRow?.hidden ?? 0)
  };

  const total = counts[query.status];
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);

  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      publicationState: recipes.publicationState,
      hiddenAt: recipes.hiddenAt,
      hiddenReason: recipes.hiddenReason,
      hiddenByUserId: recipes.hiddenByUserId,
      styleId: recipes.styleId,
      ratingAvg: recipes.ratingAvg,
      ratingCount: recipes.ratingCount,
      featuredAt: recipes.featuredAt,
      createdAt: recipes.createdAt,
      updatedAt: recipes.updatedAt,
      authorId: recipes.authorId,
      authorDisplayName: users.displayName,
      authorEmail: users.email
    })
    .from(recipes)
    .leftJoin(users, eq(users.id, recipes.authorId))
    .where(whereClause)
    .orderBy(...resolveOrderBy(query.sort))
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);

  const moderatorNames = await resolveModeratorNames(rows.map((row) => row.hiddenByUserId));

  const items: AdminRecipeListItem[] = rows.map((row) => {
    const style = getBeerStyleById(row.styleId);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      publicationState: row.publicationState,
      status: resolveAdminRecipeStatus({ publicationState: row.publicationState, hiddenAt: row.hiddenAt }),
      hiddenAt: row.hiddenAt,
      hiddenReason: row.hiddenReason,
      hiddenByName: row.hiddenByUserId ? moderatorNames.get(row.hiddenByUserId) ?? null : null,
      authorId: row.authorId,
      authorName: row.authorDisplayName?.trim() || row.authorEmail || "—",
      styleCode: style ? style.bjcpId : null,
      styleName: style ? style.nameRu ?? style.name : null,
      ratingAvg: row.ratingAvg,
      ratingCount: row.ratingCount,
      featured: row.featuredAt != null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  });

  return { items, total, page, pageSize: query.pageSize, totalPages, counts };
};

export type HideRecipesResult = {
  /** styleId нужен вызывающему, чтобы сбросить ISR страницы стиля /bjcp/<slug>, где рецепт висит карточкой. */
  hidden: Array<{ id: string; slug: string; styleId: string | null }>;
  /** Не скрытые — с причиной: вызывающий показывает это модератору как частичный отказ. */
  failures: RecipeBulkFailure[];
};

/**
 * Почему id не попал в апдейт. Читаем состояние ПОСЛЕ записи, поэтому гонка
 * (рецепт скрыли/удалили параллельно) отражается честно, а не как «сбой».
 * Строка на месте и не скрыта — апдейт её не взял: это уже реальный сбой записи.
 */
const classifyHideFailures = async (ids: string[]): Promise<RecipeBulkFailure[]> => {
  if (ids.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: recipes.id, hiddenAt: recipes.hiddenAt })
    .from(recipes)
    .where(inArray(recipes.id, ids));

  const hiddenAtById = new Map(rows.map((row) => [row.id, row.hiddenAt]));

  return ids.map((id) => {
    if (!hiddenAtById.has(id)) {
      return { id, reason: "missing" as const };
    }
    return { id, reason: hiddenAtById.get(id) != null ? ("hidden" as const) : ("failed" as const) };
  });
};

/**
 * Скрывает рецепты модератором. Идемпотентна по факту: уже скрытые в hidden не
 * попадают (уезжают в failures с причиной). Метку «Выбор редакции» снимаем —
 * скрытый рецепт не может оставаться кураторской рекомендацией.
 */
export const hideRecipes = async (
  moderator: Moderator,
  recipeIds: string[],
  reason: string
): Promise<HideRecipesResult> => {
  const parsedReason = hideReasonSchema.parse(reason);
  const ids = [...new Set(recipeIds)];
  if (ids.length === 0) {
    return { hidden: [], failures: [] };
  }

  const updated = await db
    .update(recipes)
    .set({
      hiddenAt: new Date(),
      hiddenReason: parsedReason,
      hiddenByUserId: moderator.id,
      featuredAt: null
    })
    .where(and(inArray(recipes.id, ids), isNull(recipes.hiddenAt)))
    .returning({ id: recipes.id, title: recipes.title, slug: recipes.slug, styleId: recipes.styleId });

  for (const recipe of updated) {
    await recordAuditEvent({
      actorUserId: moderator.id,
      actorEmail: moderator.email,
      action: "recipe.hide",
      entityType: "recipe",
      entityId: recipe.id,
      summary: `Скрыт рецепт «${recipe.title}»: ${parsedReason}`,
      payload: { reason: parsedReason, slug: recipe.slug }
    });
  }

  const hiddenIdSet = new Set(updated.map((recipe) => recipe.id));

  return {
    hidden: updated.map((recipe) => ({ id: recipe.id, slug: recipe.slug, styleId: recipe.styleId ?? null })),
    failures: await classifyHideFailures(ids.filter((id) => !hiddenIdSet.has(id)))
  };
};

/** Возвращает рецепт в публичный доступ (состояние публикации не трогаем). */
export const unhideRecipe = async (
  moderator: Moderator,
  recipeId: string
): Promise<{ slug: string; styleId: string | null }> => {
  const [updated] = await db
    .update(recipes)
    .set({ hiddenAt: null, hiddenReason: null, hiddenByUserId: null })
    .where(and(eq(recipes.id, recipeId), isNotNull(recipes.hiddenAt)))
    .returning({ id: recipes.id, title: recipes.title, slug: recipes.slug, styleId: recipes.styleId });

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  await recordAuditEvent({
    actorUserId: moderator.id,
    actorEmail: moderator.email,
    action: "recipe.unhide",
    entityType: "recipe",
    entityId: updated.id,
    summary: `Рецепт «${updated.title}» возвращён`,
    payload: { slug: updated.slug }
  });

  return { slug: updated.slug, styleId: updated.styleId ?? null };
};

/**
 * Удаление рецепта модератором. Файлы фотографий чистим САМИ: в БД
 * recipe_images висят на CASCADE, и без этого объекты остались бы в storage
 * навсегда. Связанные партии/списания осиротеют (recipe_id → SET NULL) — это
 * ожидаемо, снапшот партии самодостаточен.
 */
export const deleteRecipeAsModerator = async (
  moderator: Moderator,
  recipeId: string
): Promise<{ slug: string; title: string; styleId: string | null }> => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { id: true, title: true, slug: true, authorId: true, styleId: true }
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  const images = await db
    .select({
      storageKeyOriginal: recipeImages.storageKeyOriginal,
      storageKeyLarge: recipeImages.storageKeyLarge,
      storageKeyMedium: recipeImages.storageKeyMedium,
      storageKeyThumb: recipeImages.storageKeyThumb
    })
    .from(recipeImages)
    .where(eq(recipeImages.recipeId, recipeId));

  await db.delete(recipes).where(eq(recipes.id, recipeId));

  await deleteRecipeImageObjects(
    images.flatMap((image) => [
      image.storageKeyOriginal,
      image.storageKeyLarge,
      image.storageKeyMedium,
      image.storageKeyThumb
    ])
  );

  await recordAuditEvent({
    actorUserId: moderator.id,
    actorEmail: moderator.email,
    action: "recipe.delete",
    entityType: "recipe",
    entityId: recipe.id,
    summary: `Удалён рецепт «${recipe.title}»`,
    payload: { slug: recipe.slug, authorId: recipe.authorId }
  });

  return { slug: recipe.slug, title: recipe.title, styleId: recipe.styleId ?? null };
};
