import {
  contentArticleStatuses,
  type ContentArticleListItem,
  type ContentArticleStatus
} from "./contracts";

export const adminArticlesPageSizeOptions = [20, 50, 100] as const;
export const defaultAdminArticlesPageSize = 20;

export type AdminArticlesPageParams = {
  q: string;
  status: ContentArticleStatus | undefined;
  page: number;
  pageSize: number;
};

export type AdminArticlesPage = {
  items: ContentArticleListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const readParam = (value: string | string[] | undefined): string | undefined => (
  typeof value === "string" ? value : undefined
);

export const parseContentArticleStatus = (
  value: string | undefined
): ContentArticleStatus | undefined => (
  contentArticleStatuses.includes(value as ContentArticleStatus)
    ? value as ContentArticleStatus
    : undefined
);

export const parseAdminArticlesPageParams = (
  params: Record<string, string | string[] | undefined>
): AdminArticlesPageParams => {
  const page = Number(readParam(params.page) ?? "1");
  const pageSize = Number(readParam(params.pageSize) ?? "");

  return {
    q: (readParam(params.q) ?? "").trim(),
    status: parseContentArticleStatus(readParam(params.status)),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: (adminArticlesPageSizeOptions as readonly number[]).includes(pageSize)
      ? pageSize
      : defaultAdminArticlesPageSize
  };
};

export const buildAdminArticlesHref = (
  pathname: string,
  {
    q = "",
    status = "all",
    page = 1,
    pageSize = defaultAdminArticlesPageSize
  }: {
    q?: string;
    status?: ContentArticleStatus | "all";
    page?: number;
    pageSize?: number;
  }
) => {
  const params = new URLSearchParams();
  const trimmed = q.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (pageSize !== defaultAdminArticlesPageSize) {
    params.set("pageSize", String(pageSize));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const countAdminArticlesByStatus = (
  items: ContentArticleListItem[]
): Record<ContentArticleStatus, number> => {
  const counts = { draft: 0, published: 0, archived: 0 } as Record<ContentArticleStatus, number>;
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
};

/** Поиск идёт по заголовку, слагу и автору — именно по ним ищут статью в списке. */
export const filterAdminArticles = (
  items: ContentArticleListItem[],
  q: string
): ContentArticleListItem[] => {
  const needle = q.trim().toLocaleLowerCase("ru");
  if (!needle) {
    return items;
  }

  return items.filter((item) => (
    item.title.toLocaleLowerCase("ru").includes(needle)
    || item.slug.toLocaleLowerCase("ru").includes(needle)
    || (item.authorName ?? "").toLocaleLowerCase("ru").includes(needle)
  ));
};

export const paginateAdminArticles = (
  items: ContentArticleListItem[],
  page: number,
  pageSize: number
): AdminArticlesPage => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages
  };
};
