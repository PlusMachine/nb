import { z } from "zod";

import {
  fermentableSubtypes,
  hopSubtypes,
  ingredientCategories,
  ingredientDisplayUnits,
  isIngredientDisplayUnit,
  isIngredientSubtypeForCategory,
  miscSubtypes,
  resolveIngredientCategory,
  resolveIngredientSubtype,
  waterPrepSubtypes,
  yeastSubtypes,
  type FermentableSubtype,
  type HopSubtype,
  type IngredientCategory,
  type IngredientDisplayUnit,
  type IngredientSubtype,
  type MiscSubtype,
  type WaterPrepSubtype,
  type YeastSubtype
} from "./taxonomy";

export const hopForms = ["pellet", "whole_cone", "lupulin", "cryo"] as const;
export type HopForm = (typeof hopForms)[number];
export const legacyYeastTypes = ["ale", "lager", "wine"] as const;
export type LegacyYeastType = (typeof legacyYeastTypes)[number];
export const yeastForms = ["dry", "liquid", "slurry", "culture"] as const;
export type YeastForm = (typeof yeastForms)[number];
export const yeastFlocculationLevels = ["low", "medium", "high", "very_high"] as const;
export type YeastFlocculationLevel = (typeof yeastFlocculationLevels)[number];
export const waterPrepPhysicalForms = ["solid", "powder", "crystal", "liquid", "solution", "tablet"] as const;
export type WaterPrepPhysicalForm = (typeof waterPrepPhysicalForms)[number];
export const miscUsagePhases = ["mash", "boil", "whirlpool", "fermentation", "conditioning", "packaging", "water_prep", "other"] as const;
export type MiscUsagePhase = (typeof miscUsagePhases)[number];

export type IngredientTechnicalFields = {
  manufacturer?: string | null;
  country?: string | null;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  fermentableProteinPct?: number | null;
  fermentableMoisturePct?: number | null;
  fermentableMaxUsagePercent?: number | null;
  fermentableDiastaticPowerLintner?: number | null;
  fermentableUsageFlags?: string[] | null;
  hopAlphaAcidPct?: number | null;
  hopBetaAcidPct?: number | null;
  hopTotalOilMlPer100g?: number | null;
  hopForm?: HopForm | null;
  hopSeason?: string | null;
  hopNotes?: string | null;
  yeastAttenuationPct?: number | null;
  yeastType?: LegacyYeastType | null;
  yeastForm?: YeastForm | null;
  yeastMinFermentationTempC?: number | null;
  yeastMaxFermentationTempC?: number | null;
  yeastFlocculation?: YeastFlocculationLevel | null;
  yeastAlcoholTolerancePct?: number | null;
  yeastPackageSize?: number | null;
  yeastPackageUnit?: IngredientDisplayUnit | null;
  yeastPhenolic?: boolean | null;
  yeastDiastaticus?: boolean | null;
  waterPrepCompound?: string | null;
  waterPrepAcidType?: string | null;
  waterPrepStrengthPct?: number | null;
  waterPrepPurityPct?: number | null;
  waterPrepPhysicalForm?: WaterPrepPhysicalForm | null;
  miscUsagePhase?: MiscUsagePhase | null;
  miscDoseHint?: string | null;
};

export type FermentableTechnicalData = {
  category: "fermentable";
  subtype: FermentableSubtype;
  colorEbc: number;
  extractYieldPct: number;
  proteinPct: number | null;
  moisturePct: number | null;
  maxUsagePercent: number | null;
  diastaticPowerLintner: number | null;
  usageFlags: string[];
};

export type HopTechnicalData = {
  category: "hop";
  subtype: HopSubtype;
  alphaAcidPct: number;
  betaAcidPct: number | null;
  totalOilMlPer100g: number | null;
  notes: string | null;
  harvestYear: number | null;
};

export type YeastTechnicalData = {
  category: "yeast";
  subtype: YeastSubtype;
  form: YeastForm;
  attenuationPct: number;
  tempMinC: number | null;
  tempMaxC: number | null;
  flocculation: YeastFlocculationLevel | null;
  alcoholTolerancePct: number | null;
  packageSize: number | null;
  packageUnit: IngredientDisplayUnit | null;
  phenolic: boolean | null;
  diastaticus: boolean | null;
};

