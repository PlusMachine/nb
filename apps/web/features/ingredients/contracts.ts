import { z } from "zod";

export const ingredientTypes = ["fermentable", "hop", "yeast", "sugar", "adjunct", "fining", "misc"] as const;
export type IngredientType = (typeof ingredientTypes)[number];
export const hopForms = ["pellet", "whole_cone", "lupulin", "cryo"] as const;
export type HopForm = (typeof hopForms)[number];
export const yeastTypes = ["ale", "lager", "wine"] as const;
export type YeastType = (typeof yeastTypes)[number];
export const yeastForms = ["dry", "liquid"] as const;
export type YeastForm = (typeof yeastForms)[number];

export type IngredientTechnicalFields = {
  manufacturer?: string | null;
  country?: string | null;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  hopAlphaAcidPct?: number | null;
  hopForm?: HopForm | null;
  hopSeason?: string | null;
  yeastAttenuationPct?: number | null;
  yeastType?: YeastType | null;
  yeastForm?: YeastForm | null;
  yeastMinFermentationTempC?: number | null;
  yeastMaxFermentationTempC?: number | null;
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
  fermentableColorEbc: nullableNumberField(0, 2000),
  fermentableExtractYieldPct: nullableNumberField(0, 100),
  hopAlphaAcidPct: nullableNumberField(0, 100),
  hopForm: z.enum(hopForms).optional().nullable(),
  hopSeason: z.string().trim().max(32).optional().nullable(),
  yeastAttenuationPct: nullableNumberField(0, 100),
  yeastType: z.enum(yeastTypes).optional().nullable(),
  yeastForm: z.enum(yeastForms).optional().nullable(),
  yeastMinFermentationTempC: nullableNumberField(-10, 60),
  yeastMaxFermentationTempC: nullableNumberField(-10, 60),
  properties: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "active", "archived", "merged"]).default("active"),
  visibility: z.enum(["public", "internal"]).default("public")
}).superRefine((value, ctx) => {
  if (value.type === "fermentable") {
    if (!value.manufacturer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manufacturer is required for fermentables",
        path: ["manufacturer"]
      });
    }
    if (value.fermentableColorEbc == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Color is required for fermentables",
        path: ["fermentableColorEbc"]
      });
    }
    if (value.fermentableExtractYieldPct == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Extract yield is required for fermentables",
        path: ["fermentableExtractYieldPct"]
      });
    }
  }

  if (value.type === "hop") {
    if (value.hopAlphaAcidPct == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Alpha acid is required for hops",
        path: ["hopAlphaAcidPct"]
      });
    }
    if (!value.hopForm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hop form is required",
        path: ["hopForm"]
      });
    }
    if (!value.country) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Country is required for hops",
        path: ["country"]
      });
    }
  }

  if (value.type === "yeast") {
    if (value.yeastAttenuationPct == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attenuation is required for yeast",
        path: ["yeastAttenuationPct"]
      });
    }
    if (!value.yeastType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Yeast type is required",
        path: ["yeastType"]
      });
    }
    if (!value.yeastForm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Yeast form is required",
        path: ["yeastForm"]
      });
    }
    if (value.yeastMinFermentationTempC == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum fermentation temperature is required",
        path: ["yeastMinFermentationTempC"]
      });
    }
    if (value.yeastMaxFermentationTempC == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum fermentation temperature is required",
        path: ["yeastMaxFermentationTempC"]
      });
    }
    if (
      value.yeastMinFermentationTempC != null
      && value.yeastMaxFermentationTempC != null
      && value.yeastMinFermentationTempC > value.yeastMaxFermentationTempC
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum temperature cannot exceed maximum temperature",
        path: ["yeastMinFermentationTempC"]
      });
    }
  }
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
  source: "catalog" | "custom";
};
