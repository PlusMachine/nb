import type { IngredientTechnicalData, IngredientTechnicalFields, IngredientType } from "./contracts";

export const hopForms = ["pellet", "whole_cone", "lupulin", "cryo", "standard"] as const;
export type HopForm = (typeof hopForms)[number];

const hopFormDisplayLabels: Record<string, string> = {
  pellet: "Гранулы",
  standard: "Гранулы",
  whole_cone: "Шишковой",
  cone: "Шишковой",
  leaf: "Шишковой",
  cryo: "Крио",
  lupulin: "Люпулин",
  lupulin_concentrate: "Люпулин",
  lupomax: "LUPOMAX"
};

export const yeastFlocculationLevels = ["low", "medium", "high"] as const;
export type YeastFlocculationLevel = (typeof yeastFlocculationLevels)[number];

export const yeastForms = ["dry", "liquid", "slurry", "culture"] as const;
export type YeastForm = (typeof yeastForms)[number];

export const waterPrepPhysicalForms = ["solid", "powder", "crystal", "liquid", "solution", "tablet"] as const;
export type WaterPrepPhysicalForm = (typeof waterPrepPhysicalForms)[number];

export const miscUsagePhases = ["mash", "boil", "whirlpool", "fermentation", "packaging", "finished_beer", "other"] as const;
export type MiscUsagePhase = (typeof miscUsagePhases)[number];

export const yeastFlocculationLabels: Record<YeastFlocculationLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High"
};

export const yeastFormLabels: Record<YeastForm, string> = {
  dry: "Dry",
  liquid: "Liquid",
  slurry: "Slurry",
  culture: "Culture"
};

export const waterPrepPhysicalFormLabels: Record<WaterPrepPhysicalForm, string> = {
  solid: "Solid",
  powder: "Powder",
  crystal: "Crystal",
  liquid: "Liquid",
  solution: "Solution",
  tablet: "Tablet"
};

export const miscUsagePhaseLabels: Record<MiscUsagePhase, string> = {
  mash: "Mash",
  boil: "Boil",
  whirlpool: "Whirlpool",
  fermentation: "Fermentation",
  packaging: "Packaging",
  finished_beer: "Finished beer",
  other: "Other"
};

export const formatHopFormLabel = (value?: string | null) => {
  const normalized = readString(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  return hopFormDisplayLabels[normalized] ?? normalized.replaceAll("_", " ");
};

type IngredientTechnicalSource = {
  type?: string | null;
  technicalData?: unknown;
  attributes?: unknown;
  properties?: unknown;
  hopAlphaAcidPct?: number | null;
  hopBetaAcidPct?: number | null;
  hopTotalOilMlPer100g?: number | null;
  hopForm?: string | null;
  fermentableExtractYieldPct?: number | null;
  fermentableColorLovibond?: number | null;
  fermentableColorEbc?: number | null;
  yeastAttenuationPct?: number | null;
  yeastForm?: string | null;
  yeastMinFermentationTempC?: number | null;
  yeastMaxFermentationTempC?: number | null;
  formula?: string | null;
  unitPreferred?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readRecord = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
};

const readNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
};

const readBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
};

const readStringArray = (...values: unknown[]) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  }

  return [];
};

const readFermentableExtractForm = (...values: unknown[]) => {
  const normalized = readString(...values)?.toLowerCase();
  return normalized === "dry" || normalized === "liquid" ? normalized : null;
};

const readFermentableHoppingState = (...values: unknown[]) => {
  const normalized = readString(...values)?.toLowerCase();
  return normalized === "hopped"
    || normalized === "unhopped"
    || normalized === "unknown"
    || normalized === "not_applicable"
    ? normalized
    : null;
};

const metadataPropertyKeys = new Set([
  "category",
  "subtype",
  "defaultDisplayUnit",
  "allowedUnits",
  "measurementDimension",
  "brand",
  "harvestYear",
  "technicalData"
]);

export const sanitizeIngredientColorValue = (value: number | null | undefined) => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
);

export const toLovibondFromEbc = (value: number | null | undefined, fractionDigits = 2) => {
  const normalized = sanitizeIngredientColorValue(value);
  return normalized == null ? null : Number((normalized / 1.97).toFixed(fractionDigits));
};

export const lovibondToEbc = (value: number | null | undefined, fractionDigits = 2) => {
  const normalized = sanitizeIngredientColorValue(value);
  return normalized == null ? null : Number((normalized * 1.97).toFixed(fractionDigits));
};