export type WaterPrepTechnicalData = {
  category: "water_prep";
  subtype: WaterPrepSubtype;
  compound: string | null;
  acidType: string | null;
  strengthPct: number | null;
  purityPct: number | null;
  physicalForm: WaterPrepPhysicalForm | null;
};

export type MiscTechnicalData = {
  category: "misc";
  subtype: MiscSubtype;
  usagePhase: MiscUsagePhase | null;
  doseHint: string | null;
};

export type IngredientTechnicalData =
  | FermentableTechnicalData
  | HopTechnicalData
  | YeastTechnicalData
  | WaterPrepTechnicalData
  | MiscTechnicalData;

type IngredientTechnicalSource = {
  category?: string | null;
  subtype?: string | null;
  type?: string | null;
  technicalData?: Record<string, unknown> | IngredientTechnicalData | null;
  properties?: Record<string, unknown> | null;
  brandName?: string | null;
  manufacturer?: string | null;
  country?: string | null;
  harvestYear?: number | null;
  description?: string | null;
} & IngredientTechnicalFields;

const nullableNumberField = (min: number, max: number) => z.preprocess((value) => {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return Number(trimmed);
  }

  return value;
}, z.number().min(min).max(max).nullable());

const nullableTextField = (max: number) => z.preprocess((value) => {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed || null;
}, z.string().trim().max(max).nullable());

const nullableBooleanField = z.preprocess((value) => {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().nullable());

const usageFlagsField = z.preprocess((value) => {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}, z.array(z.string().trim().min(1).max(40)).max(12));

const ingredientDisplayUnitEnum = z.enum(ingredientDisplayUnits);

const fermentableTechnicalFieldSchema = z.object({
  category: z.literal("fermentable"),
  subtype: z.enum(fermentableSubtypes),
  colorEbc: z.number().positive(),
  extractYieldPct: z.number().gt(0).max(100),
  proteinPct: nullableNumberField(0, 100),
  moisturePct: nullableNumberField(0, 100),
  maxUsagePercent: nullableNumberField(0, 100),
  diastaticPowerLintner: nullableNumberField(0, 1000),
  usageFlags: usageFlagsField.default([])
});

const hopTechnicalFieldSchema = z.object({
  category: z.literal("hop"),
  subtype: z.enum(hopSubtypes),
  alphaAcidPct: z.number().gt(0).max(100),
  betaAcidPct: nullableNumberField(0, 100),
  totalOilMlPer100g: nullableNumberField(0, 20),
  notes: nullableTextField(1000),
  harvestYear: z.number().int().min(1900).max(2200).nullable()
});

const yeastTechnicalFieldSchema = z.object({
  category: z.literal("yeast"),
  subtype: z.enum(yeastSubtypes),
  form: z.enum(yeastForms),
  attenuationPct: z.number().gt(0).max(100),
  tempMinC: nullableNumberField(-10, 60),
  tempMaxC: nullableNumberField(-10, 60),
  flocculation: z.enum(yeastFlocculationLevels).nullable(),
  alcoholTolerancePct: nullableNumberField(0, 100),
  packageSize: nullableNumberField(0.0001, 100000),
  packageUnit: ingredientDisplayUnitEnum.nullable(),
  phenolic: nullableBooleanField,
  diastaticus: nullableBooleanField
});

const waterPrepTechnicalFieldSchema = z.object({
  category: z.literal("water_prep"),
  subtype: z.enum(waterPrepSubtypes),
  compound: nullableTextField(120),
  acidType: nullableTextField(120),
  strengthPct: nullableNumberField(0.0001, 100),
  purityPct: nullableNumberField(0.0001, 100),
  physicalForm: z.enum(waterPrepPhysicalForms).nullable()
});

const miscTechnicalFieldSchema = z.object({
  category: z.literal("misc"),
  subtype: z.enum(miscSubtypes),
  usagePhase: z.enum(miscUsagePhases).nullable(),
  doseHint: nullableTextField(240)
});

export const ingredientTechnicalFieldInputSchema = z.discriminatedUnion("category", [
  fermentableTechnicalFieldSchema,
  hopTechnicalFieldSchema,
  yeastTechnicalFieldSchema,
  waterPrepTechnicalFieldSchema,
  miscTechnicalFieldSchema
]).superRefine((value, ctx) => {
  if (value.category === "yeast") {
    if (
      value.tempMinC != null
      && value.tempMaxC != null
      && value.tempMinC > value.tempMaxC
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum temperature cannot exceed maximum temperature",
        path: ["tempMinC"]
      });
    }

    if ((value.packageSize == null) !== (value.packageUnit == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Package size and unit must be provided together",
        path: value.packageSize == null ? ["packageSize"] : ["packageUnit"]
      });
    }
  }

  if (value.category === "water_prep") {
    if ((value.subtype === "salt" || value.subtype === "base") && !value.compound) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Compound is required for this subtype",
        path: ["compound"]
      });
    }

    if (value.subtype === "acid" && !value.acidType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Acid type is required for acid preparations",
        path: ["acidType"]
      });
    }

    const requiresStrength = value.physicalForm === "liquid" || value.physicalForm === "solution";
    if (requiresStrength && value.strengthPct == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Strength is required for liquid/solution preparations",
        path: ["strengthPct"]
      });
    }
  }
});

