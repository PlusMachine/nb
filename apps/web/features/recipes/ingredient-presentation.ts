import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import { formatInventoryQuantityForDisplay, formatPackCountHintSuffix } from "@/features/inventory/display";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import type { IngredientTechnicalData } from "@/features/ingredients/contracts";
import type { RecipeIngredientDto } from "@/features/recipes/contracts";

// Общие read-хелперы позиции рецепта: имя/количество/тайминг из stepMeta.
// Используются и списком ингредиентов, и read-only секциями процесса
// (кипячение/брожение) — чтобы обе стороны читали снапшот одинаково.

export const resolveRecipeIngredientNames = (ingredient: RecipeIngredientDto) =>
  resolveIngredientDisplayNames({
    displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? ingredient.type,
    displayNameRu: ingredient.ingredientDisplayNameRu,
    displayNameEn: ingredient.ingredientDisplayNameEn
  });

export const formatRecipeIngredientAmount = (ingredient: RecipeIngredientDto): string => {
  const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
  // technicalData сюда НЕ идёт (см. ниже) — formatInventoryQuantityForDisplay для
  // дрожжей всегда предпочитает "pack" как display-unit, а после Ф9-конверсии
  // (features/recipes/scale.ts) строка может быть уже в граммах/мл — пересчёт
  // назад в дробную пачку вернул бы тот же баг «0.73 пачки».
  const base = formatInventoryQuantityForDisplay({
    enteredQuantity: ingredient.amountEnteredQuantity,
    enteredUnit: ingredient.amountEnteredUnit,
    normalizedQuantity: ingredient.amountNormalizedQuantity,
    normalizedUnit: ingredient.amountNormalizedUnit,
    type: ingredient.type,
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.ingredientDefaultDisplayUnitSnapshot,
    allowedUnits: ingredient.ingredientAllowedUnits ?? null,
    measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? null
  });

  // Строка дрожжей уже в весе/объёме (после Ф9-конверсии пачки в граммы) — рядом
  // подсказка «(N пачек)» как ориентир "сколько взять", если граммовка известна.
  if (category === "yeast" && (ingredient.amountEnteredUnit === "g" || ingredient.amountEnteredUnit === "ml")) {
    const packEquivalent = resolveInventoryPackEquivalent(ingredient.ingredientTechnicalData ?? null);
    const hint = formatPackCountHintSuffix(ingredient.amountEnteredQuantity, ingredient.amountEnteredUnit, packEquivalent);
    if (hint) {
      return `${base} (${hint})`;
    }
  }

  return base;
};

export const recipeIngredientCategoryOf = (ingredient: RecipeIngredientDto) =>
  ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });

const stepMetaOf = (ingredient: RecipeIngredientDto): Record<string, unknown> =>
  (ingredient.stepMeta ?? {}) as Record<string, unknown>;

export const recipeIngredientUseType = (ingredient: RecipeIngredientDto): string | null => {
  const useType = stepMetaOf(ingredient).useType;
  return typeof useType === "string" ? useType : null;
};

/** Эффективное время внесения в минутах: stepMeta.timeMinutes с фолбэком на legacy timeOffset. */
export const recipeIngredientTimeMinutes = (ingredient: RecipeIngredientDto): number | null => {
  const time = stepMetaOf(ingredient).timeMinutes;
  if (typeof time === "number" && Number.isFinite(time)) {
    return time;
  }
  return typeof ingredient.timeOffset === "number" && Number.isFinite(ingredient.timeOffset)
    ? ingredient.timeOffset
    : null;
};

export const recipeIngredientDurationDays = (ingredient: RecipeIngredientDto): number | null => {
  const days = stepMetaOf(ingredient).durationDays;
  return typeof days === "number" && Number.isFinite(days) ? days : null;
};

export const buildRecipeIngredientCardSource = (ingredient: RecipeIngredientDto) => {
  const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });

  // Override альфы позиции (recipe_ingredients.stepMeta.alphaAcidPct) должен совпадать
  // с тем, что показывает редактор рецепта — подмешиваем его в копию technicalData,
  // не трогая исходный объект (та же логика в recipe-designer/helpers.ts).
  const hopTechnicalData = category === "hop" && ingredient.ingredientTechnicalData?.type === "hop"
    ? ingredient.ingredientTechnicalData as Extract<IngredientTechnicalData, { type: "hop" }>
    : null;
  const stepMeta = (ingredient.stepMeta ?? null) as Record<string, unknown> | null;
  const alphaAcidPctOverride = hopTechnicalData && stepMeta && typeof stepMeta.alphaAcidPct === "number" && Number.isFinite(stepMeta.alphaAcidPct)
    ? stepMeta.alphaAcidPct
    : null;
  const technicalData = alphaAcidPctOverride != null && hopTechnicalData
    ? { ...hopTechnicalData, alphaAcidPctTypical: alphaAcidPctOverride }
    : ingredient.ingredientTechnicalData ?? null;

  return {
    type: ingredient.type,
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    brand: ingredient.ingredientBrand ?? null,
    producer: ingredient.ingredientProducer ?? null,
    brandName: ingredient.ingredientBrandName ?? null,
    manufacturer: ingredient.ingredientManufacturer ?? null,
    countryCode: ingredient.ingredientCountryCode ?? null,
    countryName: ingredient.ingredientCountryName ?? null,
    country: ingredient.ingredientCountry ?? null,
    technicalData
  };
};
