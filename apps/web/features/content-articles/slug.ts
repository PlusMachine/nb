import { appendSlugSuffix, toRecipeSlugBase } from "../recipes/slug";

// Переиспользуем транслитерацию/санитайзинг рецептов; меняем только дефолт пустого
// слага ("recipe" → "article"). Реальные заголовки дают "recipe" только из
// пустого/мусорного ввода, так что подмена безопасна.
export const toContentArticleSlugBase = (title: string): string => {
  const base = toRecipeSlugBase(title);
  return base === "recipe" ? "article" : base;
};

export { appendSlugSuffix };
