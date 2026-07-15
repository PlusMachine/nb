import { calculateEquipmentVolumePlan } from "../equipment-profiles/volume-plan";
import { buildRecipeWaterPlanResult, type RecipeWaterPlanFermentableInput } from "../recipes/water-plan";
import { toBatchVolumeLiters } from "../recipes/units";
import type { RecipeDetailDto } from "../recipes/contracts";
import type { BrewPlanSnapshot } from "./contracts";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

// Дублирует buildFermentablesForWaterPlan из
// components/recipes/public-recipe-water-section.tsx: там это внутренний
// хелпер серверного компонента, а сюда, в сервисный слой, тянуть React ради
// одной чистой функции неуместно.
const isFermentableIngredientForWaterPlan = (ingredient: RecipeDetailDto["ingredients"][number]): boolean => (
  ingredient.ingredientCategory === "fermentable" || ingredient.type === "malt" || ingredient.type === "fermentable"
);

// Класс/цвет солода для модели pH затора (Ф6/Ф7) несут только "малтовые" технические
// данные (MaltTechnicalData) — у ферментируемых-не-солодов (сахар, экстракт и т.п.)
// эти поля не заполняются, там классификатор падает на ключевые слова имени.
const resolveMaltFieldsForWaterPlan = (
  technicalData: RecipeDetailDto["ingredients"][number]["ingredientTechnicalData"]
): Pick<RecipeWaterPlanFermentableInput, "maltType" | "colorEbcMin" | "colorEbcMax"> => {
  if (!technicalData || technicalData.type !== "malt") {
    return { maltType: null, colorEbcMin: null, colorEbcMax: null };
  }

  const malt = technicalData as Extract<
    NonNullable<typeof technicalData>,
    { type: "malt" }
  >;
  return {
    maltType: malt.maltType ?? null,
    colorEbcMin: malt.colorEbcMin ?? null,
    colorEbcMax: malt.colorEbcMax ?? null
  };
};

const buildFermentablesForWaterPlan = (
  ingredients: RecipeDetailDto["ingredients"]
): RecipeWaterPlanFermentableInput[] => ingredients
  .filter(isFermentableIngredientForWaterPlan)
  .map((ingredient) => {
    const unit = ingredient.amountNormalizedUnit;
    const qty = ingredient.amountNormalizedQuantity;
    const weightKg = unit === "kg" ? qty : unit === "g" ? qty / 1000 : 0;
    return {
      name: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameRu ?? ingredient.ingredientDisplayNameSnapshot ?? null,
      subtype: ingredient.ingredientSubtype ?? null,
      weightKg,
      ...resolveMaltFieldsForWaterPlan(ingredient.ingredientTechnicalData)
    };
  });

// Аккуратное число для граммов/миллилитров добавки воды: без хвостовых нулей.
const roundDose = (value: number): number => Number(value.toFixed(1));

// Солод, который входит в общую засыпь (шаг гида "Засыпьте солод", см.
// mash:dough-in в brew-day.ts): категория fermentable, стадия mash, и
// stepMeta.use отсутствует или === "mash". Настойный солод (use === "steep") в
// эту сумму не входит — за него в гиде отвечает свой шаг "Внести: …". Симметричный
// предикат isMashDoughInDuplicate в brew-day.ts делает то же самое над
// raw-снапшотом (там нет типизированного RecipeDetailDto, поэтому предикат не общий).
const isMashDoughInFermentable = (ingredient: RecipeDetailDto["ingredients"][number]): boolean => {
  if (ingredient.ingredientCategory !== "fermentable" || ingredient.stage !== "mash") {
    return false;
  }
  const stepMeta = ingredient.stepMeta;
  const use = isRecord(stepMeta) && typeof stepMeta.use === "string" ? stepMeta.use : null;
  return use == null || use === "mash";
};

/**
 * Прекомпьют водного движка для гида варочного дня: соли/кислоты затора и
 * промывки + целевой pH. Считается один раз на старте варки (не на каждый
 * рендер) — снапшот иммутабелен, движок ощутимо тяжелее остальной сборки
 * плана. Возвращает null, если водоподготовка не включена в рецепте, движок
 * ничего не насчитал (нечего вносить) или упал на кривых входных данных —
 * создание партии важнее шагов гида по воде.
 */
