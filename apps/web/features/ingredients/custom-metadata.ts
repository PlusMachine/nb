import type { userCustomIngredients } from "@nb/db";

import type {
  IngredientAliasLocale,
  IngredientDisplayMode,
  IngredientTechnicalData
} from "./contracts";
import { normalizeSearchText } from "./normalization";
import type {
  IngredientCategory,
  IngredientSubtype
} from "./taxonomy";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype
} from "./taxonomy";
import {
  inventoryUnits,
  type InventoryUnit,
  type InventoryUnitDimension
} from "../inventory/units";

export type CustomIngredientAliasRecord = {
  locale: IngredientAliasLocale;
  alias: string;
  aliasNormalized: string;
  source: string;
  isEnabled: boolean;
};

export type CustomIngredientMetadata = {
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  nameRu: string | null;
  nameEn: string | null;
  displayModeRu: IngredientDisplayMode;
  displayNameOverrideRu: string | null;
  secondaryNameOverrideRu: string | null;
  hideSecondaryNameRu: boolean;
  aliases: CustomIngredientAliasRecord[];
  notes: string | null;
  defaultDisplayUnit: InventoryUnit | null;
  allowedUnits: InventoryUnit[] | null;
  measurementDimension: InventoryUnitDimension | null;
  technicalData: IngredientTechnicalData | null;
  derivedFromIngredientId: string | null;
  derivedFromDisplayName: string | null;
  productCode: string | null;
  properties: Record<string, unknown>;
};

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

const normalizeAliasLocale = (value: unknown): IngredientAliasLocale => {
  if (value === "ru" || value === "en" || value === "neutral") {
    return value;
  }

  return "neutral";
};

const normalizeAliasEntry = (value: unknown): CustomIngredientAliasRecord | null => {
  if (typeof value === "string") {
    const alias = readTrimmedString(value);
    if (!alias) {
      return null;
    }

    return {
      locale: "neutral",
      alias,
      aliasNormalized: normalizeSearchText(alias),
      source: "custom",
      isEnabled: true
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const alias = readTrimmedString(value.alias);
  if (!alias) {
    return null;
  }

  return {
    locale: normalizeAliasLocale(value.locale),
    alias,
    aliasNormalized: normalizeSearchText(alias),
    source: readTrimmedString(value.source) ?? "custom",
    isEnabled: typeof value.isEnabled === "boolean" ? value.isEnabled : true
  };
};

const normalizeAliases = (value: unknown): CustomIngredientAliasRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, CustomIngredientAliasRecord>();
  for (const aliasValue of value) {
    const normalized = normalizeAliasEntry(aliasValue);
    if (!normalized || !normalized.aliasNormalized) {
      continue;
    }

    deduped.set(`${normalized.locale}:${normalized.aliasNormalized}`, normalized);
  }

  return Array.from(deduped.values());
};

const normalizeAllowedUnits = (value: unknown): InventoryUnit[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const units = value
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry): entry is InventoryUnit => (inventoryUnits as readonly string[]).includes(entry));

  return units.length ? Array.from(new Set(units)) : null;
};

const normalizeMeasurementDimension = (value: unknown): InventoryUnitDimension | null => {
  if (value === "weight" || value === "volume" || value === "count") {
    return value;
  }

  return null;
};

export const readCustomIngredientMetadata = (
  custom: Pick<typeof userCustomIngredients.$inferSelect, "type" | "properties">
): CustomIngredientMetadata => {
  const properties = isRecord(custom.properties) ? custom.properties : {};
  const category = resolveIngredientCategory({
    type: custom.type,
    category: readTrimmedString(properties.category) ?? undefined
  });
  const subtype = resolveIngredientSubtype({
    type: custom.type,
    category,
    subtype: readTrimmedString(properties.subtype) ?? undefined
  });

  return {
    category,
    subtype,
    nameRu: readTrimmedString(properties.nameRu),
    nameEn: readTrimmedString(properties.nameEn),
    displayModeRu: properties.displayModeRu === "localized_first" || properties.displayModeRu === "source_first"
      ? properties.displayModeRu
      : "auto",
    displayNameOverrideRu: readTrimmedString(properties.displayNameOverrideRu),
    secondaryNameOverrideRu: readTrimmedString(properties.secondaryNameOverrideRu),
    hideSecondaryNameRu: properties.hideSecondaryNameRu === true,
    aliases: normalizeAliases(properties.aliases),
    notes: readTrimmedString(properties.notes),
    defaultDisplayUnit: (() => {
      const value = String(properties.defaultDisplayUnit ?? "").trim().toLowerCase();
      return (inventoryUnits as readonly string[]).includes(value) ? value as InventoryUnit : null;
    })(),
    allowedUnits: normalizeAllowedUnits(properties.allowedUnits),
    measurementDimension: normalizeMeasurementDimension(properties.measurementDimension),
    technicalData: isRecord(properties.technicalData) && typeof properties.technicalData.type === "string"
      ? properties.technicalData as IngredientTechnicalData
      : null,
    derivedFromIngredientId: readTrimmedString(properties.derivedFromIngredientId),
    derivedFromDisplayName: readTrimmedString(properties.derivedFromDisplayName),
    productCode: readTrimmedString(properties.productCode),
    properties
  };
};
