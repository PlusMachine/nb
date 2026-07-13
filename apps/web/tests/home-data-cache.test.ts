import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Слоты главной (features/home/home-data-cache.ts) — процессный TTL-кэш мимо Next-кэша:
// revalidatePath("/") его не сбрасывает, поэтому модерация обязана звать
// invalidateHomeDataCache() — иначе скрытый рецепт остаётся в ленте и счётчиках до 90 с.
// Сам кэш в vitest намеренно выключен (bypassCache = process.env.VITEST), поэтому модуль
// поднимаем заново с погашенным флагом — иначе тест кэша проверял бы его отсутствие.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  searchPublicRecipes: vi.fn(),
  getPublicRecipeFamilyCounts: vi.fn(),
  listFeaturedContentArticles: vi.fn()
}));

vi.mock("@/features/recipes/service", () => ({
  searchPublicRecipes: mocks.searchPublicRecipes,
  getPublicRecipeFamilyCounts: mocks.getPublicRecipeFamilyCounts
}));

vi.mock("@/features/content-articles/service", () => ({
  listFeaturedContentArticles: mocks.listFeaturedContentArticles
}));

const recipeList = (title: string) => ({
  items: [{ id: "r-1", title }],
  total: 1,
  page: 1,
  pageSize: 3,
  totalPages: 1
});

const loadHomeCache = async () => {
  vi.stubEnv("VITEST", "");
  vi.resetModules();
  return await import("../features/home/home-data-cache");
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.searchPublicRecipes.mockResolvedValue(recipeList("Скрытая IPA"));
  mocks.getPublicRecipeFamilyCounts.mockResolvedValue({ ipa: 3 });
  mocks.listFeaturedContentArticles.mockResolvedValue([{ id: "a-1", slug: "kak-svarit-pervoe-pivo" }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("features/home/home-data-cache", () => {
  it("лента и счётчики берутся из слота, пока он свеж", async () => {
    const cache = await loadHomeCache();

    await cache.getHomeLatestPublicRecipes();
    await cache.getHomeLatestPublicRecipes();
    await cache.getHomePublicRecipeFamilyCounts();
    await cache.getHomePublicRecipeFamilyCounts();

    expect(mocks.searchPublicRecipes).toHaveBeenCalledTimes(1);
    expect(mocks.getPublicRecipeFamilyCounts).toHaveBeenCalledTimes(1);
  });

  it("invalidateHomeDataCache сбрасывает слоты: скрытый рецепт пропадает из ленты сразу, а не через 90 с", async () => {
    const cache = await loadHomeCache();

    const before = await cache.getHomeLatestPublicRecipes();
    expect(before.items).toHaveLength(1);

    // Модератор скрыл рецепт: свежая выборка его уже не возвращает.
    mocks.searchPublicRecipes.mockResolvedValue({ ...recipeList("Скрытая IPA"), items: [], total: 0 });
    mocks.getPublicRecipeFamilyCounts.mockResolvedValue({});

    expect((await cache.getHomeLatestPublicRecipes()).items).toHaveLength(1);

    cache.invalidateHomeDataCache();

    expect((await cache.getHomeLatestPublicRecipes()).items).toHaveLength(0);
    expect(await cache.getHomePublicRecipeFamilyCounts()).toEqual({});
    expect(mocks.searchPublicRecipes).toHaveBeenCalledTimes(2);
  });

  it("сброс задевает и слот статей (ключ по limit), а не только рецептные", async () => {
    const cache = await loadHomeCache();

    await cache.getHomeFeaturedContentArticles(3);
    await cache.getHomeFeaturedContentArticles(3);
    expect(mocks.listFeaturedContentArticles).toHaveBeenCalledTimes(1);

    cache.invalidateHomeDataCache();
    await cache.getHomeFeaturedContentArticles(3);

    expect(mocks.listFeaturedContentArticles).toHaveBeenCalledTimes(2);
  });
});
