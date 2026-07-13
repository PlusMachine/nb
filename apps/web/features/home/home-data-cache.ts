import { listFeaturedContentArticles } from "@/features/content-articles/service";
import type { ContentArticleListItem } from "@/features/content-articles/contracts";
import { parsePublicRecipeFilters } from "@/features/recipes/public-recipe-query";
import { getPublicRecipeFamilyCounts, searchPublicRecipes } from "@/features/recipes/service";
import type { PublicRecipeListResult } from "@/features/recipes/contracts";

/**
 * Процессный in-memory TTL-кэш горячих выборок анонимной главной
 * (app/(public)/page.tsx): счётчики семейств рецептов, лента «новых»
 * публичных рецептов и подборка featured-статей. Все три запроса выполняются
 * заново на КАЖДЫЙ анонимный хит одним и тем же кодом (без персонализации —
 * залогиненных редиректит в /app раньше), поэтому короткий TTL безопасен.
 *
 * Паттерн — как у catalogCache в features/ingredients/service.ts:340 (та же
 * причина отказа от unstable_cache: сериализация не нужна, Date остаются
 * Date). Сами сервисы (features/recipes/service.ts,
 * features/content-articles/service.ts) НЕ трогаем — они общие с другими
 * зонами (рецепты, админка статей); кэш — только внешняя обёртка для вызовов
 * главной.
 *
 * Кэш процессный: invalidateHomeDataCache() чистит слоты только текущего
 * процесса — при нескольких Node-инстансах остальные держат старые данные до
 * истечения TTL. Для витринных счётчиков/ленты это приемлемо, строгой
 * межпроцессной консистентности здесь нет.
 */
const HOME_CACHE_TTL_MS = 90 * 1000;

// Vitest мокает db на каждый тест независимо — процессный кэш пережил бы мок
// предыдущего теста и отдал бы чужие данные следующему (см. тот же приём в
// features/ingredients/service.ts).
const bypassCache = Boolean(process.env.VITEST);

type CacheSlot<T> = { value: T; loadedAt: number } | null;

const isFresh = (slot: CacheSlot<unknown>): slot is NonNullable<CacheSlot<unknown>> =>
  slot !== null && Date.now() - slot.loadedAt < HOME_CACHE_TTL_MS;

let familyCountsSlot: CacheSlot<Record<string, number>> = null;

export const getHomePublicRecipeFamilyCounts = async (): Promise<Record<string, number>> => {
  if (!bypassCache && isFresh(familyCountsSlot)) {
    return { ...familyCountsSlot.value };
  }
  const value = await getPublicRecipeFamilyCounts();
  if (!bypassCache) {
    familyCountsSlot = { value, loadedAt: Date.now() };
  }
  return { ...value };
};

// Фиксированные фильтры «свежих» рецептов главной (те же, что раньше собирались
// прямо в page.tsx): newest, страница 1, 3 карточки. parsePublicRecipeFilters
// чистая (без БД) — считаем один раз при загрузке модуля.
const LATEST_RECIPES_FILTERS = {
  ...parsePublicRecipeFilters({}),
  sort: "newest" as const,
  page: 1,
  pageSize: 3
};

let latestRecipesSlot: CacheSlot<PublicRecipeListResult> = null;

// Защитная копия (как у соседних обёрток): мутация items вызывающим кодом не
// должна отравлять кэш для следующих посетителей до истечения TTL.
const copyRecipeListResult = (value: PublicRecipeListResult): PublicRecipeListResult => ({
  ...value,
  items: value.items.slice()
});

export const getHomeLatestPublicRecipes = async (): Promise<PublicRecipeListResult> => {
  if (!bypassCache && isFresh(latestRecipesSlot)) {
    return copyRecipeListResult(latestRecipesSlot.value);
  }
  const value = await searchPublicRecipes(LATEST_RECIPES_FILTERS);
  if (!bypassCache) {
    latestRecipesSlot = { value, loadedAt: Date.now() };
  }
  return copyRecipeListResult(value);
};

// Ключ по limit (не только 3) — на случай, если функцию позже переиспользуют
// с другим лимитом; отдельная главная всегда зовёт с одним и тем же значением.
const featuredArticlesSlots = new Map<number, CacheSlot<ContentArticleListItem[]>>();

export const getHomeFeaturedContentArticles = async (limit = 3): Promise<ContentArticleListItem[]> => {
  const cached = featuredArticlesSlots.get(limit) ?? null;
  if (!bypassCache && isFresh(cached)) {
    return cached.value.slice();
  }
  const value = await listFeaturedContentArticles(limit);
  if (!bypassCache) {
    featuredArticlesSlots.set(limit, { value, loadedAt: Date.now() });
  }
  return value.slice();
};

/**
 * Сброс слотов после модерации (скрытие/возврат/удаление рецепта, «Выбор
 * редакции»). Обязателен: слоты живут в памяти процесса, и `revalidatePath("/")`
 * их не видит — без явного сброса скрытый рецепт остаётся в ленте и счётчиках
 * главной до истечения TTL.
 */
export const invalidateHomeDataCache = () => {
  familyCountsSlot = null;
  latestRecipesSlot = null;
  featuredArticlesSlots.clear();
};
