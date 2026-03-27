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

export const resolveInventoryPackEquivalent = (
  technicalData?: IngredientTechnicalData | null
): InventoryPackEquivalent | null => {
  if (!technicalData || technicalData.type !== "yeast") {
    return null;
  }

  const packageSize = normalizePositiveNumber(technicalData.packageSize);
  const packageUnit = parseInventoryUnit(String(technicalData.packageUnit ?? "").trim().toLowerCase());

  if (packageSize != null && packageUnit) {
    if ((inventoryWeightUnits as readonly InventoryUnit[]).includes(packageUnit)) {
      const weightUnit = packageUnit as InventoryWeightUnit;
      return {
        normalizedUnit: "g",
        normalizedQuantity: roundTo(convertWeight({ value: packageSize, unit: weightUnit }, "g").value, 3)
      };
    }

    if ((inventoryVolumeUnits as readonly InventoryUnit[]).includes(packageUnit)) {
      const volumeUnit = packageUnit as InventoryVolumeUnit;
      return {
        normalizedUnit: "ml",
        normalizedQuantity: roundTo(convertVolume({ value: packageSize, unit: volumeUnit }, "ml").value, 3)
      };
    }
  }

  return technicalData.form === "dry" ? fallbackDryYeastPack : null;
};
