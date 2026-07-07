import type { IngredientCategory } from "../ingredients/contracts";
import type { InventoryUnit } from "../inventory/units";

// Варка-источник, из-за которой ингредиент попал в список покупок.
export type ShoppingListSourceBrew = {
  brewBatchId: string;
  brewName: string;
  recipeId: string;
  recipeTitle: string;
  plannedFor: Date | null;
  // Число строк §3.2 (агрегированной секции), где эта варка стоит в `neededBy` —
  // для чипа «N позиций» в блоке источников.
  missingCount: number;
};

// Строка «Чего не хватает»: один ингредиент, агрегированный по всем запланированным
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

// Одна нехватка внутри рецепта-«возможности» (§3.3). В отличие от
// ShoppingListLineDto — без агрегации между рецептами: количество ровно на
// один этот рецепт (принцип §2 — «возможность», не обязательство).
//
// Семантика §3.3 (FIX-1): строка попадает сюда, только если status==="missing"
// (весь тип ингредиента отсутствует). Строки со status==="partial" (тип есть,
// не хватает количества) на этом ярусе НЕ показываем — ярус живёт на семантике
// «отсутствующих ТИПОВ», как resolveBrewabilityBadge; количественные нехватки —
// дело match-панели конкретного рецепта. Отсюда инвариант:
// ShoppingOpportunityDto.missingCount === ShoppingOpportunityDto.lines.length.
//
// quantityToBuy/unit/quantityLabel — null, если у строки матча нет валидного
// suggestedAddQuantity/suggestedAddUnit (перевод нехватки не удался — см.
// resolveAddSuggestion в match-service.ts). Строка всё равно показывается
// (ингредиент отсутствует), просто без количества; addToStockHref в этом
// случае собирается без addQty/addUnit (buildIngredientCatalogActionHref
// поддерживает вызов без amount).
export type ShoppingOpportunityLineDto = {
  ingredientDisplayName: string;
  quantityToBuy: number | null;
  unit: InventoryUnit | null;
  quantityLabel: string | null;
  catalogHref: string | null;
  addToStockHref: string | null;
};

// Рецепт («Почти хватает на:»): избранный или свой, докупить которого —
// 1+ позиций при покрытии типов ≥70% (см. resolveShoppingOpportunityTier).
export type ShoppingOpportunityDto = {
  recipeId: string;
  slug: string;
  title: string;
  // Ссылка на рецепт: свой → редактор (`/app/recipes/{id}/edit`), избранный
  // чужой → публичная страница (`/recipes/{slug}`).
  recipeHref: string;
  // Число строк-нехваток (см. семантику у ShoppingOpportunityLineDto) — всегда
  // равно lines.length: обе величины считаются с одного и того же предиката
  // status==="missing".
  missingCount: number;
  lines: ShoppingOpportunityLineDto[];
  // true — рецепт не входит в развёрнутый ярус (кап §3.3 или нехватка ≥3):
  // в UI прячется под «Ещё K рецептов».
  collapsed: boolean;
  // Презентация карточки (S4, языка BrewableRecipeCard) — те же поля, что у
  // RecipeThumb/StyleChip на витрине. Для избранных приходят из
  // PublicRecipeListItem, для своих — из OwnRecipeRefDto (см.
  // listOwnRecipeRefs); резолвятся кеш-хелперами BJCP, без доп. запросов.
  styleCode: string | null;
  styleName: string | null;
  styleHref: string | null;
  heroImage: { thumbUrl: string; blurDataUrl: string | null } | null;
  styleImageUrl: string | null;
  colorSrm: number | null;
};

export type ShoppingListDto = {
  groups: ShoppingListGroupDto[];
  // Число уникальных позиций к покупке.
  totalItems: number;
  // Запланированные варки, по которым собран список.
  plannedBrews: ShoppingListSourceBrew[];
  // Секция «Почти хватает на:» (§3.3): избранные + свои рецепты за вычетом
  // тех, что уже стоят за запланированными варками. И развёрнутые, и свёрнутые
  // записи — с полными строками нехваток (свернуть/развернуть не требует рефетча).
  opportunities: ShoppingOpportunityDto[];
  // Сколько записей opportunities помечены collapsed — для подписи «Остальные (K)».
  collapsedOpportunityCount: number;
  // Почему список пуст (для контекстного пустого состояния). null — список есть.
  // "nothing_to_do" — нет ни запланированных варок, ни возможностей (§3.4);
  // "all_in_stock" — варки запланированы, но нехваток нет (докупать нечего).
  emptyReason: "nothing_to_do" | "all_in_stock" | null;
};
