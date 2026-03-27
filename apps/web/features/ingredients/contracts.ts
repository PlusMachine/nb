import { z } from "zod";

import {
  ingredientCategories as taxonomyIngredientCategories,
  ingredientCompletenessLevels as taxonomyIngredientCompletenessLevels,
  ingredientDisplayUnits,
  ingredientMatchPolicies as taxonomyIngredientMatchPolicies,
  ingredientMeasurementDimensions as taxonomyIngredientMeasurementDimensions,
  legacyIngredientTypes,
  miscSubtypes,
  resolveIngredientCategory,
  resolveIngredientSubtype,
  resolveLegacyIngredientType,
  type IngredientCategory,
  type IngredientCompletenessLevel,
  type IngredientDisplayUnit,
  type IngredientMatchPolicy,
  type IngredientMeasurementDimension,
  type IngredientSubtype,
  type LegacyIngredientType
} from "./taxonomy";
import {
  hopForms,
  legacyYeastTypes,
  miscUsagePhases,
  normalizeIngredientTechnicalData,
  waterPrepPhysicalForms,
  yeastFlocculationLevels,
  yeastForms,
  type HopForm,
  type IngredientTechnicalData,
  type IngredientTechnicalFields,
  type LegacyYeastType,
  type MiscUsagePhase,
  type WaterPrepPhysicalForm,
  type YeastFlocculationLevel,
  type YeastForm
} from "./technical-fields";

export const ingredientTypes = legacyIngredientTypes;
export type IngredientType = LegacyIngredientType;
export type {
  IngredientCategory,
  IngredientCompletenessLevel,
  IngredientDisplayUnit,
  IngredientMatchPolicy,
  IngredientMeasurementDimension,
  IngredientSubtype
};
export const ingredientCategories = taxonomyIngredientCategories;
export const ingredientMatchPolicies = taxonomyIngredientMatchPolicies;
export const ingredientCompletenessLevels = taxonomyIngredientCompletenessLevels;
export const ingredientMeasurementDimensions = taxonomyIngredientMeasurementDimensions;
export const yeastTypes = legacyYeastTypes;
export type YeastType = LegacyYeastType;
export {
  hopForms,
  miscUsagePhases,
  waterPrepPhysicalForms,
  yeastFlocculationLevels,
  yeastForms
};
export type {
  HopForm,
  IngredientTechnicalData,
  IngredientTechnicalFields,
  MiscUsagePhase,
  WaterPrepPhysicalForm,
  YeastFlocculationLevel,
  YeastForm
};

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
}, z.number().min(min).max(max).nullable().optional());

const nullableIntegerField = (min: number, max: number) => z.preprocess((value) => {
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
}, z.number().int().min(min).max(max).nullable().optional());

export const ingredientSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  type: z.enum(ingredientTypes).optional(),
  category: z.enum(ingredientCategories).optional(),
  limit: z.coerce.number().min(1).max(20).default(10)
}).superRefine((value, ctx) => {
  if (value.type && value.category) {
    const resolvedCategory = resolveIngredientCategory(value);
    if (resolvedCategory !== value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Type and category filters conflict",
        path: ["category"]
      });
    }
  }
});

