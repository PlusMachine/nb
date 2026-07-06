import { and, db, desc, eq, favoriteCalculators, inArray } from "@nb/db";

import { calculatorBySlug, getCalculatorBySlug, type CalculatorCatalogItem, type CalculatorSlug } from "./catalog";

// Сервис избранных калькуляторов. По образцу «сохранённых рецептов»
// (features/recipes/service.ts): идемпотентный toggle, батч-проверка состояния и
// список для дашборда. Идентификатор калькулятора — статический slug из каталога
// в коде, поэтому валидность slug проверяем здесь, а не через FK.

const isKnownSlug = (slug: string): slug is CalculatorSlug => getCalculatorBySlug(slug) !== null;

/** Добавляет/убирает калькулятор в избранное. Неизвестный slug молча игнорируем. */
export const setFavoriteCalculator = async (
  userId: string,
  slug: string,
  next: boolean
): Promise<{ favorite: boolean }> => {
  if (!isKnownSlug(slug)) {
    return { favorite: false };
  }

  if (next) {
    await db
      .insert(favoriteCalculators)
      .values({ userId, calculatorSlug: slug })
      .onConflictDoNothing({ target: [favoriteCalculators.userId, favoriteCalculators.calculatorSlug] });
  } else {
    await db
      .delete(favoriteCalculators)
      .where(and(eq(favoriteCalculators.userId, userId), eq(favoriteCalculators.calculatorSlug, slug)));
  }

  return { favorite: next };
};

/** В избранном ли калькулятор у пользователя (для детальной страницы). */
export const isCalculatorFavorite = async (userId: string, slug: string): Promise<boolean> => {
  const row = await db.query.favoriteCalculators.findFirst({
    where: and(eq(favoriteCalculators.userId, userId), eq(favoriteCalculators.calculatorSlug, slug)),
    columns: { id: true }
  });
  return !!row;
};

/**
 * Батч: какие из `slugs` в избранном у пользователя. Индекс калькуляторов грузит
 * состояние звёзд одним запросом после гидрации, не де-кэшируя статический документ.
 */
export const getFavoriteCalculatorSlugs = async (userId: string, slugs: string[]): Promise<Set<string>> => {
  if (slugs.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ slug: favoriteCalculators.calculatorSlug })
    .from(favoriteCalculators)
    .where(and(eq(favoriteCalculators.userId, userId), inArray(favoriteCalculators.calculatorSlug, slugs)));

  return new Set(rows.map((row) => row.slug));
};

/**
 * Избранные калькуляторы пользователя в порядке добавления (новые сверху) —
 * для секции на дашборде. Записи с неизвестным slug (например удалённый из
 * каталога калькулятор) отбрасываем.
 */
export const listFavoriteCalculators = async (userId: string): Promise<CalculatorCatalogItem[]> => {
  const rows = await db
    .select({ slug: favoriteCalculators.calculatorSlug })
    .from(favoriteCalculators)
    .where(eq(favoriteCalculators.userId, userId))
    .orderBy(desc(favoriteCalculators.createdAt));

  return rows
    .map((row) => (isKnownSlug(row.slug) ? calculatorBySlug[row.slug] : null))
    .filter((item): item is CalculatorCatalogItem => item !== null);
};
