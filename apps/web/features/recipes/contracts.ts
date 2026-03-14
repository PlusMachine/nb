import type { StyleFitResult, StyleRange } from "@nb/brewing-core";
import { z } from "zod";

import {
  ingredientCategories,
  ingredientTypes,
  type IngredientCategory,
  type IngredientSubtype,
  type IngredientType
} from "../ingredients/contracts";
import { resolveIngredientCategory, resolveLegacyIngredientType, resolveIngredientSubtype } from "../ingredients/taxonomy";
import { inventoryUnits, type InventoryUnit, type InventoryUnitDimension } from "../inventory/units";

export const recipePublicationStates = ["draft", "private", "published"] as const;
export const recipeIngredientStages = ["mash", "boil", "whirlpool", "fermentation", "packaging", "other"] as const;
export const recipeHopUseTypes = ["boil", "whirlpool", "dry_hop", "dip_hop", "other"] as const;
export const recipeFermentableUseTypes = ["mash", "steep", "boil"] as const;

export type RecipePublicationState = (typeof recipePublicationStates)[number];
export type RecipeIngredientStage = (typeof recipeIngredientStages)[number];
export type RecipeHopUseType = (typeof recipeHopUseTypes)[number];
export type RecipeFermentableUseType = (typeof recipeFermentableUseTypes)[number];

export const recipePublicationStateLabels: Record<RecipePublicationState, string> = {
  draft: "Черновик",
  private: "Личный",
  published: "Публичный"
};

const mashStepSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80).default("Инфузия"),
  temperatureC: z.coerce.number().min(0).max(100),
  durationMinutes: z.coerce.number().int().min(1).max(600)
});

const fermentationStepSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  temperatureC: z.coerce.number().min(-10).max(50).optional().nullable(),
  durationDays: z.coerce.number().int().min(1).max(365).optional().nullable()
});

const optionalTemperatureStepSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  temperatureC: z.coerce.number().min(-10).max(50).optional().nullable(),
  durationDays: z.coerce.number().int().min(1).max(365).optional().nullable()
});

export const defaultRecipeProcessMeta = {
  mashProfile: {
    steps: [
      {
        id: "mash-step-1",
        name: "Основной настой",
        temperatureC: 67,
        durationMinutes: 60
      }
    ]
  },
  fermentationProfile: {
    primaryTemperatureC: 20,
    primaryDurationDays: 10,
    extraSteps: [] as Array<{
      id: string;
      name: string;
      temperatureC?: number | null;
      durationDays?: number | null;
    }>,
    coldCrash: {
      enabled: false,
      temperatureC: 2,
      durationDays: 2
    },
    conditioning: {
      enabled: false,
      temperatureC: 12,
      durationDays: 14
    }
  }
};

export const recipeProcessMetaSchema = z.object({
  mashProfile: z.object({
    steps: z.array(mashStepSchema).min(1).max(10).default(defaultRecipeProcessMeta.mashProfile.steps)
  }).default(defaultRecipeProcessMeta.mashProfile),
  fermentationProfile: z.object({
    primaryTemperatureC: z.coerce.number().min(-10).max(50).optional().nullable().default(defaultRecipeProcessMeta.fermentationProfile.primaryTemperatureC),
    primaryDurationDays: z.coerce.number().int().min(1).max(365).optional().nullable().default(defaultRecipeProcessMeta.fermentationProfile.primaryDurationDays),
    extraSteps: z.array(fermentationStepSchema).max(10).default([]),
    coldCrash: optionalTemperatureStepSchema.default(defaultRecipeProcessMeta.fermentationProfile.coldCrash),
    conditioning: optionalTemperatureStepSchema.default(defaultRecipeProcessMeta.fermentationProfile.conditioning)
  }).default(defaultRecipeProcessMeta.fermentationProfile)
}).default(defaultRecipeProcessMeta);

export type RecipeProcessMeta = z.infer<typeof recipeProcessMetaSchema>;

export const recipeSourceLinkageSchema = z.object({
  ingredientCatalogItemId: z.string().uuid().optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable()
}).refine((value) => Boolean(value.ingredientCatalogItemId) !== Boolean(value.userCustomIngredientId), {
  message: "Exactly one source is required",
  path: ["ingredientCatalogItemId"]
});