const HOP_FORM_VALUES = new Set<HopForm>(hopForms);
const LEGACY_YEAST_TYPE_VALUES = new Set<LegacyYeastType>(legacyYeastTypes);
const YEAST_FORM_VALUES = new Set<YeastForm>(yeastForms);
const YEAST_FLOCCULATION_VALUES = new Set<YeastFlocculationLevel>(yeastFlocculationLevels);
const WATER_PREP_PHYSICAL_FORM_VALUES = new Set<WaterPrepPhysicalForm>(waterPrepPhysicalForms);
const MISC_USAGE_PHASE_VALUES = new Set<MiscUsagePhase>(miscUsagePhases);

const TECHNICAL_PROPERTY_KEYS = [
  "acidType",
  "alcoholTolerancePct",
  "alphaAcid",
  "alphaAcidPercent",
  "attenuationPercent",
  "betaAcid",
  "betaAcidPercent",
  "colorEbc",
  "colorLovibond",
  "compound",
  "diastaticPowerLintner",
  "diastaticus",
  "doseHint",
  "extractFgdbPct",
  "extractYieldPct",
  "flocculation",
  "form",
  "hopForm",
  "hopNotes",
  "maxTemperatureC",
  "maxUsagePercent",
  "minTemperatureC",
  "moisturePct",
  "packageSize",
  "packageUnit",
  "phenolic",
  "physicalForm",
  "potentialPpg",
  "proteinPct",
  "purityPct",
  "season",
  "strength",
  "strengthPct",
  "technicalYeastForm",
  "totalOil",
  "totalOilMlPer100g",
  "usageFlags",
  "usagePhase",
  "yeastForm",
  "yeastType"
];

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const readBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
};

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

const readStringArray = (...values: unknown[]) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const items = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
      if (items.length) {
        return items;
      }
    }

    if (typeof value === "string") {
      const items = value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (items.length) {
        return items;
      }
    }
  }

  return [];
};

const parseHopForm = (value: unknown): HopForm | null => {
  if (typeof value !== "string") {
    return null;
  }

  if (HOP_FORM_VALUES.has(value as HopForm)) {
    return value as HopForm;
  }

  if (value === "leaf" || value === "cone") {
    return "whole_cone";
  }

  return null;
};

const parseLegacyYeastType = (value: unknown): LegacyYeastType | null => {
  if (typeof value !== "string" || !LEGACY_YEAST_TYPE_VALUES.has(value as LegacyYeastType)) {
    return null;
  }

  return value as LegacyYeastType;
};

const parseYeastForm = (value: unknown): YeastForm | null => {
  if (typeof value !== "string" || !YEAST_FORM_VALUES.has(value as YeastForm)) {
    return null;
  }

  return value as YeastForm;
};

const parseYeastFlocculation = (value: unknown): YeastFlocculationLevel | null => {
  if (typeof value !== "string" || !YEAST_FLOCCULATION_VALUES.has(value as YeastFlocculationLevel)) {
    return null;
  }

  return value as YeastFlocculationLevel;
};

const parseWaterPrepPhysicalForm = (value: unknown): WaterPrepPhysicalForm | null => {
  if (typeof value !== "string" || !WATER_PREP_PHYSICAL_FORM_VALUES.has(value as WaterPrepPhysicalForm)) {
    return null;
  }

  return value as WaterPrepPhysicalForm;
};

