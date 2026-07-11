import {
  MIN_RATED_RECIPES_FOR_SORT,
  MIN_SAVED_RECIPES_FOR_SORT,
  type PublicRecipeSort,
  type PublicRecipeSortAvailability
} from "./contracts";

/**
 * Клиент-безопасные (без БД/каталога/фикстур) хелперы для URL-driven контролов
 * витрины `/recipes`. Имена query-ключей — РОВНО по контракту
 * {@link parsePublicRecipeFilters} (`public-recipe-query.ts`): q, family, style,
 * colorMin/colorMax, abvMin/abvMax, ibuMin/ibuMax, sort, page, pageSize.
 *
 * Импортируется только в клиентские компоненты — НЕ тянуть сюда тяжёлые
 * серверные модули (@nb/content, beerStyleFixtures).
 */

/** Дефолтные значения, которые НЕ должны попадать в URL. */
export const recipeFilterDefaults = {
  sort: "newest",
  page: "1"
} as const;

/** Рабочие опции сортировки (popular = по числу сохранений; rating — по среднему рейтингу). */
export const recipeSortOptions: { value: PublicRecipeSort; label: string }[] = [
  { value: "newest", label: "Сначала новые" },
  { value: "popular", label: "Популярные" },
  { value: "rating", label: "По рейтингу" },
  { value: "abv_desc", label: "Крепче" },
  { value: "abv_asc", label: "Слабее" },
  { value: "ibu_desc", label: "Горше" },
  { value: "ibu_asc", label: "Мягче" },
  { value: "color_asc", label: "Светлее" },
  { value: "color_desc", label: "Темнее" },
  { value: "name", label: "По алфавиту" }
];

/**
 * Отфильтровывает опции сортировки под наличие данных (count-conditional): пока
 * оценённых/сохранённых рецептов меньше порога, «По рейтингу»/«Популярные» не
 * показываем — на холодном старте они дали бы пустой/случайный порядок.
 *
 * `activeSort` всегда остаётся в списке, даже если подпороговый: пользователь мог
 * прийти по прямой ссылке (`?sort=rating` со страницы стиля), и селект не должен
 * показывать «пустой» выбор. URL-парсер (`parseSort`) пороги не проверяет —
 * ссылки работают независимо от витрины.
 */
export const resolveVisibleSortOptions = (
  availability: PublicRecipeSortAvailability,
  activeSort: PublicRecipeSort
): { value: PublicRecipeSort; label: string }[] => {
  const gatedOut = (value: PublicRecipeSort): boolean => {
    if (value === activeSort) {
      return false;
    }
    if (value === "rating") {
      return availability.ratedRecipes < MIN_RATED_RECIPES_FOR_SORT;
    }
    if (value === "popular") {
      return availability.savedRecipes < MIN_SAVED_RECIPES_FOR_SORT;
    }
    return false;
  };
  return recipeSortOptions.filter((option) => !gatedOut(option.value));
};

type QueryPatch = Record<string, string | null>;

const stripDefaults = (params: URLSearchParams): void => {
  if (params.get("sort") === recipeFilterDefaults.sort) {
    params.delete("sort");
  }
  if (params.get("page") === recipeFilterDefaults.page) {
    params.delete("page");
  }
};

/**
 * Применяет частичный патч к текущему query и возвращает нормализованную
 * query-строку (без ведущего `?`).
 *
 * - `null`/пустая строка в патче → ключ удаляется (используется для снятия чипа);
 * - прочие ключи текущего query сохраняются (мерж, не перезапись);
 * - `resetPage` (по умолчанию `true`) сбрасывает `page`, если он не задан в самом
 *   патче — любое изменение фильтра/поиска/сортировки возвращает на 1-ю страницу;
 *   для пагинации передавать `{ resetPage: false }`;
 * - дефолтные значения (`sort=newest`, `page=1`) в URL не пишутся.
 */
export const mergeRecipeQuery = (
  current: URLSearchParams,
  patch: QueryPatch,
  opts: { resetPage?: boolean } = {}
): string => {
  const { resetPage = true } = opts;
  const params = new URLSearchParams(current.toString());

  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  if (resetPage && !("page" in patch)) {
    params.delete("page");
  }

  stripDefaults(params);
  return params.toString();
};

const filterDimensions: string[][] = [
  ["q"],
  ["family"],
  ["style"],
  ["colorMin", "colorMax"],
  ["abvMin", "abvMax"],
  ["ibuMin", "ibuMax"]
];

/**
 * Число активных смысловых фильтров (для бейджа на мобильной кнопке «Фильтры»).
 * Каждое измерение (поиск, семейство, стиль, цвет, ABV, IBU) считается один раз;
 * sort/page/pageSize не учитываются.
 */
export const countActiveRecipeFilters = (params: URLSearchParams): number =>
  filterDimensions.reduce((total, keys) => {
    const active = keys.some((key) => {
      const value = params.get(key);
      return value != null && value !== "";
    });
    return total + (active ? 1 : 0);
  }, 0);
