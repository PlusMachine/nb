"use server";

// =============================================================================
//  features/devices/search-public-recipes-for-device-action.ts
//  Тонкая обёртка над searchPublicRecipes для вкладки «Найти рецепт» пикера
//  «Сварить рецепт…» на пульте устройства (W5, редизайн L2 §7). Публичные
//  рецепты, лёгкий DTO, без пагинации/фасетов — только то, что нужно списку
//  выбора (limit ≤10).
// =============================================================================
import { searchPublicRecipes } from "@/features/recipes/service";

const SEARCH_LIMIT = 10;

export type DevicePickableRecipe = {
  id: string;
  title: string;
  authorName: string | null;
  abv: number | null;
};

export async function searchPublicRecipesForDeviceAction(query: string): Promise<DevicePickableRecipe[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const result = await searchPublicRecipes({
    q: trimmed,
    sort: "popular",
    page: 1,
    pageSize: SEARCH_LIMIT
  });

  return result.items.map((item) => ({
    id: item.id,
    title: item.name,
    authorName: item.author.displayName,
    abv: item.abv
  }));
}