const buildWaterSchedule = (
  recipe: RecipeDetailDto,
  batchSizeL: number | null
): BrewPlanSnapshot["waterSchedule"] => {
  const waterPlanMeta = recipe.waterPlanMeta;
  if (!waterPlanMeta?.setupEnabled) {
    return null;
  }

  try {
    const fermentables = buildFermentablesForWaterPlan(recipe.ingredients);
    const grainKg = fermentables.reduce((sum, item) => sum + (item.weightKg ?? 0), 0);
    const equipmentVolumePlan = recipe.equipmentProfileSnapshot
      ? calculateEquipmentVolumePlan(
          {
            ...recipe.equipmentProfileSnapshot,
            targetBatchVolumeL: batchSizeL ?? recipe.equipmentProfileSnapshot.targetBatchVolumeL,
            grainAbsorptionLPerKg:
              waterPlanMeta.grainAbsorptionLPerKg ?? recipe.equipmentProfileSnapshot.grainAbsorptionLPerKg
          },
          grainKg,
          recipe.boilTimeMinutes
        )
      : null;

    const result = buildRecipeWaterPlanResult({
      waterPlanMeta,
      fallbackBatchVolumeL: batchSizeL,
      boilTimeMinutes: recipe.boilTimeMinutes,
      equipmentVolumePlan,
      grainKg,
      beerSrm: recipe.color ?? null,
      fermentables
    });

    const mashSalts = result.mashSaltAdditions
      .map((salt) => ({ label: salt.label, grams: roundDose(salt.grams) }))
      .filter((salt) => salt.grams > 0);
    const spargeSalts = result.spargeSaltAdditions
      .map((salt) => ({ label: salt.label, grams: roundDose(salt.grams) }))
      .filter((salt) => salt.grams > 0);
    const mashAcid = result.mashAcidAddition && result.mashAcidAddition.mashAcidMl > 0
      ? { label: result.mashAcidAddition.label, ml: roundDose(result.mashAcidAddition.mashAcidMl) }
      : null;
    const spargeAcid = result.spargeAcidAddition && result.spargeAcidAddition.spargeAcidMl > 0
      ? { label: result.spargeAcidAddition.label, ml: roundDose(result.spargeAcidAddition.spargeAcidMl) }
      : null;

    if (!mashSalts.length && !spargeSalts.length && !mashAcid && !spargeAcid) {
      return null;
    }

    return {
      mashSalts,
      spargeSalts,
      mashAcid,
      spargeAcid,
      targetMashPh: waterPlanMeta.targetMashPh ?? null
    };
  } catch {
    return null;
  }
};

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

export const buildBrewPlanSnapshot = (
  recipe: RecipeDetailDto,
  // Эффективность рецепта ДО пересчёта под оборудование варщика: recipe сюда уже
  // приезжает пересчитанным (см. brew-setup.ts), и своей исходной он не помнит.
  // Не передана — варим на авторской эффективности, дожима засыпи не было.
  options: { recipeEfficiencyPct?: number | null } = {}
): BrewPlanSnapshot => {
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

  // Суммарная засыпь солода (для шага гида «Засыпьте солод») — только mash-солод
  // без настойного use="steep" (isMashDoughInFermentable, Ф10) и только строки в
  // граммах, чтобы не путать единицы измерения; прочие пропускаем.
  const grainBillTotalGrams = recipe.ingredients
    .filter((ingredient) => isMashDoughInFermentable(ingredient) && ingredient.amountNormalizedUnit === "g")
    .reduce((sum, ingredient) => sum + ingredient.amountNormalizedQuantity, 0);
  const grainBillTotalKg = grainBillTotalGrams > 0
    ? Number((grainBillTotalGrams / 1000).toFixed(2))
    : null;

  const batchSizeL = recipe.batchSizeNormalizedUnit === "ml"
    ? toBatchVolumeLiters(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit)
    : null;

  return {
    version: "brew_plan_v1",
    recipe: {
      id: recipe.id,
      title: recipe.title,
      versionNumber: recipe.versionNumber,
      batchSizeL,
      efficiencyPct: recipe.efficiency ?? null,
      recipeEfficiencyPct: options.recipeEfficiencyPct ?? recipe.efficiency ?? null
    },
    equipmentProfileSnapshot: recipe.equipmentProfileSnapshot ?? null,
    waterPlanMeta: recipe.waterPlanMeta ?? null,
    waterSchedule: buildWaterSchedule(recipe, batchSizeL),
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
    grainBillTotalKg,
    deviceHints: []
  };
};
