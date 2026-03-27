import type { IngredientDisplayMode, IngredientTechnicalData } from "./contracts";
import { normalizeSearchText } from "./normalization";
import type { IngredientCategory, IngredientSubtype, LegacyIngredientType as IngredientType } from "./taxonomy";

type IngredientPresentationSource = {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  type?: IngredientType | null;
  primaryLabelRu?: string | null;
  secondaryLabelRu?: string | null;
  displayName?: string | null;
  displayNameRu?: string | null;
  displayNameEn?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
  displayModeRu?: IngredientDisplayMode | null;
  displayNameOverrideRu?: string | null;
  secondaryNameOverrideRu?: string | null;
  hideSecondaryNameRu?: boolean | null;
  countryCode?: string | null;
  familyDisplayName?: string | null;
  familyCanonicalName?: string | null;
  technicalData?: IngredientTechnicalData | Record<string, unknown> | null;
  unitPreferred?: string | null;
};

export const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  consumable: "Расходники",
  water_treatment: "Водоподготовка"
};

const subtypeLabels: Record<string, string> = {
  malt: "солод",
  fermentable: "ферментируемое",
  hop: "хмель",
  yeast: "дрожжи",
  process_aid: "process aid",
  nutrient: "nutrient",
  sanitizer: "sanitizer",
  cleaner: "cleaner",
  antioxidant: "antioxidant",
  fining: "fining",
  water_source: "source water",
  salt: "salt",
  acid: "acid",
  base: "base",
  dechlorination: "dechlorination",
  other: "other"
};

const formatNumber = (value: number) => value.toLocaleString("en-US", {
  maximumFractionDigits: value % 1 === 0 ? 0 : 1
});

const normalizeOptionalName = (value?: string | null) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const areNameVariantsEqual = (left?: string, right?: string) => {
  if (!left || !right) {
    return false;
  }

  return normalizeSearchText(left) === normalizeSearchText(right);
};

export const resolveEffectiveDisplayMode = (
  source: Pick<IngredientPresentationSource, "type" | "countryCode" | "nameRu" | "displayModeRu">
): Exclude<IngredientDisplayMode, "auto"> => {
  if (source.displayModeRu === "localized_first" || source.displayModeRu === "source_first") {
    return source.displayModeRu;
  }

  if (source.type === "hop") {
    return source.countryCode && ["RU", "BY", "UA", "KZ"].includes(source.countryCode) && normalizeOptionalName(source.nameRu)
      ? "localized_first"
      : "source_first";
  }

  if (source.type === "yeast") {
    return "source_first";
  }

  return "localized_first";
};

export const resolveIngredientPrimaryDisplayName = (source: Pick<
  IngredientPresentationSource,
  | "type"
  | "countryCode"
  | "primaryLabelRu"
  | "displayName"
  | "displayNameRu"
  | "displayNameEn"
  | "nameRu"
  | "nameEn"
  | "displayModeRu"
  | "displayNameOverrideRu"
>) => {
  const directPrimary = normalizeOptionalName(source.primaryLabelRu)
    ?? normalizeOptionalName(source.displayName);
  if (directPrimary) {
    return directPrimary;
  }

  const override = normalizeOptionalName(source.displayNameOverrideRu);
  if (override) {
    return override;
  }

  const nameRu = normalizeOptionalName(source.nameRu) ?? normalizeOptionalName(source.displayNameRu);
  const nameEn = normalizeOptionalName(source.nameEn) ?? normalizeOptionalName(source.displayNameEn);
  const mode = resolveEffectiveDisplayMode(source);

  if (mode === "localized_first") {
    return nameRu ?? nameEn ?? "";
  }

  return nameEn ?? nameRu ?? "";
};

export const resolveIngredientSecondaryDisplayName = (source: Pick<
  IngredientPresentationSource,
  | "type"
  | "countryCode"
  | "secondaryLabelRu"
  | "displayNameRu"
  | "displayNameEn"
  | "nameRu"
  | "nameEn"
  | "displayModeRu"
  | "displayNameOverrideRu"
  | "secondaryNameOverrideRu"
  | "hideSecondaryNameRu"
>) => {
  if (source.hideSecondaryNameRu) {
    return undefined;
  }

  const directSecondary = normalizeOptionalName(source.secondaryLabelRu);
  if (directSecondary) {
    return directSecondary;
  }

  const override = normalizeOptionalName(source.secondaryNameOverrideRu);
  if (override) {
    return override;
  }

  const primaryName = resolveIngredientPrimaryDisplayName(source);
  const nameRu = normalizeOptionalName(source.nameRu) ?? normalizeOptionalName(source.displayNameRu);
  const nameEn = normalizeOptionalName(source.nameEn) ?? normalizeOptionalName(source.displayNameEn);
  const mode = resolveEffectiveDisplayMode(source);
  const secondary = mode === "localized_first" ? nameEn : nameRu;

  if (!secondary || areNameVariantsEqual(primaryName, secondary)) {
    return undefined;
  }

  return secondary;
};

