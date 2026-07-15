import {
  beerStyleFixtures,
  buildBjcpLayoutQueryVariants,
  buildBjcpQueryVariants,
  foldBjcpSearchDiacritics,
  scoreBjcpStyle
} from "@nb/brewing-core";
import { getBjcpCatalogData } from "@nb/content";

import {
  defaultPublicRecipePageSize,
  maxPublicRecipePageSize,
  publicRecipeSorts,
  recipeMethods,
  type PublicRecipeFilters,
  type PublicRecipeSort,
  type RecipeMethod
} from "./contracts";

/**
 * Чистые (без БД) хелперы парсинга/резолвинга фильтров публичной витрины
 * `/recipes`. Тестируются изолированно; SQL-сборка живёт в service-слое.
 */

type RawSearchParams = Record<string, string | string[] | undefined>;

const firstString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

const parseTrimmed = (value: string | string[] | undefined, maxLength: number): string | undefined => {
  const raw = firstString(value)?.trim();
  if (!raw) {
    return undefined;
  }
  return raw.slice(0, maxLength);
};

const parseFiniteNumber = (value: string | string[] | undefined): number | undefined => {
  const raw = firstString(value);
  if (raw == null || raw.trim() === "") {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const clamp = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi);

const clampOptional = (value: number | undefined, lo: number, hi: number): number | undefined =>
  value == null ? undefined : clamp(value, lo, hi);

const parseRange = (
  rawMin: string | string[] | undefined,
  rawMax: string | string[] | undefined,
  lo: number,
  hi: number
): { min?: number; max?: number } => {
  let min = clampOptional(parseFiniteNumber(rawMin), lo, hi);
  let max = clampOptional(parseFiniteNumber(rawMax), lo, hi);
  if (min != null && max != null && min > max) {
    // Своп, чтобы перепутанные границы не давали пустой результат.
    [min, max] = [max, min];
  }
  return { min, max };
};

const parseMethods = (value: string | string[] | undefined): RecipeMethod[] | undefined => {
  const raw = Array.isArray(value) ? value.join(",") : value;
  if (!raw) {
    return undefined;
  }
  const allowed = new Set<string>(recipeMethods);
  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is RecipeMethod => allowed.has(part));
  const unique = [...new Set(parsed)];
  return unique.length ? unique : undefined;
};

const parseSort = (value: string | string[] | undefined): PublicRecipeSort => {
  const raw = firstString(value);
  return (publicRecipeSorts as readonly string[]).includes(raw ?? "")
    ? (raw as PublicRecipeSort)
    : "newest";
};

const parsePositiveInt = (value: string | string[] | undefined, fallback: number): number => {
  const parsed = parseFiniteNumber(value);
  if (parsed == null) {
    return fallback;
  }
  const int = Math.trunc(parsed);
  return int >= 1 ? int : fallback;
};

/**
 * Парсит `searchParams` страницы (`{ [k]: string | string[] | undefined }`) в
 * валидированный {@link PublicRecipeFilters} с дефолтами и клампами. Мусор и
 * вне-диапазонные значения тихо нормализуются — страница не падает.
 *
 * URL-контракт: q, family, style, colorMin/colorMax, abvMin/abvMax,
 * ibuMin/ibuMax, method (csv), sort, page, pageSize.
 */
export const parsePublicRecipeFilters = (searchParams: RawSearchParams = {}): PublicRecipeFilters => {
  const color = parseRange(searchParams.colorMin, searchParams.colorMax, 0, 80);
  const abv = parseRange(searchParams.abvMin, searchParams.abvMax, 0, 20);
  const ibu = parseRange(searchParams.ibuMin, searchParams.ibuMax, 0, 200);

  return {
    q: parseTrimmed(searchParams.q, 120),
    family: parseTrimmed(searchParams.family, 120),
    styleCode: parseTrimmed(searchParams.style, 64),
    colorMinSrm: color.min,
    colorMaxSrm: color.max,
    abvMin: abv.min,
    abvMax: abv.max,
    ibuMin: ibu.min,
    ibuMax: ibu.max,
    method: parseMethods(searchParams.method),
    sort: parseSort(searchParams.sort),
    page: parsePositiveInt(searchParams.page, 1),
    pageSize: clamp(parsePositiveInt(searchParams.pageSize, defaultPublicRecipePageSize), 1, maxPublicRecipePageSize)
  };
};

export type PublicRecipeSortKey = "updatedAt" | "abv" | "ibu" | "color" | "title" | "rating" | "saveCount";

export type PublicRecipeSortPlan = {
  key: PublicRecipeSortKey;
  direction: "asc" | "desc";
  /** Рейтинг: рецепты без оценок (rating_avg IS NULL) уходят в конец. */
  nullsLast?: boolean;
};

/**
 * Маппит `sort` в план сортировки (колонка + направление). `popular` →
 * save_count desc (число сохранений). `rating` (Phase D) → rating_avg desc
 * NULLS LAST. Вторичный ключ (updatedAt desc) добавляет service-слой для
 * стабильности.
 */
