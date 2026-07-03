import type { IngredientCategory } from "../ingredients/contracts";
import type { InventoryUnit } from "../inventory/units";

// Варка-источник, из-за которой ингредиент попал в список покупок.
export type ShoppingListSourceBrew = {
  brewBatchId: string;
  brewName: string;
  recipeId: string;
  recipeTitle: string;
  plannedFor: Date | null;
};

// Строка списка покупок: один ингредиент, агрегированный по всем запланированным
// варкам, где его не хватает. Количество — сумма нехваток («докупить хотя бы столько»).
export type ShoppingListLineDto = {
  key: string;
  ingredientDisplayName: string;
  category: IngredientCategory | null;
  quantityToBuy: number;
  unit: InventoryUnit;
  quantityLabel: string;
  // Ссылка на карточку каталога — «где посмотреть/купить». null, если у строки
  // нет каталожной/кастомной привязки (только имя из снапшота).
  catalogHref: string | null;
  // Deeplink на модалку добавления на склад (?addSource=…&addId=…). null без привязки.
  addToStockHref: string | null;
  // Названия варок, которым нужен этот ингредиент (для контекста «зачем покупаю»).
  neededBy: { recipeTitle: string; brewName: string }[];
};

export type ShoppingListGroupDto = {
  category: IngredientCategory | "other";
  label: string;
  items: ShoppingListLineDto[];
};

export type ShoppingListDto = {
  groups: ShoppingListGroupDto[];
  // Число уникальных позиций к покупке.
  totalItems: number;
  // Запланированные варки, по которым собран список.
  plannedBrews: ShoppingListSourceBrew[];
  // Почему список пуст (для контекстного пустого состояния). null — список есть.
  emptyReason: "no_planned_brews" | "all_in_stock" | null;
};
