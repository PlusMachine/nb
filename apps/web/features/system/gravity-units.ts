import { sgToGravityUnit, type CalculatorGravityUnit } from "@nb/brewing-core";

export const preferredGravityUnits = ["sg", "plato", "brix"] as const;
export type PreferredGravityUnit = (typeof preferredGravityUnits)[number];

export const defaultPreferredGravityUnit: PreferredGravityUnit = "plato";

export const gravityUnitLabels: Record<PreferredGravityUnit, string> = {
  sg: "SG",
  plato: "°P",
  brix: "°Bx"
};

export const resolvePreferredGravityUnit = (value: unknown): PreferredGravityUnit => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (preferredGravityUnits as readonly string[]).includes(normalized)
    ? (normalized as PreferredGravityUnit)
    : defaultPreferredGravityUnit;
};

export const toCalculatorGravityUnit = (unit: PreferredGravityUnit): CalculatorGravityUnit => (
  unit === "sg" ? "SG" : unit === "brix" ? "Brix" : "Plato"
);

/**
 * ABV-калькулятор намеренно не поддерживает Brix (показание рефрактометра после
 * брожения занижает крепость — см. `abvGravityUnitOptions` в calculators/definitions.ts).
 * При предпочтении Brix откатываемся на Plato — числа совпадают, это та же шкала.
 */
export const toAbvGravityUnit = (unit: PreferredGravityUnit): Extract<CalculatorGravityUnit, "SG" | "Plato"> => (
  unit === "sg" ? "SG" : "Plato"
);

/** Единый форматтер плотности — одно число в предпочитаемой единице, без дублей. */
export const formatGravity = (
  value: number | null,
  unit: PreferredGravityUnit,
  precision?: number
): string => {
  if (value == null) {
    return "—";
  }

  if (unit === "sg") {
    return value.toFixed(precision ?? 3);
  }

  const converted = Math.max(0, sgToGravityUnit(value, toCalculatorGravityUnit(unit)));
  return `${converted.toFixed(precision ?? 1)} ${gravityUnitLabels[unit]}`;
};

/**
 * Диапазон плотности («мин–макс») в предпочитаемой единице — единица не дублируется
 * (один суффикс на пару чисел), как и в `formatGravity`. Возвращает null, если хотя
 * бы одна из границ не задана — рядом с точечным значением диапазон тогда просто не
 * показывается.
 */
export const formatGravityRange = (
  min: number | null,
  max: number | null,
  unit: PreferredGravityUnit,
  precision?: number
): string | null => {
  if (min == null || max == null) {
    return null;
  }

  if (unit === "sg") {
    return `${min.toFixed(precision ?? 3)}–${max.toFixed(precision ?? 3)}`;
  }

  const convertedMin = Math.max(0, sgToGravityUnit(min, toCalculatorGravityUnit(unit)));
  const convertedMax = Math.max(0, sgToGravityUnit(max, toCalculatorGravityUnit(unit)));
  return `${convertedMin.toFixed(precision ?? 1)}–${convertedMax.toFixed(precision ?? 1)} ${gravityUnitLabels[unit]}`;
};
