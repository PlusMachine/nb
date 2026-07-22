import { roundTo } from "@nb/brewing-core";

import { pluralize } from "../../lib/pluralize";
import { convertWithinDimension } from "../inventory/pack";
import {
  formatInventoryUnitLabel,
  getInventoryUnitDimension,
  parseInventoryUnit,
  type InventoryUnit
} from "../inventory/units";
import { formatInventoryQuantityInputValue } from "../inventory/display";

/**
 * П4 «Округление до покупабельных фасовок» (notes/shopping-list-improvements.md).
 * Один вариант фасовки каталога — только пара stockContent*, она гарантированно
 * сводима к складским единицам (parseInventoryUnit/convertWithinDimension).
 * packageAmount/packageUnit — сырой текст источника, здесь НЕ используется.
 */
export type PackVariantInput = {
  id: string;
  stockContentAmount: number | null;
  stockContentUnit: string | null;
  isDefaultForStock: boolean;
  position: number;
};

export type PackSuggestion = {
  count: number;
  packLabel: string;
  totalQuantity: number;
  totalUnit: InventoryUnit;
};

// Тот же эпсилон-паттерн, что и PACK_HINT_CEIL_EPSILON (features/inventory/display.ts) —
// «почти целая» пачка не должна округляться вверх из-за шума плавающей точки.
const CEIL_EPSILON = 1e-9;

// Порог для «вырожденной» фасовки: содержимое варианта ≈ 1 кг/л в единице нехватки —
// тогда пачка как единица покупки не несёт смысла, показываем просто итог.
const DEGENERATE_CONTENT_EPSILON = 1e-9;

type ResolvedVariant = {
  variant: PackVariantInput;
  contentInNeedUnit: number;
};

const byPosition = (a: ResolvedVariant, b: ResolvedVariant) => a.variant.position - b.variant.position;

const resolveVariants = (
  variants: readonly PackVariantInput[],
  needUnit: InventoryUnit
): ResolvedVariant[] => {
  const resolved: ResolvedVariant[] = [];

  for (const variant of variants) {
    const amount = variant.stockContentAmount;
    if (amount == null || !(amount > 0)) {
      continue;
    }

    if (!variant.stockContentUnit) {
      continue;
    }

    const parsedUnit = parseInventoryUnit(variant.stockContentUnit);
    if (!parsedUnit) {
      continue;
    }

    const converted = convertWithinDimension(amount, parsedUnit, needUnit);
    if (converted == null || !(converted > 0)) {
      continue;
    }

    resolved.push({ variant, contentInNeedUnit: converted });
  }

  return resolved;
};

const chooseVariant = (resolved: ResolvedVariant[], needQuantity: number): ResolvedVariant => {
  const defaults = resolved.filter((entry) => entry.variant.isDefaultForStock);
  if (defaults.length > 0) {
    return [...defaults].sort(byPosition)[0];
  }

  const covering = resolved.filter((entry) => entry.contentInNeedUnit >= needQuantity);
  const pool = covering.length > 0 ? covering : resolved;

  return [...pool].sort((a, b) => {
    const diff = a.contentInNeedUnit - b.contentInNeedUnit;
    if (diff !== 0) {
      return diff;
    }
    return byPosition(a, b);
  })[0];
};

const buildPackLabel = (count: number, content: number, totalQuantity: number, unit: InventoryUnit): string => {
  const isDegenerateUnitContent = (unit === "kg" || unit === "l")
    && Math.abs(content - 1) < DEGENERATE_CONTENT_EPSILON;

  if (isDegenerateUnitContent) {
    return `${formatInventoryQuantityInputValue(totalQuantity, unit)} ${formatInventoryUnitLabel(unit, totalQuantity)}`;
  }

  const perPackQuantity = roundTo(content, 3);
  const perPackLabel = `${formatInventoryQuantityInputValue(perPackQuantity, unit)} ${formatInventoryUnitLabel(unit, perPackQuantity)}`;

  if (count === 1) {
    return `пачка ${perPackLabel}`;
  }

  return `${count} ${pluralize(count, ["пачка", "пачки", "пачек"])} по ${perPackLabel}`;
};

export const resolvePackSuggestion = (
  need: { quantity: number; unit: InventoryUnit },
  variants: readonly PackVariantInput[]
): PackSuggestion | null => {
  if (!Number.isFinite(need.quantity) || need.quantity <= 0) {
    return null;
  }

  // «1 пачка» дрожжей (Б6) уже покрыта отдельной механикой — не дублировать.
  if (getInventoryUnitDimension(need.unit) === "count") {
    return null;
  }

  const resolved = resolveVariants(variants, need.unit);
  if (resolved.length === 0) {
    return null;
  }

  const chosen = chooseVariant(resolved, need.quantity);
  const content = chosen.contentInNeedUnit;

  const count = Math.max(1, Math.ceil(need.quantity / content - CEIL_EPSILON));
  const totalQuantity = roundTo(count * content, 3);
  const totalUnit = need.unit;

  return {
    count,
    packLabel: buildPackLabel(count, content, totalQuantity, totalUnit),
    totalQuantity,
    totalUnit
  };
};
