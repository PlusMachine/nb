import { and, brewBatches, db, eq, inArray } from "@nb/db";

import { resolveEfficiencyFactor } from "./scale";
import { toBatchVolumeLiters } from "./units";

/**
 * Пересчёт количеств рецепта под объём варки — ОДИН источник истины для матча
 * («сколько нужно») и для списания склада («сколько снимаем»).
 *
 * До этого ответы расходились: матч масштабировал строки под дефолтный профиль
 * оборудования, а списание брало количества рецепта как есть. Рецепт на 30 л при
 * профиле «BIAB 20 л» давал на странице партии «Хватает всего» и одновременно
 * INSUFFICIENT_STOCK по кнопке «Списать со склада» — на одних и тех же данных.
 *
 * Для ПАРТИИ целевой объём — её собственный: `brew_plan_snapshot.recipe.batchSizeL`,
 * слепок на момент старта варки. Не дефолтный профиль оборудования (варят именно
 * эту партию) и не текущий объём рецепта (рецепт с тех пор могли поправить).
 * Профиль оборудования остаётся дефолтом там, где партии нет (витрина, дашборд,
 * «Почти хватает на:») — там вопрос другой: «сварю ли я это на своём оборудовании».
 */

export const FALLBACK_BATCH_VOLUME_L = 20;

/** Объём рецепта в литрах. Кривая единица/ноль → фолбэк: матч не должен падать. */
export const safeRecipeBatchVolumeL = (normalizedQuantity: number, normalizedUnit: string): number => {
  try {
    const volume = toBatchVolumeLiters(normalizedQuantity, normalizedUnit);
    return volume > 0 ? volume : FALLBACK_BATCH_VOLUME_L;
  } catch {
    return FALLBACK_BATCH_VOLUME_L;
  }
};

/**
 * Множитель количеств рецепта под целевой объём (рецепт 20 л → партия 30 л = 1.5).
 * Неизвестный/нулевой объём с любой стороны → 1: «не знаем — не масштабируем»,
 * иначе списание молча разошлось бы с рецептом.
 */
export const resolveBatchScaleFactor = (recipeBatchVolumeL: number, targetBatchVolumeL: number): number => (
  recipeBatchVolumeL > 0 && targetBatchVolumeL > 0 ? targetBatchVolumeL / recipeBatchVolumeL : 1
);

/**
 * Объём партии из её плана. null — в снапшоте объёма нет (старый план/рецепт с
 * не-объёмной единицей); тогда потребность считается от объёма самого рецепта.
 */
export const readBrewPlanBatchVolumeL = (snapshot: unknown): number | null => {
  const value = (snapshot as { recipe?: { batchSizeL?: unknown } } | null | undefined)?.recipe?.batchSizeL;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Множитель дожима засыпи ЭТОЙ партии: варится на 65%, автор считал на 75% →
 * солода нужно ×1.154, чтобы попасть в авторский OG (см. features/recipes/scale.ts).
 * Обе эффективности — из плана партии, а не из живого рецепта: рецепт с тех пор
 * могли поправить, а варится то, что зафиксировано на старте. Полей нет (старые
 * партии) → 1.
 */
export const readBrewPlanEfficiencyFactor = (snapshot: unknown): number => {
  const recipe = (snapshot as {
    recipe?: { efficiencyPct?: unknown; recipeEfficiencyPct?: unknown };
  } | null | undefined)?.recipe;
  const target = typeof recipe?.efficiencyPct === "number" ? recipe.efficiencyPct : null;
  const source = typeof recipe?.recipeEfficiencyPct === "number" ? recipe.recipeEfficiencyPct : null;
  if (target == null || source == null) {
    return 1;
  }
  return resolveEfficiencyFactor(source, target);
};

/** Масштаб партии: объём (л) и дожим засыпи под эффективность оборудования. */
export type BrewBatchScale = {
  targetBatchVolumeL: number | null;
  efficiencyFactor: number;
};

/**
 * Масштабы партий (brewBatchId → объём + дожим) одним запросом — для батч-матча.
 * Скоуп по userId: чужие партии сюда не доезжают.
 */
export const getBrewBatchScales = async (
  userId: string,
  brewBatchIds: string[]
): Promise<Map<string, BrewBatchScale>> => {
  const ids = [...new Set(brewBatchIds)].filter(Boolean);
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await db.query.brewBatches.findMany({
    where: and(eq(brewBatches.userId, userId), inArray(brewBatches.id, ids)),
    columns: { id: true, brewPlanSnapshot: true }
  });

  const scales = new Map<string, BrewBatchScale>();
  for (const row of rows) {
    scales.set(row.id, {
      targetBatchVolumeL: readBrewPlanBatchVolumeL(row.brewPlanSnapshot),
      efficiencyFactor: readBrewPlanEfficiencyFactor(row.brewPlanSnapshot)
    });
  }

  return scales;
};

/**
 * Объёмы партий (brewBatchId → л). Партии без объёма в плане в карту не попадают
 * (вызывающий трактует как «не масштабировать»).
 */
export const getBrewBatchVolumesL = async (
  userId: string,
  brewBatchIds: string[]
): Promise<Map<string, number>> => {
  const scales = await getBrewBatchScales(userId, brewBatchIds);
  const volumes = new Map<string, number>();
  for (const [id, scale] of scales) {
    if (scale.targetBatchVolumeL != null) {
      volumes.set(id, scale.targetBatchVolumeL);
    }
  }
  return volumes;
};

/** Масштаб одной партии. null — партия чужая/не найдена. */
export const getBrewBatchScale = async (
  userId: string,
  brewBatchId: string
): Promise<BrewBatchScale | null> => {
  const scales = await getBrewBatchScales(userId, [brewBatchId]);
  return scales.get(brewBatchId) ?? null;
};

/** Объём одной партии, л. null — партия чужая/без объёма в плане. */
export const getBrewBatchVolumeL = async (
  userId: string,
  brewBatchId: string
): Promise<number | null> => {
  const scale = await getBrewBatchScale(userId, brewBatchId);
  return scale?.targetBatchVolumeL ?? null;
};
