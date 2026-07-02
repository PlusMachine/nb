import { toBatchVolumeLiters } from "../recipes/units";
import type { RecipeDetailDto } from "../recipes/contracts";
import type { BrewPlanSnapshot } from "./contracts";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readHopUseType = (ingredient: RecipeDetailDto["ingredients"][number]) => {
  const stepMeta = ingredient.stepMeta;
  if (isRecord(stepMeta) && typeof stepMeta.useType === "string") {
    return stepMeta.useType;
  }

  if (ingredient.stage === "whirlpool") return "whirlpool";
  if (ingredient.stage === "fermentation") return "dry_hop";
  if (ingredient.stage === "boil") return "boil";
  return "other";
};

const buildTimedAddition = (ingredient: RecipeDetailDto["ingredients"][number]) => ({
  linePersistentKey: ingredient.persistentKey,
  name: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? "Ingredient",
  category: ingredient.ingredientCategory ?? null,
  stage: ingredient.stage,
  timeOffsetMinutes: ingredient.timeOffset,
  amount: {
    quantity: ingredient.amountEnteredQuantity,
    unit: ingredient.amountEnteredUnit
  },
  stepMeta: ingredient.stepMeta ?? null
});

export const buildBrewPlanSnapshot = (recipe: RecipeDetailDto): BrewPlanSnapshot => {
  const mashSteps = recipe.processMeta.mashProfile.steps.map((step) => ({
    id: step.id,
    name: step.name,
    targetTemperatureC: step.temperatureC,
    durationMinutes: step.durationMinutes
  }));
  const timedAdditions = recipe.ingredients
    .filter((ingredient) => ingredient.stage === "boil" || ingredient.stage === "mash")
    .map(buildTimedAddition);
  const whirlpoolPlan = recipe.ingredients
    .filter((ingredient) => readHopUseType(ingredient) === "whirlpool" || readHopUseType(ingredient) === "dip_hop")
    .map(buildTimedAddition);
  // Сухой хмель и другие внесения на брожении: стадия fermentation целиком, кроме
  // дрожжей (питчинг дрожжей уже покрыт шагом «Поставить на брожение» — отдельный
  // шаг для него был бы дублем). Не хмель ли это — не важно: category сохраняется
  // в записи для рендера (см. buildTimedAddition), гид размечает единообразно.
  const dryHopPlan = recipe.ingredients
    .filter((ingredient) => ingredient.stage === "fermentation" && ingredient.ingredientCategory !== "yeast")
    .map(buildTimedAddition);
  // Позиции рецепта на розливе (прайминг-сахар и т.п.) — раньше вообще не попадали
  // в снапшот варки (только настройки packagingPlan, не строки состава). См. #6c.
  const packagingAdditions = recipe.ingredients
    .filter((ingredient) => ingredient.stage === "packaging")
    .map(buildTimedAddition);

  return {
    version: "brew_plan_v1",
    recipe: {
      id: recipe.id,
      title: recipe.title,
      versionNumber: recipe.versionNumber,
      batchSizeL: recipe.batchSizeNormalizedUnit === "ml"
        ? toBatchVolumeLiters(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit)
        : null
    },
    equipmentProfileSnapshot: recipe.equipmentProfileSnapshot ?? null,
    waterPlanMeta: recipe.waterPlanMeta ?? null,
    mashSteps,
    boilPlan: {
      boilTimeMinutes: recipe.boilTimeMinutes,
      timedAdditions
    },
    whirlpoolPlan,
    dryHopPlan,
    fermentationPlan: recipe.processMeta.fermentationProfile as unknown as Record<string, unknown>,
    packagingPlan: recipe.brewPlanMeta?.packagingPlan && isRecord(recipe.brewPlanMeta.packagingPlan)
      ? recipe.brewPlanMeta.packagingPlan
      : null,
    packagingAdditions,
    deviceHints: []
  };
};