export const resolveIngredientColorRangeEbc = (
  colorEbcMin?: number | null,
  colorEbcMax?: number | null
): { min: number; max: number; average: number } | null => {
  const normalizedMin = sanitizeIngredientColorValue(colorEbcMin);
  const normalizedMax = sanitizeIngredientColorValue(colorEbcMax);

  if (normalizedMin == null && normalizedMax == null) {
    return null;
  }

  const start = normalizedMin ?? normalizedMax ?? 0;
  const end = normalizedMax ?? normalizedMin ?? 0;
  const min = Math.min(start, end);
  const max = Math.max(start, end);

  return {
    min,
    max,
    average: (min + max) / 2
  };
};

export const resolveIngredientTechnicalDataColorRangeEbc = (
  technicalData: IngredientTechnicalData | null | undefined
): { min: number; max: number; average: number } | null => {
  if (!technicalData || (technicalData.type !== "malt" && technicalData.type !== "fermentable")) {
    return null;
  }

  if (technicalData.type === "malt") {
    const malt = technicalData as Extract<IngredientTechnicalData, { type: "malt" }>;
    const range = resolveIngredientColorRangeEbc(malt.colorEbcMin, malt.colorEbcMax);
    if (range) {
      return range;
    }
  }

  const fermentable = technicalData as Extract<IngredientTechnicalData, { type: "malt" | "fermentable" }>;
  if (technicalData.type === "fermentable") {
    const directRange = resolveIngredientColorRangeEbc(
      fermentable.colorEbcMin,
      fermentable.colorEbcMax
    );
    if (directRange) {
      return directRange;
    }
  }

  const colorLovibond = typeof fermentable.colorLovibond === "number" ? fermentable.colorLovibond : null;
  const ebc = lovibondToEbc(colorLovibond ?? null);
  return ebc == null
    ? null
    : {
      min: ebc,
      max: ebc,
      average: ebc
    };
};

export const resolveIngredientTechnicalDataColorLovibond = (
  technicalData: IngredientTechnicalData | null | undefined
) => {
  const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
  if (range) {
    return toLovibondFromEbc(range.average);
  }

  if (!technicalData || (technicalData.type !== "malt" && technicalData.type !== "fermentable")) {
    return null;
  }

  const fermentable = technicalData as Extract<IngredientTechnicalData, { type: "malt" | "fermentable" }>;
  return sanitizeIngredientColorValue(
    typeof fermentable.colorLovibond === "number" ? fermentable.colorLovibond : null
  );
};

const inferType = (source: IngredientTechnicalSource): IngredientType | null => {
  if (
    source.type === "hop"
    || source.type === "malt"
    || source.type === "fermentable"
    || source.type === "yeast"
    || source.type === "consumable"
    || source.type === "water_treatment"
  ) {
    return source.type;
  }

  return null;
};