const parseMiscUsagePhase = (value: unknown): MiscUsagePhase | null => {
  if (typeof value !== "string" || !MISC_USAGE_PHASE_VALUES.has(value as MiscUsagePhase)) {
    return null;
  }

  return value as MiscUsagePhase;
};

const parseDisplayUnit = (value: unknown): IngredientDisplayUnit | null => {
  return typeof value === "string" && isIngredientDisplayUnit(value) ? value : null;
};

const toLovibondFromEbc = (value: number) => roundTo(value / 1.97, 2);
const toPotentialPpgFromExtractYield = (value: number) => roundTo((value / 100) * 46, 2);

const mapYeastSubtypeToLegacyType = (subtype: YeastSubtype): LegacyYeastType | null => {
  if (subtype === "lager") {
    return "lager";
  }

  if (subtype === "ale" || subtype === "wheat" || subtype === "belgian" || subtype === "kveik") {
    return "ale";
  }

  return null;
};

const normalizeCategoryAndSubtype = (source: IngredientTechnicalSource) => {
  const category = resolveIngredientCategory(source);
  const subtype = resolveIngredientSubtype(source);

  if (!subtype || !isIngredientSubtypeForCategory(category, subtype)) {
    return { category, subtype: null };
  }

  return { category, subtype };
};

const readPersistedTechnicalData = (source: IngredientTechnicalSource): Record<string, unknown> => {
  if (!isRecord(source.technicalData)) {
    return {};
  }

  return source.technicalData as Record<string, unknown>;
};

const buildTechnicalDataCandidate = (source: IngredientTechnicalSource) => {
  const { category, subtype } = normalizeCategoryAndSubtype(source);
  const technicalData = readPersistedTechnicalData(source);
  const properties = isRecord(source.properties) ? source.properties : {};

  if (!subtype) {
    return null;
  }

  if (category === "fermentable") {
    return {
      category,
      subtype,
      colorEbc: readNumber(source.fermentableColorEbc, technicalData.colorEbc, properties.colorEbc),
      extractYieldPct: readNumber(
        source.fermentableExtractYieldPct,
        technicalData.extractYieldPct,
        technicalData.extractFgdbPct,
        properties.extractFgdbPct,
        properties.extractYieldPct
      ),
      proteinPct: readNumber(source.fermentableProteinPct, technicalData.proteinPct, properties.proteinPct),
      moisturePct: readNumber(source.fermentableMoisturePct, technicalData.moisturePct, properties.moisturePct),
      maxUsagePercent: readNumber(source.fermentableMaxUsagePercent, technicalData.maxUsagePercent, properties.maxUsagePercent),
      diastaticPowerLintner: readNumber(source.fermentableDiastaticPowerLintner, technicalData.diastaticPowerLintner, properties.diastaticPowerLintner),
      usageFlags: readStringArray(source.fermentableUsageFlags, technicalData.usageFlags, properties.usageFlags)
    };
  }

  if (category === "hop") {
    return {
      category,
      subtype,
      alphaAcidPct: readNumber(source.hopAlphaAcidPct, technicalData.alphaAcidPct, properties.alphaAcidPercent, properties.alphaAcid),
      betaAcidPct: readNumber(source.hopBetaAcidPct, technicalData.betaAcidPct, properties.betaAcidPercent, properties.betaAcid),
      totalOilMlPer100g: readNumber(source.hopTotalOilMlPer100g, technicalData.totalOilMlPer100g, properties.totalOilMlPer100g, properties.totalOil),
      notes: readString(source.hopNotes, technicalData.notes, properties.hopNotes),
      harvestYear: readNumber(source.harvestYear, technicalData.harvestYear, source.hopSeason, properties.harvestYear)
    };
  }

  if (category === "yeast") {
    return {
      category,
      subtype,
      form: readString(source.yeastForm, technicalData.form, technicalData.technicalYeastForm, properties.technicalYeastForm, properties.yeastForm, properties.form),
      attenuationPct: readNumber(source.yeastAttenuationPct, technicalData.attenuationPct, properties.attenuationPercent),
      tempMinC: readNumber(source.yeastMinFermentationTempC, technicalData.tempMinC, properties.minTemperatureC),
      tempMaxC: readNumber(source.yeastMaxFermentationTempC, technicalData.tempMaxC, properties.maxTemperatureC),
      flocculation: readString(source.yeastFlocculation, technicalData.flocculation, properties.flocculation),
      alcoholTolerancePct: readNumber(source.yeastAlcoholTolerancePct, technicalData.alcoholTolerancePct, properties.alcoholTolerancePct),
      packageSize: readNumber(source.yeastPackageSize, technicalData.packageSize, properties.packageSize),
      packageUnit: readString(source.yeastPackageUnit, technicalData.packageUnit, properties.packageUnit),
      phenolic: readBoolean(source.yeastPhenolic, technicalData.phenolic, properties.phenolic),
      diastaticus: readBoolean(source.yeastDiastaticus, technicalData.diastaticus, properties.diastaticus)
    };
  }

  if (category === "water_prep") {
    return {
      category,
      subtype,
      compound: readString(source.waterPrepCompound, technicalData.compound, properties.compound),
      acidType: readString(source.waterPrepAcidType, technicalData.acidType, properties.acidType),
      strengthPct: readNumber(source.waterPrepStrengthPct, technicalData.strengthPct, properties.strengthPct, properties.strength),
      purityPct: readNumber(source.waterPrepPurityPct, technicalData.purityPct, properties.purityPct),
      physicalForm: readString(source.waterPrepPhysicalForm, technicalData.physicalForm, properties.physicalForm)
    };
  }

  return {
    category,
    subtype,
    usagePhase: readString(source.miscUsagePhase, technicalData.usagePhase, properties.usagePhase, properties.stage),
    doseHint: readString(source.miscDoseHint, technicalData.doseHint, properties.doseHint)
  };
};

