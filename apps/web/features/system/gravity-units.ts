import type { PreferredGravityUnit } from "@nb/auth";
import { gravityToSg, sgToGravityUnit, type CalculatorGravityUnit } from "@nb/brewing-core";

import { parseDecimalInput } from "@/features/forms/numeric-validation";

// sgToPlato(1.000) ≈ −0.003 — артефакт полинома: после округления получилось бы «−0.0».
// Приводим такой ноль к «0.0», но настоящие отрицательные °P/°Bx (FG ниже 1.000 SG
// у очень сухого пива) сохраняем — обнулять их значит показывать неверный замер.
const formatConvertedGravity = (converted: number, precision: number): string => {
  const text = converted.toFixed(precision);
  return Number(text) === 0 ? (0).toFixed(precision) : text;
};

export const preferredGravityUnits = ["sg", "plato", "brix"] as const satisfies readonly PreferredGravityUnit[];
export type { PreferredGravityUnit };

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

export const fromCalculatorGravityUnit = (unit: CalculatorGravityUnit): PreferredGravityUnit => (
  unit === "SG" ? "sg" : unit === "Brix" ? "brix" : "plato"
);

/**
 * Вторая (дублирующая) единица рядом с основной: у SG это Plato, у Plato и Brix — SG.
 * Brix никогда не выступает второй единицей: численно он совпадает с Plato, дубль
 * не добавил бы информации.
 */
export const secondaryGravityUnit = (unit: PreferredGravityUnit): PreferredGravityUnit => (
  unit === "sg" ? "plato" : "sg"
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

  const converted = sgToGravityUnit(value, toCalculatorGravityUnit(unit));
  return `${formatConvertedGravity(converted, precision ?? 1)} ${gravityUnitLabels[unit]}`;
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

  const convertedMin = sgToGravityUnit(min, toCalculatorGravityUnit(unit));
  const convertedMax = sgToGravityUnit(max, toCalculatorGravityUnit(unit));
  return `${formatConvertedGravity(convertedMin, precision ?? 1)}–${formatConvertedGravity(convertedMax, precision ?? 1)} ${gravityUnitLabels[unit]}`;
};

/**
 * Значение во «второй» единице (см. secondaryGravityUnit) — для дублирующего слоя
 * рядом с основным числом. В отличие от formatGravity, SG здесь идёт с суффиксом
 * «SG»: без основного контекста голое «1.052» рядом с «12,9 °P» не читается.
 */
export const formatGravitySecondary = (
  value: number | null,
  unit: PreferredGravityUnit,
  precision?: number
): string | null => {
  if (value == null) {
    return null;
  }

  const secondary = secondaryGravityUnit(unit);
  if (secondary === "sg") {
    return `${value.toFixed(precision ?? 3)} SG`;
  }

  return formatGravity(value, secondary, precision);
};

/** Диапазон во «второй» единице — пара к formatGravityRange для дублирующего слоя. */
export const formatGravityRangeSecondary = (
  min: number | null,
  max: number | null,
  unit: PreferredGravityUnit,
  precision?: number
): string | null => {
  if (min == null || max == null) {
    return null;
  }

  const secondary = secondaryGravityUnit(unit);
  if (secondary === "sg") {
    return `${min.toFixed(precision ?? 3)}–${max.toFixed(precision ?? 3)} SG`;
  }

  return formatGravityRange(min, max, secondary, precision);
};

/**
 * Пересчёт строкового значения поля плотности при смене единицы ввода (переключатель
 * SG/°P/°Bx в калькуляторах): число остаётся осмысленным, а не «1.050 как Plato».
 * Пустое/некорректное значение возвращается как есть, чтобы не мешать набору.
 * Единственная общая реализация — вместо локальных копий в калькуляторах.
 */
export const convertGravityFieldValue = (
  rawValue: unknown,
  fromUnit: CalculatorGravityUnit,
  toUnit: CalculatorGravityUnit
): string => {
  if (fromUnit === toUnit) {
    return String(rawValue ?? "");
  }

  // parseDecimalInput вместо голого Number: NumericInput до blur хранит «12,4» с запятой,
  // а переключить шкалу можно и посреди набора — такое значение тоже должно пересчитаться.
  const value = typeof rawValue === "number" ? rawValue : parseDecimalInput(String(rawValue ?? "")) ?? Number.NaN;
  // SG ≤ 0 — заведомо неполный/мусорный ввод; для Plato/Brix валидны 0 и небольшие
  // отрицательные значения (FG ниже 1.000 SG у очень сухого пива).
  if (!Number.isFinite(value) || (fromUnit === "SG" && value <= 0)) {
    return String(rawValue ?? "");
  }

  const sg = gravityToSg(value, fromUnit);
  return toUnit === "SG" ? sg.toFixed(3) : formatConvertedGravity(sgToGravityUnit(sg, toUnit), 1);
};
