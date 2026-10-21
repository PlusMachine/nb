import { roundTo } from "@nb/brewing-core";

import type { RecipeMatchLineDto, RecipeMatchLineStatus } from "./contracts";

/**
 * Ключ «один ингредиент» для счётчиков «Есть N из M»: кипячение + вирпул одного
 * Citra — одна позиция, а не две. Каталог/кастом → exact id; name-only строки
 * (импорт без привязки) схлопываются по категории+имени.
 *
 * Чистый модуль без DB — можно импортировать из клиентских компонентов панели матча.
 */
export const resolveMatchIngredientIdentityKey = (line: Pick<
  RecipeMatchLineDto,
  "ingredientCatalogItemId" | "userCustomIngredientId" | "ingredientDisplayName" | "category" | "recipeIngredientId"
>): string => {
  if (line.ingredientCatalogItemId) {
    return `catalog:${line.ingredientCatalogItemId}`;
  }
  if (line.userCustomIngredientId) {
    return `custom:${line.userCustomIngredientId}`;
  }
  const name = (line.ingredientDisplayName ?? "").trim().toLowerCase();
  if (name) {
    return `name:${line.category ?? "?"}:${name}`;
  }
  return `line:${line.recipeIngredientId}`;
};

export type MatchIngredientGroup = {
  category: string | null;
  lines: RecipeMatchLineDto[];
};

export const groupMatchLinesByIngredient = (lines: RecipeMatchLineDto[]): MatchIngredientGroup[] => {
  const groups = new Map<string, MatchIngredientGroup>();
  for (const line of lines) {
    const key = resolveMatchIngredientIdentityKey(line);
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      continue;
    }
    groups.set(key, { category: line.category, lines: [line] });
  }
  return [...groups.values()];
};

/**
 * Схлопывает повторные добавки одного ингредиента (кипячение + вирпул + dry-hop)
 * в одну строку для панели матча — иначе Mosaic 15′ / 0′ / dry hop выглядят как
 * три разных позиции с тремя кнопками «На склад».
 */
export const collapseMatchLinesForPanel = (lines: RecipeMatchLineDto[]): RecipeMatchLineDto[] => (
  groupMatchLinesByIngredient(lines)
    .map((group) => {
      if (group.lines.length === 1) {
        return group.lines[0]!;
      }

      const sorted = [...group.lines].sort((left, right) => (
        left.displayOrder - right.displayOrder
        || left.recipeIngredientId.localeCompare(right.recipeIngredientId)
      ));
      const primary = sorted[0]!;

      let required = 0;
      let available = 0;
      let shortfall = 0;
      let suggestedAddQuantity = 0;
      let suggestedAddUnit: RecipeMatchLineDto["suggestedAddUnit"] = null;
      let suggestedUnitConflict = false;

      for (const line of sorted) {
        required += line.requiredQuantityNormalized;
        available += line.availableQuantityNormalized;
        shortfall += line.shortfallNormalized;
        if (line.suggestedAddQuantity == null || !line.suggestedAddUnit) {
          continue;
        }
        if (!suggestedAddUnit) {
          suggestedAddUnit = line.suggestedAddUnit;
          suggestedAddQuantity = line.suggestedAddQuantity;
        } else if (line.suggestedAddUnit === suggestedAddUnit) {
          suggestedAddQuantity += line.suggestedAddQuantity;
        } else {
          suggestedUnitConflict = true;
        }
      }

      const allMissing = sorted.every((line) => line.status === "missing");
      const allFullyCovered = sorted.every(
        (line) => line.status === "covered" || line.status === "substitute"
      );
      const allSubstitute = sorted.every((line) => line.status === "substitute");

      let status: RecipeMatchLineStatus;
      if (allFullyCovered) {
        status = allSubstitute ? "substitute" : "covered";
      } else if (allMissing) {
        status = "missing";
      } else {
        status = "partial";
      }

      const coveragePercent = required > 0
        ? Math.round(Math.min(Math.max((required - shortfall) / required, 0), 1) * 100)
        : (allFullyCovered ? 100 : 0);

      const showSuggested = status !== "covered" && status !== "substitute" && !suggestedUnitConflict && suggestedAddUnit;

      return {
        ...primary,
        status,
        coveragePercent,
        requiredQuantityNormalized: roundTo(required, 3),
        availableQuantityNormalized: roundTo(available, 3),
        shortfallNormalized: roundTo(shortfall, 3),
        viaSubstitute: sorted.some((line) => line.viaSubstitute),
        suggestedAddQuantity: showSuggested ? roundTo(suggestedAddQuantity, 3) : null,
        suggestedAddUnit: showSuggested ? suggestedAddUnit : null
      };
    })
    .sort((left, right) => left.displayOrder - right.displayOrder)
);
