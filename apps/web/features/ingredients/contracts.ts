import { z } from "zod";

export const ingredientTypes = ["fermentable", "hop", "yeast", "sugar", "adjunct", "fining", "misc"] as const;
export type IngredientType = (typeof ingredientTypes)[number];
export const ingredientSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  type: z.enum(ingredientTypes).optional(),
  limit: z.coerce.number().min(1).max(20).default(10)
});

export const ingredientUpsertSchema = z.object({
  type: z.enum(ingredientTypes),
  subtype: z.string().trim().max(80).optional().nullable(),
  displayName: z.string().trim().min(2).max(180),
  aliases: z.array(z.string().trim().min(1).max(180)).max(20).default([]),
  manufacturer: z.string().trim().max(140).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  defaultUnit: z.string().trim().min(1).max(32),
  properties: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "active", "archived", "merged"]).default("active"),
  visibility: z.enum(["public", "internal"]).default("public")
});

export const moderationActionSchema = z.object({
  action: z.enum(["approve", "reject", "merge"]),
  targetIngredientId: z.string().uuid().optional(),
  resolutionNote: z.string().trim().max(1000).optional()
});

export type IngredientSuggestionItem = {
  id: string;
  type: IngredientType;
  displayName: string;
  subtitle?: string;
  manufacturer?: string;
  defaultUnit: string;
  source: "catalog";
};
