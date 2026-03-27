import { ingredientCatalogItems, userCustomIngredients } from "@nb/db";

import {
  resolveIngredientPrimaryDisplayName,
  resolveIngredientFamilyDisplayName,
  buildIngredientTypedSummary
} from "./presentation";
import { extractIngredientTechnicalData, type IngredientTechnicalData } from "./technical-fields";
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

const readStringProperty = (properties: Record<string, unknown>, key: string) => (
  typeof properties[key] === "string" ? String(properties[key]).trim() : ""
);

const readStringArrayProperty = (properties: Record<string, unknown>, key: string) => (
  Array.isArray(properties[key])
    ? properties[key].filter((value): value is string => typeof value === "string")
    : []
);

export const buildCatalogIngredientLinkage = (
  catalog: typeof ingredientCatalogItems.$inferSelect
): IngredientSourceLinkage => {
  const technicalData = extractIngredientTechnicalData(catalog);
  const displayName = resolveIngredientPrimaryDisplayName(catalog);
  const unitProfile = resolveInventoryUnitProfile({
    type: catalog.type,
    category: catalog.category,
    subtype: catalog.subtype as IngredientSubtype | null,
    defaultDisplayUnit: catalog.defaultDisplayUnit,
    allowedUnits: catalog.allowedUnits,
    measurementDimension: catalog.measurementDimension,
    technicalData
  });

  return {
    type: catalog.type,
    category: catalog.category,
    subtype: catalog.subtype as IngredientSubtype | null,
    familyId: catalog.familyId,
    displayName,
    displayNameRu: catalog.displayNameRu,
    displayNameEn: catalog.displayNameEn,
    familyDisplayName: resolveIngredientFamilyDisplayName({
      displayName,
      familyCanonicalName: null
    }) ?? null,
    summary: buildIngredientTypedSummary({
      category: catalog.category,
      subtype: catalog.subtype as IngredientSubtype | null,
      displayName,
      harvestYear: catalog.harvestYear,
      defaultDisplayUnit: unitProfile.defaultUnit,
      technicalData
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
  const properties = isRecord(custom.properties) ? custom.properties : {};
  const technicalData = extractIngredientTechnicalData(custom);
  const category = resolveIngredientCategory({
    type: custom.type,
    displayName: custom.displayName,
    properties: custom.properties,
    hopForm: custom.hopForm,
    yeastType: custom.yeastType,
    yeastForm: custom.yeastForm
  });
  const subtype = resolveIngredientSubtype({
    category,
    type: custom.type,
    displayName: custom.displayName,
    properties: custom.properties,
    hopForm: custom.hopForm,
    yeastType: custom.yeastType,
    yeastForm: custom.yeastForm
  });
  const unitProfile = resolveInventoryUnitProfile({
    type: custom.type,
    category,
    subtype,
    defaultDisplayUnit: readStringProperty(properties, "defaultDisplayUnit") || undefined,
    allowedUnits: readStringArrayProperty(properties, "allowedUnits"),
    measurementDimension: readStringProperty(properties, "measurementDimension") || undefined,
    technicalData
  });

  return {
    type: custom.type,
    category,
    subtype: subtype as IngredientSubtype | null,
    familyId: null,
    displayName: custom.displayName,
    displayNameRu: null,
    displayNameEn: null,
    familyDisplayName: null,
    summary: buildIngredientTypedSummary({
      category,
      subtype: subtype as IngredientSubtype | null,
      displayName: custom.displayName,
      defaultDisplayUnit: unitProfile.defaultUnit,
      technicalData
    }) ?? null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    technicalData
  };
};
