"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  consumeBrewBatchInventoryForStart,
  type StartBrewConsumeResult
} from "@/features/brew-batches/inventory";
import { createBrewBatchFromRecipe } from "@/features/brew-batches/service";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { getRecipeById } from "@/features/recipes/service";
import { toBatchVolumeLiters } from "@/features/recipes/units";
import { getSessionUser } from "@/lib/auth";

/** Верхний кламп объёма варки — тот же, что у пересчёта рецепта (scale.ts). */
const MAX_BREW_VOLUME_L = 1000;

// В "use server"-модуле можно экспортировать только async-функции (и типы), поэтому
// схема и хелперы — локальные.
const brewInputSchema = z.object({
  /** Объём ЭТОЙ варки, л. Не задан — варим в объёме рецепта. */
  targetBatchVolumeL: z.coerce.number().positive().max(MAX_BREW_VOLUME_L).optional(),
  /** Профиль оборудования, на котором варим (только свой). Не задан — профиль рецепта. */
  equipmentProfileId: z.string().uuid().optional(),
  recipeId: z.string().uuid(),
  /** «Сварить самому» (виртуальная ветка единого входа «Сварить») — списать
   *  ингредиенты со склада ТЕКУЩЕГО пользователя сразу при старте. */
  consumeIngredients: z.boolean().optional(),
  /** Ключ идемпотентности создания партии (двойной клик/ретрай → одна партия). */
  idempotencyKey: z.string().uuid().optional(),
  /** Опциональная дата варки (акт «Подготовка») — задаётся сразу в диалоге «Сварить». */
  plannedFor: z.string().datetime().optional()
});

/**
 * Что показать в диалоге «Сварить» до создания партии: объём рецепта и объём
 * оборудования пользователя. Разошлись — диалог заставляет выбрать явно (варить
 * чужие 30 л на своих 20 л молча нельзя: разъедутся и склад, и водный план).
 * Профиль — дефолтный; другой объём вводится руками (решение владельца).
 */
export type BrewVolumeOptions = {
  recipeBatchVolumeL: number | null;
  /** Эффективность, на которой рецепт посчитан автором (null → дефолт движка). */
  recipeEfficiencyPct: number | null;
  defaultProfile: {
    id: string;
    name: string;
    targetBatchVolumeL: number;
    brewhouseEfficiencyPct: number;
  } | null;
};

/** Объём рецепта в литрах; null — батч задан не объёмной единицей (масштабировать нечего). */
const readRecipeBatchVolumeL = (recipe: RecipeDetailDto): number | null => {
  try {
    const litres = toBatchVolumeLiters(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit);
    return litres > 0 ? litres : null;
  } catch {
    return null;
  }
};

export const getBrewVolumeOptionsAction = async (recipeId: string): Promise<BrewVolumeOptions | null> => {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  try {
    // Тот же гейт доступа, что и у старта варки: свой любой статус / чужой published.
    const recipe = await getRecipeById(user.id, recipeId);
    const profiles = await listEquipmentProfiles(user.id);
    const profile = profiles.find((item) => item.isDefault) ?? null;

    return {
      recipeBatchVolumeL: readRecipeBatchVolumeL(recipe),
      recipeEfficiencyPct: recipe.efficiency ?? null,
      defaultProfile: profile
        ? {
          id: profile.id,
          name: profile.name,
          targetBatchVolumeL: profile.targetBatchVolumeL,
          brewhouseEfficiencyPct: profile.brewhouseEfficiencyPct
        }
        : null
    };
  } catch {
    // Рецепт недоступен — молча без выбора объёма: сам старт варки честно упрётся
    // в тот же гейт и покажет ошибку.
    return null;
  }
};

/** Итог опционального списания склада — доезжает до диалога честно, без глотания ошибок.
 *  hasSubstitutes (Ф2) — на складе есть кандидаты на замену, которые «Сварить
 *  самому» не подставляет сам (exact-only): точный подбор не хватает/не находит
 *  позицию, но по match-group есть чем закрыть. Флаг, а не свободный текст — сам
 *  текст подсказки живёт в brew-stock-notice.tsx (стройка URL не носит свободный
 *  текст, см. brew-picker-dialog.tsx). Тип живёт в features/brew-batches/inventory —
 *  реэкспорт, чтобы brew-picker-dialog.tsx мог импортировать его отсюда же, откуда
 *  и раньше. */
export type { StartBrewConsumeResult };

export type StartBrewFromRecipeResult =
  | { ok: true; brewBatchId: string; consume?: StartBrewConsumeResult }
  | { ok: false; code: "AUTH" | "NOT_FOUND" | "ERROR"; message: string };

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
  targetBatchVolumeL?: number;
  equipmentProfileId?: string;
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
      plannedFor: parsed.data.plannedFor ? new Date(parsed.data.plannedFor) : undefined,
      targetBatchVolumeL: parsed.data.targetBatchVolumeL,
      equipmentProfileId: parsed.data.equipmentProfileId
    });

    // «Сварить самому» списывает exact-only (без диалога-предпросмотра с
    // заменами, Ф2) — если у оставшихся строк ЕСТЬ кандидаты на замену той же
    // группы, честно подсказываем: точный подбор их не видит. Списание
    // одноразовое (hasConsumedAllocationsForBatch) — применить замену можно
    // только через «Вернуть на склад» и повторное списание в «Списать со
    // склада» на странице партии, а не «на этой же странице кнопкой».
    const consume: StartBrewConsumeResult | undefined = parsed.data.consumeIngredients
      ? await consumeBrewBatchInventoryForStart(user.id, batch.id)
      : undefined;

    revalidatePath("/app/brew-batches");
    return { ok: true, brewBatchId: batch.id, consume };
  } catch (error) {
    if (error instanceof Error && (error.message === "NOT_FOUND" || error.message === "FORBIDDEN")) {
      return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для варки." };
    }
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return { ok: false, code: "ERROR", message: "Слишком часто. Подождите немного и попробуйте снова." };
    }
    if (error instanceof Error && error.message === "BREW_BATCH_QUOTA_REACHED") {
      return { ok: false, code: "ERROR", message: "Достигнут предел числа партий (500)." };
    }
    return { ok: false, code: "ERROR", message: "Не удалось начать варку. Попробуйте ещё раз." };
  }
};
