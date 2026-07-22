import { z } from "zod";

import { ingredientCategories, type IngredientCategory } from "../ingredients/contracts";
import { inventoryUnits, type InventoryUnit } from "../inventory/units";

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
  // v4 (лаборатория /app/shopping-lab, фильтр-чипы по варкам): каждая запись
  // несёт СВОЙ per-brew остаток (quantityToBuy этой конкретной варки — не общий
  // агрегат строки) и его собственное округление до фасовки — при выборе чипа
  // конкретной варки показываем именно её долю, а не сумму по всем варкам.
  neededBy: {
    brewBatchId: string;
    recipeTitle: string;
    brewName: string;
    quantityToBuy: number;
    unit: InventoryUnit;
    quantityLabel: string;
    packSuggestion: { label: string; totalQuantity: number; totalUnit: InventoryUnit } | null;
  }[];
  // П2: отмечена ли строка «куплено» (join по ключу с shopping_line_checks).
  checked: boolean;
  // П2: есть ли каталожная/кастомная привязка — строки без неё нельзя перенести
  // на склад пачкой (CHECK user_ingredients_source_linkage_chk), диалог переноса
  // показывает их отдельным хвостом «Добавьте вручную».
  hasStockLinkage: boolean;
  // П4: округление нехватки до покупабельной фасовки каталога
  // (resolvePackSuggestion в pack-rounding.ts) — «пачка 50 г» вместо «37 г».
  // null — нет каталожной привязки, вариантов фасовки, или размерность
  // нехватки не сводится к содержимому фасовки (или это count-единица,
  // «1 пачка» дрожжей — там суть уже фасовка, дублировать нечего).
  // quantityLabel строки выше — исходная нехватка, она не меняется.
  packSuggestion: { label: string; totalQuantity: number; totalUnit: InventoryUnit } | null;
  // v4: мета склада для второй строки в лаборатории («{бренд} · {страна}»).
  // Заполнено только у строк с каталожной привязкой (catalogId) — берётся
  // из ingredients.brand (или producer, если brand пуст) и ingredients.country_name.
  // null у custom/name-only строк и у каталожных записей без этих полей.
  brand: string | null;
  countryName: string | null;
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
  // Число уникальных позиций к покупке (производные строки + НЕотмеченные
  // ручные позиции — П1: отмеченная «куплено» перестаёт считаться тем, что
  // ещё нужно купить).
  totalItems: number;
  // П2: сколько позиций отмечено «куплено» — производные строки + отмеченные
  // ручные позиции. Управляет видимостью кнопки «Пополнить склад (K)».
  checkedCount: number;
  // Запланированные варки, по которым собран список.
  plannedBrews: ShoppingListSourceBrew[];
  // Секция «Почти хватает на:» (§3.3): избранные + свои рецепты за вычетом
  // тех, что уже стоят за запланированными варками. И развёрнутые, и свёрнутые
  // записи — с полными строками нехваток (свернуть/развернуть не требует рефетча).
  opportunities: ShoppingOpportunityDto[];
  // Сколько записей opportunities помечены collapsed — для подписи «Остальные (K)».
  collapsedOpportunityCount: number;
  // П1: ручные позиции («Своё») — то, чего не породит ни один рецепт
  // (дезинфектант, кроненпробки, «Каскад про запас»). Читаются ВСЕГДА, в т.ч.
  // на дашборде — это дёшево (один запрос по индексу userId).
  manualItems: ShoppingManualItemDto[];
  // Почему список пуст (для контекстного пустого состояния). null — список есть.
  // "nothing_to_do" — нет ни запланированных варок, ни возможностей (§3.4), ни
  // ручных позиций (П1); "all_in_stock" — варки запланированы, но нехваток нет
  // (докупать нечего); ручные позиции могут сосуществовать с обоими статусами.
  emptyReason: "nothing_to_do" | "all_in_stock" | null;
};

// --- П1: ручные позиции («Своё») --------------------------------------------

/**
 * Анти-абьюз: щедрый потолок ручных позиций на пользователя + rate limit на
 * добавление — тот же паттерн, что и у остальных create-барьеров проекта (см.
 * INVENTORY_ITEM_MAX_COUNT_PER_USER в features/inventory/contracts.ts).
 */
export const SHOPPING_MANUAL_ITEM_MAX_COUNT_PER_USER = 100;
export const SHOPPING_MANUAL_ITEM_CREATE_RATE_LIMIT = 60;
export const SHOPPING_MANUAL_ITEM_CREATE_RATE_WINDOW_SECONDS = 60 * 60;

const manualItemNameSchema = z.string({ required_error: "Введите название." })
  .trim()
  .min(1, "Введите название.")
  .max(180, "Название должно быть не длиннее 180 символов.");

// "" и undefined — то же самое, что «не заполнено».
const manualItemQuantitySchema = z.preprocess((value) => {
  if (value == null || value === "") {
    return null;
  }
  return value;
}, z.coerce.number({ invalid_type_error: "Введите число." })
  .positive("Количество должно быть больше нуля.")
  .finite("Введите корректное число.")
  .nullable()
  .optional());

const manualItemUnitSchema = z.preprocess((value) => {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}, z.enum(inventoryUnits, { invalid_type_error: "Выберите единицу измерения." }).nullable().optional());

const manualItemCategorySchema = z.preprocess((value) => {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}, z.enum(ingredientCategories, { invalid_type_error: "Выберите корректную категорию." }).nullable().optional());

