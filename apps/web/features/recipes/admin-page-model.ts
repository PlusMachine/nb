import type { BadgeTone } from "@nb/ui";

import {
  countAdminBulkFailures,
  describeAdminBulkFailures,
  groupAdminBulkFailures,
  type AdminBulkFailure,
  type AdminBulkFailureGroup
} from "@/lib/admin-bulk";

import type { RecipePublicationState } from "./contracts";

// Модель списка /admin/recipes: статусы, лейблы, сортировки и разбор URL живут
// здесь (как в features/ingredients/admin-page-model.ts), чтобы страница и
// клиентский список не расходились и не тащили в бандл сервисный слой.

/**
 * Статус в админке — не то же самое, что publicationState: скрытие модератором
 * ортогонально публикации (скрыть можно и черновик). «Скрыт» перекрывает
 * остальные статусы, потому что для модератора это главный факт о рецепте.
 */
export const adminRecipeStatuses = ["published", "private", "draft", "hidden"] as const;
export type AdminRecipeStatus = (typeof adminRecipeStatuses)[number];

export const adminRecipeStatusFilters = ["all", ...adminRecipeStatuses] as const;
export type AdminRecipeStatusFilter = (typeof adminRecipeStatusFilters)[number];

export const adminRecipeStatusLabels: Record<AdminRecipeStatus, string> = {
  published: "Опубликован",
  private: "Приватный",
  draft: "Черновик",
  hidden: "Скрыт"
};

export const adminRecipeStatusFilterLabels: Record<AdminRecipeStatusFilter, string> = {
  all: "Все",
  published: "Опубликованные",
  private: "Приватные",
  draft: "Черновики",
  hidden: "Скрытые"
};

export const adminRecipeStatusTones: Record<AdminRecipeStatus, BadgeTone> = {
  published: "success",
  private: "neutral",
  draft: "neutral",
  hidden: "danger"
};

export const adminRecipeSorts = ["updated", "created", "rating", "title"] as const;
export type AdminRecipeSort = (typeof adminRecipeSorts)[number];

export const adminRecipeSortLabels: Record<AdminRecipeSort, string> = {
  updated: "По обновлению",
  created: "По дате создания",
  rating: "По рейтингу",
  title: "По названию"
};

export const defaultAdminRecipeSort: AdminRecipeSort = "updated";
export const adminRecipePageSizeOptions = [20, 50, 100];
export const defaultAdminRecipePageSize = 20;

export const HIDE_REASON_MIN_LENGTH = 3;
export const HIDE_REASON_MAX_LENGTH = 500;

/**
 * Почему рецепт не скрылся при массовом скрытии. Механика группировки — общая
 * с каталогом (@/lib/admin-bulk), домен задаёт только набор причин и подписи.
 */
export const recipeBulkFailureReasons = ["hidden", "missing", "failed"] as const;
export type RecipeBulkFailureReason = (typeof recipeBulkFailureReasons)[number];

export type RecipeBulkFailure = AdminBulkFailure<RecipeBulkFailureReason>;
export type RecipeBulkFailureGroup = AdminBulkFailureGroup<RecipeBulkFailureReason>;

export const recipeBulkFailureLabels: Record<RecipeBulkFailureReason, string> = {
  hidden: "Уже скрыты",
  missing: "Не найдены",
  failed: "Сбой при сохранении"
};

export const groupRecipeBulkFailures = (failures: RecipeBulkFailure[]): RecipeBulkFailureGroup[] => (
  groupAdminBulkFailures(recipeBulkFailureReasons, failures)
);

export const countRecipeBulkFailures = (failed: RecipeBulkFailureGroup[]): number => (
  countAdminBulkFailures(failed)
);

export const describeRecipeBulkFailures = (failed: RecipeBulkFailureGroup[]): string => (
  describeAdminBulkFailures(recipeBulkFailureLabels, failed)
);

export type AdminRecipeListItem = {
  id: string;
  slug: string;
  title: string;
  publicationState: RecipePublicationState;
  status: AdminRecipeStatus;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  hiddenByName: string | null;
  authorId: string;
  authorName: string;
  styleCode: string | null;
  styleName: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminRecipeStatusCounts = Record<AdminRecipeStatusFilter, number>;

export type AdminRecipesPage = {
  items: AdminRecipeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: AdminRecipeStatusCounts;
};

/** Статус строки списка: скрытие перекрывает состояние публикации. */
export const resolveAdminRecipeStatus = (recipe: {
  publicationState: RecipePublicationState;
  hiddenAt: Date | null;
}): AdminRecipeStatus => (recipe.hiddenAt != null ? "hidden" : recipe.publicationState);

export type AdminRecipesQuery = {
  q: string;
  status: AdminRecipeStatusFilter;
  sort: AdminRecipeSort;
  page: number;
  pageSize: number;
};

const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const parseAdminRecipesQuery = (
  params: Record<string, string | string[] | undefined>
): AdminRecipesQuery => {
  const status = firstParam(params.status);
  const sort = firstParam(params.sort);
  const pageSize = parsePositiveInt(firstParam(params.pageSize), defaultAdminRecipePageSize);

  return {
    q: (firstParam(params.q) ?? "").trim(),
    status: (adminRecipeStatusFilters as readonly string[]).includes(status ?? "")
      ? (status as AdminRecipeStatusFilter)
      : "all",
    sort: (adminRecipeSorts as readonly string[]).includes(sort ?? "")
      ? (sort as AdminRecipeSort)
      : defaultAdminRecipeSort,
    page: parsePositiveInt(firstParam(params.page), 1),
    pageSize: adminRecipePageSizeOptions.includes(pageSize) ? pageSize : defaultAdminRecipePageSize
  };
};

/** Ссылка списка с частично изменёнными параметрами (смена статуса/сорта сбрасывает страницу). */
export const buildAdminRecipesHref = (
  query: AdminRecipesQuery,
  patch: Partial<AdminRecipesQuery> = {}
): string => {
  const next: AdminRecipesQuery = { ...query, ...patch };
  const resetPage = patch.page === undefined && (patch.status !== undefined || patch.sort !== undefined || patch.q !== undefined);
  const params = new URLSearchParams();

  if (next.q) {
    params.set("q", next.q);
  }
  if (next.status !== "all") {
    params.set("status", next.status);
  }
  if (next.sort !== defaultAdminRecipeSort) {
    params.set("sort", next.sort);
  }
  if (next.pageSize !== defaultAdminRecipePageSize) {
    params.set("pageSize", String(next.pageSize));
  }
  const page = resetPage ? 1 : next.page;
  if (page > 1) {
    params.set("page", String(page));
  }

  const search = params.toString();
  return search ? `/admin/recipes?${search}` : "/admin/recipes";
};

/** Рейтинг для списка: «4.6 (12)» либо прочерк, если оценок нет. */
export const formatAdminRecipeRating = (recipe: { ratingAvg: number | null; ratingCount: number }): string =>
  recipe.ratingCount > 0 && recipe.ratingAvg != null
    ? `${recipe.ratingAvg.toFixed(1)} (${recipe.ratingCount})`
    : "—";
