"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth";
import type { RecipeMatchDto } from "@/features/recipes/contracts";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";

// Персональный матчинг «склад ↔ рецепт» тянется ПОСЛЕ гидрации (как и форма
// оценки), чтобы документ `/recipes/[slug]` не читал cookie и оставался
// кэшируемым для анонимов. Вся доменная логика — на сервере; наружу уходит
// только готовый % и разбивка по строкам.
export type RecipeMatchViewerState = {
  authenticated: boolean;
  match: RecipeMatchDto | null;
};

export const loadRecipeMatch = async (recipeId: string): Promise<RecipeMatchViewerState> => {
  const user = await getSessionUser();
  if (!user) {
    return { authenticated: false, match: null };
  }

  try {
    // Тяжёлый серверный модуль импортируем лениво, чтобы клиентский
    // RecipeMatchPanel, ссылающийся на этот action, не тянул его в граф модулей.
    const { computeRecipeMatch } = await import("@/features/recipes/match-service");
    const match = await computeRecipeMatch({ userId: user.id, recipeId });
    return { authenticated: true, match };
  } catch {
    return { authenticated: true, match: null };
  }
};

export type MatchIngredientCardState = { authenticated: boolean; item: IngredientSuggestionItem | null };

// Ф24: карточка ингредиента для разворота строки «На склад» в панели матча —
// презентация из общего каталожного пикера (IngredientSelectionCard), без
// повторного похода на страницу каталога. Сессия читается только здесь (как и
// в loadRecipeMatch), тяжёлый каталожный сервис — лениво.
export const loadMatchIngredientCard = async (input: {
  ingredientCatalogItemId?: string | null;
  userCustomIngredientId?: string | null;
}): Promise<MatchIngredientCardState> => {
  const user = await getSessionUser();
  if (!user) {
    return { authenticated: false, item: null };
  }

  const source: "catalog" | "custom" | null = input.ingredientCatalogItemId
    ? "catalog"
    : input.userCustomIngredientId
      ? "custom"
      : null;
  const id = input.ingredientCatalogItemId ?? input.userCustomIngredientId ?? null;
  if (!source || !id) {
    return { authenticated: true, item: null };
  }

  try {
    const { getIngredientSuggestionByRef } = await import("@/features/ingredients/catalog-service");
    const item = await getIngredientSuggestionByRef(user.id, source, id);
    return { authenticated: true, item };
  } catch {
    return { authenticated: true, item: null };
  }
};

export type AddRecipeIngredientResult = { ok: boolean; message: string; authRequired?: boolean };

// «Добавить на склад» прямо из панели матча: кладёт недостающий ингредиент рецепта
// в склад пользователя. Сессия читается только здесь (документ рецепта остаётся
// кэшируемым). Тяжёлый inventory-сервис импортируем лениво. После добавления
// панель сама перезапрашивает матч (computeRecipeMatch читает склад на лету).
export const addRecipeIngredientToInventory = async (input: {
  ingredientCatalogItemId?: string | null;
  userCustomIngredientId?: string | null;
  enteredQuantity: number;
  enteredUnit: string;
}): Promise<AddRecipeIngredientResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, message: "Войдите, чтобы добавить на склад.", authRequired: true };
  }

  if (!input.ingredientCatalogItemId && !input.userCustomIngredientId) {
    return { ok: false, message: "Не указан ингредиент." };
  }
  if (!(input.enteredQuantity > 0)) {
    return { ok: false, message: "Введите количество больше нуля." };
  }

  try {
    const service = await import("@/features/inventory/service");
    if (input.userCustomIngredientId) {
      await service.addCustomIngredientToInventory(user.id, {
        userCustomIngredientId: input.userCustomIngredientId,
        enteredQuantity: input.enteredQuantity,
        enteredUnit: input.enteredUnit
      });
    } else {
      await service.addCatalogIngredientToInventory(user.id, {
        ingredientCatalogItemId: input.ingredientCatalogItemId,
        enteredQuantity: input.enteredQuantity,
        enteredUnit: input.enteredUnit
      });
    }
    revalidatePath("/app/ingredients");
    return { ok: true, message: "Добавлено на склад." };
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return { ok: false, message: "Слишком много добавлений подряд. Немного подождите." };
    }
    if (error instanceof Error && error.message === "INVENTORY_ITEM_QUOTA_REACHED") {
      return { ok: false, message: "Достигнут предел числа позиций склада. Удалите ненужные, чтобы добавлять новые." };
    }
    return { ok: false, message: "Не удалось добавить на склад. Попробуйте ещё раз." };
  }
};
