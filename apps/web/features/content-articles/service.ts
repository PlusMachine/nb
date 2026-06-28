import { and, contentArticles, db, desc, eq, inArray } from "@nb/db";
import type { UserRole } from "@nb/auth";

import { getContentCapabilities } from "../content/permissions";
import { appendSlugSuffix, toContentArticleSlugBase } from "./slug";
import { estimateReadingMinutes, extractPlainText } from "./reading-time";
import {
  type AdminContentArticleFilter,
  type ContentArticleDto,
  type ContentArticleInput,
  type ContentArticleListItem,
  type ContentArticleStatus,
  type ContentArticleType,
  type TiptapDoc
} from "./contracts";

export type ContentActor = { id: string; role: UserRole };

type ArticleRow = typeof contentArticles.$inferSelect;
type ArticleRowWithAuthor = ArticleRow & { author?: { displayName: string | null } | null };

const mapDto = (row: ArticleRowWithAuthor): ContentArticleDto => ({
  id: row.id,
  type: row.type as ContentArticleType,
  status: row.status as ContentArticleStatus,
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt,
  bodyJson: (row.bodyJson as TiptapDoc | null) ?? null,
  metaJson: (row.metaJson as Record<string, unknown> | null | undefined) ?? {},
  coverImageUrl: row.coverImageUrl,
  seoTitle: row.seoTitle,
  seoDescription: row.seoDescription,
  readingMinutes: row.readingMinutes,
  isFeatured: row.isFeatured,
  authorId: row.authorId,
  authorName: row.author?.displayName ?? null,
  reviewerId: row.reviewerId,
  publishedAt: row.publishedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapListItem = (row: ArticleRowWithAuthor): ContentArticleListItem => ({
  id: row.id,
  type: row.type as ContentArticleType,
  status: row.status as ContentArticleStatus,
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt,
  coverImageUrl: row.coverImageUrl,
  readingMinutes: row.readingMinutes,
  isFeatured: row.isFeatured,
  authorName: row.author?.displayName ?? null,
  publishedAt: row.publishedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

// Конфликт уникального индекса слага (гонка между resolveUniqueSlug и записью).
const isSlugConflict = (error: unknown): boolean =>
  error instanceof Error
  && (error.message.includes("content_articles_slug_uidx") || (error as { code?: string }).code === "23505");

const resolveUniqueSlug = async (title: string, excludeId?: string): Promise<string> => {
  const base = toContentArticleSlugBase(title);
  for (let index = 1; index < 1000; index += 1) {
    const candidate = appendSlugSuffix(base, index);
    const existing = await db.query.contentArticles.findFirst({
      where: eq(contentArticles.slug, candidate),
      columns: { id: true }
    });
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
  }
  // Крайне маловероятно: гарантируем уникальность временной меткой длины слага.
  return appendSlugSuffix(base, Math.floor(Date.now() % 100000));
};

const normalizeExcerpt = (input: ContentArticleInput): string | null => {
  if (input.excerpt && input.excerpt.trim()) {
    return input.excerpt.trim();
  }
  const fromBody = extractPlainText(input.bodyJson ?? null, 280);
  return fromBody || null;
};

const loadOwnedRow = async (articleId: string): Promise<ArticleRow> => {
  const row = await db.query.contentArticles.findFirst({ where: eq(contentArticles.id, articleId) });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  return row;
};

const assertCanMutate = (actor: ContentActor, row: ArticleRow) => {
  const caps = getContentCapabilities(actor.role);
  if (row.authorId === actor.id || caps.canModerate) {
    return;
  }
  throw new Error("FORBIDDEN");
};

export const createContentArticle = async (
  actor: ContentActor,
  input: ContentArticleInput
): Promise<ContentArticleDto> => {
  if (!getContentCapabilities(actor.role).canEditDrafts) {
    throw new Error("FORBIDDEN");
  }
  // Ретрай на гонку слага (TOCTOU между resolveUniqueSlug и insert): уникальный
  // индекс — финальный арбитр, повторно подбираем слаг при конфликте.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = await resolveUniqueSlug(input.title);
    try {
      const [created] = await db.insert(contentArticles).values({
        type: input.type,
        status: "draft",
        slug,
        title: input.title,
        excerpt: normalizeExcerpt(input),
        bodyJson: (input.bodyJson ?? null) as Record<string, unknown> | null,
        metaJson: input.metaJson ?? {},
        coverImageUrl: input.coverImageUrl ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        readingMinutes: estimateReadingMinutes(input.bodyJson ?? null),
        authorId: actor.id
      }).returning();
      if (!created) {
        throw new Error("CREATE_FAILED");
      }
      return mapDto(created);
    } catch (error) {
      if (isSlugConflict(error) && attempt < 4) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("CREATE_FAILED");
};

export const updateContentArticle = async (
  actor: ContentActor,
  articleId: string,
  input: ContentArticleInput
): Promise<ContentArticleDto> => {
  const row = await loadOwnedRow(articleId);
  assertCanMutate(actor, row);

  // Слаг переадресуем только пока статья в черновике — после публикации URL
  // /guides/<slug> канонический и не должен ломаться при правке заголовка.
  const slug = (row.status !== "draft" || row.title === input.title)
    ? row.slug
    : await resolveUniqueSlug(input.title, articleId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateSlug = attempt === 0 ? slug : await resolveUniqueSlug(input.title, articleId);
    try {
      const [updated] = await db.update(contentArticles).set({
        type: input.type,
        slug: candidateSlug,
        title: input.title,
        excerpt: normalizeExcerpt(input),
        bodyJson: (input.bodyJson ?? null) as Record<string, unknown> | null,
        metaJson: input.metaJson ?? row.metaJson,
        coverImageUrl: input.coverImageUrl ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        readingMinutes: estimateReadingMinutes(input.bodyJson ?? null),
        updatedAt: new Date()
      }).where(eq(contentArticles.id, articleId)).returning();
      if (!updated) {
        throw new Error("NOT_FOUND");
      }
      return mapDto(updated);
    } catch (error) {
      // Не переподбираем слаг, если он заморожен (published/archived) — там слаг не менялся.
      if (isSlugConflict(error) && attempt < 4 && row.status === "draft") {
        continue;
      }
      throw error;
    }
  }
  throw new Error("NOT_FOUND");
};

export const setContentArticlePublication = async (
  actor: ContentActor,
  articleId: string,
  publish: boolean
): Promise<ContentArticleDto> => {
  if (!getContentCapabilities(actor.role).canPublish) {
    throw new Error("FORBIDDEN");
  }
  const row = await loadOwnedRow(articleId);
  const now = new Date();
  const [updated] = await db.update(contentArticles).set({
    status: publish ? "published" : "draft",
    // publishedAt ставим один раз при первой публикации, дальше сохраняем.
    publishedAt: publish ? (row.publishedAt ?? now) : row.publishedAt,
    reviewerId: publish ? actor.id : row.reviewerId,
    updatedAt: now
  }).where(eq(contentArticles.id, articleId)).returning();
  if (!updated) {
    throw new Error("NOT_FOUND");
  }
  return mapDto(updated);
};

export const setContentArticleFeatured = async (
  actor: ContentActor,
  articleId: string,
  featured: boolean
): Promise<ContentArticleDto> => {
  if (!getContentCapabilities(actor.role).canFeatureOnHome) {
    throw new Error("FORBIDDEN");
  }
  const [updated] = await db.update(contentArticles).set({
    isFeatured: featured,
    updatedAt: new Date()
  }).where(eq(contentArticles.id, articleId)).returning();
  if (!updated) {
    throw new Error("NOT_FOUND");
  }
  return mapDto(updated);
};

export const deleteContentArticle = async (actor: ContentActor, articleId: string): Promise<void> => {
  const row = await loadOwnedRow(articleId);
  assertCanMutate(actor, row);
  await db.delete(contentArticles).where(eq(contentArticles.id, articleId));
};

// --- Чтение: админка -----------------------------------------------------------

export const listAdminContentArticles = async (
  filter: AdminContentArticleFilter = {}
): Promise<ContentArticleListItem[]> => {
  const conditions = [
    filter.type ? eq(contentArticles.type, filter.type) : undefined,
    filter.status ? eq(contentArticles.status, filter.status) : undefined
  ].filter(Boolean);

  const rows = await db.query.contentArticles.findMany({
    where: conditions.length ? and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])) : undefined,
    with: { author: { columns: { displayName: true } } },
    orderBy: [desc(contentArticles.updatedAt)]
  });
  return rows.map(mapListItem);
};

export const getContentArticleForEditor = async (
  actor: ContentActor,
  articleId: string
): Promise<ContentArticleDto | null> => {
  if (!getContentCapabilities(actor.role).canEditDrafts) {
    throw new Error("FORBIDDEN");
  }
  const row = await db.query.contentArticles.findFirst({
    where: eq(contentArticles.id, articleId),
    with: { author: { columns: { displayName: true } } }
  });
  if (!row) {
    return null;
  }
  // Доступ к редактированию = тот же предикат, что и на запись (автор ИЛИ
  // модератор+). Чужой черновик не показываем (404 вместо гарантированного
  // FORBIDDEN при сохранении).
  if (row.authorId !== actor.id && !getContentCapabilities(actor.role).canModerate) {
    return null;
  }
  return mapDto(row);
};

// --- Чтение: публичная зона ----------------------------------------------------

export const listPublishedContentArticles = async (
  options: { type?: ContentArticleType; limit?: number } = {}
): Promise<ContentArticleListItem[]> => {
  const conditions = [
    eq(contentArticles.status, "published"),
    options.type ? eq(contentArticles.type, options.type) : undefined
  ].filter(Boolean);

  const rows = await db.query.contentArticles.findMany({
    where: and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])),
    with: { author: { columns: { displayName: true } } },
    orderBy: [desc(contentArticles.publishedAt)],
    limit: options.limit
  });
  return rows.map(mapListItem);
};

export const getPublishedContentArticleBySlug = async (slug: string): Promise<ContentArticleDto | null> => {
  const row = await db.query.contentArticles.findFirst({
    where: and(eq(contentArticles.slug, slug), eq(contentArticles.status, "published")),
    with: { author: { columns: { displayName: true } } }
  });
  return row ? mapDto(row) : null;
};

export const listFeaturedContentArticles = async (limit = 3): Promise<ContentArticleListItem[]> => {
  const rows = await db.query.contentArticles.findMany({
    where: and(eq(contentArticles.status, "published"), eq(contentArticles.isFeatured, true)),
    with: { author: { columns: { displayName: true } } },
    orderBy: [desc(contentArticles.publishedAt)],
    limit
  });
  return rows.map(mapListItem);
};

export const listPublishedContentArticlesByIds = async (ids: string[]): Promise<ContentArticleListItem[]> => {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db.query.contentArticles.findMany({
    where: and(eq(contentArticles.status, "published"), inArray(contentArticles.id, ids)),
    with: { author: { columns: { displayName: true } } }
  });
  return rows.map(mapListItem);
};
