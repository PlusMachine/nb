import { roundTo } from "@nb/brewing-core";

import { DEFAULT_BREWHOUSE_EFFICIENCY_PCT } from "../equipment-profiles/contracts";
import type { IngredientTechnicalData } from "../ingredients/contracts";
import { fermentableAppliesMashEfficiency } from "../ingredients/technical-fields";
import { resolveInventoryPackEquivalent } from "../inventory/pack";
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

// Эпсилон-защита ceil от плавающего шума (0.99999999999 не должно давать 2
// пачки вместо 1) — тот же паттерн, что и ceilTo3 в features/recipes/match-service.ts.
const CEIL_EPSILON = 1e-9;
const ceilWithEpsilon = (value: number): number => Math.ceil(value - CEIL_EPSILON);

export type ScaledAmount = {
  amountEnteredQuantity: number;
  amountEnteredUnit: InventoryUnit;
  amountNormalizedQuantity: number;
  amountNormalizedUnit: InventoryUnit;
};

/**
 * Масштабирует ОДНУ строку количества рецепта под фактор объёма/эффективности —
 * общий узел обоих движков (scaleRecipeToVolume и scaleRecipeDetailForBrew).
 *
 * Ф9 «граммы как факт» (решение владельца): дробной пачки не существует физически
 * («0.73 пачки» дрожжей нельзя отмерить), поэтому единица количества при
 * масштабировании может смениться:
 *  - "pack" с известной граммовкой (resolveInventoryPackEquivalent — тот же мост
 *    pack↔г/мл, что и склад, дефолт 11 г для сухих дрожжей) → конвертируется в вес/
 *    объём: количество = пачки × граммовка × factor, единица = единица эквивалента,
 *    округление по практичной точности ЭТОЙ единицы;
 *  - "pack" с НЕизвестной граммовкой (жидкие дрожжи, кастом без form="dry") и
 *    "item" (шт. — таблетки и т.п., грамм-конверсии не бывает) → неделимая
 *    единица: округление ВВЕРХ до целой, минимум 1 (никогда не «пропадает» и
 *    никогда не дробится);
 *  - factor === 1 (масштаб не применяется) — строка не трогается вовсе, чтобы
 *    «посмотреть свой же рецепт» не отличался от основной страницы рецепта
 *    (там дрожжи в пачках показываются как «1 пачка (11 г)», а не наоборот).
 *  - вес/объём — поведение прежнее: roundTo по практичной точности единицы.
 */
