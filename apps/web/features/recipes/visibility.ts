import { eq, isNull, recipes } from "@nb/db";

// Единственное место, где живёт правило «рецепт виден публично»: опубликован И
// не скрыт модератором. Скрытие (recipes.hidden_at) ортогонально публикации:
// автор не снимает метку, сняв рецепт с публикации и опубликовав заново.
// Свой рецепт автор видит в рабочей зоне всегда — гейт касается только
// публичных путей (витрина, страница рецепта, sitemap, наклейки, /beer, фото).

export type RecipeVisibility = {
  publicationState: string;
  hiddenAt: Date | null;
};

export const isRecipeHidden = (recipe: { hiddenAt: Date | null }): boolean => recipe.hiddenAt != null;

export const isRecipePubliclyVisible = (recipe: RecipeVisibility): boolean =>
  recipe.publicationState === "published" && recipe.hiddenAt == null;

/** То же правило в SQL — для публичных выборок: `and(...publiclyVisibleRecipeConditions())`. */
export const publiclyVisibleRecipeConditions = () => [
  eq(recipes.publicationState, "published"),
  isNull(recipes.hiddenAt)
];