export const resolveIngredientDisplayNames = (source: Pick<
  IngredientPresentationSource,
  | "type"
  | "countryCode"
  | "primaryLabelRu"
  | "secondaryLabelRu"
  | "displayName"
  | "displayNameRu"
  | "displayNameEn"
  | "nameRu"
  | "nameEn"
  | "displayModeRu"
  | "displayNameOverrideRu"
  | "secondaryNameOverrideRu"
  | "hideSecondaryNameRu"
>) => ({
  primaryName: resolveIngredientPrimaryDisplayName(source),
  secondaryName: resolveIngredientSecondaryDisplayName(source)
});

export const formatIngredientSubtypeLabel = (
  category: IngredientCategory,
  subtype?: IngredientSubtype | null
) => {
  if (!subtype) {
    return ingredientCategoryLabels[category];
  }

  return subtypeLabels[subtype] ?? subtype.replaceAll("_", " ");
};

export const resolveIngredientFamilyDisplayName = (
  source: Pick<IngredientPresentationSource, "familyDisplayName" | "familyCanonicalName"> & {
    displayName?: string | null;
    familyDisplayNameRu?: string | null;
    familyDisplayNameEn?: string | null;
  }
) => source.familyDisplayName
  ?? source.familyDisplayNameEn
  ?? source.familyDisplayNameRu
  ?? source.familyCanonicalName
  ?? source.displayName
  ?? undefined;

const buildHopSummary = (technicalData: Extract<IngredientTechnicalData, { type: "hop" }>) => (
  [
    technicalData.alphaAcidPctTypical != null
      ? `${formatNumber(technicalData.alphaAcidPctTypical)}% AA`
      : null,
    technicalData.hopForm && technicalData.hopForm !== "standard" ? technicalData.hopForm : null
  ].filter(Boolean).join(" • ")
);

const buildMaltSummary = (technicalData: Extract<IngredientTechnicalData, { type: "malt" }>) => (
  [
    technicalData.colorLovibond != null ? `${formatNumber(technicalData.colorLovibond)} Lovibond` : null,
    technicalData.extractPctDryBasis != null ? `${formatNumber(technicalData.extractPctDryBasis)}% extract` : null
  ].filter(Boolean).join(" • ")
);

const buildFermentableSummary = (technicalData: Extract<IngredientTechnicalData, { type: "fermentable" }>) => (
  [
    technicalData.colorLovibond != null ? `${formatNumber(technicalData.colorLovibond)} Lovibond` : null,
    technicalData.extractPctDryBasis != null ? `${formatNumber(technicalData.extractPctDryBasis)}% extract` : null
  ].filter(Boolean).join(" • ")
);

const buildYeastSummary = (technicalData: Extract<IngredientTechnicalData, { type: "yeast" }>) => (
  [
    technicalData.form,
    technicalData.attenuationPctTypical != null
      ? `${formatNumber(technicalData.attenuationPctTypical)}% attenuation`
      : null,
    technicalData.fermentationTempCMin != null && technicalData.fermentationTempCMax != null
      ? `${formatNumber(technicalData.fermentationTempCMin)}-${formatNumber(technicalData.fermentationTempCMax)}C`
      : null
  ].filter(Boolean).join(" • ")
);

const buildConsumableSummary = (
  technicalData: Extract<IngredientTechnicalData, { type: "consumable" }>,
  subtype?: IngredientSubtype | null
) => (
  [
    subtype ? formatIngredientSubtypeLabel("consumable", subtype) : null,
    technicalData.commonForms?.[0] ?? null
  ].filter(Boolean).join(" • ")
);

const buildWaterTreatmentSummary = (
  technicalData: Extract<IngredientTechnicalData, { type: "water_treatment" }>,
  unitPreferred?: string | null,
  subtype?: IngredientSubtype | null
) => (
  [
    subtype ? formatIngredientSubtypeLabel("water_treatment", subtype) : null,
    technicalData.unitPreferred ?? unitPreferred ?? null
  ].filter(Boolean).join(" • ")
);

export const buildIngredientTypedSummary = (source: IngredientPresentationSource) => {
  const technicalData = source.technicalData as IngredientTechnicalData | null | undefined;
  if (!technicalData) {
    if (source.category && source.subtype) {
      return formatIngredientSubtypeLabel(source.category, source.subtype);
    }

    return undefined;
  }

  if (technicalData.type === "hop") {
    return buildHopSummary(technicalData as Extract<IngredientTechnicalData, { type: "hop" }>);
  }

  if (technicalData.type === "malt") {
    return buildMaltSummary(technicalData as Extract<IngredientTechnicalData, { type: "malt" }>);
  }

  if (technicalData.type === "fermentable") {
    return buildFermentableSummary(technicalData as Extract<IngredientTechnicalData, { type: "fermentable" }>);
  }

  if (technicalData.type === "yeast") {
    return buildYeastSummary(technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>);
  }

  if (technicalData.type === "consumable") {
    return buildConsumableSummary(technicalData as Extract<IngredientTechnicalData, { type: "consumable" }>, source.subtype);
  }

  if (technicalData.type === "water_treatment") {
    return buildWaterTreatmentSummary(
      technicalData as Extract<IngredientTechnicalData, { type: "water_treatment" }>,
      source.unitPreferred,
      source.subtype
    );
  }

  return undefined;
};

export const buildIngredientSuggestionMetaLine = (source: IngredientPresentationSource) => {
  const typedSummary = buildIngredientTypedSummary(source);
  return typedSummary || undefined;
};
