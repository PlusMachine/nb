import { recipeFermentableUseTypes, type RecipeHopUseType } from "@/features/recipes/contracts";

/**
 * Общие словари переводов для стадий/способов внесения ингредиентов рецепта.
 * Источник истины — этот модуль; recipe-designer/helpers.ts реэкспортирует
 * значения отсюда, чтобы не дублировать логику.
 */
export const hopUseTypeLabels: Record<RecipeHopUseType, string> = {
  boil: "Кипячение",
  first_wort_hop: "Первое сусло (FWH)",
  whirlpool: "Вирпул / хопстенд",
  dry_hop: "Сухое охмеление",
  dip_hop: "Дип-хоп",
  other: "Другое"
};

export const fermentableUseLabels: Record<(typeof recipeFermentableUseTypes)[number], string> = {
  mash: "Затор",
  steep: "Настой",
  boil: "Кипячение"
};
