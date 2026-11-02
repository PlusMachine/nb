import { gravityToSg, sgToBrix, type CalculatorGravityUnit } from "@nb/brewing-core";

import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { convertGravityFieldValue, convertGravityOffsetValue } from "@/features/system/gravity-units";
import type { CalculatorSlug } from "./catalog";
import type { CalculatorState } from "./definitions";

type GravityInputUnit = CalculatorGravityUnit | "points";
type GravityInput = { value: string; unit: GravityInputUnit; display: string };
type GravityInputs = { version: 1; fields: Record<string, GravityInput> };
type GravityInputConfig = { unitField: string; valueFields: string[]; offsetFields?: string[]; rawBrix?: boolean };

export const calculatorGravityInputs: Partial<Record<CalculatorSlug, GravityInputConfig>> = {
  "abv-attenuation": { unitField: "gravityUnit", valueFields: ["og", "fg"] },
  "dilution-boiloff": { unitField: "gravityUnit", valueFields: ["currentGravity", "targetGravity"] },
  "hydrometer-correction": { unitField: "readingUnit", valueFields: ["reading"], offsetFields: ["offset"] },
  "refractometer-correction": { unitField: "originalUnit", valueFields: ["originalValue"], rawBrix: true },
  ibu: { unitField: "gravityUnit", valueFields: ["wortGravity"] },
  "yeast-starter": { unitField: "gravityUnit", valueFields: ["gravity"] },
  "speise-krausen": { unitField: "gravityUnit", valueFields: ["speiseGravity"] },
  "brewhouse-efficiency": { unitField: "gravityUnit", valueFields: ["measuredOg"] },
  "unit-converter": { unitField: "gravityFrom", valueFields: ["gravityValue"] }
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isUnit = (unit: unknown): unit is GravityInputUnit => ["SG", "Plato", "Brix", "points"].includes(String(unit));
const numberOf = (value: unknown) => {
  const parsed = parseDecimalInput(String(value ?? ""));
  return parsed != null && Number.isFinite(parsed) ? parsed : null;
};
const sameNumber = (left: unknown, right: unknown) => (
  String(left ?? "") === String(right ?? "") || (numberOf(left) != null && numberOf(left) === numberOf(right))
);

const sourceFields = (state: CalculatorState): Record<string, unknown> => {
  const stored = state._gravityInputs;
  return isRecord(stored) && stored.version === 1 && isRecord(stored.fields) ? stored.fields : {};
};

export const invalidateCalculatorGravityInputs = (state: CalculatorState, fields?: string[]): CalculatorState => {
  const next = { ...state };
  if (!fields) delete next._gravityInputs;
  else next._gravityInputs = { version: 1, fields: Object.fromEntries(Object.entries(sourceFields(state)).filter(([field]) => !fields.includes(field))) };
  return next;
};

// Старые сохранения не содержат источников: их текущее значение и шкала становятся
// первым измерением. display защищает от устаревшего источника при внешнем изменении поля.
export const readCalculatorGravityInput = (state: CalculatorState, field: string, unit: GravityInputUnit): GravityInput => {
  const source = sourceFields(state)[field];
  if (isRecord(source) && isUnit(source.unit) && typeof source.value === "string" && source.value.length <= 64
    && typeof source.display === "string" && sameNumber(source.display, state[field])) {
    return source as GravityInput;
  }
  const value = String(state[field] ?? "");
  return { value, unit, display: value };
};

const sourceToSg = (source: GravityInput, fallback: number): number => {
  const value = numberOf(source.value);
  return value == null ? fallback : source.unit === "points" ? 1 + value / 1000 : gravityToSg(value, source.unit);
};

export const calculatorGravitySg = (state: CalculatorState, field: string, unit: CalculatorGravityUnit, fallback = 0): number => (
  sourceToSg(readCalculatorGravityInput(state, field, unit), fallback)
);

export const calculatorGravityOffsetSg = (state: CalculatorState, field: string, unit: CalculatorGravityUnit): number => {
  const source = readCalculatorGravityInput(state, field, unit);
  const value = numberOf(source.value) ?? 0;
  return source.unit === "SG" || value === 0 ? value : sourceToSg(source, 1) - 1;
};

const formatSource = (state: CalculatorState, source: GravityInput, unit: GravityInputUnit, offset: boolean, rawBrix: boolean): string => {
  if (source.unit === unit) return source.value;
  if (offset) return convertGravityOffsetValue(source.value, source.unit as CalculatorGravityUnit, unit as CalculatorGravityUnit);
  if (!rawBrix || (source.unit !== "Brix" && unit !== "Brix")) return convertGravityFieldValue(source.value, source.unit, unit);
  const value = numberOf(source.value);
  if (value == null || (source.unit === "SG" && value <= 0)) return source.value;
  const wcf = numberOf(state.wortCorrectionFactor);
  const factor = wcf != null && wcf > 0 ? wcf : 1.04;
  if (source.unit === "Brix") return convertGravityFieldValue(value / factor, "Brix", unit);
  const raw = sgToBrix(sourceToSg(source, 1)) * factor;
  return Number(raw.toFixed(1)) === 0 ? "0.0" : raw.toFixed(1);
};

// °Bx рефрактометра — сырое показание, SG/°P — истинная плотность: граница
// между ними учитывает WCF. Форматирование общее для ручной смены шкалы и профиля.
export const convertRefractometerOgFieldValue = (
  state: CalculatorState, value: unknown, fromUnit: CalculatorGravityUnit, toUnit: CalculatorGravityUnit
): string => formatSource(state, { value: String(value ?? ""), unit: fromUnit, display: String(value ?? "") }, toUnit, false, true);

export const switchCalculatorGravityUnit = (
  slug: CalculatorSlug, state: CalculatorState, unit: GravityInputUnit, touched = true
): CalculatorState => {
  const config = calculatorGravityInputs[slug];
  if (!config || !isUnit(unit)) return state;
  const currentUnit = isUnit(state[config.unitField]) ? state[config.unitField] as GravityInputUnit : "SG";
  const fields: GravityInputs["fields"] = {};
  const next: CalculatorState = { ...state, [config.unitField]: unit };
  for (const field of [...config.valueFields, ...(config.offsetFields ?? [])]) {
    const source = readCalculatorGravityInput(state, field, currentUnit);
    const display = formatSource(state, source, unit, Boolean(config.offsetFields?.includes(field)), Boolean(config.rawBrix));
    fields[field] = { ...source, display };
    next[field] = display;
  }
  next._gravityInputs = { version: 1, fields } satisfies GravityInputs;
  if (touched) next.gravityUnitTouched = true;
  return next;
};

export const updateCalculatorInput = (slug: CalculatorSlug, state: CalculatorState, name: string, value: unknown): CalculatorState => {
  const config = calculatorGravityInputs[slug];
  if (config?.unitField === name && isUnit(value)) return switchCalculatorGravityUnit(slug, state, value);
  const next = { ...state, [name]: value };
  if (config && [...config.valueFields, ...(config.offsetFields ?? [])].includes(name)) {
    const unit = isUnit(state[config.unitField]) ? state[config.unitField] as GravityInputUnit : "SG";
    // blur может убрать запятую и нули. Нормализуем исходную строку в её шкале,
    // но не заменяем исходный замер округлённым числом из другой шкалы.
    if (sameNumber(state[name], value) && readCalculatorGravityInput(state, name, unit).unit !== unit) return next;
    next._gravityInputs = { version: 1, fields: { ...sourceFields(state), [name]: { value: String(value ?? ""), unit, display: String(value ?? "") } } };
  }
  if (config?.rawBrix && name === "wortCorrectionFactor") {
    return switchCalculatorGravityUnit(slug, next, state[config.unitField] as GravityInputUnit, false);
  }
  return next;
};

export const restoreCalculatorGravityInputs = (slug: CalculatorSlug, state: CalculatorState, raw: string | undefined): CalculatorState => {
  const config = calculatorGravityInputs[slug];
  if (!config || !raw || raw.length > 4096) return state;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.fields)) return state;
    const candidate = { ...state, _gravityInputs: parsed };
    const unit = isUnit(state[config.unitField]) ? state[config.unitField] as GravityInputUnit : "SG";
    const fields = Object.fromEntries([...config.valueFields, ...(config.offsetFields ?? [])].map(field => (
      [field, readCalculatorGravityInput(candidate, field, unit)]
    )));
    return { ...state, _gravityInputs: { version: 1, fields } };
  } catch {
    return state;
  }
};