export const normalizeIngredientTechnicalData = (source: IngredientTechnicalSource): IngredientTechnicalData => {
  const candidate = buildTechnicalDataCandidate(source);
  if (!candidate) {
    throw new Error("TECHNICAL_SUBTYPE_REQUIRED");
  }

  return ingredientTechnicalFieldInputSchema.parse(candidate);
};

export const extractIngredientTechnicalData = (source: IngredientTechnicalSource): IngredientTechnicalData | null => {
  const candidate = buildTechnicalDataCandidate(source);
  if (!candidate) {
    return null;
  }

  const parsed = ingredientTechnicalFieldInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

export const hopFormLabels: Record<HopForm, string> = {
  pellet: "Гранулы",
  whole_cone: "Шишковой",
  lupulin: "Лупулин",
  cryo: "Крио"
};

export const yeastTypeLabels: Record<LegacyYeastType, string> = {
  ale: "Элевые",
  lager: "Лагерные",
  wine: "Винные"
};

export const yeastFormLabels: Record<YeastForm, string> = {
  dry: "Сухие",
  liquid: "Жидкие",
  slurry: "Суспензия",
  culture: "Культура"
};

export const yeastFlocculationLabels: Record<YeastFlocculationLevel, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
  very_high: "Очень высокая"
};

export const waterPrepPhysicalFormLabels: Record<WaterPrepPhysicalForm, string> = {
  solid: "Твёрдая",
  powder: "Порошок",
  crystal: "Кристаллы",
  liquid: "Жидкость",
  solution: "Раствор",
  tablet: "Таблетка"
};

export const miscUsagePhaseLabels: Record<MiscUsagePhase, string> = {
  mash: "Затор",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  fermentation: "Брожение",
  conditioning: "Созревание",
  packaging: "Розлив",
  water_prep: "Подготовка воды",
  other: "Другое"
};

