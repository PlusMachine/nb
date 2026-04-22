import { z } from "zod";

export const recipeImageStatuses = ["uploading", "ready", "failed"] as const;
export const recipeImageVariants = ["original", "large", "medium", "thumb"] as const;
export const recipeImageAcceptedMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const RECIPE_IMAGE_MAX_COUNT = 8;
export const RECIPE_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const RECIPE_IMAGE_MAX_TOTAL_BYTES = 40 * 1024 * 1024;

export type RecipeImageStatus = (typeof recipeImageStatuses)[number];
export type RecipeImageVariant = (typeof recipeImageVariants)[number];
export type RecipeImageAcceptedMimeType = (typeof recipeImageAcceptedMimeTypes)[number];

export const recipeImageStatusSchema = z.enum(recipeImageStatuses);
export const recipeImageVariantSchema = z.enum(recipeImageVariants);

export type RecipeImageDto = {
  id: string;
  recipeId: string;
  width: number | null;
  height: number | null;
  mimeType: string;
  sizeBytes: number;
  blurDataUrl: string | null;
  caption: string | null;
  altText: string | null;
  effectiveAltText: string;
  sortOrder: number;
  isCover: boolean;
  status: RecipeImageStatus;
  createdAt: Date;
  updatedAt: Date;
  thumbUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
  originalUrl: string | null;
};

export const buildRecipeImageVariantUrl = (
  imageId: string,
  variant: RecipeImageVariant
) => `/api/recipe-images/${imageId}/${variant}`;
