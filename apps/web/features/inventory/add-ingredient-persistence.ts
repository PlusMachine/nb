import type { IngredientCategory } from "@/features/ingredients/contracts";

export type StoredAddIngredientCategoryValue = IngredientCategory | "malt" | "fermentable";

export const addIngredientLastCategoryStorageKey = "nb:add-ingredient:last-category";
export const addIngredientLastCategoryCookieName = "nb_add_ingredient_last_category";

export const normalizeStoredAddIngredientCategoryValue = (
  value: string | null | undefined
): StoredAddIngredientCategoryValue | null => (
  value === "malt"
    || value === "fermentable"
    || value === "hop"
    || value === "yeast"
    || value === "water_treatment"
    || value === "consumable"
    ? value
    : null
);

export const persistStoredAddIngredientCategoryValue = (
  value: StoredAddIngredientCategoryValue
) => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${addIngredientLastCategoryCookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
};