const fromAttributes = (
  type: IngredientType,
  attributes: Record<string, unknown>
): IngredientTechnicalData => {
  if (type === "hop") {
    return {
      type,
      alphaAcidPctMin: readNumber(attributes.alpha_acid_pct_min),
      alphaAcidPctMax: readNumber(attributes.alpha_acid_pct_max),
      alphaAcidPctTypical: readNumber(attributes.alpha_acid_pct_typical),
      betaAcidPctMin: readNumber(attributes.beta_acid_pct_min),
      betaAcidPctMax: readNumber(attributes.beta_acid_pct_max),
      betaAcidPctTypical: readNumber(attributes.beta_acid_pct_typical),
      oilMl100gMin: readNumber(attributes.oil_ml_100g_min),
      oilMl100gMax: readNumber(attributes.oil_ml_100g_max),
      oilMl100gTypical: readNumber(attributes.oil_ml_100g_typical),
      cohumulonePctMin: readNumber(attributes.cohumulone_pct_min),
      cohumulonePctMax: readNumber(attributes.cohumulone_pct_max),
      cohumulonePctTypical: readNumber(attributes.cohumulone_pct_typical),
      categoryBirrf: readString(attributes.category_birrf),
      categoryBirrfRu: readString(attributes.category_birrf_ru),
      hopForm: readString(attributes.hop_form),
      isBlend: readBoolean(attributes.is_blend),
      isPopularInRussia: readBoolean(attributes.is_popular_in_russia),
      aromaDescriptorsEn: readStringArray(attributes.aroma_descriptors_en),
      notes: readString(attributes.notes)
    };
  }

  if (type === "malt") {
    const colorRange = resolveIngredientColorRangeEbc(
      readNumber(attributes.color_ebc_min),
      readNumber(attributes.color_ebc_max)
    );

    return {
      type,
      maltType: readString(attributes.malt_type),
      extractPctDryBasis: readNumber(attributes.extract_pct_dry_basis),
      colorEbcMin: colorRange?.min ?? null,
      colorEbcMax: colorRange?.max ?? null,
      colorLovibond: sanitizeIngredientColorValue(readNumber(attributes.color_lovibond))
        ?? (colorRange ? toLovibondFromEbc(colorRange.average) : null),
      proteinPct: readNumber(attributes.protein_pct),
      maxUsagePct: readNumber(attributes.max_usage_pct),
      colorEbcIsApprox: readBoolean(attributes.color_ebc_is_approx)
    };
  }

  if (type === "fermentable") {
    const colorRange = resolveIngredientColorRangeEbc(
      readNumber(attributes.color_ebc_min),
      readNumber(attributes.color_ebc_max)
    );

    return {
      type,
      fermentabilityClass: readString(attributes.fermentability_class),
      extractForm: readFermentableExtractForm(attributes.extract_form),
      productFamily: readString(attributes.product_family),
      subtypeKey: readString(attributes.subtype_key),
      physicalForm: readString(attributes.physical_form),
      baseMaterialFamily: readString(attributes.base_material_family),
      baseMaterials: readStringArray(attributes.base_materials),
      hoppingState: readFermentableHoppingState(attributes.hopping_state),
      isHoppedProduct: readBoolean(attributes.is_hopped_product),
      functionalRole: readString(attributes.functional_role),
      gravityCalcMode: readString(attributes.gravity_calc_mode),
      displayTypeRu: readString(attributes.display_type_ru),
      displayTypeEn: readString(attributes.display_type_en),
      extractPctDryBasis: readNumber(attributes.extract_pct_dry_basis),
      colorEbcMin: colorRange?.min ?? null,
      colorEbcMax: colorRange?.max ?? null,
      colorLovibond: sanitizeIngredientColorValue(readNumber(attributes.color_lovibond))
        ?? (colorRange ? toLovibondFromEbc(colorRange.average) : null),
      colorEbcIsApprox: readBoolean(attributes.color_ebc_is_approx),
      recommendedMaxPct: readNumber(attributes.recommended_max_pct),
      isUsableInBeerGravityCalculations: readBoolean(attributes.is_usable_in_beer_gravity_calculations),
      beerRelevance: readString(attributes.beer_relevance)
    };
  }

  if (type === "yeast") {
    const form = readString(attributes.form);
    const packageSize = readNumber(attributes.package_size) ?? (form === "dry" ? 11 : null);
    const packageUnit = readString(attributes.package_unit) ?? (form === "dry" ? "g" : null);

    return {
      type,
      form,
      yeastFamily: readString(attributes.yeast_family),
      birrfCategory: readString(attributes.birrf_category),
      attenuationPctMin: readNumber(attributes.attenuation_pct_min),
      attenuationPctMax: readNumber(attributes.attenuation_pct_max),
      attenuationPctTypical: readNumber(attributes.attenuation_pct_typical),
      flocculation: readString(attributes.flocculation),
      fermentationTempCMin: readNumber(attributes.fermentation_temp_c_min),
      fermentationTempCMax: readNumber(attributes.fermentation_temp_c_max),
      fermentationTempCOptimum: readNumber(attributes.fermentation_temp_c_optimum),
      alcoholToleranceAbvTypical: readNumber(attributes.alcohol_tolerance_abv_typical),
      sourceBasis: readString(attributes.source_basis),
      packageSize,
      packageUnit
    };
  }

  if (type === "consumable") {
    return {
      type,
      commonForms: readStringArray(attributes.common_forms),
      usageStage: readStringArray(attributes.usage_stage),
      dosageReference: isRecord(attributes.dosage_reference) ? attributes.dosage_reference : null,
      familyKey: readString(attributes.family_key),
      pickerGroup: readString(attributes.picker_group),
      marketNamesRu: readStringArray(attributes.market_names_ru),
      marketNamesEn: readStringArray(attributes.market_names_en),
      searchPriorityTermsRu: readStringArray(attributes.search_priority_terms_ru),
      searchPriorityTermsEn: readStringArray(attributes.search_priority_terms_en),
      pickerFunctionRu: readString(attributes.picker_function_ru),
      pickerUsageRu: readString(attributes.picker_usage_ru),
      brandFamilyMode: readString(attributes.brand_family_mode)
    };
  }

  return {
    type,
    formula: readString(attributes.formula),
    commonForms: readStringArray(attributes.common_forms),
    unitPreferred: readString(attributes.unit_preferred),
    typicalUseRu: readString(attributes.typical_use_ru),
    recommendedFor: readStringArray(attributes.recommended_for),
    waterCalcRole: readStringArray(attributes.water_calc_role),
    pHEffectDirection: readString(attributes.pH_effect_direction),
    effectOnIons: isRecord(attributes.effect_on_ions) ? attributes.effect_on_ions : null,
    calculationSupport: readString(attributes.calculation_support),
    commonInHomebrewing: readBoolean(attributes.common_in_homebrewing),
    commonInProBrewing: readBoolean(attributes.common_in_pro_brewing),
    recommendationLevel: readString(attributes.recommendation_level),
    cautionsRu: readString(attributes.cautions_ru),
    sourceBasis: Array.isArray(attributes.source_basis)
      ? attributes.source_basis.filter((item): item is string => typeof item === "string")
      : readString(attributes.source_basis)
  };
};