export const ingredientUpsertSchema = z.object({
  type: z.enum(ingredientTypes).optional(),
  category: z.enum(ingredientCategories).optional(),
  subtype: z.string().trim().max(80).optional().nullable(),
  familyId: z.string().uuid().optional().nullable(),
  canonicalFamilyName: z.string().trim().min(1).max(180).optional().nullable(),
  familyDisplayNameRu: z.string().trim().max(180).optional().nullable(),
  familyDisplayNameEn: z.string().trim().max(180).optional().nullable(),
  matchPolicy: z.enum(ingredientMatchPolicies).optional().nullable(),
  displayName: z.string().trim().min(2).max(180),
  aliases: z.array(z.string().trim().min(1).max(180)).max(20).default([]),
  brandName: z.string().trim().max(140).optional().nullable(),
  manufacturer: z.string().trim().max(140).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  harvestYear: nullableIntegerField(1900, 2200),
  description: z.string().trim().max(3000).optional().nullable(),
  defaultUnit: z.string().trim().min(1).max(32).optional(),
  defaultDisplayUnit: z.enum(ingredientDisplayUnits).optional(),
  allowedUnits: z.array(z.enum(ingredientDisplayUnits)).max(12).optional(),
  measurementDimension: z.enum(ingredientMeasurementDimensions).optional().nullable(),
  completenessLevel: z.enum(ingredientCompletenessLevels).optional().nullable(),
  technicalData: z.record(z.string(), z.unknown()).optional().nullable(),
  fermentableColorEbc: nullableNumberField(0, 2000),
  fermentableExtractYieldPct: nullableNumberField(0, 100),
  fermentableProteinPct: nullableNumberField(0, 100),
  fermentableMoisturePct: nullableNumberField(0, 100),
  fermentableMaxUsagePercent: nullableNumberField(0, 100),
  fermentableDiastaticPowerLintner: nullableNumberField(0, 1000),
  fermentableUsageFlags: z.preprocess((value) => {
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
  }, z.array(z.string().trim().min(1).max(40)).max(12)).optional(),
  hopAlphaAcidPct: nullableNumberField(0, 100),
  hopBetaAcidPct: nullableNumberField(0, 100),
  hopTotalOilMlPer100g: nullableNumberField(0, 20),
  hopForm: z.enum(hopForms).optional().nullable(),
  hopSeason: z.string().trim().max(32).optional().nullable(),
  hopNotes: z.string().trim().max(1000).optional().nullable(),
  yeastAttenuationPct: nullableNumberField(0, 100),
  yeastType: z.enum(yeastTypes).optional().nullable(),
  yeastForm: z.enum(yeastForms).optional().nullable(),
  yeastMinFermentationTempC: nullableNumberField(-10, 60),
  yeastMaxFermentationTempC: nullableNumberField(-10, 60),
  yeastFlocculation: z.enum(yeastFlocculationLevels).optional().nullable(),
  yeastAlcoholTolerancePct: nullableNumberField(0, 100),
  yeastPackageSize: nullableNumberField(0.0001, 100000),
  yeastPackageUnit: z.enum(ingredientDisplayUnits).optional().nullable(),
  yeastPhenolic: z.preprocess((value) => {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
    }

    return value;
  }, z.boolean().nullable().optional()),
  yeastDiastaticus: z.preprocess((value) => {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
    }

    return value;
  }, z.boolean().nullable().optional()),
  waterPrepCompound: z.string().trim().max(120).optional().nullable(),
  waterPrepAcidType: z.string().trim().max(120).optional().nullable(),
  waterPrepStrengthPct: nullableNumberField(0.0001, 100),
  waterPrepPurityPct: nullableNumberField(0.0001, 100),
  waterPrepPhysicalForm: z.enum(waterPrepPhysicalForms).optional().nullable(),
  miscUsagePhase: z.enum(miscUsagePhases).optional().nullable(),
  miscDoseHint: z.string().trim().max(240).optional().nullable(),
  properties: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "active", "archived", "merged"]).default("active"),
  visibility: z.enum(["public", "internal"]).default("public")
}).superRefine((value, ctx) => {
  if (!value.type && !value.category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either type or category is required",
      path: ["category"]
    });
    return;
  }

  const resolvedCategory = resolveIngredientCategory(value);
  const resolvedLegacyType = resolveLegacyIngredientType(value);
  const resolvedSubtype = resolveIngredientSubtype(value);
  if (value.category && resolvedCategory !== value.category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provided category conflicts with type/subtype mapping",
      path: ["category"]
    });
  }

  if (value.type && resolvedLegacyType !== value.type && value.category == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provided type conflicts with subtype mapping",
      path: ["type"]
    });
  }

  if (!value.defaultUnit && !value.defaultDisplayUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Default display unit is required",
      path: ["defaultDisplayUnit"]
    });
  }

  if (resolvedCategory === "misc" && value.subtype && !miscSubtypes.includes(resolvedSubtype as never)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unknown misc subtype",
      path: ["subtype"]
    });
  }

  if (!resolvedSubtype) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Subtype is required",
      path: ["subtype"]
    });
    return;
  }

  try {
    normalizeIngredientTechnicalData({
      ...value,
      category: resolvedCategory,
      subtype: resolvedSubtype,
      type: resolvedLegacyType
    });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Technical field validation failed",
        path: ["subtype"]
      });
      return;
    }

    for (const issue of error.issues) {
      const path = issue.path[0];
      const fieldPath = (() => {
        if (path === "colorEbc") return ["fermentableColorEbc"];
        if (path === "extractYieldPct") return ["fermentableExtractYieldPct"];
        if (path === "proteinPct") return ["fermentableProteinPct"];
        if (path === "moisturePct") return ["fermentableMoisturePct"];
        if (path === "maxUsagePercent") return ["fermentableMaxUsagePercent"];
        if (path === "diastaticPowerLintner") return ["fermentableDiastaticPowerLintner"];
        if (path === "usageFlags") return ["fermentableUsageFlags"];
        if (path === "alphaAcidPct") return ["hopAlphaAcidPct"];
        if (path === "betaAcidPct") return ["hopBetaAcidPct"];
        if (path === "totalOilMlPer100g") return ["hopTotalOilMlPer100g"];
        if (path === "notes") return ["hopNotes"];
        if (path === "form") return ["yeastForm"];
        if (path === "attenuationPct") return ["yeastAttenuationPct"];
        if (path === "tempMinC") return ["yeastMinFermentationTempC"];
        if (path === "tempMaxC") return ["yeastMaxFermentationTempC"];
        if (path === "flocculation") return ["yeastFlocculation"];
        if (path === "alcoholTolerancePct") return ["yeastAlcoholTolerancePct"];
        if (path === "packageSize") return ["yeastPackageSize"];
        if (path === "packageUnit") return ["yeastPackageUnit"];
        if (path === "phenolic") return ["yeastPhenolic"];
        if (path === "diastaticus") return ["yeastDiastaticus"];
        if (path === "compound") return ["waterPrepCompound"];
        if (path === "acidType") return ["waterPrepAcidType"];
        if (path === "strengthPct") return ["waterPrepStrengthPct"];
        if (path === "purityPct") return ["waterPrepPurityPct"];
        if (path === "physicalForm") return ["waterPrepPhysicalForm"];
        if (path === "usagePhase") return ["miscUsagePhase"];
        if (path === "doseHint") return ["miscDoseHint"];
        return issue.path.length ? issue.path.map((segment) => String(segment)) : ["category"];
      })();

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: fieldPath
      });
    }
  }
});