export const resolvePublicRecipeSort = (sort: PublicRecipeSort): PublicRecipeSortPlan => {
  switch (sort) {
    case "abv_desc":
      return { key: "abv", direction: "desc" };
    case "abv_asc":
      return { key: "abv", direction: "asc" };
    case "ibu_desc":
      return { key: "ibu", direction: "desc" };
    case "ibu_asc":
      return { key: "ibu", direction: "asc" };
    case "color_asc":
      return { key: "color", direction: "asc" };
    case "color_desc":
      return { key: "color", direction: "desc" };
    case "name":
      return { key: "title", direction: "asc" };
    case "rating": // Phase D — по среднему рейтингу, без оценок в конец
      return { key: "rating", direction: "desc", nullsLast: true };
    case "popular": // по числу сохранений («Избранные»); save_count NOT NULL → без nulls last
      return { key: "saveCount", direction: "desc" };
    case "newest":
    default:
      return { key: "updatedAt", direction: "desc" };
  }
};

export type PublicRecipePagination = {
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
};

export const resolvePagination = (page: number, pageSize: number): PublicRecipePagination => {
  const safePageSize = clamp(Math.trunc(pageSize) || defaultPublicRecipePageSize, 1, maxPublicRecipePageSize);
  const safePage = Math.max(1, Math.trunc(page) || 1);
  return {
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize,
    page: safePage,
    pageSize: safePageSize
  };
};

// Индекс styleKey/bjcpId/id -> [BeerStyle.id], построенный из статических фикстур.
let styleKeyIndex: Map<string, string[]> | null = null;

const buildStyleKeyIndex = (): Map<string, string[]> => {
  if (styleKeyIndex) {
    return styleKeyIndex;
  }
  const index = new Map<string, string[]>();
  const add = (key: string | null | undefined, id: string) => {
    if (!key) {
      return;
    }
    const existing = index.get(key) ?? [];
    if (!existing.includes(id)) {
      existing.push(id);
    }
    index.set(key, existing);
  };
  for (const style of beerStyleFixtures) {
    // styleKey (= full_bjcp_id) — мост к семействам /bjcp; bjcpId/id — запасные ключи.
    add(style.styleKey, style.id);
    add(style.bjcpId, style.id);
    add(style.id, style.id);
  }
  styleKeyIndex = index;
  return index;
};

/**
 * Резолвит фильтр по семейству/стилю в набор значений `recipes.styleId`
 * (id фикстур brewing-core) для SQL `WHERE styleId IN (...)`.
 *
 * - Семейства берутся из `getBjcpCatalogData()` — тот же словарь, что на `/bjcp`.
 * - Возвращает `null`, если ни семейство, ни стиль не заданы (фильтр не нужен).
 * - Возвращает `[]`, если фильтр задан, но ничего не сматчилось (неизвестное
 *   семейство) → витрина показывает пусто, не падает.
 */
export const resolveStyleScope = async (
  filters: Pick<PublicRecipeFilters, "family" | "styleCode">
): Promise<string[] | null> => {
  const hasFamily = Boolean(filters.family);
  const hasStyle = Boolean(filters.styleCode);
  if (!hasFamily && !hasStyle) {
    return null;
  }

  const keys = new Set<string>();
  if (filters.styleCode) {
    keys.add(filters.styleCode);
  }
  if (filters.family) {
    const catalog = await getBjcpCatalogData();
    const family = catalog.families.find((entry) => entry.id === filters.family);
    if (family) {
      for (const key of family.styleIds) {
        keys.add(key);
      }
      for (const key of family.crossListedStyleIds ?? []) {
        keys.add(key);
      }
    }
  }

  const index = buildStyleKeyIndex();
  const ids = new Set<string>();
  for (const key of keys) {
    for (const id of index.get(key) ?? []) {
      ids.add(id);
    }
  }
  return [...ids];
};

/**
 * Строит карту `familyId -> recipes.styleId[]` (id фикстур brewing-core) для всех
 * семейств каталога — обратная сторона {@link resolveStyleScope}. Используется для
 * подсчёта числа рецептов в каждом семействе (показ/скрытие пустых табов фильтра).
 */
export const resolveFamilyStyleScopes = async (): Promise<Map<string, string[]>> => {
  const catalog = await getBjcpCatalogData();
  const index = buildStyleKeyIndex();
  const scopes = new Map<string, string[]>();

  for (const family of catalog.families) {
    const keys = new Set<string>();
    for (const key of family.styleIds) {
      keys.add(key);
    }
    for (const key of family.crossListedStyleIds ?? []) {
      keys.add(key);
    }

    const ids = new Set<string>();
    for (const key of keys) {
      for (const id of index.get(key) ?? []) {
        ids.add(id);
      }
    }
    scopes.set(family.id, [...ids]);
  }

  return scopes;
};

