import { z } from "zod";

import {
  ingredientCategories,
  ingredientDisplayModes,
  ingredientTypes,
  type IngredientCategory,
  type IngredientCompletenessLevel,
  type IngredientTechnicalData,
  type IngredientSubtype,
  type IngredientTechnicalFields,
  type IngredientType
} from "../ingredients/contracts";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype,
  resolveLegacyIngredientType
} from "../ingredients/taxonomy";
import { systemCurrencies, type SystemCurrency } from "../system/currency";
import { customYeastForms } from "./custom-ingredient";
import {
  inventoryPriceInputModes,
  type InventoryPriceInputMode
} from "./purchase-cost";
import { inventoryUnits, type InventoryUnit, type InventoryUnitDimension } from "./units";

export const inventoryStockStates = ["in_stock", "empty", "all"] as const;
export type InventoryStockState = (typeof inventoryStockStates)[number];

export const inventorySortOptions = ["default", "name", "quantity", "updated", "best_before", "price"] as const;
export type InventorySortOption = (typeof inventorySortOptions)[number];

const nullablePositiveInteger = z.preprocess((value) => {
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
}, z.number().int().positive().nullable().optional());

const nullableNumber = (schema: z.ZodNumber) => z.preprocess((value) => {
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
}, schema.nullable().optional());

const nullablePriceInputMode = z.preprocess((value) => {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}, z.enum(inventoryPriceInputModes).nullable().optional());

const baseInventoryFieldsObject = z.object({
  enteredQuantity: z.coerce.number().positive(),
  enteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits)),
  priceInputMode: nullablePriceInputMode,
  priceInputAmountMinor: nullablePositiveInteger,
  priceInputCurrency: z.preprocess((value) => {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim().toUpperCase();
    return normalized || null;
  }, z.enum(systemCurrencies).nullable().optional()),
  purchasedAt: z.coerce.date().optional().nullable(),
  freshnessDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

const withPurchaseValidation = <T extends z.ZodTypeAny>(schema: T) => schema.superRefine((value, ctx) => {
  const payload = value as {
    priceInputAmountMinor?: number | null;
    priceInputCurrency?: string | null;
  };

  if (payload.priceInputAmountMinor == null && payload.priceInputCurrency != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Нельзя указать валюту без цены покупки.",
      path: ["priceInputAmountMinor"]
    });
  }
});