export const recipeIngredientPayloadSchema = z.object({
  ingredientCatalogItemId: z.string().uuid().optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable(),
  type: z.enum(ingredientTypes).optional(),
  category: z.enum(ingredientCategories).optional(),
  subtype: z.string().trim().max(80).optional().nullable(),
  familyId: z.string().uuid().optional().nullable(),
  amountEnteredQuantity: z.coerce.number().positive(),
  amountEnteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits)),
  stage: z.enum(recipeIngredientStages).default("other"),
  timeOffset: z.coerce.number().int().optional().nullable(),
  stepMeta: z.record(z.string(), z.unknown()).optional().nullable()
}).superRefine((value, ctx) => {
  const linkage = recipeSourceLinkageSchema.safeParse({
    ingredientCatalogItemId: value.ingredientCatalogItemId,
    userCustomIngredientId: value.userCustomIngredientId
  });

  if (!linkage.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Exactly one source is required",
      path: ["ingredientCatalogItemId"]
    });
  }

  if (!value.type && !value.category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Category is required",
      path: ["category"]
    });
    return;
  }

  if (value.category) {
    const resolvedCategory = resolveIngredientCategory(value);
    if (resolvedCategory !== value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Category conflicts with subtype/type mapping",
        path: ["category"]
      });
    }
  }

  if (value.subtype) {
    const resolvedSubtype = resolveIngredientSubtype(value);
    if (!resolvedSubtype) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subtype conflicts with category",
        path: ["subtype"]
      });
    }
  }

  if (value.type && value.category == null) {
    const resolvedType = resolveLegacyIngredientType(value);
    if (resolvedType !== value.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Type conflicts with category/subtype mapping",
        path: ["type"]
      });
    }
  }
});

const baseRecipePayloadSchema = z.object({
  publicationState: z.enum(recipePublicationStates).default("draft"),
  title: z.string().trim().min(2).max(180),
  styleId: z.string().trim().max(64).optional().nullable(),
  batchSizeEnteredQuantity: z.coerce.number().positive(),
  batchSizeEnteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits)),
  efficiency: z.coerce.number().positive().max(100).optional().nullable(),
  boilTimeMinutes: z.coerce.number().int().min(1).max(600).default(60),
  description: z.string().trim().max(6000).optional().nullable(),
  authorNotes: z.string().trim().max(6000).optional().nullable(),
  processMeta: recipeProcessMetaSchema.optional().nullable(),
  heroImageId: z.string().uuid().optional().nullable()
});

export const createRecipePayloadSchema = baseRecipePayloadSchema.extend({
  ingredients: z.array(recipeIngredientPayloadSchema).max(200).default([])
});

export const updateRecipePayloadSchema = baseRecipePayloadSchema.partial().extend({
  ingredients: z.array(recipeIngredientPayloadSchema).max(200).optional(),
  recomputeStats: z.coerce.boolean().default(true)
});

export const listAuthorRecipesQuerySchema = z.object({
  publicationState: z.enum(recipePublicationStates).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export type RecipeIngredientDto = {
  id: string;
  recipeId: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  type: IngredientType;
  ingredientCategory?: IngredientCategory | null;
  ingredientSubtype?: IngredientSubtype | null;
  ingredientFamilyId?: string | null;
  ingredientDisplayName?: string | null;
  ingredientDisplayNameSnapshot?: string | null;
  ingredientFamilyDisplayName?: string | null;
  ingredientSummary?: string | null;
  ingredientDefaultDisplayUnit?: InventoryUnit | null;
  ingredientDefaultDisplayUnitSnapshot?: InventoryUnit | null;
  ingredientAllowedUnits?: InventoryUnit[] | null;
  ingredientMeasurementDimension?: InventoryUnitDimension | null;
  ingredientMeasurementDimensionSnapshot?: InventoryUnitDimension | null;
  amountEnteredQuantity: number;
  amountEnteredUnit: InventoryUnit;
  amountNormalizedQuantity: number;
  amountNormalizedUnit: InventoryUnit;
  stage: RecipeIngredientStage;
  timeOffset: number | null;
  stepMeta: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeListItemDto = {
  id: string;
  authorId: string;
  publicationState: RecipePublicationState;
  title: string;
  slug: string;
  styleId: string | null;
  batchSizeEnteredQuantity: number;
  batchSizeEnteredUnit: InventoryUnit;
  batchSizeNormalizedQuantity: number;
  batchSizeNormalizedUnit: InventoryUnit;
  efficiency: number | null;
  boilTimeMinutes: number;
  og: number | null;
  fg: number | null;
  abv: number | null;
  ibu: number | null;
  color: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeDetailDto = RecipeListItemDto & {
  description: string | null;
  authorNotes: string | null;
  processMeta: RecipeProcessMeta;
  heroImageId: string | null;
  ingredients: RecipeIngredientDto[];
};

export type RecipeDraftPreviewDto = {
  batchSizeEnteredQuantity: number;
  batchSizeEnteredUnit: InventoryUnit;
  boilTimeMinutes: number;
  og: number | null;
  fg: number | null;
  abv: number | null;
  ibu: number | null;
  color: number | null;
  styleId: string | null;
  styleRange: StyleRange | null;
  styleFit: StyleFitResult | null;
};
