import { pickHomeRecipes } from "./landing-model";
import { listFeaturedContentArticles } from "@/features/content-articles/service";
import type { ContentArticleListItem } from "@/features/content-articles/contracts";
import { parsePublicRecipeFilters } from "@/features/recipes/public-recipe-query";
import { getPublicRecipeById, getPublicRecipeFamilyCounts, listVisibleRecipeIds, searchPublicRecipes } from "@/features/recipes/service";
import type { PublicRecipeDetailDto, PublicRecipeListResult } from "@/features/recipes/contracts";

const HOME_CACHE_TTL_MS = 90 * 1000;

// Vitest мокает db на каждый тест независимо — процессный кэш пережил бы мок
// предыдущего теста и отдал бы чужие данные следующему (см. тот же приём в
// features/ingredients/service.ts).
const bypassCache = Boolean(process.env.VITEST);

type CacheSlot<T> = { value: T; loadedAt: number } | null;

const isFresh = (slot: CacheSlot<unknown>): slot is NonNullable<CacheSlot<unknown>> =>
  slot !== null && Date.now() - slot.loadedAt < HOME_CACHE_TTL_MS;

const createCache = () => ({
  familyCounts: null as CacheSlot<Record<string, number>>,
  latestRecipes: null as CacheSlot<PublicRecipeListResult>,
  featuredArticles: new Map<number, CacheSlot<ContentArticleListItem[]>>(),
  recipeDetails: new Map<string, CacheSlot<PublicRecipeDetailDto>>()
});

// Next bundles the homepage and the Server Actions as separate entry points.
// Sharing the process cache lets both entries see the same invalidation.
const runtime = globalThis as typeof globalThis & { __nbHomeDataCache?: ReturnType<typeof createCache> };
const getCache = () => bypassCache ? createCache() : (runtime.__nbHomeDataCache ??= createCache());

export const getHomePublicRecipeFamilyCounts = async (): Promise<Record<string, number>> => {
  const cache = getCache();
  if (isFresh(cache.familyCounts)) {
    return { ...cache.familyCounts.value };
  }
  const value = await getPublicRecipeFamilyCounts();
  cache.familyCounts = { value, loadedAt: Date.now() };
  return { ...value };
};

// Фиксированные фильтры «свежих» рецептов главной (те же, что раньше собирались
// прямо в page.tsx): newest, страница 1. Из 12 свежих выбираем 3 разных стиля. parsePublicRecipeFilters
// чистая (без БД) — считаем один раз при загрузке модуля.
const LATEST_RECIPES_FILTERS = {
  ...parsePublicRecipeFilters({}),
  sort: "newest" as const,
  page: 1,
  pageSize: 12
};

// Защитная копия (как у соседних обёрток): мутация items вызывающим кодом не
// должна отравлять кэш для следующих посетителей до истечения TTL.
const copyRecipeListResult = (value: PublicRecipeListResult): PublicRecipeListResult => ({
  ...value,
  items: value.items.slice()
});

export const getHomeLatestPublicRecipes = async (): Promise<PublicRecipeListResult> => {
  const cache = getCache();
  if (isFresh(cache.latestRecipes)) {
    return copyRecipeListResult(cache.latestRecipes.value);
  }
  const result = await searchPublicRecipes(LATEST_RECIPES_FILTERS);
  const value = { ...result, pageSize: 3, items: pickHomeRecipes(result.items) };
  cache.latestRecipes = { value, loadedAt: Date.now() };
  return copyRecipeListResult(value);
};

export const getHomePublicRecipeDetails = async (ids: string[]): Promise<PublicRecipeDetailDto[]> => {
  const { recipeDetails } = getCache();
  const candidates = ids.slice(0, 3);
  // A different instance can hide a recipe while this process holds its details.
  const visible = await listVisibleRecipeIds(candidates);
  const values = await Promise.all(candidates.filter(id => visible.has(id)).map(async (id) => {
    const cached = recipeDetails.get(id) ?? null;
    if (isFresh(cached)) return cached.value;
    try {
      // Only the public projection: no author notes, drafts or private versions.
      const value = await getPublicRecipeById(id);
      if (recipeDetails.size >= 3) recipeDetails.clear();
      recipeDetails.set(id, { value, loadedAt: Date.now() });
      return value;
    } catch (error) {
      if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) return null;
      throw error;
    }
  }));
  return values.filter((value): value is PublicRecipeDetailDto => value !== null);
};

export const getHomeFeaturedContentArticles = async (limit = 3): Promise<ContentArticleListItem[]> => {
  const { featuredArticles } = getCache();
  const cached = featuredArticles.get(limit) ?? null;
  if (isFresh(cached)) {
    return cached.value.slice();
  }
  const value = await listFeaturedContentArticles(limit);
  featuredArticles.set(limit, { value, loadedAt: Date.now() });
  return value.slice();
};

export const invalidateHomeDataCache = () => {
  // Requests already in flight retain the old slots until they finish.
  runtime.__nbHomeDataCache = undefined;
};
