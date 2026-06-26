import { roundTo } from "@nb/brewing-core";

import type { RecipeDetailDto } from "./contracts";
import { toBatchVolumeLiters } from "./units";

/**
 * Пересчёт рецепта под целевой объём партии — ЧИСТАЯ, немутирующая функция.
 * Масштабирует АБСОЛЮТНЫЕ величины (количества ингредиентов и объём партии)
 * множителем `factor = targetLitres / baseLitres`. Интенсивные свойства
 * (OG/FG/ABV/IBU/SRM/эффективность/время кипячения) НЕ масштабируются: при
 * пропорциональном изменении гриста/хмеля те же показатели достигаются на другом
 * объёме — это корректное приближение. Ничего не пишет в БД и не создаёт копий.
 */

const MAX_TARGET_BATCH_LITRES = 1000;
const SCALE_PRECISION = 3;

type RecipeIngredientStage = RecipeDetailDto["ingredients"][number]["stage"];
type InventoryUnit = RecipeDetailDto["batchSizeEnteredUnit"];

export type ScaledRecipeIngredient = {
  id: string;
  persistentKey: string;
  displayName: string | null;
  amountEnteredQuantity: number;
  amountEnteredUnit: InventoryUnit;
  amountNormalizedQuantity: number;
  amountNormalizedUnit: InventoryUnit;
  stage: RecipeIngredientStage;
};

export type ScaledRecipeView = {
  /** Множитель масштабирования (1 = без изменений). */
  factor: number;
  /** Базовый объём рецепта, л. */
  baseBatchLitres: number;
  /** Применённый целевой объём, л (после клампов). */
  targetBatchLitres: number;
  /** true, если масштаб реально применён (factor ≠ 1). */
  scaled: boolean;
  batchSizeEnteredQuantity: number;
  batchSizeEnteredUnit: InventoryUnit;
  ingredients: ScaledRecipeIngredient[];
};

/** Безопасно получает базовый объём партии в литрах; 0 при некорректных данных. */
const safeBaseBatchLitres = (recipe: RecipeDetailDto): number => {
  try {
    const litres = toBatchVolumeLiters(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit);
    return litres > 0 ? litres : 0;
  } catch {
    return 0;
  }
};

export const scaleRecipeToVolume = (recipe: RecipeDetailDto, targetLitres: number): ScaledRecipeView => {
  const baseBatchLitres = safeBaseBatchLitres(recipe);

  // Невалидный/непозитивный/пустой target или нулевой базовый объём → factor = 1
  // (показываем оригинал без масштабирования). Верхний кламп — защита от абсурда.
  const isValidTarget = Number.isFinite(targetLitres) && targetLitres > 0;
  const targetBatchLitres = isValidTarget
    ? Math.min(targetLitres, MAX_TARGET_BATCH_LITRES)
    : baseBatchLitres;
  const factor = baseBatchLitres > 0 ? targetBatchLitres / baseBatchLitres : 1;

  return {
    factor,
    baseBatchLitres,
    targetBatchLitres: baseBatchLitres > 0 ? targetBatchLitres : baseBatchLitres,
    scaled: factor !== 1,
    batchSizeEnteredQuantity: roundTo(recipe.batchSizeEnteredQuantity * factor, SCALE_PRECISION),
    batchSizeEnteredUnit: recipe.batchSizeEnteredUnit,
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      persistentKey: ingredient.persistentKey,
      displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? null,
      amountEnteredQuantity: roundTo(ingredient.amountEnteredQuantity * factor, SCALE_PRECISION),
      amountEnteredUnit: ingredient.amountEnteredUnit,
      amountNormalizedQuantity: roundTo(ingredient.amountNormalizedQuantity * factor, SCALE_PRECISION),
      amountNormalizedUnit: ingredient.amountNormalizedUnit,
      stage: ingredient.stage
    }))
  };
};