export const extractIngredientTechnicalFields = (source: IngredientTechnicalSource): IngredientTechnicalFields => {
  const technicalData = extractIngredientTechnicalData(source);
  const properties = isRecord(source.properties) ? source.properties : {};

  return {
    manufacturer: readString(source.manufacturer),
    country: readString(source.country),
    fermentableColorEbc: technicalData?.category === "fermentable"
      ? technicalData.colorEbc
      : readNumber(source.fermentableColorEbc, properties.colorEbc),
    fermentableExtractYieldPct: technicalData?.category === "fermentable"
      ? technicalData.extractYieldPct
      : readNumber(source.fermentableExtractYieldPct, properties.extractFgdbPct, properties.extractYieldPct),
    fermentableProteinPct: technicalData?.category === "fermentable"
      ? technicalData.proteinPct
      : readNumber(source.fermentableProteinPct, properties.proteinPct),
    fermentableMoisturePct: technicalData?.category === "fermentable"
      ? technicalData.moisturePct
      : readNumber(source.fermentableMoisturePct, properties.moisturePct),
    fermentableMaxUsagePercent: technicalData?.category === "fermentable"
      ? technicalData.maxUsagePercent
      : readNumber(source.fermentableMaxUsagePercent, properties.maxUsagePercent),
    fermentableDiastaticPowerLintner: technicalData?.category === "fermentable"
      ? technicalData.diastaticPowerLintner
      : readNumber(source.fermentableDiastaticPowerLintner, properties.diastaticPowerLintner),
    fermentableUsageFlags: technicalData?.category === "fermentable"
      ? technicalData.usageFlags
      : readStringArray(source.fermentableUsageFlags, properties.usageFlags),
    hopAlphaAcidPct: technicalData?.category === "hop"
      ? technicalData.alphaAcidPct
      : readNumber(source.hopAlphaAcidPct, properties.alphaAcidPercent, properties.alphaAcid),
    hopBetaAcidPct: technicalData?.category === "hop"
      ? technicalData.betaAcidPct
      : readNumber(source.hopBetaAcidPct, properties.betaAcidPercent, properties.betaAcid),
    hopTotalOilMlPer100g: technicalData?.category === "hop"
      ? technicalData.totalOilMlPer100g
      : readNumber(source.hopTotalOilMlPer100g, properties.totalOilMlPer100g, properties.totalOil),
    hopForm: parseHopForm(source.hopForm ?? source.subtype ?? properties.hopForm ?? properties.form),
    hopSeason: technicalData?.category === "hop"
      ? (technicalData.harvestYear != null ? String(technicalData.harvestYear) : null)
      : readString(source.hopSeason, properties.season),
    hopNotes: technicalData?.category === "hop"
      ? technicalData.notes
      : readString(source.hopNotes, properties.hopNotes),
    yeastAttenuationPct: technicalData?.category === "yeast"
      ? technicalData.attenuationPct
      : readNumber(source.yeastAttenuationPct, properties.attenuationPercent),
    yeastType: technicalData?.category === "yeast"
      ? mapYeastSubtypeToLegacyType(technicalData.subtype)
      : parseLegacyYeastType(source.yeastType ?? properties.yeastType),
    yeastForm: technicalData?.category === "yeast"
      ? technicalData.form
      : parseYeastForm(source.yeastForm ?? properties.technicalYeastForm ?? properties.yeastForm ?? properties.form),
    yeastMinFermentationTempC: technicalData?.category === "yeast"
      ? technicalData.tempMinC
      : readNumber(source.yeastMinFermentationTempC, properties.minTemperatureC),
    yeastMaxFermentationTempC: technicalData?.category === "yeast"
      ? technicalData.tempMaxC
      : readNumber(source.yeastMaxFermentationTempC, properties.maxTemperatureC),
    yeastFlocculation: technicalData?.category === "yeast"
      ? technicalData.flocculation
      : parseYeastFlocculation(source.yeastFlocculation ?? properties.flocculation),
    yeastAlcoholTolerancePct: technicalData?.category === "yeast"
      ? technicalData.alcoholTolerancePct
      : readNumber(source.yeastAlcoholTolerancePct, properties.alcoholTolerancePct),
    yeastPackageSize: technicalData?.category === "yeast"
      ? technicalData.packageSize
      : readNumber(source.yeastPackageSize, properties.packageSize),
    yeastPackageUnit: technicalData?.category === "yeast"
      ? technicalData.packageUnit
      : parseDisplayUnit(source.yeastPackageUnit ?? properties.packageUnit),
    yeastPhenolic: technicalData?.category === "yeast"
      ? technicalData.phenolic
      : readBoolean(source.yeastPhenolic, properties.phenolic),
    yeastDiastaticus: technicalData?.category === "yeast"
      ? technicalData.diastaticus
      : readBoolean(source.yeastDiastaticus, properties.diastaticus),
    waterPrepCompound: technicalData?.category === "water_prep"
      ? technicalData.compound
      : readString(source.waterPrepCompound, properties.compound),
    waterPrepAcidType: technicalData?.category === "water_prep"
      ? technicalData.acidType
      : readString(source.waterPrepAcidType, properties.acidType),
    waterPrepStrengthPct: technicalData?.category === "water_prep"
      ? technicalData.strengthPct
      : readNumber(source.waterPrepStrengthPct, properties.strengthPct, properties.strength),
    waterPrepPurityPct: technicalData?.category === "water_prep"
      ? technicalData.purityPct
      : readNumber(source.waterPrepPurityPct, properties.purityPct),
    waterPrepPhysicalForm: technicalData?.category === "water_prep"
      ? technicalData.physicalForm
      : parseWaterPrepPhysicalForm(source.waterPrepPhysicalForm ?? properties.physicalForm),
    miscUsagePhase: technicalData?.category === "misc"
      ? technicalData.usagePhase
      : parseMiscUsagePhase(source.miscUsagePhase ?? properties.usagePhase ?? properties.stage),
    miscDoseHint: technicalData?.category === "misc"
      ? technicalData.doseHint
      : readString(source.miscDoseHint, properties.doseHint)
  };
};

