import { getBeerStyleById } from "@nb/brewing-core";
import { listArticles } from "@nb/content";
import { revalidatePath } from "next/cache";

import { invalidateHomeDataCache } from "@/features/home/home-data-cache";

type PublicRecipePath = { slug: string; styleId: string | null };

/**
 * Страницы стилей, где рецепт живёт карточкой. `/bjcp/[slug]` держит ISR
 * (revalidate = 3600) и рендерит карточки серверно, а клиентский провайдер при
 * непустом initial сознательно не перезапрашивает — без явной ревалидации
 * скрытый рецепт остаётся на странице стиля до часа.
 *
 * Один BJCP-код может стоять у нескольких статей (21B — три подстиля), а блок
 * рецептов фильтруется именно по коду, поэтому ревалидируем все статьи с этим
 * кодом, а не одну.
 */
const resolveStylePagePaths = async (recipes: PublicRecipePath[]): Promise<string[]> => {
  const styleCodes = new Set<string>();
  for (const recipe of recipes) {
    // Стиль у рецепта опционален — публикация без BJCP-стиля разрешена.
    const bjcpId = getBeerStyleById(recipe.styleId)?.bjcpId;
    if (bjcpId) {
      styleCodes.add(bjcpId);
    }
  }

  if (styleCodes.size === 0) {
    return [];
  }

  const articles = await listArticles();
  return articles
    .filter((article) => styleCodes.has(article.bjcpId))
    .map((article) => `/bjcp/${article.slug}`);
};

/** Публичные поверхности скрытого/возвращённого рецепта: витрина, деталка, гостевая страница пива, страница стиля, sitemap. */
export const revalidatePublicRecipePages = async (recipes: PublicRecipePath[]) => {
  if (recipes.length === 0) return;
  revalidatePath("/recipes");
  revalidatePath("/");
  // Лента и счётчики главной живут в процессном TTL-слоте, а не в Next-кэше:
  // revalidatePath("/") его не сбрасывает (см. features/home/home-data-cache.ts).
  invalidateHomeDataCache();
  for (const slug of new Set(recipes.map(recipe => recipe.slug))) {
    revalidatePath(`/recipes/${slug}`);
    revalidatePath(`/beer/${slug}`);
  }
  for (const path of await resolveStylePagePaths(recipes)) {
    revalidatePath(path);
  }
};
