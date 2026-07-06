"use server";

import { revalidatePath } from "next/cache";

import {
  getFavoriteCalculatorSlugs,
  isCalculatorFavorite,
  setFavoriteCalculator
} from "@/features/calculators/favorites-service";
import { getSessionUser } from "@/lib/auth";

export type FavoriteCalculatorActionResult =
  | { ok: true; favorite: boolean }
  | { ok: false; code: "AUTH" | "ERROR"; message: string };

/** Персональное состояние избранного для клиента после гидрации. */
export type FavoriteCalculatorViewerState = {
  authenticated: boolean;
  favorite: boolean;
};

/**
 * Добавляет/убирает калькулятор в избранное. userId берётся ТОЛЬКО из сессии на
 * сервере — клиентскому payload не доверяем. Страницы калькуляторов публичные и
 * статические, поэтому неавторизованному отвечаем code:"AUTH" (клиент ведёт на логин).
 */
export const toggleFavoriteCalculatorAction = async (input: {
  slug: string;
  next: boolean;
}): Promise<FavoriteCalculatorActionResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы добавлять калькуляторы в избранное." };
  }

  try {
    const { favorite } = await setFavoriteCalculator(user.id, input.slug, input.next);
    revalidatePath("/app");
    return { ok: true, favorite };
  } catch {
    return { ok: false, code: "ERROR", message: "Не удалось обновить избранное. Попробуйте ещё раз." };
  }
};

/** Состояние избранного для текущего пользователя (детальная страница). */
export const loadFavoriteCalculatorState = async (slug: string): Promise<FavoriteCalculatorViewerState> => {
  const user = await getSessionUser();
  if (!user) {
    return { authenticated: false, favorite: false };
  }
  const favorite = await isCalculatorFavorite(user.id, slug);
  return { authenticated: true, favorite };
};

/**
 * Батч: какие из видимых калькуляторов в избранном у текущего пользователя.
 * Индекс вызывает это после гидрации и раздаёт состояние звёздам через контекст.
 */
export const loadFavoriteCalculatorStates = async (slugs: string[]): Promise<string[]> => {
  const user = await getSessionUser();
  if (!user) {
    return [];
  }
  const favorites = await getFavoriteCalculatorSlugs(user.id, slugs);
  return [...favorites];
};