export const scaleIngredientAmount = (
  entered: { quantity: number; unit: InventoryUnit },
  normalized: { quantity: number; unit: InventoryUnit },
  technicalData: IngredientTechnicalData | null | undefined,
  factor: number
): ScaledAmount => {
  if (entered.unit === "pack" || entered.unit === "item") {
    if (factor === 1) {
      return {
        amountEnteredQuantity: entered.quantity,
        amountEnteredUnit: entered.unit,
        amountNormalizedQuantity: normalized.quantity,
        amountNormalizedUnit: normalized.unit
      };
    }

    const packEquivalent = entered.unit === "pack" ? resolveInventoryPackEquivalent(technicalData ?? null) : null;
    if (packEquivalent) {
      const contentQuantity = entered.quantity * packEquivalent.normalizedQuantity * factor;
      return {
        amountEnteredQuantity: roundTo(contentQuantity, getInventoryUnitQuantityPrecision(packEquivalent.normalizedUnit)),
        amountEnteredUnit: packEquivalent.normalizedUnit,
        amountNormalizedQuantity: roundTo(contentQuantity, SCALE_PRECISION),
        amountNormalizedUnit: packEquivalent.normalizedUnit
      };
    }

    const wholeCount = Math.max(1, ceilWithEpsilon(entered.quantity * factor));
    return {
      amountEnteredQuantity: wholeCount,
      amountEnteredUnit: entered.unit,
      amountNormalizedQuantity: wholeCount,
      amountNormalizedUnit: normalized.unit
    };
  }

  return {
    amountEnteredQuantity: roundTo(entered.quantity * factor, getInventoryUnitQuantityPrecision(entered.unit)),
    amountEnteredUnit: entered.unit,
    amountNormalizedQuantity: roundTo(normalized.quantity * factor, SCALE_PRECISION),
    amountNormalizedUnit: normalized.unit
  };
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
  // Нужен на отображении (не только на расчёте): формат «X г (N пачек)» строится
  // из entered-количества ПОСЛЕ конверсии + технических данных ингредиента —
  // см. formatQuantityWithPackCountHint в features/inventory/display.ts.
  technicalData: IngredientTechnicalData | null;
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
    batchSizeEnteredQuantity: roundTo(recipe.batchSizeEnteredQuantity * factor, getInventoryUnitQuantityPrecision(recipe.batchSizeEnteredUnit)),
    batchSizeEnteredUnit: recipe.batchSizeEnteredUnit,
    ingredients: recipe.ingredients.map((ingredient) => {
      const scaledAmount = scaleIngredientAmount(
        { quantity: ingredient.amountEnteredQuantity, unit: ingredient.amountEnteredUnit },
        { quantity: ingredient.amountNormalizedQuantity, unit: ingredient.amountNormalizedUnit },
        ingredient.ingredientTechnicalData,
        factor
      );
      return {
        id: ingredient.id,
        persistentKey: ingredient.persistentKey,
        type: ingredient.type,
        ingredientCategory: ingredient.ingredientCategory ?? null,
        ingredientSubtype: ingredient.ingredientSubtype ?? null,
        displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? null,
        displayNameRu: ingredient.ingredientDisplayNameRu ?? null,
        displayNameEn: ingredient.ingredientDisplayNameEn ?? null,
        technicalData: ingredient.ingredientTechnicalData ?? null,
        ...scaledAmount,
        // Профиль единицы берём как в основной секции рецепта, чтобы окно
        // пересчёта показывало те же единицы, что и страница (мл/г/пачки, не сырой код).
        defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.ingredientDefaultDisplayUnitSnapshot ?? null,
        allowedUnits: ingredient.ingredientAllowedUnits ?? null,
        measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? null,
        stage: ingredient.stage
      };
    })
  };
};

// =============================================================================
//  Пересчёт под ЧУЖУЮ ЭФФЕКТИВНОСТЬ (варка чужого рецепта на своём оборудовании)
//
//  Эффективность затирания — свойство ПИВОВАРНИ, а не рецепта. Рецепт на 75%
//  сваренный на 65%-оборудовании недоберёт сахаров: тот же солод даст меньший OG.
//  Решение владельца: дожимать ЗАСЫПЬ, чтобы попасть в авторский OG («то же
//  пиво»), а не занижать цель.
//
//  Дожим = recipeEff / targetEff (75/65 = 1.154) и применяется ТОЛЬКО к строкам,
//  на которые вообще действует эффективность затирания: солод и зерновые добавки.
//  Сахар/экстракт (100% выход), хмель, дрожжи масштабируются лишь по объёму —
//  иначе мы бы «дожали» то, что и так усваивается полностью.
//
//  Математика: og_points = Σ(вес × ppg × eff) / объём. Умножив вес засыпи на
//  eff_recipe/eff_target и вес всего остального на объёмный множитель, получаем
//  ТОЧНО тот же OG (и, следовательно, те же FG/ABV/IBU) — авторские цели остаются
//  верными, пересчитывать их не нужно. Цвет чуть темнее: солода на литр больше.
//
//  Единый источник истины для трёх потребителей: слепка партии (brew-setup),
//  списания склада (inventory-service) и матча «сколько нужно» (match-service).
//  Разъедутся — вернётся дефект «карточка обещает, склад не сходится».
// =============================================================================

/** Множитель дожима засыпи. Любая сторона неизвестна/непозитивна → 1 (не дожимаем). */
export const resolveEfficiencyFactor = (
  recipeEfficiencyPct: number | null | undefined,
  targetEfficiencyPct: number | null | undefined
): number => {
  const from = recipeEfficiencyPct ?? DEFAULT_BREWHOUSE_EFFICIENCY_PCT;
  const to = targetEfficiencyPct;
  if (!Number.isFinite(from) || from <= 0 || to == null || !Number.isFinite(to) || to <= 0) {
    return 1;
  }
  return from / to;
};

