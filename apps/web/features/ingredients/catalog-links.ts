// Единый формат ссылок «добавить со страницы каталога» — модалки на
// /app/ingredients и /app/recipes/new уже умеют читать addSource/addId из
// query и открываться этим параметром. Здесь только одна точка правды для
// формата URL, чтобы витрина каталога и детальная страница ингредиента не
// разошлись.

export type IngredientCatalogActionPathname = "/app/ingredients" | "/app/recipes/new";

export const buildIngredientCatalogActionHref = (
  pathname: IngredientCatalogActionPathname,
  source: "catalog" | "custom",
  id: string,
  // Опциональный дефицит из «Чего не хватает» → предзаполнить количество/единицу
  // формы добавления (UX-находка #20). Оба параметра нужны вместе: подставлять
  // число без единицы нельзя (риск чужой единицы), поэтому кодируем обе.
  amount?: { quantity: number; unit: string } | null
) => {
  const base = `${pathname}?addSource=${source}&addId=${id}`;
  if (amount && Number.isFinite(amount.quantity) && amount.quantity > 0 && amount.unit) {
    return `${base}&addQty=${encodeURIComponent(amount.quantity)}&addUnit=${encodeURIComponent(amount.unit)}`;
  }
  return base;
};
