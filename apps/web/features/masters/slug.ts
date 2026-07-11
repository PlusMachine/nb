import { appendSlugSuffix, toRecipeSlugBase } from "../recipes/slug";

// Переиспользуем транслитерацию/санитайзинг рецептов (см. features/content-articles/slug.ts
// для того же паттерна); меняем только дефолт пустого слага ("recipe" → "master").
export const toMasterSlugBase = (title: string): string => {
  const base = toRecipeSlugBase(title);
  return base === "recipe" ? "master" : base;
};

export { appendSlugSuffix };
