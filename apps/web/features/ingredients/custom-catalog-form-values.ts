import type { CustomCatalogIngredientFormInitialValue } from "@/components/ingredients/custom-catalog-ingredient-form";

import type { UserCatalogIngredientDto } from "./contracts";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readTrimmedString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const readFiniteNumber = (value: unknown) => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

const lovibondToEbc = (value: number) => Number((value * 1.97).toFixed(2));

export const buildCustomFormInitialValueFromCatalogItem = (
  item: UserCatalogIngredientDto
): CustomCatalogIngredientFormInitialValue => ({
  category: item.category,
  subtype: item.subtype,
  displayName: item.primaryLabelRu,
  nameRu: item.nameRu,
  nameEn: item.nameEn,
  aliases: item.aliases.map((alias) => alias.alias),
  brand: item.brand ?? item.producer,
  country: item.countryName ?? item.country,
  productCode: item.productCode,
  notes: item.notes,
  displayModeRu: item.displayModeRu,
  displayNameOverrideRu: item.displayNameOverrideRu,
  secondaryNameOverrideRu: item.secondaryNameOverrideRu,
  hideSecondaryNameRu: item.hideSecondaryNameRu,
  derivedFromIngredientId: item.source === "catalog" ? item.id : item.derivedFromIngredientId,
  derivedFromDisplayName: item.source === "catalog" ? item.primaryLabelRu : item.derivedFromDisplayName,
  harvestYear: readFiniteNumber(item.properties?.harvestYear),
  fermentableColorEbc: item.fermentableColorLovibond == null ? null : lovibondToEbc(item.fermentableColorLovibond),
  fermentableExtractYieldPct: item.fermentableExtractYieldPct ?? null,
  fermentableProteinPct: (() => {
    const technicalData = item.technicalData;
    if (!technicalData || technicalData.type !== "malt") {
      return null;
    }

    return readFiniteNumber(technicalData.proteinPct);
  })(),
  hopAlphaAcidPct: item.hopAlphaAcidPct ?? null,
  hopBetaAcidPct: item.hopBetaAcidPct ?? null,
  hopForm: (readTrimmedString(item.hopForm) ?? readTrimmedString(item.properties?.hopForm)) as CustomCatalogIngredientFormInitialValue["hopForm"],
  yeastAttenuationPct: item.yeastAttenuationPct ?? null,
  yeastForm: (() => {
    const technicalData = item.technicalData;
    if (technicalData && technicalData.type === "yeast") {
      return (readTrimmedString(technicalData.form) ?? readTrimmedString(item.properties?.yeastForm)) as CustomCatalogIngredientFormInitialValue["yeastForm"];
    }

    return readTrimmedString(item.properties?.yeastForm) as CustomCatalogIngredientFormInitialValue["yeastForm"];
  })(),
  yeastFlocculation: (() => {
    const technicalData = item.technicalData;
    if (!technicalData || technicalData.type !== "yeast") {
      return null;
    }

    return readTrimmedString(technicalData.flocculation);
  })(),
  yeastMinFermentationTempC: item.yeastMinFermentationTempC ?? null,
  yeastMaxFermentationTempC: item.yeastMaxFermentationTempC ?? null,
  alcoholToleranceAbvTypical: (() => {
    const technicalData = item.technicalData;
    if (!technicalData || technicalData.type !== "yeast") {
      return null;
    }

    return readFiniteNumber(technicalData.alcoholToleranceAbvTypical);
  })(),
  physicalForm: readTrimmedString(item.properties?.physicalForm) as CustomCatalogIngredientFormInitialValue["physicalForm"],
  concentration: readTrimmedString(item.properties?.concentration),
  defaultDisplayUnit: item.defaultDisplayUnit
});

export const buildCustomFormInitialValueFromCustomItem = (
  item: UserCatalogIngredientDto
): CustomCatalogIngredientFormInitialValue => {
  const base = buildCustomFormInitialValueFromCatalogItem(item);
  const properties = isRecord(item.properties) ? item.properties : {};

  return {
    ...base,
    id: item.id,
    derivedFromIngredientId: readTrimmedString(properties.derivedFromIngredientId),
    derivedFromDisplayName: readTrimmedString(properties.derivedFromDisplayName) ?? item.derivedFromDisplayName,
    hopForm: readTrimmedString(properties.hopForm) as CustomCatalogIngredientFormInitialValue["hopForm"],
    yeastForm: base.yeastForm,
    physicalForm: readTrimmedString(properties.physicalForm) as CustomCatalogIngredientFormInitialValue["physicalForm"],
    concentration: readTrimmedString(properties.concentration) ?? base.concentration
  };
};
