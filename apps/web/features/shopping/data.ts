import {
  and,
  asc,
  count,
  db,
  eq,
  inArray,
  ingredientPackageVariants,
  ingredients,
  notInArray,
  shoppingLineChecks,
  shoppingManualItems,
  userCustomIngredients
} from "@nb/db";

import type { IngredientCategory } from "../ingredients/contracts";

/**
 * Единственная точка обращения к БД для таблиц `shopping_manual_items` /
 * `shopping_line_checks` (П1/П2). Сервис (`service.ts`) валидирует и
 * собирает DTO, сюда не лезет в БД напрямую — если завтра появится вторая
 * таблица (shopping_line_checks, П2), она тоже живёт здесь.
 */

export type ManualItemRow = typeof shoppingManualItems.$inferSelect;

// db или открытая транзакция — тот же паттерн, что и в
// features/recipes/inventory-service.ts (DbTransactionClient): будущий
// перенос купленного на склад (П2) удаляет ручные позиции в ОДНОМ
// транзакционном периметре со вставкой позиций склада.
type DbTransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ShoppingDbClient = typeof db | DbTransactionClient;

export const loadManualItems = async (userId: string): Promise<ManualItemRow[]> =>
  db.select().from(shoppingManualItems)
    .where(eq(shoppingManualItems.userId, userId))
    // createdAt может совпасть у позиций, добавленных в одну миллисекунду
    // (двойной клик/сабмит) — id вторым ключом даёт детерминированный порядок.
    .orderBy(asc(shoppingManualItems.createdAt), asc(shoppingManualItems.id));

export const countManualItems = async (userId: string): Promise<number> => {
  const [row] = await db.select({ value: count() })
    .from(shoppingManualItems)
    .where(eq(shoppingManualItems.userId, userId));
  return row?.value ?? 0;
};

/**
 * Проверка привязки ручной позиции ПЕРЕД insertManualItem — форма присылает
 * catalogId/customId напрямую (не через серверную агрегацию, как derived-
 * строки §3.2), поэтому сервер обязан сам убедиться, что ссылка существует
 * (и активна/принадлежит пользователю), прежде чем сохранить её в БД: битая
 * ссылка иначе тихо переживает до первого рендера hrefs и до переноса на
 * склад (transferCheckedToStock уже отфильтровывает деактивированный catalogId
 * там, но здесь дешевле не пускать её в БД вовсе).
 */
export const ensureCatalogRefValid = async (catalogId: string): Promise<void> => {
  const [row] = await db.select({ id: ingredients.id })
    .from(ingredients)
    .where(and(eq(ingredients.id, catalogId), eq(ingredients.isActive, true)));

  if (!row) {
    throw new Error("CATALOG_INGREDIENT_NOT_FOUND");
  }
};

export const ensureCustomRefOwned = async (userId: string, customId: string): Promise<void> => {
  const [row] = await db.select({ id: userCustomIngredients.id })
    .from(userCustomIngredients)
    .where(and(eq(userCustomIngredients.id, customId), eq(userCustomIngredients.userId, userId)));

  if (!row) {
    throw new Error("CUSTOM_INGREDIENT_NOT_FOUND");
  }
};

export type InsertManualItemValues = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory | null;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
};

export const insertManualItem = async (
  userId: string,
  values: InsertManualItemValues
): Promise<ManualItemRow> => {
  const [created] = await db.insert(shoppingManualItems).values({
    userId,
    name: values.name,
    quantity: values.quantity,
    unit: values.unit,
    category: values.category,
    ingredientCatalogItemId: values.ingredientCatalogItemId,
    userCustomIngredientId: values.userCustomIngredientId
  }).returning();

  return created;
};

export type ManualItemPatch = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

export const updateManualItemRow = async (
  userId: string,
  id: string,
  patch: ManualItemPatch
): Promise<ManualItemRow> => {
  const [updated] = await db.update(shoppingManualItems)
    .set({
      name: patch.name,
      quantity: patch.quantity,
      unit: patch.unit,
      updatedAt: new Date()
    })
    .where(and(eq(shoppingManualItems.id, id), eq(shoppingManualItems.userId, userId)))
    .returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return updated;
};

