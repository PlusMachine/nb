import {
  buildBjcpQueryVariants,
  foldBjcpSearchDiacritics,
  normalizeBjcpSearchText,
  scoreBjcpSearchText
} from "@nb/brewing-core";
import type { BjcpCatalogData } from "@nb/content";

/**
 * Компактный поисковый индекс стилей/семейств для клиентского пикера на `/recipes`.
 * Строится на сервере из `getBjcpCatalogData()` и содержит ровно поля, нужные для
 * фаззи-поиска и отображения — без контента статей (страница остаётся лёгкой).
 *
 * Поиск (`searchRecipeStyles`) — чистая функция: переиспользует те же
 * скоринг-примитивы `@nb/brewing-core`, что и умный поиск страницы BJCP.
 */

export type RecipeFamilyEntry = {
  id: string;
  nameRu: string;
  nameEn: string;
  styleCount: number;
  sortOrder: number;
};

export type RecipeStyleEntry = {
  code: string;
  title: string;
  titleEn: string;
  familyIds: string[];
  familyNameRu: string;
};

export type RecipeStyleSearchIndex = {
  families: RecipeFamilyEntry[];
  styles: RecipeStyleEntry[];
};

export type RecipeStyleSearchResult = {
  families: RecipeFamilyEntry[];
  styles: RecipeStyleEntry[];
};

const MIN_QUERY_LENGTH = 2;
const MAX_FAMILY_RESULTS = 4;
const MAX_STYLE_RESULTS = 8;

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

/** Компактный индекс из полного каталога BJCP (вызывается на сервере). */
export const buildRecipeStyleSearchIndex = (catalog: BjcpCatalogData): RecipeStyleSearchIndex => ({
  families: catalog.families.map((family) => ({
    id: family.id,
    nameRu: family.nameRu,
    nameEn: family.nameEn,
    styleCount: family.styleCount,
    sortOrder: family.sortOrder
  })),
  styles: catalog.styles.map((style) => ({
    code: style.bjcpId,
    title: style.title,
    titleEn: style.titleEn,
    familyIds: style.familyIds,
    familyNameRu: style.familyNameRu
  }))
});

const scoreFamilyEntry = (family: RecipeFamilyEntry, variants: string[]): number => {
  const aliases = [family.id, family.nameRu, family.nameEn];
  let score = 0;
  for (const variant of variants) {
    for (const candidate of aliases) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 700, 520, 320));
    }
  }
  return score;
};

const scoreStyleEntry = (style: RecipeStyleEntry, variants: string[]): number => {
  // Код (21A) — точное совпадение в приоритете; затем RU/EN-названия и семейство.
  let score = 0;
  for (const variant of variants) {
    score = Math.max(score, scoreBjcpSearchText(style.code, variant, 760, 560, 0));
    score = Math.max(score, scoreBjcpSearchText(style.title, variant, 700, 520, 320));
    score = Math.max(score, scoreBjcpSearchText(style.titleEn, variant, 680, 500, 300));
    score = Math.max(score, scoreBjcpSearchText(style.familyNameRu, variant, 520, 380, 220));
  }
  return score;
};

/**
 * Фаззи-поиск по индексу. Короткие запросы (<2 нормализованных символов) дают
 * пустой результат (как в подсказках BJCP). Результаты отсортированы по убыванию
 * скора, при равенстве — по коду/sortOrder; срезаны до топ-N.
 */
export const searchRecipeStyles = (
  query: string,
  index: RecipeStyleSearchIndex
): RecipeStyleSearchResult => {
  const trimmed = query.trim();
  if (normalizeBjcpSearchText(trimmed).length < MIN_QUERY_LENGTH) {
    return { families: [], styles: [] };
  }

  const variants = buildBjcpQueryVariants(foldBjcpSearchDiacritics(trimmed));

  const families = index.families
    .map((family) => ({ family, score: scoreFamilyEntry(family, variants) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.family.sortOrder - right.family.sortOrder)
    .slice(0, MAX_FAMILY_RESULTS)
    .map((entry) => entry.family);

  const styles = index.styles
    .map((style) => ({ style, score: scoreStyleEntry(style, variants) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || collator.compare(left.style.code, right.style.code))
    .slice(0, MAX_STYLE_RESULTS)
    .map((entry) => entry.style);

  return { families, styles };
};

/** Семейства в порядке отображения (по `sortOrder`) для списка-фильтра. */
export const orderedFamilies = (index: RecipeStyleSearchIndex): RecipeFamilyEntry[] =>
  [...index.families].sort((left, right) => left.sortOrder - right.sortOrder);

export type RecipeFamilyWithCount = RecipeFamilyEntry & { recipeCount: number };

/**
 * Семейства для списка-фильтра с числом рецептов на витрине (`familyId -> count`,
 * с сервера). Пустые семейства (0 рецептов) отброшены — не засоряем фильтр.
 */
export const orderedFamiliesWithCounts = (
  index: RecipeStyleSearchIndex,
  counts: Record<string, number>
): RecipeFamilyWithCount[] =>
  orderedFamilies(index)
    .map((family) => ({ ...family, recipeCount: counts[family.id] ?? 0 }))
    .filter((family) => family.recipeCount > 0);

/** Стиль по коду (для подписи выбранного стиля в поиске). */
export const findStyleByCode = (
  index: RecipeStyleSearchIndex,
  code: string | null
): RecipeStyleEntry | null => (code ? index.styles.find((entry) => entry.code === code) ?? null : null);
