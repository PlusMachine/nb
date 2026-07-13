import { getEquipmentProfile } from "../equipment-profiles/service";
import { buildEquipmentProfileSnapshotFromDto } from "../equipment-profiles/snapshot";
import type { RecipeDetailDto } from "../recipes/contracts";
import { scaleRecipeDetailForBrew } from "../recipes/scale";

/**
 * Настройка варки на старте: «в каком объёме» и «на каком оборудовании».
 *
 * Рецепт на 30 л варится на 20-литровом оборудовании сплошь и рядом (чужой рецепт
 * с витрины — норма, клонировать его ради объёма никто не обязан). Раньше объём
 * партии молча брался из рецепта: гид, водный план и списание считали 30 л, а
 * карточка рецепта обещала «хватает» из расчёта на профиль пользователя (20 л) —
 * два ответа на одних данных. Теперь объём — явный выбор в диалоге «Сварить», а
 * здесь он материализуется ОДИН раз, до сборки снапшотов.
 *
 * Профиль подставляется целиком (объём, выпаривание, потери, впитывание зерна,
 * ЭФФЕКТИВНОСТЬ) — иначе водный план варочного дня остался бы посчитан по чужому
 * котлу. Эффективность вдобавок дожимает засыпь, чтобы попасть в авторский OG на
 * своём оборудовании (см. features/recipes/scale.ts) — цели OG/FG/ABV/IBU при этом
 * остаются авторскими и пересчёта не требуют.
 *
 * Отдаёт рецепт, от которого считается ВСЁ остальное в createBrewBatchFromRecipe:
 * план варочного дня, слепок состава, водный план. Ничего не пишет в БД.
 */
export const resolveBrewBatchRecipe = async (
  userId: string,
  recipe: RecipeDetailDto,
  options: { targetBatchVolumeL?: number | null; equipmentProfileId?: string | null }
): Promise<{ recipe: RecipeDetailDto; recipeEfficiencyPct: number | null }> => {
  const recipeEfficiencyPct = recipe.efficiency ?? null;
  let profileEfficiencyPct: number | null = null;
  let resolved = recipe;

  if (options.equipmentProfileId) {
    // Чужой профиль сюда не пролезет: getEquipmentProfile скоупит по userId и
    // кидает NOT_FOUND (клиентскому payload не доверяем).
    const profile = await getEquipmentProfile(userId, options.equipmentProfileId);
    profileEfficiencyPct = profile.brewhouseEfficiencyPct;
    resolved = {
      ...resolved,
      equipmentProfileId: profile.id,
      equipmentProfileSnapshot: buildEquipmentProfileSnapshotFromDto(profile)
    };
  }

  const targetBatchVolumeL = options.targetBatchVolumeL != null
    && Number.isFinite(options.targetBatchVolumeL)
    && options.targetBatchVolumeL > 0
    ? options.targetBatchVolumeL
    : null;

  if (targetBatchVolumeL == null && profileEfficiencyPct == null) {
    return { recipe: resolved, recipeEfficiencyPct };
  }

  return {
    recipe: scaleRecipeDetailForBrew(resolved, {
      targetLitres: targetBatchVolumeL,
      targetEfficiencyPct: profileEfficiencyPct
    }),
    recipeEfficiencyPct
  };
};