export const setManualItemCheckedAt = async (
  userId: string,
  id: string,
  checked: boolean
): Promise<ManualItemRow> => {
  const [updated] = await db.update(shoppingManualItems)
    .set({
      checkedAt: checked ? new Date() : null,
      updatedAt: new Date()
    })
    .where(and(eq(shoppingManualItems.id, id), eq(shoppingManualItems.userId, userId)))
    .returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return updated;
};

/**
 * client — задел под будущий перенос «купленное → склад» (П2): та же
 * транзакция, что вставляет позиции user_ingredients, должна и удалить
 * перенесённые ручные позиции, иначе повторный сбор списка снова покажет их.
 */
export const deleteManualItemRow = async (
  userId: string,
  id: string,
  client: ShoppingDbClient = db
): Promise<void> => {
  const deleted = await client.delete(shoppingManualItems)
    .where(and(eq(shoppingManualItems.id, id), eq(shoppingManualItems.userId, userId)))
    .returning({ id: shoppingManualItems.id });

  if (deleted.length === 0) {
    throw new Error("NOT_FOUND");
  }
};

// --- П2: отметки «куплено» у производных строк §3.2 ------------------------

/** Все ключи строк, отмеченных пользователем как «куплено». */
export const loadLineChecks = async (userId: string): Promise<Set<string>> => {
  const rows = await db.select({ lineKey: shoppingLineChecks.lineKey })
    .from(shoppingLineChecks)
    .where(eq(shoppingLineChecks.userId, userId));

  return new Set(rows.map((row) => row.lineKey));
};

/** Число отметок «куплено» пользователя — квота на постановку (см. service.ts). */
export const countLineChecks = async (userId: string): Promise<number> => {
  const [row] = await db.select({ value: count() })
    .from(shoppingLineChecks)
    .where(eq(shoppingLineChecks.userId, userId));
  return row?.value ?? 0;
};

/**
 * Переключение отметки: insert идемпотентен через onConflictDoNothing на
 * unique(userId, lineKey) — повторная отметка того же ключа (двойной клик,
 * гонка вкладок) не бросает ошибку. Снятие — обычный delete.
 */
export const setLineChecked = async (
  userId: string,
  lineKey: string,
  checked: boolean
): Promise<void> => {
  if (checked) {
    await db.insert(shoppingLineChecks)
      .values({ userId, lineKey })
      .onConflictDoNothing({ target: [shoppingLineChecks.userId, shoppingLineChecks.lineKey] });
    return;
  }

  await deleteLineCheck(userId, lineKey);
};

/**
 * client — тот же паттерн, что и у deleteManualItemRow: перенос купленного на
 * склад (П2) удаляет отметку в ОДНОЙ транзакции со вставкой позиции склада.
 */
export const deleteLineCheck = async (
  userId: string,
  lineKey: string,
  client: ShoppingDbClient = db
): Promise<void> => {
  await client.delete(shoppingLineChecks)
    .where(and(eq(shoppingLineChecks.userId, userId), eq(shoppingLineChecks.lineKey, lineKey)));
};

/**
 * Строгий вариант deleteLineCheck — ТОЛЬКО для транзакции переноса
 * (transferCheckedToStock). Обычный deleteLineCheck идемпотентен (0 строк —
 * тоже успех), что подходит для снятия отметки вручную, но внутри переноса
 * это маскирует гонку: если отметка уже исчезла (снята/перенесена в
 * параллельном сабмите) между чтением и удалением, идемпотентный delete молча
 * «успевает», а позиция склада всё равно вставляется второй раз — дубль.
 * Здесь 0 удалённых строк — это ошибка, откатывающая всю транзакцию.
 */
export const deleteLineCheckStrict = async (
  userId: string,
  lineKey: string,
  client: ShoppingDbClient
): Promise<void> => {
  const deleted = await client.delete(shoppingLineChecks)
    .where(and(eq(shoppingLineChecks.userId, userId), eq(shoppingLineChecks.lineKey, lineKey)))
    .returning({ id: shoppingLineChecks.id });

  if (deleted.length === 0) {
    throw new Error("NOT_FOUND");
  }
};

