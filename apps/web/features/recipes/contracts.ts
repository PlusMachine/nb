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

export type RecipePublicationState = (typeof recipePublicationStates)[number];
export type RecipeIngredientStage = (typeof recipeIngredientStages)[number];

export const recipePublicationStateLabels: Record<RecipePublicationState, string> = {
  draft: "Черновик",
  private: "Личный",
  published: "Опубликован"
};

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
  description: z.string().trim().max(6000).optional().nullable(),
  authorNotes: z.string().trim().max(6000).optional().nullable(),
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
  heroImageId: string | null;
  ingredients: RecipeIngredientDto[];
};