export const normalizeIngredientTechnicalFields = (source: IngredientTechnicalSource) => {
  const technicalData = normalizeIngredientTechnicalData(source);

  return {
    fermentableColorEbc: technicalData.category === "fermentable" ? technicalData.colorEbc : null,
    fermentableExtractYieldPct: technicalData.category === "fermentable" ? technicalData.extractYieldPct : null,
    hopAlphaAcidPct: technicalData.category === "hop" ? technicalData.alphaAcidPct : null,
    hopForm: technicalData.category === "hop" && HOP_FORM_VALUES.has(technicalData.subtype as HopForm)
      ? technicalData.subtype as HopForm
      : null,
    hopSeason: technicalData.category === "hop" && technicalData.harvestYear != null ? String(technicalData.harvestYear) : null,
    yeastAttenuationPct: technicalData.category === "yeast" ? technicalData.attenuationPct : null,
    yeastType: technicalData.category === "yeast" ? mapYeastSubtypeToLegacyType(technicalData.subtype) : null,
    yeastForm: technicalData.category === "yeast" && (technicalData.form === "dry" || technicalData.form === "liquid")
      ? technicalData.form
      : null,
    yeastMinFermentationTempC: technicalData.category === "yeast" ? technicalData.tempMinC : null,
    yeastMaxFermentationTempC: technicalData.category === "yeast" ? technicalData.tempMaxC : null
  };
};

