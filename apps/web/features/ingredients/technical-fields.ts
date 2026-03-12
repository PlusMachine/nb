import type { IngredientTechnicalFields, IngredientType, HopForm, YeastForm, YeastType } from "./contracts";

type IngredientTechnicalSource = {
  type: IngredientType;
  properties?: Record<string, unknown> | null;
} & IngredientTechnicalFields;

const HOP_FORM_VALUES = new Set<HopForm>(["pellet", "whole_cone", "lupulin", "cryo"]);
const YEAST_TYPE_VALUES = new Set<YeastType>(["ale", "lager", "wine"]);
const YEAST_FORM_VALUES = new Set<YeastForm>(["dry", "liquid"]);

const TECHNICAL_PROPERTY_KEYS = [
  "alphaAcid",
  "alphaAcidPercent",
  "attenuationPercent",
  "colorEbc",
  "colorLovibond",
  "extractFgdbPct",
  "extractYieldPct",
  "form",
  "hopForm",
  "maxTemperatureC",
  "minTemperatureC",
  "potentialPpg",
  "season",
  "yeastForm",
  "yeastType"
] as const;

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

const parseYeastType = (value: unknown): YeastType | null => {
  if (typeof value !== "string" || !YEAST_TYPE_VALUES.has(value as YeastType)) {
    return null;
  }

  return value as YeastType;
};

const parseYeastForm = (value: unknown): YeastForm | null => {
  if (typeof value !== "string" || !YEAST_FORM_VALUES.has(value as YeastForm)) {
    return null;
  }

  return value as YeastForm;
};

const toLovibondFromEbc = (value: number) => roundTo(value / 1.97, 2);
const toPotentialPpgFromExtractYield = (value: number) => roundTo((value / 100) * 46, 2);

export const hopFormLabels: Record<HopForm, string> = {
  pellet: "Гранулы",
  whole_cone: "Шишковой",
  lupulin: "Лупулин",
  cryo: "Крио"
};

export const yeastTypeLabels: Record<YeastType, string> = {
  ale: "Элевые",
  lager: "Лагерные",
  wine: "Винные"
};

export const yeastFormLabels: Record<YeastForm, string> = {
  dry: "Сухие",
  liquid: "Жидкие"
};

export const extractIngredientTechnicalFields = (source: IngredientTechnicalSource): IngredientTechnicalFields => {
  const properties = isRecord(source.properties) ? source.properties : {};

  return {
    manufacturer: readString(source.manufacturer),
    country: readString(source.country),
    fermentableColorEbc: source.type === "fermentable"
      ? readNumber(source.fermentableColorEbc, properties.colorEbc)
      : null,
    fermentableExtractYieldPct: source.type === "fermentable"
      ? readNumber(source.fermentableExtractYieldPct, properties.extractFgdbPct, properties.extractYieldPct)
      : null,
    hopAlphaAcidPct: source.type === "hop"
      ? readNumber(source.hopAlphaAcidPct, properties.alphaAcidPercent, properties.alphaAcid)
      : null,
    hopForm: source.type === "hop"
      ? parseHopForm(source.hopForm ?? properties.hopForm ?? properties.form)
      : null,
    hopSeason: source.type === "hop"
      ? readString(source.hopSeason, properties.season)
      : null,
    yeastAttenuationPct: source.type === "yeast"
      ? readNumber(source.yeastAttenuationPct, properties.attenuationPercent)
      : null,
    yeastType: source.type === "yeast"
      ? parseYeastType(source.yeastType ?? properties.yeastType)
      : null,
    yeastForm: source.type === "yeast"
      ? parseYeastForm(source.yeastForm ?? properties.yeastForm ?? properties.form)
      : null,
    yeastMinFermentationTempC: source.type === "yeast"
      ? readNumber(source.yeastMinFermentationTempC, properties.minTemperatureC)
      : null,
    yeastMaxFermentationTempC: source.type === "yeast"
      ? readNumber(source.yeastMaxFermentationTempC, properties.maxTemperatureC)
      : null
  };
};

export const normalizeIngredientTechnicalFields = (source: IngredientTechnicalSource): Required<Omit<IngredientTechnicalFields, "manufacturer" | "country">> => {
  const fields = extractIngredientTechnicalFields(source);

  return {
    fermentableColorEbc: source.type === "fermentable" ? fields.fermentableColorEbc ?? null : null,
    fermentableExtractYieldPct: source.type === "fermentable" ? fields.fermentableExtractYieldPct ?? null : null,
    hopAlphaAcidPct: source.type === "hop" ? fields.hopAlphaAcidPct ?? null : null,
    hopForm: source.type === "hop" ? fields.hopForm ?? null : null,
    hopSeason: source.type === "hop" ? fields.hopSeason ?? null : null,
    yeastAttenuationPct: source.type === "yeast" ? fields.yeastAttenuationPct ?? null : null,
    yeastType: source.type === "yeast" ? fields.yeastType ?? null : null,
    yeastForm: source.type === "yeast" ? fields.yeastForm ?? null : null,
    yeastMinFermentationTempC: source.type === "yeast" ? fields.yeastMinFermentationTempC ?? null : null,
    yeastMaxFermentationTempC: source.type === "yeast" ? fields.yeastMaxFermentationTempC ?? null : null
  };
};

export const syncIngredientPropertiesWithTechnicalFields = (source: IngredientTechnicalSource) => {
  const properties = {
    ...(isRecord(source.properties) ? source.properties : {})
  };

  for (const key of TECHNICAL_PROPERTY_KEYS) {
    delete properties[key];
  }

  const fields = extractIngredientTechnicalFields(source);

  if (source.type === "fermentable") {
    if (fields.fermentableColorEbc != null) {
      properties.colorEbc = fields.fermentableColorEbc;
      properties.colorLovibond = toLovibondFromEbc(fields.fermentableColorEbc);
    }
    if (fields.fermentableExtractYieldPct != null) {
      properties.extractFgdbPct = fields.fermentableExtractYieldPct;
      properties.extractYieldPct = fields.fermentableExtractYieldPct;
      properties.potentialPpg = toPotentialPpgFromExtractYield(fields.fermentableExtractYieldPct);
    }
  }

  if (source.type === "hop") {
    if (fields.hopAlphaAcidPct != null) {
      properties.alphaAcid = fields.hopAlphaAcidPct;
      properties.alphaAcidPercent = fields.hopAlphaAcidPct;
    }
    if (fields.hopForm) {
      properties.hopForm = fields.hopForm;
    }
    if (fields.hopSeason) {
      properties.season = fields.hopSeason;
    }
  }

  if (source.type === "yeast") {
    if (fields.yeastAttenuationPct != null) {
      properties.attenuationPercent = fields.yeastAttenuationPct;
    }
    if (fields.yeastType) {
      properties.yeastType = fields.yeastType;
    }
    if (fields.yeastForm) {
      properties.yeastForm = fields.yeastForm;
      properties.form = fields.yeastForm;
    }
    if (fields.yeastMinFermentationTempC != null) {
      properties.minTemperatureC = fields.yeastMinFermentationTempC;
    }
    if (fields.yeastMaxFermentationTempC != null) {
      properties.maxTemperatureC = fields.yeastMaxFermentationTempC;
    }
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