export const createUserCustomIngredientSchema = z.object({
  type: z.enum(ingredientTypes).optional(),
  category: z.enum(ingredientCategories).optional(),
  subtype: z.string().trim().max(80).optional().nullable(),
  displayName: z.string().trim().min(2).max(180),
  nameRu: z.string().trim().max(180).optional().nullable(),
  nameEn: z.string().trim().max(180).optional().nullable(),
  aliases: z.array(z.string().trim().min(1).max(180)).default([]).optional(),
  brand: z.string().trim().max(140).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  productCode: z.string().trim().max(80).optional().nullable(),
  displayModeRu: z.enum(ingredientDisplayModes).default("auto").optional(),
  displayNameOverrideRu: z.string().trim().max(180).optional().nullable(),
  secondaryNameOverrideRu: z.string().trim().max(180).optional().nullable(),
  hideSecondaryNameRu: z.coerce.boolean().default(false).optional(),
  derivedFromIngredientId: z.string().trim().max(191).optional().nullable(),
  derivedFromDisplayName: z.string().trim().max(180).optional().nullable(),
  harvestYear: nullableNumber(z.number().int().min(1900).max(2100)),
  fermentableColorEbc: nullableNumber(z.number().min(0).max(9999)),
  fermentableExtractYieldPct: nullableNumber(z.number().min(0).max(100)),
  fermentableProteinPct: nullableNumber(z.number().min(0).max(100)),
  maltType: z.preprocess((value) => {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase();
    return normalized || null;
  }, z.enum(["base", "specialty"]).nullable().optional()),
  fermentableMaxUsagePct: nullableNumber(z.number().min(0).max(100)),
  hopAlphaAcidPct: nullableNumber(z.number().min(0).max(100)),
  hopBetaAcidPct: nullableNumber(z.number().min(0).max(100)),
  hopForm: z.preprocess((value) => {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase();
    return normalized || null;
  }, z.enum(["pellet", "whole_cone", "lupulin", "cryo", "standard"]).nullable().optional()),
  yeastAttenuationPct: nullableNumber(z.number().min(0).max(100)),
  yeastForm: z.preprocess((value) => {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase();
    return normalized || null;
  }, z.enum(customYeastForms).nullable().optional()),
  yeastFlocculation: z.string().trim().max(80).optional().nullable(),
  yeastMinFermentationTempC: nullableNumber(z.number().min(-20).max(60)),
  yeastMaxFermentationTempC: nullableNumber(z.number().min(-20).max(60)),
  alcoholToleranceAbvTypical: nullableNumber(z.number().min(0).max(100)),
  physicalForm: z.preprocess((value) => {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase();
    return normalized || null;
  }, z.enum(["solid", "powder", "crystal", "liquid", "solution", "tablet"]).nullable().optional()),
  concentration: z.string().trim().max(120).optional().nullable(),
  defaultDisplayUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits)).optional().nullable(),
  properties: z.record(z.string(), z.unknown()).default({}),
  visibility: z.enum(["private", "shared"]).default("private")
}).superRefine((value, ctx) => {
  if (!value.type && !value.category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Выберите категорию ингредиента.",
      path: ["category"]
    });
  }
  const resolvedCategory = resolveIngredientCategory(value);
  const resolvedType = resolveLegacyIngredientType({
    type: value.type,
    category: value.category,
    subtype: value.subtype
  });

  if (value.category) {
    if (resolvedCategory !== value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Категория и subtype конфликтуют.",
        path: ["category"]
      });
    }
  }

  if (value.subtype) {
    const resolvedSubtype = resolveIngredientSubtype({
      type: resolvedType,
      category: resolvedCategory,
      subtype: value.subtype
    });
    if (!resolvedSubtype) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subtype не распознан для выбранной категории.",
        path: ["subtype"]
      });
    }
  }

  if (value.type && value.category == null) {
    if (resolvedType !== value.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Тип ингредиента конфликтует с taxonomy.",
        path: ["type"]
      });
    }
  }

  if (resolvedCategory === "fermentable") {
    if (value.fermentableColorEbc == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите цвет в EBC.",
        path: ["fermentableColorEbc"]
      });
    }

    if (value.fermentableExtractYieldPct == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите экстрактивность.",
        path: ["fermentableExtractYieldPct"]
      });
    }
  }

  if (resolvedCategory === "hop" && value.hopAlphaAcidPct == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Укажите альфа-кислоту.",
      path: ["hopAlphaAcidPct"]
    });
  }

  if (resolvedCategory === "yeast") {
    if (value.yeastAttenuationPct == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите аттенюацию.",
        path: ["yeastAttenuationPct"]
      });
    }

    if (!value.yeastForm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите тип дрожжей.",
        path: ["yeastForm"]
      });
    }
  }
});

export const addCatalogInventoryItemSchema = withPurchaseValidation(baseInventoryFieldsObject.extend({
  ingredientCatalogItemId: z.string().trim().min(1),
  packageVariantId: z.string().trim().min(1).optional().nullable()
}));

export const addCustomInventoryItemSchema = withPurchaseValidation(baseInventoryFieldsObject.extend({
  userCustomIngredientId: z.string().uuid()
}));

export const inventorySourceLinkageSchema = z.object({
  ingredientCatalogItemId: z.string().trim().min(1).optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable()
}).refine((value) => Boolean(value.ingredientCatalogItemId) !== Boolean(value.userCustomIngredientId), {
  message: "Exactly one source is required",
  path: ["ingredientCatalogItemId"]
});

