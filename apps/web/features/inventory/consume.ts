import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type { InventoryListItemDto } from "./contracts";
import {
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "./display";
import { resolveInventoryPackEquivalent, type InventoryPackEquivalent } from "./pack";
import {
  inventoryVolumeUnits,
  inventoryWeightUnits,
  normalizeInventoryMeasurementForProfile,
  resolveInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitProfile
} from "./units";

type InventoryDisplayMeasurement = {
  quantity: number;
  unit: InventoryUnit;
  converted: boolean;
};

/**
 * Builds the canonical "display input" object that the inventory display helpers
 * expect, straight from an inventory item DTO. Centralises the shape that is
 * otherwise hand-assembled across the quantity editor, details editor and card.
 */
export const buildInventoryDisplayInput = (item: InventoryListItemDto) => ({
  enteredQuantity: item.enteredQuantity,
  enteredUnit: item.enteredUnit,
  normalizedQuantity: item.normalizedQuantity,
  normalizedUnit: item.normalizedUnit,
  type: item.source.type,
  category: item.source.category,
  subtype: item.source.subtype,
  defaultDisplayUnit: item.source.defaultDisplayUnit,
  allowedUnits: item.source.allowedUnits,
  measurementDimension: item.source.measurementDimension,
  technicalData: item.source.technicalData
});

const resolveItemUnitProfile = (item: InventoryListItemDto): InventoryUnitProfile => (
  resolveInventoryUnitProfile({
    type: item.source.type,
    category: item.source.category,
    subtype: item.source.subtype,
    defaultDisplayUnit: item.source.defaultDisplayUnit,
    allowedUnits: item.source.allowedUnits,
    measurementDimension: item.source.measurementDimension,
    technicalData: item.source.technicalData
  })
);

/**
 * Converts a normalized quantity (g / ml / count) into an arbitrary target unit.
 * Mirrors the private converter used by the display layer so consumption math
 * stays consistent with how the remaining amount is shown on the card.
 * Returns null when the units are incompatible.
 */
export const convertInventoryNormalizedToUnit = (
  normalizedQuantity: number,
  normalizedUnit: InventoryUnit,
  targetUnit: InventoryUnit,
  packEquivalent?: InventoryPackEquivalent | null
): number | null => {
  if (normalizedUnit === targetUnit) {
    return normalizedQuantity;
  }

  if (normalizedUnit === "g" && (inventoryWeightUnits as readonly InventoryUnit[]).includes(targetUnit)) {
    return convertWeight({ value: normalizedQuantity, unit: "g" }, targetUnit as "g" | "kg" | "oz" | "lb").value;
  }

  if (normalizedUnit === "ml" && (inventoryVolumeUnits as readonly InventoryUnit[]).includes(targetUnit)) {
    return convertVolume({ value: normalizedQuantity, unit: "ml" }, targetUnit as "ml" | "l" | "gal").value;
  }

  if (
    targetUnit === "pack"
    && packEquivalent
    && packEquivalent.normalizedUnit === normalizedUnit
    && packEquivalent.normalizedQuantity > 0
  ) {
    return normalizedQuantity / packEquivalent.normalizedQuantity;
  }

  return null;
};

export type InventoryConsumeContext = {
  profile: InventoryUnitProfile;
  packEquivalent: InventoryPackEquivalent | null;
  remainingDisplay: InventoryDisplayMeasurement;
  defaultUnit: InventoryUnit;
  allowedUnits: InventoryUnit[];
};

/**
 * Resolves the static context for the consume flow: unit profile, pack
 * equivalent (yeast), the human-facing remaining amount and the default input
 * unit (the same unit the card uses to show the remaining quantity).
 */
export const resolveInventoryConsumeContext = (item: InventoryListItemDto): InventoryConsumeContext => {
  const profile = resolveItemUnitProfile(item);
  const packEquivalent = resolveInventoryPackEquivalent(item.source.technicalData);
  const remainingDisplay = resolveInventoryMeasurementForDisplay(buildInventoryDisplayInput(item));

  return {
    profile,
    packEquivalent,
    remainingDisplay,
    defaultUnit: remainingDisplay.unit,
    allowedUnits: profile.allowedUnits
  };
};

/**
 * Amount of remaining stock expressed in `unit`, used to pre-fill the input when
 * the user taps a fraction / "all" quick chip. Returns null when incompatible.
 */
export const resolveInventoryRemainingInUnit = (
  item: InventoryListItemDto,
  unit: InventoryUnit,
  packEquivalent?: InventoryPackEquivalent | null
): number | null => (
  convertInventoryNormalizedToUnit(item.normalizedQuantity, item.normalizedUnit, unit, packEquivalent)
);

export type InventoryAdjustDirection = "consume" | "restock";

export type InventoryConsumeState = {
  consumedNormalized: number;
  newNormalized: number;
  remainingDisplay: InventoryDisplayMeasurement;
  newRemainingDisplay: InventoryDisplayMeasurement;
  submitQuantity: string;
  submitUnit: InventoryUnit;
  willEmpty: boolean;
  error: string | null;
};

const resolveConsumedNormalized = (
  item: InventoryListItemDto,
  context: InventoryConsumeContext,
  amount: number,
  unit: InventoryUnit
): number => {
  if (unit === "pack") {
    if (context.packEquivalent && context.packEquivalent.normalizedUnit === item.normalizedUnit) {
      return amount * context.packEquivalent.normalizedQuantity;
    }

    if (item.normalizedUnit === "pack") {
      return amount;
    }

    throw new Error("INCOMPATIBLE_UNIT");
  }

  const measurement = normalizeInventoryMeasurementForProfile(context.profile, amount, unit);
  if (measurement.normalizedUnit !== item.normalizedUnit) {
    throw new Error("INCOMPATIBLE_UNIT");
  }

  return measurement.normalizedQuantity;
};

/**
 * Computes the result of adjusting an inventory item by `amount` of `unit`:
 * consuming subtracts (clamped at zero), restocking adds. Returns the new
 * remaining, its human-facing display, and the absolute value to submit to
 * `updateInventoryInlineAction`.
 */
export const resolveInventoryConsumeState = ({
  item,
  context,
  amount,
  unit,
  direction = "consume"
}: {
  item: InventoryListItemDto;
  context: InventoryConsumeContext;
  amount: number;
  unit: InventoryUnit;
  direction?: InventoryAdjustDirection;
}): InventoryConsumeState => {
  const base = {
    remainingDisplay: context.remainingDisplay,
    submitUnit: context.remainingDisplay.unit
  };

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ...base,
      consumedNormalized: 0,
      newNormalized: item.normalizedQuantity,
      newRemainingDisplay: context.remainingDisplay,
      submitQuantity: formatInventoryQuantityInputValue(context.remainingDisplay.quantity, context.remainingDisplay.unit),
      willEmpty: false,
      error: "Введите количество больше нуля."
    };
  }

  let consumedNormalized: number;
  try {
    consumedNormalized = resolveConsumedNormalized(item, context, amount, unit);
  } catch {
    return {
      ...base,
      consumedNormalized: 0,
      newNormalized: item.normalizedQuantity,
      newRemainingDisplay: context.remainingDisplay,
      submitQuantity: formatInventoryQuantityInputValue(context.remainingDisplay.quantity, context.remainingDisplay.unit),
      willEmpty: false,
      error: "Эта единица измерения не подходит для позиции."
    };
  }

  const newNormalized = direction === "restock"
    ? roundTo(item.normalizedQuantity + consumedNormalized, 3)
    : Math.max(0, roundTo(item.normalizedQuantity - consumedNormalized, 3));
  const newRemainingDisplay = resolveInventoryMeasurementForDisplay({
    ...buildInventoryDisplayInput(item),
    enteredQuantity: newNormalized,
    enteredUnit: item.normalizedUnit,
    normalizedQuantity: newNormalized
  });

  return {
    ...base,
    consumedNormalized,
    newNormalized,
    newRemainingDisplay,
    submitQuantity: formatInventoryQuantityInputValue(newRemainingDisplay.quantity, newRemainingDisplay.unit),
    submitUnit: newRemainingDisplay.unit,
    willEmpty: direction === "consume" && newNormalized <= 0,
    error: null
  };
};

export const inventoryConsumeFractions: { label: string; value: number }[] = [
  { label: "¼", value: 0.25 },
  { label: "½", value: 0.5 },
  { label: "¾", value: 0.75 }
];