export const moderationActionSchema = z.object({
  action: z.enum(["approve", "reject", "merge"]),
  targetIngredientId: z.string().uuid().optional(),
  resolutionNote: z.string().trim().max(1000).optional()
});

export type IngredientFamilySummaryDto = {
  id: string;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  canonicalName: string;
  normalizedCanonicalName: string;
  displayNameRu: string | null;
  displayNameEn: string | null;
  matchPolicy: IngredientMatchPolicy;
  isActive: boolean;
};

export type IngredientFamilyDto = IngredientFamilySummaryDto & {
  createdAt: Date;
  updatedAt: Date;
};

export type IngredientCatalogItemDto = IngredientTechnicalFields & {
  id: string;
  type: IngredientType;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string;
  family: IngredientFamilySummaryDto | null;
  displayName: string;
  displayNameRu: string;
  displayNameEn: string | null;
  normalizedName: string;
  aliases: string[];
  searchAliasesNorm: string[];
  brandName: string | null;
  manufacturer: string | null;
  country: string | null;
  harvestYear: number | null;
  description: string | null;
  technicalData: IngredientTechnicalData | null;
  defaultUnit: IngredientDisplayUnit;
  defaultDisplayUnit: IngredientDisplayUnit;
  allowedUnits: IngredientDisplayUnit[];
  measurementDimension: IngredientMeasurementDimension;
  completenessLevel: IngredientCompletenessLevel;
  properties: Record<string, unknown>;
  catalogSourceDataset?: string | null;
  catalogSourceKey?: string | null;
  status: "draft" | "active" | "archived" | "merged";
  visibility: "public" | "internal";
  mergedIntoId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IngredientSuggestionItem = {
  id: string;
  type: IngredientType;
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  familyId?: string | null;
  familyCanonicalName?: string;
  familyDisplayName?: string;
  familyDisplayNameRu?: string;
  familyDisplayNameEn?: string;
  displayName: string;
  displayNameRu?: string;
  displayNameEn?: string;
  subtitle?: string;
  brandName?: string;
  manufacturer?: string;
  country?: string;
  technicalData?: IngredientTechnicalData | null;
  defaultUnit: IngredientDisplayUnit;
  defaultDisplayUnit?: IngredientDisplayUnit;
  allowedUnits?: IngredientDisplayUnit[];
  measurementDimension?: IngredientMeasurementDimension;
  completenessLevel?: IngredientCompletenessLevel;
  score?: number;
  source: "catalog" | "custom";
};

export const resolveUpsertCompletenessLevel = (value: z.infer<typeof ingredientUpsertSchema>) => {
  if (value.completenessLevel === "full") {
    return "full";
  }

  const category = resolveIngredientCategory(value);
  const subtype = resolveIngredientSubtype(value);
  const technicalData = normalizeIngredientTechnicalData({
    ...value,
    category,
    subtype,
    type: resolveLegacyIngredientType(value)
  });

  if (value.completenessLevel === "minimum") {
    return "minimum";
  }

  if (category === "fermentable") {
    const hasRecommended = Boolean(
      (value.manufacturer?.trim() || value.brandName?.trim())
      && value.country?.trim()
    );

    return hasRecommended ? "recommended" : "minimum";
  }

  if (category === "hop") {
    const hasRecommended = technicalData.category === "hop"
      && technicalData.harvestYear != null
      && Boolean(value.country?.trim());

    return hasRecommended ? "recommended" : "minimum";
  }

  if (category === "yeast") {
    const hasRecommended = technicalData.category === "yeast"
      && technicalData.tempMinC != null
      && technicalData.tempMaxC != null;

    return hasRecommended ? "recommended" : "minimum";
  }

  if (category === "water_prep") {
    const hasRecommended = technicalData.category === "water_prep"
      && (
        technicalData.physicalForm != null
        || technicalData.purityPct != null
        || Boolean(value.manufacturer?.trim() || value.brandName?.trim())
      );

    return hasRecommended ? "recommended" : "minimum";
  }

  const hasRecommended = technicalData.category === "misc"
    && (
      technicalData.usagePhase != null
      || Boolean(technicalData.doseHint?.trim())
      || Boolean(value.manufacturer?.trim() || value.brandName?.trim())
    );

  return hasRecommended ? "recommended" : "minimum";
};