export type TextSearchScope = {
  /** Нормализованные варианты запроса (транслит + curated-словарь) для ilike по title/автору. */
  titleVariants: string[];
  /** recipes.styleId[], уверенно сматченные термином запроса на стиль (код/алиасы/название). */
  styleIds: string[];
};

// Ниже этого порога скор даёт только семейство/категория/бейдж стиля (см.
// scoreBjcpStyle: их потолок — 420/380/260) — слишком шумно для матча
// «запрос -> стиль». 700 отсекает эти уровни, но пропускает contains-хиты по
// коду/алиасам/названию стиля (потолок exact-тира — 720), т.е. настоящие
// «вайцен» → 10A, а не любое случайное слово.
const CONFIDENT_STYLE_MATCH_SCORE = 700;
const MAX_TEXT_SEARCH_STYLE_MATCHES = 6;
// Ф3 (P1 ревью) + Ф8 (регрессия волны 4, живой прогон): короткие запросы
// («и», «s») не должны расширяться вообще — ни в сторону стиля (prefix-скоринг
// в scoreBjcpStyle не имеет нижнего порога длины сам по себе: «и» ->
// ['2A','2B','2C','15A','15B','15C']), ни в сторону title-вариантов
// (buildBjcpQueryVariants транслитерирует «и» в «i», и ilike '%i%' по
// title/author матчит почти все рецепты). Ниже этого порога — никакой
// экспансии: titleVariants = [trimmed], styleIds = [].
const MIN_QUERY_EXPANSION_LENGTH = 3;
// Ф6 (P2 ревью): общий кап на суммарный набор вариантов title (включая
// раскладочный фолбэк includeLayoutVariants второго прохода) — без него
// OR-цепочка ilike может неограниченно разрастись.
const MAX_TITLE_VARIANTS = 16;

/**
 * Резолвит текстовый поиск `?q=` витрины `/recipes`: варианты запроса (транслит +
 * curated-словарь из `@nb/brewing-core`, те же, что и умный поиск `/bjcp`) для
 * ilike по названию/автору, плюс `recipes.styleId`, уверенно сматченные термином
 * запроса на стиль (напр. «вайцен» → 10A через styleAliasMap).
 *
 * `includeLayoutVariants` — раскладочный фолбэк («gbkcyth» = «пилснер» на
 * латинской раскладке): строго опционален, вызывающая сторона включает его
 * только вторым проходом при нуле результатов первого (см. searchPublicRecipes).
 *
 * Пустой `q` — no-op без похода в каталог BJCP (в отличие от `resolveStyleScope`,
 * которому каталог нужен для семейств — тут фильтровать нечего).
 */
export const resolveTextSearchScope = async (
  q: string | undefined,
  options: { includeLayoutVariants?: boolean } = {}
): Promise<TextSearchScope> => {
  const trimmed = q?.trim();
  if (!trimmed) {
    return { titleVariants: [], styleIds: [] };
  }

  // Ниже порога — буквальный trimmed и точка, см. комментарий у константы.
  if (trimmed.length < MIN_QUERY_EXPANSION_LENGTH) {
    return { titleVariants: [trimmed], styleIds: [] };
  }

  const folded = foldBjcpSearchDiacritics(trimmed);
  const titleVariants = new Set<string>(buildBjcpQueryVariants(folded));
  if (options.includeLayoutVariants) {
    for (const variant of buildBjcpLayoutQueryVariants(folded)) {
      titleVariants.add(variant);
    }
  }

  const styleIds = new Set<string>();
  {
    const variants = [...titleVariants];
    const catalog = await getBjcpCatalogData();
    const index = buildStyleKeyIndex();

    const confidentStyles = catalog.styles
      .map((style) => ({ style, score: scoreBjcpStyle(style, trimmed, { variants }) }))
      .filter((entry) => entry.score >= CONFIDENT_STYLE_MATCH_SCORE)
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_TEXT_SEARCH_STYLE_MATCHES);

    for (const { style } of confidentStyles) {
      for (const id of index.get(style.bjcpId) ?? []) {
        styleIds.add(id);
      }
    }
  }

  // Ф4 (P1 ревью): чисто пунктуационный запрос длиной ≥3 («???», «...») схлопывается
  // нормализацией в пустой набор titleVariants, а styleIds тоже пуст — но раз
  // пользователь что-то ввёл, текстовое условие не должно молча пропадать
  // (иначе `buildTextSearchCondition` вернёт null и поиск отдаст ВСЕ рецепты).
  // Буквальный trimmed q как единственный вариант — прежнее поведение голого ilike.
  // (Короткая пунктуация вроде «-» уже отсечена гейтом MIN_QUERY_EXPANSION_LENGTH выше.)
  if (titleVariants.size === 0 && styleIds.size === 0) {
    titleVariants.add(trimmed);
  }

  const cappedVariants = [...titleVariants].slice(0, MAX_TITLE_VARIANTS);

  return { titleVariants: cappedVariants, styleIds: [...styleIds] };
};