export const syncIngredientPropertiesWithTechnicalFields = (source: IngredientTechnicalSource) => {
  const properties = {
    ...(isRecord(source.properties) ? source.properties : {})
  };

  for (const key of TECHNICAL_PROPERTY_KEYS) {
    delete properties[key];
  }

  const technicalData = normalizeIngredientTechnicalData(source);

  if (technicalData.category === "fermentable") {
    properties.colorEbc = technicalData.colorEbc;
    properties.colorLovibond = toLovibondFromEbc(technicalData.colorEbc);
    properties.extractFgdbPct = technicalData.extractYieldPct;
    properties.extractYieldPct = technicalData.extractYieldPct;
    properties.potentialPpg = toPotentialPpgFromExtractYield(technicalData.extractYieldPct);
    if (technicalData.proteinPct != null) properties.proteinPct = technicalData.proteinPct;
    if (technicalData.moisturePct != null) properties.moisturePct = technicalData.moisturePct;
    if (technicalData.maxUsagePercent != null) properties.maxUsagePercent = technicalData.maxUsagePercent;
    if (technicalData.diastaticPowerLintner != null) properties.diastaticPowerLintner = technicalData.diastaticPowerLintner;
    if (technicalData.usageFlags.length) properties.usageFlags = technicalData.usageFlags;
  }

  if (technicalData.category === "hop") {
    properties.alphaAcid = technicalData.alphaAcidPct;
    properties.alphaAcidPercent = technicalData.alphaAcidPct;
    if (technicalData.betaAcidPct != null) {
      properties.betaAcid = technicalData.betaAcidPct;
      properties.betaAcidPercent = technicalData.betaAcidPct;
    }
    if (technicalData.totalOilMlPer100g != null) {
      properties.totalOil = technicalData.totalOilMlPer100g;
      properties.totalOilMlPer100g = technicalData.totalOilMlPer100g;
    }
    if (HOP_FORM_VALUES.has(technicalData.subtype as HopForm)) {
      properties.hopForm = technicalData.subtype;
    }
    if (technicalData.harvestYear != null) {
      properties.season = String(technicalData.harvestYear);
    }
    if (technicalData.notes) {
      properties.hopNotes = technicalData.notes;
    }
  }

  if (technicalData.category === "yeast") {
    properties.attenuationPercent = technicalData.attenuationPct;
    const legacyYeastType = mapYeastSubtypeToLegacyType(technicalData.subtype);
    if (legacyYeastType) {
      properties.yeastType = legacyYeastType;
    }
    properties.technicalYeastForm = technicalData.form;
    if (technicalData.form === "dry" || technicalData.form === "liquid") {
      properties.yeastForm = technicalData.form;
      properties.form = technicalData.form;
    }
    if (technicalData.tempMinC != null) properties.minTemperatureC = technicalData.tempMinC;
    if (technicalData.tempMaxC != null) properties.maxTemperatureC = technicalData.tempMaxC;
    if (technicalData.flocculation) properties.flocculation = technicalData.flocculation;
    if (technicalData.alcoholTolerancePct != null) properties.alcoholTolerancePct = technicalData.alcoholTolerancePct;
    if (technicalData.packageSize != null) properties.packageSize = technicalData.packageSize;
    if (technicalData.packageUnit) properties.packageUnit = technicalData.packageUnit;
    if (technicalData.phenolic != null) properties.phenolic = technicalData.phenolic;
    if (technicalData.diastaticus != null) properties.diastaticus = technicalData.diastaticus;
  }

  if (technicalData.category === "water_prep") {
    if (technicalData.compound) properties.compound = technicalData.compound;
    if (technicalData.acidType) properties.acidType = technicalData.acidType;
    if (technicalData.strengthPct != null) {
      properties.strength = technicalData.strengthPct;
      properties.strengthPct = technicalData.strengthPct;
    }
    if (technicalData.purityPct != null) properties.purityPct = technicalData.purityPct;
    if (technicalData.physicalForm) properties.physicalForm = technicalData.physicalForm;
  }

  if (technicalData.category === "misc") {
    if (technicalData.usagePhase) {
      properties.usagePhase = technicalData.usagePhase;
      properties.stage = technicalData.usagePhase;
    }
    if (technicalData.doseHint) properties.doseHint = technicalData.doseHint;
  }

  return properties;
};

export const getIngredientPotentialPpg = (source: IngredientTechnicalSource, fallback = 36) => {
  const properties = isRecord(source.properties) ? source.properties : {};
  const fields = extractIngredientTechnicalFields(source);
  const derived = fields.fermentableExtractYieldPct != null
    ? toPotentialPpgFromExtractYield(fields.fermentableExtractYieldPct)
    : null;

  return readNumber(derived, properties.potentialPpg) ?? fallback;
};

export const getIngredientColorLovibond = (source: IngredientTechnicalSource, fallback = 2) => {
  const properties = isRecord(source.properties) ? source.properties : {};
  const fields = extractIngredientTechnicalFields(source);
  const legacyColorEbc = readNumber(properties.colorEbc);
  const derived = fields.fermentableColorEbc != null
    ? toLovibondFromEbc(fields.fermentableColorEbc)
    : null;
  const derivedFromLegacyColor = legacyColorEbc != null
    ? toLovibondFromEbc(legacyColorEbc)
    : null;

  return readNumber(derived, properties.colorLovibond, derivedFromLegacyColor) ?? fallback;
};

export const getIngredientAlphaAcidPercent = (source: IngredientTechnicalSource, fallback = 5) => {
  const properties = isRecord(source.properties) ? source.properties : {};
  const fields = extractIngredientTechnicalFields(source);

  return readNumber(fields.hopAlphaAcidPct, properties.alphaAcidPercent, properties.alphaAcid) ?? fallback;
};

export const getIngredientTechnicalDataCategory = (value: unknown): IngredientCategory | null => (
  typeof value === "string" && (ingredientCategories as readonly string[]).includes(value)
    ? value as IngredientCategory
    : null
);

export const getIngredientTechnicalDataSubtype = (
  category: IngredientCategory,
  value: unknown
): IngredientSubtype | null => (
  typeof value === "string" && isIngredientSubtypeForCategory(category, value)
    ? value
    : null
);