const normalizeStructuredTechnicalData = (technicalData: IngredientTechnicalData): IngredientTechnicalData => {
  if (technicalData.type === "malt") {
    const malt = technicalData as Extract<IngredientTechnicalData, { type: "malt" }>;
    const colorRange = resolveIngredientColorRangeEbc(malt.colorEbcMin, malt.colorEbcMax);

    return {
      ...malt,
      colorEbcMin: colorRange?.min ?? null,
      colorEbcMax: colorRange?.max ?? null,
      colorLovibond: sanitizeIngredientColorValue(malt.colorLovibond)
        ?? (colorRange ? toLovibondFromEbc(colorRange.average) : null)
    };
  }

  if (technicalData.type === "fermentable") {
    const fermentable = technicalData as Extract<IngredientTechnicalData, { type: "fermentable" }>;

    return {
      ...fermentable,
      extractForm: readFermentableExtractForm(fermentable.extractForm),
      hoppingState: readFermentableHoppingState(fermentable.hoppingState),
      colorLovibond: sanitizeIngredientColorValue(fermentable.colorLovibond)
    };
  }

  return technicalData;
};

export const extractIngredientTechnicalData = (source: IngredientTechnicalSource): IngredientTechnicalData | null => {
  if (isRecord(source.technicalData) && typeof source.technicalData.type === "string") {
    return normalizeStructuredTechnicalData(source.technicalData as IngredientTechnicalData);
  }

  const type = inferType(source);
  if (!type) {
    return null;
  }

  const attributes = readRecord(source.attributes);
  if (Object.keys(attributes).length > 0) {
    return fromAttributes(type, attributes);
  }

  const properties = readRecord(source.properties);
  if (isRecord(properties.technicalData) && typeof properties.technicalData.type === "string") {
    return normalizeStructuredTechnicalData(properties.technicalData as IngredientTechnicalData);
  }

  const filteredProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => !metadataPropertyKeys.has(key))
  );

  if (Object.keys(filteredProperties).length > 0) {
    return {
      type,
      ...filteredProperties
    } as IngredientTechnicalData;
  }

  if (type === "hop") {
    return {
      type,
      alphaAcidPctTypical: readNumber(source.hopAlphaAcidPct),
      betaAcidPctTypical: readNumber(source.hopBetaAcidPct),
      oilMl100gTypical: readNumber(source.hopTotalOilMlPer100g),
      hopForm: readString(source.hopForm)
    };
  }

  if (type === "malt" || type === "fermentable") {
    const colorLovibond = sanitizeIngredientColorValue(readNumber(source.fermentableColorLovibond));
    const colorEbc = sanitizeIngredientColorValue(readNumber(source.fermentableColorEbc));

    if (type === "malt") {
      return {
        type,
        extractPctDryBasis: readNumber(source.fermentableExtractYieldPct),
        colorEbcMin: colorEbc,
        colorEbcMax: colorEbc,
        colorLovibond: colorLovibond ?? (colorEbc == null ? null : toLovibondFromEbc(colorEbc))
      } as IngredientTechnicalData;
    }

    return {
      type,
      extractPctDryBasis: readNumber(source.fermentableExtractYieldPct),
      colorEbcMin: colorEbc,
      colorEbcMax: colorEbc,
      colorLovibond: colorLovibond ?? (colorEbc == null ? null : toLovibondFromEbc(colorEbc))
    } as IngredientTechnicalData;
  }

  if (type === "yeast") {
    const form = readString(source.yeastForm);
    const packageSize = null;
    const packageUnit = form === "dry" ? "g" : null;

    return {
      type,
      attenuationPctTypical: readNumber(source.yeastAttenuationPct),
      form,
      fermentationTempCMin: readNumber(source.yeastMinFermentationTempC),
      fermentationTempCMax: readNumber(source.yeastMaxFermentationTempC),
      packageSize: form === "dry" ? 11 : packageSize,
      packageUnit
    } as Extract<IngredientTechnicalData, { type: "yeast" }>;
  }

  if (type === "water_treatment") {
    return {
      type,
      formula: readString(source.formula),
      unitPreferred: readString(source.unitPreferred)
    };
  }

  return { type };
};