// Каталожный id — text в БД (packages/db/src/schema.ts, ingredients.id), без
// ограничения на уровне колонки; 120 символов с запасом покрывает реальные
// id сид-каталога (см. ingredientPackageVariantInputSchema.id max(191) —
// здесь короче, потому что это id самого ингредиента, не варианта фасовки).
const manualItemCatalogIdSchema = z.preprocess((value) => {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}, z.string().min(1).max(120).nullable().optional());

const manualItemCustomIdSchema = z.preprocess((value) => {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}, z.string().uuid("Некорректный идентификатор.").nullable().optional());

// Количество и единица — либо обе указаны, либо обе отсутствуют (тот же
// принцип «число без единицы не подставляем», что и в catalog-links.ts).
const applyManualItemQuantityUnitPairRefine = (
  value: { quantity?: number | null; unit?: InventoryUnit | null },
  ctx: z.RefinementCtx
) => {
  const hasQuantity = value.quantity != null;
  const hasUnit = value.unit != null;
  if (hasQuantity !== hasUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Количество и единица указываются вместе.",
      path: ["quantity"]
    });
  }
};

export const addManualShoppingItemSchema = z.object({
  name: manualItemNameSchema,
  quantity: manualItemQuantitySchema,
  unit: manualItemUnitSchema,
  category: manualItemCategorySchema,
  catalogId: manualItemCatalogIdSchema,
  customId: manualItemCustomIdSchema
}).superRefine((value, ctx) => {
  applyManualItemQuantityUnitPairRefine(value, ctx);
  if (value.catalogId != null && value.customId != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Нельзя одновременно привязать и к каталогу, и к своему ингредиенту.",
      path: ["catalogId"]
    });
  }
});

// Редактирование — полная замена name/quantity/unit (форма всегда шлёт все
// три поля разом, см. manual-item-row.tsx): привязка к каталогу/кастому здесь
// не меняется, поэтому catalogId/customId в схему не входят.
export const updateManualShoppingItemSchema = z.object({
  name: manualItemNameSchema,
  quantity: manualItemQuantitySchema,
  unit: manualItemUnitSchema
}).superRefine(applyManualItemQuantityUnitPairRefine);

export type ShoppingManualItemDto = {
  id: string;
  name: string;
  quantity: number | null;
  unit: InventoryUnit | null;
  quantityLabel: string | null;
  category: IngredientCategory | null;
  catalogHref: string | null;
  addToStockHref: string | null;
  checked: boolean;
  // true — позиция привязана к каталожному или собственному ингредиенту
  // (даёт ссылку на карточку и полноценный deeplink «На склад»); false —
  // живёт только именем (name-фолбэк, как у П3-строк без привязки).
  hasStockLinkage: boolean;
};

// --- П2: отметка «куплено» + перенос на склад --------------------------------

// lineKey — непрозрачный идентификатор строки §3.2 (формат resolveLineKey в
// service.ts: "catalog:<id>|<unit>" / "custom:<id>|<unit>" / "name:<lower>|<unit>").
// Формат здесь НЕ парсим и не валидируем — сервер при перезагрузке списка
// сверяет ключ с актуальной агрегацией, а не доверяет структуре строки.
const shoppingLineKeySchema = z.string().trim().min(1).max(512);

export const toggleShoppingLineCheckedSchema = z.object({
  lineKey: shoppingLineKeySchema,
  checked: z.boolean()
});

/**
 * Анти-абьюз для отметки «куплено» на производной строке (П2): барьер стоит
 * только на ПОСТАНОВКЕ отметки (checked=true) — снятие не растит таблицу
 * (delete), блокировать его нельзя. Лимиты щедрые: в магазине человек может
 * отщёлкать десятки строк туда-обратно, барьер — против скрипта, не против
 * живого пальца.
 */
export const SHOPPING_LINE_CHECK_MAX_COUNT_PER_USER = 500;
export const SHOPPING_LINE_CHECK_RATE_LIMIT = 600;
export const SHOPPING_LINE_CHECK_RATE_WINDOW_SECONDS = 60 * 60;

const transferQuantitySchema = z.coerce.number({ invalid_type_error: "Введите число." })
  .positive("Количество должно быть больше нуля.")
  .finite("Введите корректное число.");

const transferUnitSchema = z.preprocess((value) => (
  typeof value === "string" ? value.trim().toLowerCase() : value
), z.enum(inventoryUnits, { invalid_type_error: "Выберите единицу измерения." }));

// Перенос отмеченных строк на склад: сервер НЕ доверяет клиентской привязке —
// derived-строка несёт только lineKey (непрозрачный), сервер сам пересобирает
// агрегацию (computeAggregatedShoppingLines) и берёт catalogId/customId оттуда;
// manual-строка несёт id ручной позиции — сервер читает её привязку из БД.
// quantity/unit — клиентские (пользователь мог поправить количество в диалоге).
export const transferCheckedToStockSchema = z.object({
  lines: z.array(z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("derived"),
      lineKey: shoppingLineKeySchema,
      quantity: transferQuantitySchema,
      unit: transferUnitSchema
    }),
    z.object({
      kind: z.literal("manual"),
      id: z.string().uuid(),
      quantity: transferQuantitySchema,
      unit: transferUnitSchema
    })
  ])).min(1).max(200)
});

export type TransferLineInput = z.infer<typeof transferCheckedToStockSchema>["lines"][number];
