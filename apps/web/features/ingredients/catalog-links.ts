// Единый формат ссылок «добавить со страницы каталога» — модалки на
// /app/ingredients и /app/recipes/new уже умеют читать addSource/addId из
// query и открываться этим параметром. Здесь только одна точка правды для
// формата URL, чтобы витрина каталога и детальная страница ингредиента не
// разошлись.

export type IngredientCatalogActionPathname = "/app/ingredients" | "/app/recipes/new";

export const buildIngredientCatalogActionHref = (
  pathname: IngredientCatalogActionPathname,
  source: "catalog" | "custom",
  id: string
) => `${pathname}?addSource=${source}&addId=${id}`;
