import type { PreferredGravityUnit } from "@nb/auth";
import { gravityToSg, sgToGravityUnit, sgToPlato, type CalculatorGravityUnit } from "@nb/brewing-core";

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

/**
 * Голое число в предпочитаемой единице, без суффикса. Нужно там, где единицу
 * печатает не форматтер, а сама вёрстка — например, наклейка ставит «°P» один
 * раз на строку «OG 15.2 · FG 3.1», а не после каждого числа.
 */
export const formatGravityNumber = (
  value: number | null,
  unit: PreferredGravityUnit,
  precision?: number
): string | null => {
  if (value == null) {
    return null;
  }

  if (unit === "sg") {
    return value.toFixed(precision ?? 3);
  }

  return formatConvertedGravity(sgToGravityUnit(value, toCalculatorGravityUnit(unit)), precision ?? 1);
};

/** Единый форматтер плотности — одно число в предпочитаемой единице, без дублей. */
export const formatGravity = (
  value: number | null,
  unit: PreferredGravityUnit,
  precision?: number
): string => {
  const number = formatGravityNumber(value, unit, precision);
  if (number == null) {
    return "—";
  }

  return unit === "sg" ? number : `${number} ${gravityUnitLabels[unit]}`;
};

/** Суффикс единицы для вёрстки, печатающей его отдельно от числа; у SG суффикса нет. */
export const gravityUnitSuffix = (unit: PreferredGravityUnit): string | null =>
  unit === "sg" ? null : gravityUnitLabels[unit];

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

/**
 * Пересчёт ПОПРАВКИ (дельты) плотности при смене единицы — например, поправки прибора у
 * ареометра. Дельту нельзя конвертировать как абсолютную плотность: якорь — вода
 * (1.000 SG ↔ 0 °P/°Bx), т.е. «в дистилляте прибор показывает 1.002» ↔ «показывает 0.51 °P».
 * Пустое/некорректное значение возвращается как есть, как в convertGravityFieldValue.
 */
export const convertGravityOffsetValue = (
  rawValue: unknown,
  fromUnit: CalculatorGravityUnit,
  toUnit: CalculatorGravityUnit
): string => {
  // Plato ↔ Brix — численно одна шкала (см. secondaryGravityUnit): дельта не меняется.
  if (fromUnit === toUnit || (fromUnit !== "SG" && toUnit !== "SG")) {
    return String(rawValue ?? "");
  }

  const value = typeof rawValue === "number" ? rawValue : parseDecimalInput(String(rawValue ?? "")) ?? Number.NaN;
  if (!Number.isFinite(value)) {
    return String(rawValue ?? "");
  }

  // Показание прибора в дистилляте = вода + дельта; переводим это показание в целевую
  // шкалу и вычитаем воду в ней же. Вычитание разности полиномов (а не «нуля» шкалы)
  // гасит артефакт sgToPlato(1.000) ≈ −0.003 — ноль остаётся нулём в обе стороны.
  if (toUnit === "SG") {
    return (gravityToSg(value, fromUnit) - 1).toFixed(4);
  }

  const delta = sgToPlato(1 + value, 6) - sgToPlato(1, 6);
  return formatConvertedGravity(delta, 2);
};
