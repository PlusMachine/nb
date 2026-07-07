"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { consumeBrewBatchInventory } from "@/features/brew-batches/inventory";
import { createBrewBatchFromRecipe } from "@/features/brew-batches/service";
import { getSessionUser } from "@/lib/auth";

const brewInputSchema = z.object({
  recipeId: z.string().uuid(),
  /** «Сварить самому» (виртуальная ветка единого входа «Сварить») — списать
   *  ингредиенты со склада ТЕКУЩЕГО пользователя сразу при старте. */
  consumeIngredients: z.boolean().optional(),
  /** Ключ идемпотентности создания партии (двойной клик/ретрай → одна партия). */
  idempotencyKey: z.string().uuid().optional(),
  /** Опциональная дата варки (акт «Подготовка») — задаётся сразу в диалоге «Сварить». */
  plannedFor: z.string().datetime().optional()
});

/** Итог опционального списания склада — доезжает до диалога честно, без глотания ошибок. */
export type StartBrewConsumeResult =
  | { ok: true; itemCount: number }
  | { ok: false; code: "already_consumed" | "insufficient_stock" | "recipe_unavailable" | "error" };

export type StartBrewFromRecipeResult =
  | { ok: true; brewBatchId: string; consume?: StartBrewConsumeResult }
  | { ok: false; code: "AUTH" | "NOT_FOUND" | "ERROR"; message: string };

const consumeErrorCodeByMessage: Record<string, StartBrewConsumeResult & { ok: false }> = {
  ALREADY_CONSUMED: { ok: false, code: "already_consumed" },
  INSUFFICIENT_STOCK: { ok: false, code: "insufficient_stock" },
  RECIPE_UNAVAILABLE: { ok: false, code: "recipe_unavailable" }
};

/**
 * Мост «любой доступный рецепт → варка» БЕЗ клонирования: создаёт партию варки во
 * владении текущего пользователя из снапшота рецепта (своего любого статуса или
 * чужого published). В «Мои рецепты» ничего не копируется. userId берётся ТОЛЬКО
 * из серверной сессии — клиентскому payload не доверяем (в сигнатуре userId нет).
 *
 * Единый вход «Сварить», виртуальная ветка («Сварить самому»): создаёт партию в
 * статусе 'planned' и ведёт в акт «Подготовка» — сам варочный день пользователь
 * запускает там (кнопка «Начать варочный день»), клик в диалоге варку не
 * запускает (решение аудита №2 от 2026-07-03, отменяет прежнее «переводим в
 * 'brewing' сразу же»). Опционально списывает ингредиенты рецепта со склада —
 * результат списания возвращается отдельным полем `consume`, не проглатывается:
 * партия при этом создаётся в любом случае, а провал списания — честная ошибка,
 * которую диалог доносит до страницы партии тостом.
 */
export const startBrewFromRecipeAction = async (input: {
  recipeId: string;
  consumeIngredients?: boolean;
  idempotencyKey?: string;
  plannedFor?: string;
}): Promise<StartBrewFromRecipeResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы начать варку." };
  }

  const parsed = brewInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен." };
  }

  try {
    const batch = await createBrewBatchFromRecipe(user.id, parsed.data.recipeId, {
      idempotencyKey: parsed.data.idempotencyKey,
      plannedFor: parsed.data.plannedFor ? new Date(parsed.data.plannedFor) : undefined
    });

    let consume: StartBrewConsumeResult | undefined;
    if (parsed.data.consumeIngredients) {
      try {
        const view = await consumeBrewBatchInventory(user.id, batch.id);
        consume = { ok: true, itemCount: view.consumed.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        consume = consumeErrorCodeByMessage[message] ?? { ok: false, code: "error" };
      }
    }

    revalidatePath("/app/brew-batches");
    return { ok: true, brewBatchId: batch.id, consume };
  } catch (error) {
    if (error instanceof Error && (error.message === "NOT_FOUND" || error.message === "FORBIDDEN")) {
      return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для варки." };
    }
    return { ok: false, code: "ERROR", message: "Не удалось начать варку. Попробуйте ещё раз." };
  }
};
