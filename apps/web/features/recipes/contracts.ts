import { z } from "zod";

import { ingredientTypes, type IngredientType } from "../ingredients/contracts";
import { inventoryUnits, type InventoryUnit } from "../inventory/units";

export const recipeStatuses = ["draft", "private", "published"] as const;
export const recipeVisibilities = ["private", "public"] as const;
export const recipeIngredientStages = ["mash", "boil", "whirlpool", "fermentation", "packaging", "other"] as const;

export type RecipeStatus = (typeof recipeStatuses)[number];
export type RecipeVisibility = (typeof recipeVisibilities)[number];
export type RecipeIngredientStage = (typeof recipeIngredientStages)[number];

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
  type: z.enum(ingredientTypes),
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
});

const baseRecipePayloadSchema = z.object({
  status: z.enum(recipeStatuses).default("draft"),
  visibility: z.enum(recipeVisibilities).default("private"),
  title: z.string().trim().min(2).max(180),
  slug: z.string().trim().min(2).max(220).optional().nullable(),
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
  status: z.enum(recipeStatuses).optional(),
  visibility: z.enum(recipeVisibilities).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export type RecipeIngredientDto = {
  id: string;
  recipeId: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  type: IngredientType;
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
  status: RecipeStatus;
  visibility: RecipeVisibility;
  title: string;
  slug: string | null;
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