/**
 * Действует ли на строку эффективность затирания. Тот же предикат, что и в движке
 * статистики (computeRecipeStatsSnapshot), иначе дожатая засыпь и расчёт OG
 * разошлись бы: солод и зерновые добавки — да, сахар/экстракт — нет.
 * Без техданных (кастомный ингредиент) — по типу строки.
 */
export const lineAppliesBrewhouseEfficiency = (line: {
  type?: string | null;
  technicalData?: IngredientTechnicalData | null;
}): boolean => fermentableAppliesMashEfficiency(line.technicalData ?? null, line.type === "malt");

/** Итоговый множитель строки: объём для всех, объём × дожим — для засыпи. */
export const resolveLineScaleFactor = (
  line: { type?: string | null; technicalData?: IngredientTechnicalData | null },
  volumeFactor: number,
  efficiencyFactor: number
): number => (
  efficiencyFactor !== 1 && lineAppliesBrewhouseEfficiency(line)
    ? volumeFactor * efficiencyFactor
    : volumeFactor
);

/**
 * Пересчёт рецепта под варку: полноценный RecipeDetailDto с батчем и КАЖДЫМ
 * количеством в обеих величинах (entered — для слепков и показа, normalized — для
 * движка статистики, водного плана и суммарной засыпи). ScaledRecipeView для этого
 * не годится: в нём нет батча в нормализованных единицах, а половина потребителей
 * рецепта считает именно по normalized.
 *
 * Нужен старту варки: партия варится в СВОЁМ объёме и на СВОЁМ оборудовании, и
 * план варочного дня, шаги гида и слепок состава обязаны считаться от них — иначе
 * гид скажет «засыпьте 6 кг», а со склада уйдёт 4 кг.
 *
 * Оба множителя = 1 (или не-объёмная единица батча) → рецепт возвращается как есть.
 */
export const scaleRecipeDetailForBrew = (
  recipe: RecipeDetailDto,
  options: { targetLitres?: number | null; targetEfficiencyPct?: number | null }
): RecipeDetailDto => {
  const scaled = scaleRecipeToVolume(recipe, options.targetLitres ?? Number.NaN);
  const volumeFactor = scaled.scaled ? scaled.factor : 1;
  const efficiencyFactor = resolveEfficiencyFactor(recipe.efficiency, options.targetEfficiencyPct);

  if (volumeFactor === 1 && efficiencyFactor === 1) {
    return recipe;
  }

  const targetEfficiency = efficiencyFactor !== 1 && options.targetEfficiencyPct != null
    ? options.targetEfficiencyPct
    : recipe.efficiency;

  return {
    ...recipe,
    // Эффективность варки — оборудования, на котором варим: с ней движок статистики
    // и водный план должны получить тот же OG, что у автора (засыпь уже дожата).
    efficiency: targetEfficiency,
    batchSizeEnteredQuantity: scaled.scaled
      ? scaled.batchSizeEnteredQuantity
      : recipe.batchSizeEnteredQuantity,
    batchSizeNormalizedQuantity: roundTo(recipe.batchSizeNormalizedQuantity * volumeFactor, SCALE_PRECISION),
    ingredients: recipe.ingredients.map((ingredient) => {
      const lineFactor = resolveLineScaleFactor(
        { type: ingredient.type, technicalData: ingredient.ingredientTechnicalData ?? null },
        volumeFactor,
        efficiencyFactor
      );
      if (lineFactor === 1) {
        return ingredient;
      }
      const scaledAmount = scaleIngredientAmount(
        { quantity: ingredient.amountEnteredQuantity, unit: ingredient.amountEnteredUnit },
        { quantity: ingredient.amountNormalizedQuantity, unit: ingredient.amountNormalizedUnit },
        ingredient.ingredientTechnicalData,
        lineFactor
      );
      return {
        ...ingredient,
        amountEnteredQuantity: scaledAmount.amountEnteredQuantity,
        amountEnteredUnit: scaledAmount.amountEnteredUnit,
        amountNormalizedQuantity: scaledAmount.amountNormalizedQuantity,
        amountNormalizedUnit: scaledAmount.amountNormalizedUnit
      };
    })
  };
};
