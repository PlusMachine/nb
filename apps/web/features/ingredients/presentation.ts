import {
  extractIngredientTechnicalData,
  type IngredientTechnicalData
} from "./technical-fields";
import type {
  IngredientCategory,
  IngredientDisplayUnit,
  IngredientSubtype,
  LegacyIngredientType as IngredientType
} from "./taxonomy";

type IngredientPresentationSource = {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  type?: IngredientType | null;
  displayName: string;
  familyCanonicalName?: string | null;
  familyDisplayName?: string | null;
  familyDisplayNameEn?: string | null;
  familyDisplayNameRu?: string | null;
  manufacturer?: string | null;
  brandName?: string | null;
  harvestYear?: number | null;
  defaultDisplayUnit?: IngredientDisplayUnit | null;
  technicalData?: IngredientTechnicalData | Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
};

export const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  water_prep: "Подготовка воды",
  misc: "Прочее"
};

const subtypeLabels: Record<string, string> = {
  base_malt: "base malt",
  specialty_malt: "specialty malt",
  roasted_malt: "roasted malt",
  adjunct_grain: "adjunct grain",
  extract_dry: "dry extract",
  extract_liquid: "liquid extract",
  sugar: "sugar",
  syrup_honey: "syrup/honey",
  fruit_fermentable: "fruit fermentable",
  pellet: "pellet",
  whole_cone: "whole cone",
  cryo: "cryo",
  lupulin: "lupulin",
  extract: "extract",
  ale: "ale yeast",
  lager: "lager yeast",
  wheat: "wheat yeast",
  belgian: "belgian yeast",
  kveik: "kveik",
  wild_bacteria: "wild/bacteria",
  salt: "salt",
  acid: "acid",
  base: "base",
  nutrient_other: "nutrient",
  fining: "fining",
  antioxidant: "antioxidant",
  nutrient: "nutrient",
  spice_herb: "spice/herb",
  wood: "wood",
  flavoring: "flavoring",
  enzyme: "enzyme",
  process_aid: "process aid",
  other: "other"
};

const formatNumber = (value: number) => value.toLocaleString("en-US", {
  maximumFractionDigits: value % 1 === 0 ? 0 : 1
});

export const formatIngredientSubtypeLabel = (
  category: IngredientCategory,
  subtype?: IngredientSubtype | null
) => {
  if (!subtype) {
    return ingredientCategoryLabels[category];
  }

  if (category === "yeast" && subtypeLabels[subtype]) {
    return subtypeLabels[subtype];
  }

  return subtypeLabels[subtype] ?? subtype.replaceAll("_", " ");
};

export const resolveIngredientFamilyDisplayName = (source: IngredientPresentationSource) => (
  source.familyDisplayName
  ?? source.familyDisplayNameEn
  ?? source.familyDisplayNameRu
  ?? source.familyCanonicalName
  ?? undefined
);

const buildFermentableSummary = (technicalData: Extract<IngredientTechnicalData, { category: "fermentable" }>) => (
  [`${formatNumber(technicalData.colorEbc)} EBC`, `${formatNumber(technicalData.extractYieldPct)}%`].join(" • ")
);

const buildHopSummary = (
  technicalData: Extract<IngredientTechnicalData, { category: "hop" }>,
  fallbackSubtype?: IngredientSubtype | null
) => (
  [
    `${formatNumber(technicalData.alphaAcidPct)}% AA`,
    formatIngredientSubtypeLabel("hop", technicalData.subtype ?? fallbackSubtype ?? null),
    technicalData.harvestYear ?? null
  ].filter(Boolean).join(" • ")
);

const buildYeastSummary = (technicalData: Extract<IngredientTechnicalData, { category: "yeast" }>) => (
  [
    formatIngredientSubtypeLabel("yeast", technicalData.subtype),
    technicalData.form,
    `${formatNumber(technicalData.attenuationPct)}% attenuation`,
    technicalData.packageSize != null && technicalData.packageUnit
      ? `${formatNumber(technicalData.packageSize)} ${technicalData.packageUnit}`
      : null
  ].filter(Boolean).join(" • ")
);

const buildWaterPrepSummary = (
  technicalData: Extract<IngredientTechnicalData, { category: "water_prep" }>,
  defaultDisplayUnit?: IngredientDisplayUnit | null
) => (
  [
    formatIngredientSubtypeLabel("water_prep", technicalData.subtype),
    technicalData.subtype === "acid" ? technicalData.acidType : technicalData.compound,
    technicalData.strengthPct != null ? `${formatNumber(technicalData.strengthPct)}%` : null,
    defaultDisplayUnit ?? null
  ].filter(Boolean).join(" • ")
);

const buildMiscSummary = (
  technicalData: Extract<IngredientTechnicalData, { category: "misc" }>,
  defaultDisplayUnit?: IngredientDisplayUnit | null
) => (
  [
    formatIngredientSubtypeLabel("misc", technicalData.subtype),
    technicalData.doseHint,
    defaultDisplayUnit ?? null
  ].filter(Boolean).join(" • ")
);

export const buildIngredientTypedSummary = (source: IngredientPresentationSource) => {
  const technicalData = extractIngredientTechnicalData(source);

  if (!technicalData || !source.category) {
    const fallbackParts = [
      source.subtype ? formatIngredientSubtypeLabel(source.category ?? "misc", source.subtype) : null,
      source.harvestYear ?? null,
      source.defaultDisplayUnit ?? null
    ].filter(Boolean);

    return fallbackParts.length ? fallbackParts.join(" • ") : undefined;
  }

  if (technicalData.category === "fermentable") {
    return buildFermentableSummary(technicalData);
  }

  if (technicalData.category === "hop") {
    return buildHopSummary(technicalData, source.subtype);
  }

  if (technicalData.category === "yeast") {
    return buildYeastSummary(technicalData);
  }

  if (technicalData.category === "water_prep") {
    return buildWaterPrepSummary(technicalData, source.defaultDisplayUnit);
  }

  return buildMiscSummary(technicalData, source.defaultDisplayUnit);
};

export const buildIngredientSuggestionMetaLine = (source: IngredientPresentationSource) => {
  const familyDisplayName = resolveIngredientFamilyDisplayName(source);
  const typedSummary = buildIngredientTypedSummary(source);

  return [familyDisplayName, typedSummary]
    .filter((value) => Boolean(value) && value !== source.displayName)
    .join(" • ") || undefined;
};
