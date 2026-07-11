/**
 * Клиент-безопасные (без БД/каталога/фикстур) хелперы для URL/cookie-driven
 * тулбара галереи «Мои рецепты» (`/app/recipes`, включая режим `?intent=brew`).
 * По образцу {@link mergeRecipeQuery} витрины `/recipes` (`recipes-url.ts`), но
 * проще: галерея грузит рецепты целиком и фильтрует их локально, поэтому
 * URL/cookie здесь — только персистентность выбора между заходами и шэрность
 * ссылки, а не источник данных для SQL.
 *
 * - Вид (grid/list) — в cookie {@link MY_RECIPES_VIEW_COOKIE}.
 * - Поиск/сортировка/статус — в query (`q`, `sort`, `status`); галерея зеркалит
 *   их туда через `window.history.replaceState` (без серверного раунд-трипа).
 *
 * Импортируется и сервером (`content.tsx` парсит searchParams в initial-пропы
 * галереи), и клиентом (сама галерея парсит их же для парности) — модуль не
 * должен тянуть next/headers и прочие серверные API.
 */

export type ViewMode = "grid" | "list";
export const MY_RECIPES_VIEW_COOKIE = "nb_my_recipes_view";
export const parseMyRecipesView = (value: string | null | undefined): ViewMode | null =>
  value === "list" ? "list" : value === "grid" ? "grid" : null;

export type SortMode = "updated" | "brewable" | "name" | "abv" | "ibu";
const SORT_MODES: readonly SortMode[] = ["updated", "brewable", "name", "abv", "ibu"];

export type StatusFilter = "all" | "published" | "private";
const STATUS_FILTERS: readonly StatusFilter[] = ["all", "published", "private"];

const firstValue = (value: string | string[] | null | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : null;
};

/** Свободный поиск по названию/стилю — пустая строка, если параметра нет. */
export const parseMyRecipesQuery = (value: string | string[] | null | undefined): string => firstValue(value) ?? "";

/**
 * Сортировка галереи из query. Мусор/отсутствие параметра → `null` — дефолт
 * зависит от режима (`updated` в управлении / `brewable` при варке), поэтому
 * решает вызывающая сторона, а не этот парсер.
 */
export const parseMyRecipesSort = (value: string | string[] | null | undefined): SortMode | null => {
  const raw = firstValue(value);
  return raw && (SORT_MODES as readonly string[]).includes(raw) ? (raw as SortMode) : null;
};

/** Фильтр по статусу публикации из query. Мусор/отсутствие параметра → `null` (дефолт — `"all"`). */
export const parseMyRecipesStatus = (value: string | string[] | null | undefined): StatusFilter | null => {
  const raw = firstValue(value);
  return raw && (STATUS_FILTERS as readonly string[]).includes(raw) ? (raw as StatusFilter) : null;
};

/**
 * Чистая функция merge'а q/sort/status в query-строку — по образцу
 * {@link mergeRecipeQuery} витрины `/recipes` (`recipes-url.ts`), но без
 * пагинации/сброса страницы: галерея не серверная, объединяет только эти три
 * поля. `currentSearch` — «живой» `window.location.search` (с `?` или без —
 * `URLSearchParams` понимает оба варианта), посторонние параметры (в первую
 * очередь `intent=brew`) переносятся как есть. Дефолтные значения (пустой `q`
 * после `trim`, `sort === defaultSort`, `status === "all"`) в результат не
 * попадают. Возвращает строку без ведущего `?` (`""`, если параметров нет).
 */
export const mergeMyRecipesQuery = (
  currentSearch: string,
  next: { q: string; sort: SortMode; status: StatusFilter },
  defaultSort: SortMode
): string => {
  const params = new URLSearchParams(currentSearch);

  if (next.q.trim() === "") {
    params.delete("q");
  } else {
    params.set("q", next.q);
  }

  if (next.sort === defaultSort) {
    params.delete("sort");
  } else {
    params.set("sort", next.sort);
  }

  if (next.status === "all") {
    params.delete("status");
  } else {
    params.set("status", next.status);
  }

  return params.toString();
};
