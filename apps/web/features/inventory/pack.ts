import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type { IngredientTechnicalData } from "../ingredients/contracts";
import {
  type InventoryVolumeUnit,
  inventoryVolumeUnits,
  type InventoryWeightUnit,
  inventoryWeightUnits,
  parseInventoryUnit,
  type InventoryUnit
} from "./units";

export type InventoryPackEquivalent = {
  normalizedUnit: InventoryUnit;
  normalizedQuantity: number;
};

const fallbackDryYeastPack: InventoryPackEquivalent = {
  normalizedUnit: "g",
  normalizedQuantity: 11
};

const normalizePositiveNumber = (value: unknown) => (
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
);

const isWeightUnit = (unit: InventoryUnit): unit is InventoryWeightUnit => (
  (inventoryWeightUnits as readonly InventoryUnit[]).includes(unit)
);

const isVolumeUnit = (unit: InventoryUnit): unit is InventoryVolumeUnit => (
  (inventoryVolumeUnits as readonly InventoryUnit[]).includes(unit)
);

export const resolveInventoryPackEquivalent = (
  technicalData?: IngredientTechnicalData | null
): InventoryPackEquivalent | null => {
  if (!technicalData || technicalData.type !== "yeast") {
    return null;
  }

  const packageSize = normalizePositiveNumber(technicalData.packageSize);
  const packageUnit = parseInventoryUnit(String(technicalData.packageUnit ?? "").trim().toLowerCase());

  if (packageSize != null && packageUnit) {
    if (isWeightUnit(packageUnit)) {
      return {
        normalizedUnit: "g",
        normalizedQuantity: roundTo(convertWeight({ value: packageSize, unit: packageUnit }, "g").value, 3)
      };
    }

    if (isVolumeUnit(packageUnit)) {
      return {
        normalizedUnit: "ml",
        normalizedQuantity: roundTo(convertVolume({ value: packageSize, unit: packageUnit }, "ml").value, 3)
      };
    }
  }

  return technicalData.form === "dry" ? fallbackDryYeastPack : null;
};

export type InventoryItemPackSource = {
  packageVariant?: {
    stockContentAmount: number | null;
    stockContentUnit: string | null;
  } | null;
  technicalData?: IngredientTechnicalData | null;
};

/**
 * «1 пачка = N г/мл/шт» для КОНКРЕТНОЙ складской позиции — зеркало того, как
 * склад раскрывает пачку при записи (normalizeMeasurementWithPackageVariant,
 * features/inventory/service.ts): сначала содержимое выбранного варианта
 * фасовки, иначе технические поля ингредиента (для сухих дрожжей — фолбэк 11 г).
 * Единственный мост pack↔г/мл в проекте: рецепт хранит строку в «пачках», склад —
 * в граммах, и подбор/списание обязаны считать по одному и тому же курсу.
 */
export const resolveInventoryItemPackEquivalent = ({
  packageVariant,
  technicalData
}: InventoryItemPackSource): InventoryPackEquivalent | null => {
  const stockContentAmount = normalizePositiveNumber(packageVariant?.stockContentAmount);
  const stockContentUnit = packageVariant?.stockContentUnit
    ? parseInventoryUnit(packageVariant.stockContentUnit)
    : null;

  if (stockContentAmount != null && stockContentUnit) {
    return {
      normalizedUnit: stockContentUnit,
      normalizedQuantity: stockContentAmount
    };
  }

  return resolveInventoryPackEquivalent(technicalData ?? null);
};

const convertWithinDimension = (
  quantity: number,
  fromUnit: InventoryUnit,
  toUnit: InventoryUnit
): number | null => {
  if (isWeightUnit(fromUnit) && isWeightUnit(toUnit)) {
    return convertWeight({ value: quantity, unit: fromUnit }, toUnit).value;
  }

  if (isVolumeUnit(fromUnit) && isVolumeUnit(toUnit)) {
    return convertVolume({ value: quantity, unit: fromUnit }, toUnit).value;
  }

  return null;
};

/**
 * Ядро конверсии складских количеств. Внутри одной размерности — обычный
 * пересчёт (г↔кг, мл↔л), между «пачкой» и её содержимым — через packEquivalent
 * (в обе стороны). Всё, что не сводится, — null (INCOMPATIBLE_UNIT у вызывающих).
 */
const convertInventoryQuantity = (
  quantity: number,
  fromUnit: InventoryUnit,
  toUnit: InventoryUnit,
  packEquivalent?: InventoryPackEquivalent | null
): number | null => {
  if (fromUnit === toUnit) {
    return quantity;
  }

  const withinDimension = convertWithinDimension(quantity, fromUnit, toUnit);
  if (withinDimension != null) {
    return withinDimension;
  }

  if (!packEquivalent || !(packEquivalent.normalizedQuantity > 0)) {
    return null;
  }

  if (fromUnit === "pack") {
    const inContentUnit = quantity * packEquivalent.normalizedQuantity;
    return packEquivalent.normalizedUnit === toUnit
      ? inContentUnit
      : convertWithinDimension(inContentUnit, packEquivalent.normalizedUnit, toUnit);
  }

  if (toUnit === "pack") {
    const inContentUnit = packEquivalent.normalizedUnit === fromUnit
      ? quantity
      : convertWithinDimension(quantity, fromUnit, packEquivalent.normalizedUnit);

    return inContentUnit == null ? null : inContentUnit / packEquivalent.normalizedQuantity;
  }

  return null;
};

/**
 * Нормализованное количество позиции (г / мл / шт / пачки) в произвольной
 * единице показа или ввода. Используется редакторами количества и списанием со
 * склада, чтобы остаток на карточке и математика списания считались одинаково.
 * Возвращает null, если единицы несовместимы.
 */
export const convertInventoryNormalizedToUnit = (
  normalizedQuantity: number,
  normalizedUnit: InventoryUnit,
  targetUnit: InventoryUnit,
  packEquivalent?: InventoryPackEquivalent | null
): number | null => convertInventoryQuantity(normalizedQuantity, normalizedUnit, targetUnit, packEquivalent);

/**
 * Обратное направление: требование (например, строка рецепта «1 пачка») в
 * нормализованной единице складской позиции («11 г»). Округление — как у записи
 * склада (3 знака), чтобы аллокация и остаток жили в одной сетке.
 */
export const convertQuantityToInventoryNormalizedUnit = (
  quantity: number,
  fromUnit: InventoryUnit,
  toUnit: InventoryUnit,
  packEquivalent?: InventoryPackEquivalent | null
): number | null => {
  const converted = convertInventoryQuantity(quantity, fromUnit, toUnit, packEquivalent);
  return converted == null ? null : roundTo(converted, 3);
};
