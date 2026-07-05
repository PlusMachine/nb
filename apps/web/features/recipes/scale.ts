import { roundTo } from "@nb/brewing-core";

import { getInventoryUnitQuantityPrecision } from "../inventory/units";
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

type RecipeIngredient = RecipeDetailDto["ingredients"][number];
type RecipeIngredientStage = RecipeIngredient["stage"];
type InventoryUnit = RecipeDetailDto["batchSizeEnteredUnit"];

// Округление ВВОДИМЫХ (entered) количеств до практичной точности единицы —
// иначе после умножения на factor в редактируемых полях и в клоне оседают
// значения вида «15.833 g». Штучные (pack/item) имеют точность 0, но при
// масштабе вниз это обнулило бы дробную пачку (1 × 0.3 → 0), поэтому держим ≥2.
const enteredScalePrecision = (unit: InventoryUnit): number => {
  const precision = getInventoryUnitQuantityPrecision(unit);
  return precision === 0 ? 2 : precision;
};

export type ScaledRecipeIngredient = {
  id: string;
  persistentKey: string;
  type: RecipeIngredient["type"];
  ingredientCategory: RecipeIngredient["ingredientCategory"];
  ingredientSubtype: RecipeIngredient["ingredientSubtype"];
  displayName: string | null;
  displayNameRu: RecipeIngredient["ingredientDisplayNameRu"];
  displayNameEn: RecipeIngredient["ingredientDisplayNameEn"];
  amountEnteredQuantity: number;
  amountEnteredUnit: InventoryUnit;
  amountNormalizedQuantity: number;
  amountNormalizedUnit: InventoryUnit;
  defaultDisplayUnit: RecipeIngredient["ingredientDefaultDisplayUnit"];
  allowedUnits: RecipeIngredient["ingredientAllowedUnits"];
  measurementDimension: RecipeIngredient["ingredientMeasurementDimension"];
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
    batchSizeEnteredQuantity: roundTo(recipe.batchSizeEnteredQuantity * factor, enteredScalePrecision(recipe.batchSizeEnteredUnit)),
    batchSizeEnteredUnit: recipe.batchSizeEnteredUnit,
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      persistentKey: ingredient.persistentKey,
      type: ingredient.type,
      ingredientCategory: ingredient.ingredientCategory ?? null,
      ingredientSubtype: ingredient.ingredientSubtype ?? null,
      displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? null,
      displayNameRu: ingredient.ingredientDisplayNameRu ?? null,
      displayNameEn: ingredient.ingredientDisplayNameEn ?? null,
      amountEnteredQuantity: roundTo(ingredient.amountEnteredQuantity * factor, enteredScalePrecision(ingredient.amountEnteredUnit)),
      amountEnteredUnit: ingredient.amountEnteredUnit,
      amountNormalizedQuantity: roundTo(ingredient.amountNormalizedQuantity * factor, SCALE_PRECISION),
      amountNormalizedUnit: ingredient.amountNormalizedUnit,
      // Профиль единицы берём как в основной секции рецепта, чтобы окно
      // пересчёта показывало те же единицы, что и страница (мл/г/пачки, не сырой код).
      defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.ingredientDefaultDisplayUnitSnapshot ?? null,
      allowedUnits: ingredient.ingredientAllowedUnits ?? null,
      measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? null,
      stage: ingredient.stage
    }))
  };
};
