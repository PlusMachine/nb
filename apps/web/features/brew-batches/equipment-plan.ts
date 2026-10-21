import { buildStarterEquipmentProfileDefaults } from "../equipment/defaults";
import { calculateEquipmentVolumePlan } from "../equipment-profiles/volume-plan";
import { buildRecipeWaterPlanFermentables } from "../recipes/water-plan-ingredients";
import { toBatchVolumeLiters } from "../recipes/units";
import type { RecipeDetailDto } from "../recipes/contracts";

/** Базовые литры нужны и без химической водоподготовки. */
export const buildBrewEquipmentPlan = (recipe: RecipeDetailDto) => {
  const grainKg = buildRecipeWaterPlanFermentables(recipe.ingredients).reduce((sum, item) => sum + (item.weightKg ?? 0), 0);
  const profile = recipe.equipmentProfileSnapshot ?? { ...buildStarterEquipmentProfileDefaults(), id: null, snapshotAt: new Date().toISOString() };
  const plan = calculateEquipmentVolumePlan({
    ...profile,
    targetBatchVolumeL: toBatchVolumeLiters(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit),
    grainAbsorptionLPerKg: recipe.waterPlanMeta?.grainAbsorptionLPerKg ?? profile.grainAbsorptionLPerKg
  }, grainKg, recipe.boilTimeMinutes);
  const n = (value: number) => Number(value.toFixed(2));
  const warnings = plan.warnings.map((warning) => {
    switch (warning) {
      case "grain_bill_limit_exceeded": return `Засыпь ${n(grainKg)} кг превышает максимум оборудования ${profile.maxGrainKg} кг.`;
      case "kettle_volume_limit_exceeded": return `До кипячения нужно ${n(plan.preBoilHotL)} л, максимум котла — ${profile.maxKettleVolumeL} л.`;
      case "mash_volume_limit_exceeded": return `Затор требует больше воды, чем вмещает заторник (${profile.maxMashVolumeL} л). Уменьшите объём партии или измените оборудование.`;
      case "mash_below_min_volume": return `Объём заторной воды меньше минимума оборудования ${profile.minMashVolumeL} л.`;
      default: return "Проверьте вместимость оборудования перед варкой.";
    }
  });
  return {
    ...plan,
    warnings,
    mashWaterL: recipe.waterPlanMeta?.mashWaterVolumeL ?? plan.mashWaterL,
    spargeWaterL: recipe.waterPlanMeta?.spargeWaterVolumeL ?? plan.spargeWaterL
  };
};