export const extractIngredientTechnicalFields = (source: IngredientTechnicalSource): IngredientTechnicalFields => {
  const technicalData = extractIngredientTechnicalData(source);
  if (!technicalData) {
    return {};
  }

  if (technicalData.type === "hop") {
    const hop = technicalData as Extract<IngredientTechnicalData, { type: "hop" }>;
    return {
      hopAlphaAcidPct: hop.alphaAcidPctTypical ?? hop.alphaAcidPctMax ?? hop.alphaAcidPctMin ?? null,
      hopBetaAcidPct: hop.betaAcidPctTypical ?? hop.betaAcidPctMax ?? hop.betaAcidPctMin ?? null,
      hopTotalOilMlPer100g: hop.oilMl100gTypical ?? hop.oilMl100gMax ?? hop.oilMl100gMin ?? null,
      hopForm: hop.hopForm ?? null
    };
  }

  if (technicalData.type === "malt" || technicalData.type === "fermentable") {
    const fermentable = technicalData as Extract<IngredientTechnicalData, { type: "malt" | "fermentable" }>;
    return {
      fermentableExtractYieldPct: fermentable.extractPctDryBasis ?? null,
      fermentableColorLovibond: resolveIngredientTechnicalDataColorLovibond(fermentable)
    };
  }

  if (technicalData.type === "yeast") {
    const yeast = technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>;
    return {
      yeastAttenuationPct: yeast.attenuationPctTypical ?? null,
      yeastForm: yeast.form ?? null,
      yeastMinFermentationTempC: yeast.fermentationTempCMin ?? null,
      yeastMaxFermentationTempC: yeast.fermentationTempCMax ?? null
    };
  }

  if (technicalData.type === "water_treatment") {
    const waterTreatment = technicalData as Extract<IngredientTechnicalData, { type: "water_treatment" }>;
    return {
      unitPreferred: waterTreatment.unitPreferred ?? null
    };
  }

  return {};
};

export const normalizeIngredientTechnicalData = (source: IngredientTechnicalSource): IngredientTechnicalData => (
  extractIngredientTechnicalData(source) ?? { type: inferType(source) ?? "consumable" }
);

export const normalizeIngredientTechnicalFields = (source: IngredientTechnicalSource) => (
  extractIngredientTechnicalFields(source)
);

export const syncIngredientPropertiesWithTechnicalFields = (source: IngredientTechnicalSource) => {
  const technicalData = normalizeIngredientTechnicalData(source);
  return { ...(isRecord(source.properties) ? source.properties : {}), ...technicalData };
};

export const getIngredientPotentialPpg = (source: IngredientTechnicalSource, fallback = 36) => {
  const fields = extractIngredientTechnicalFields(source);
  if (fields.fermentableExtractYieldPct == null) {
    return fallback;
  }

  return Number((fields.fermentableExtractYieldPct * 0.46).toFixed(2));
};

export const getIngredientColorLovibond = (source: IngredientTechnicalSource, fallback = 2) => {
  const fields = extractIngredientTechnicalFields(source);
  return fields.fermentableColorLovibond ?? fallback;
};

export const getIngredientAlphaAcidPercent = (source: IngredientTechnicalSource, fallback = 5) => {
  const fields = extractIngredientTechnicalFields(source);
  return fields.hopAlphaAcidPct ?? fallback;
};