export const updateInventoryQuantitySchema = z.object({
  enteredQuantity: z.coerce.number().nonnegative(),
  enteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits))
});

export const updateInventoryItemSchema = withPurchaseValidation(baseInventoryFieldsObject.extend({
  ingredientCatalogItemId: z.string().trim().min(1).optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable()
  ,
  packageVariantId: z.string().trim().min(1).optional().nullable()
})).superRefine((value, ctx) => {
  const linkage = inventorySourceLinkageSchema.safeParse({
    ingredientCatalogItemId: value.ingredientCatalogItemId,
    userCustomIngredientId: value.userCustomIngredientId
  });

  if (!linkage.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Выберите ингредиент.",
      path: ["ingredientCatalogItemId"]
    });
  }
});

export const inventoryListQuerySchema = z.object({
  includeArchived: z.coerce.boolean().default(false),
  includeEmpty: z.coerce.boolean().default(false),
  category: z.enum(ingredientCategories).optional(),
  subtype: z.enum(["malt", "fermentable"]).optional(),
  type: z.enum(ingredientTypes).optional(),
  stockState: z.enum(inventoryStockStates).default("all"),
  sort: z.enum(inventorySortOptions).default("default"),
  search: z.string().trim().max(180).optional().default("")
});

export type InventorySourceDto = {
  sourceKind: "catalog" | "custom";
  sourceId: string;
  type: IngredientType;
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  familyId?: string | null;
  familyDisplayName?: string | null;
  primaryLabelRu: string;
  secondaryLabelRu?: string | null;
  displayName: string;
  displayNameRu?: string | null;
  displayNameEn?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
  normalizedName: string;
  brand?: string | null;
  producer?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  country?: string | null;
  harvestYear?: number | null;
  completenessLevel?: IngredientCompletenessLevel | null;
  technicalData?: IngredientTechnicalData | null;
  defaultDisplayUnit?: InventoryUnit;
  allowedUnits?: InventoryUnit[];
  measurementDimension?: InventoryUnitDimension;
  packageVariantId?: string | null;
  packageVariantName?: string | null;
  summary?: string | null;
} & IngredientTechnicalFields;

export type InventoryListItemDto = {
  id: string;
  ingredientCatalogItemId?: string | null;
  userCustomIngredientId?: string | null;
  packageVariantId?: string | null;
  ingredientFamilyId?: string | null;
  ingredientCategory?: IngredientCategory | null;
  ingredientSubtype?: IngredientSubtype | null;
  ingredientDisplayNameSnapshot?: string | null;
  ingredientDefaultDisplayUnitSnapshot?: InventoryUnit | null;
  ingredientMeasurementDimension?: InventoryUnitDimension | null;
  enteredQuantity: number;
  enteredUnit: InventoryUnit;
  normalizedQuantity: number;
  normalizedUnit: InventoryUnit;
  unitDimension: InventoryUnitDimension;
  priceInputMode?: InventoryPriceInputMode | null;
  priceInputAmountMinor?: number | null;
  priceInputCurrency?: SystemCurrency | null;
  purchasePriceMinor?: number | null;
  purchaseCurrency?: SystemCurrency | null;
  purchaseQuantity?: number | null;
  purchaseQuantityUnit?: InventoryUnit | null;
  purchaseQuantityNormalized?: number | null;
  purchaseQuantityNormalizedUnit?: InventoryUnit | null;
  normalizedUnitCostMinorRub?: number | null;
  purchasedAt: Date | null;
  freshnessDate: Date | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  source: InventorySourceDto;
};

export type InventorySummaryDto = {
  totalItems: number;
  inStockItems: number;
  emptyItems: number;
  byCategory: Record<IngredientCategory, number>;
  inStockByCategory: Record<IngredientCategory, number>;
  byFermentableSubtype: {
    malt: number;
    fermentable: number;
  };
  inStockByFermentableSubtype: {
    malt: number;
    fermentable: number;
  };
};
