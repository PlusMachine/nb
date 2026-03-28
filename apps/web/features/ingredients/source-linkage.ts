import { ingredients, userCustomIngredients } from "@nb/db";

import type { IngredientTechnicalData } from "./contracts";
import {
  buildIngredientTypedSummary,
  resolveIngredientDisplayNames
} from "./presentation";
import { readCustomIngredientMetadata } from "./custom-metadata";
import { extractIngredientTechnicalData } from "./technical-fields";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype,
  type IngredientCategory,
  type IngredientSubtype,
  type LegacyIngredientType as IngredientType
} from "./taxonomy";
import {
  resolveInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitDimension
} from "../inventory/units";

export type IngredientSourceLinkage = {
  type: IngredientType;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string | null;
  displayName: string;
  displayNameRu?: string | null;
  displayNameEn?: string | null;
  familyDisplayName: string | null;
  summary: string | null;
  defaultDisplayUnit: InventoryUnit;
  allowedUnits: InventoryUnit[];
  measurementDimension: InventoryUnitDimension;
  technicalData: IngredientTechnicalData | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

export const buildCatalogIngredientLinkage = (
  catalog: typeof ingredients.$inferSelect
): IngredientSourceLinkage => {
  const technicalData = extractIngredientTechnicalData({
    type: catalog.type,
    attributes: catalog.attributes
  });
  const { primaryName, secondaryName } = resolveIngredientDisplayNames({
    type: catalog.type as IngredientType,
    countryCode: catalog.countryCode,
    nameRu: catalog.nameRu,
    nameEn: catalog.nameEn,
    displayModeRu: catalog.displayModeRu as "auto" | "localized_first" | "source_first",
    displayNameOverrideRu: catalog.displayNameOverrideRu,
    secondaryNameOverrideRu: catalog.secondaryNameOverrideRu,
    hideSecondaryNameRu: catalog.hideSecondaryNameRu
  });
  const category = resolveIngredientCategory({ type: catalog.type });
  const subtype = resolveIngredientSubtype({
    type: catalog.type,
    subtype: catalog.itemKind
  });
  const unitPreferred = technicalData?.type === "water_treatment" && typeof technicalData.unitPreferred === "string"
    ? technicalData.unitPreferred
    : null;
  const unitProfile = resolveInventoryUnitProfile({
    type: catalog.type as IngredientType,
    category,
    subtype,
    quantityDefaults: isRecord(catalog.quantityDefaults) ? catalog.quantityDefaults : null,
    unitPreferred,
    technicalData
  });

  return {
    type: catalog.type as IngredientType,
    category,
    subtype,
    familyId: null,
    displayName: primaryName,
    displayNameRu: catalog.nameRu,
    displayNameEn: secondaryName ?? catalog.nameEn,
    familyDisplayName: null,
    summary: buildIngredientTypedSummary({
      type: catalog.type as IngredientType,
      category,
      subtype,
      technicalData,
      unitPreferred
    }) ?? null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    technicalData
  };
};

export const buildCustomIngredientLinkage = (
  custom: typeof userCustomIngredients.$inferSelect
): IngredientSourceLinkage => {
  const metadata = readCustomIngredientMetadata(custom);
  const properties = metadata.properties;
  const technicalData = extractIngredientTechnicalData({
    type: custom.type,
    technicalData: metadata.technicalData ?? undefined,
    properties: custom.properties,
    hopAlphaAcidPct: custom.hopAlphaAcidPct,
    hopBetaAcidPct: null,
    hopTotalOilMlPer100g: null,
    hopForm: custom.hopForm,
    fermentableExtractYieldPct: custom.fermentableExtractYieldPct,
    fermentableColorEbc: custom.fermentableColorEbc,
    yeastAttenuationPct: custom.yeastAttenuationPct,
    yeastForm: custom.yeastForm,
    yeastMinFermentationTempC: custom.yeastMinFermentationTempC,
    yeastMaxFermentationTempC: custom.yeastMaxFermentationTempC
  });
  const type = custom.type as IngredientType;
  const category = resolveIngredientCategory({
    type,
    category: metadata.category
  });
  const subtype = resolveIngredientSubtype({
    type,
    category: metadata.category,
    subtype: metadata.subtype
  });
  const unitProfile = resolveInventoryUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit: metadata.defaultDisplayUnit,
    allowedUnits: metadata.allowedUnits,
    measurementDimension: metadata.measurementDimension,
    technicalData
  });
  const { primaryName, secondaryName } = resolveIngredientDisplayNames({
    displayName: custom.displayName,
    nameRu: metadata.nameRu,
    nameEn: metadata.nameEn,
    displayModeRu: metadata.displayModeRu,
    displayNameOverrideRu: metadata.displayNameOverrideRu,
    secondaryNameOverrideRu: metadata.secondaryNameOverrideRu,
    hideSecondaryNameRu: metadata.hideSecondaryNameRu
  });

  return {
    type,
    category,
    subtype,
    familyId: null,
    displayName: primaryName,
    displayNameRu: metadata.nameRu,
    displayNameEn: secondaryName ?? metadata.nameEn,
    familyDisplayName: null,
    summary: buildIngredientTypedSummary({
      type,
      category,
      subtype,
      technicalData
    }) ?? null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    technicalData
  };
};