// --- П4: варианты фасовки каталога -----------------------------------------

export type PackVariantRow = typeof ingredientPackageVariants.$inferSelect;

/**
 * Варианты фасовки батчем по списку catalogId строк §3.2 — один запрос на всю
 * страницу вместо одного на строку (см. resolvePackSuggestion в
 * pack-rounding.ts). `inArray` с пустым массивом — та же ловушка drizzle, что
 * и notInArray у pruneOrphanLineChecks выше, поэтому короткое замыкание явное.
 */
export const loadPackVariantsByCatalogIds = async (catalogIds: string[]): Promise<PackVariantRow[]> => {
  if (catalogIds.length === 0) {
    return [];
  }

  return db.select().from(ingredientPackageVariants)
    .where(inArray(ingredientPackageVariants.ingredientId, catalogIds));
};

// --- v4: мета каталога (бренд/страна) для строк лаборатории ------------------

export type IngredientMetaRow = {
  id: string;
  brand: string | null;
  producer: string | null;
  countryName: string | null;
};

/**
 * Батч-лоадер бренда/производителя/страны по catalogId строк §3.2 — та же
 * ловушка `inArray` с пустым массивом, что и у loadPackVariantsByCatalogIds
 * выше, поэтому короткое замыкание явное. Используется лабораторией
 * (/app/shopping-lab, v4) для строки «{бренд} · {страна}» вместо eyebrow-ярлыка
 * категории — сервис сам решает brand vs producer (см. service.ts).
 */
export const loadIngredientMetaByCatalogIds = async (catalogIds: string[]): Promise<IngredientMetaRow[]> => {
  if (catalogIds.length === 0) {
    return [];
  }

  return db.select({
    id: ingredients.id,
    brand: ingredients.brand,
    producer: ingredients.producer,
    countryName: ingredients.countryName
  }).from(ingredients)
    .where(inArray(ingredients.id, catalogIds));
};

/**
 * Ленивая чистка осиротевших отметок (см. contracts.ts/service.ts): строка
 * §3.2 исчезла (партию отменили/списали/оприходовали) — её отметка больше
 * никогда не найдёт пару и мусорится в таблице бесконечно, если не подчистить.
 * Вызывается из buildShoppingListForUser ПОСЛЕ агрегации, живыми ключами.
 *
 * ⚠ notInArray с пустым массивом — ловушка drizzle (генерирует SQL, который
 * либо не матчит ничего, либо ведёт себя не так, как ожидается для «всё»):
 * при пустом liveLineKeys явно удаляем ВСЕ отметки пользователя отдельным
 * delete без notInArray, а не полагаемся на его поведение с [].
 */
export const pruneOrphanLineChecks = async (userId: string, liveLineKeys: string[]): Promise<void> => {
  if (liveLineKeys.length === 0) {
    await db.delete(shoppingLineChecks).where(eq(shoppingLineChecks.userId, userId));
    return;
  }

  await db.delete(shoppingLineChecks).where(
    and(eq(shoppingLineChecks.userId, userId), notInArray(shoppingLineChecks.lineKey, liveLineKeys))
  );
};

// --- перенос: проверка привязок --------------------------------------------

/**
 * Батч-проверка активности каталожных привязок (перенос купленного на склад,
 * П2): id из аккумулированной агрегации/ручных позиций мог устареть (товар
 * деактивирован в каталоге) между сборкой списка и сабмитом переноса — один
 * select по уникальным id вместо проверки внутри addCatalogIngredientToInventory
 * на КАЖДОЙ строке (та тоже проверяет, но роняет ошибкой всю пачку, не даёт
 * серверу отсеять виновника заранее и перенести остальное). Кастомные
 * привязки сюда не входят — они уже гарантированы владением в БД (FK +
 * userId), деактивации у собственных ингредиентов нет.
 */
export const loadActiveCatalogIds = async (catalogIds: string[]): Promise<Set<string>> => {
  if (catalogIds.length === 0) {
    return new Set();
  }

  const rows = await db.select({ id: ingredients.id })
    .from(ingredients)
    .where(and(inArray(ingredients.id, catalogIds), eq(ingredients.isActive, true)));

  return new Set(rows.map((row) => row.id));
};
