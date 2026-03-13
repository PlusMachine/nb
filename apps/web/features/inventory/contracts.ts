import { z } from "zod";

import {
  ingredientCategories,
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

  if (!value.defaultDisplayUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Укажите базовую единицу.",
      path: ["defaultDisplayUnit"]
    });
  }

  if (value.category) {
    const resolvedCategory = resolveIngredientCategory(value);
    if (resolvedCategory !== value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Категория и subtype конфликтуют.",
        path: ["category"]
      });
    }
  }

  if (value.subtype) {
    const resolvedSubtype = resolveIngredientSubtype(value);
    if (!resolvedSubtype) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subtype не распознан для выбранной категории.",
        path: ["subtype"]
      });
    }
  }

  if (value.type && value.category == null) {
    const resolvedType = resolveLegacyIngredientType(value);
    if (resolvedType !== value.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Тип ингредиента конфликтует с taxonomy.",
        path: ["type"]
      });
    }
  }
});

export const addCatalogInventoryItemSchema = withPurchaseValidation(baseInventoryFieldsObject.extend({
  ingredientCatalogItemId: z.string().uuid()
}));

export const addCustomInventoryItemSchema = withPurchaseValidation(baseInventoryFieldsObject.extend({
  userCustomIngredientId: z.string().uuid()
}));

export const inventorySourceLinkageSchema = z.object({
  ingredientCatalogItemId: z.string().uuid().optional().nullable(),
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
  ingredientCatalogItemId: z.string().uuid().optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable()
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
  type: z.enum(ingredientTypes).optional(),
  stockState: z.enum(inventoryStockStates).default("in_stock"),
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
  displayName: string;
  normalizedName: string;
  brandName?: string | null;
  completenessLevel?: IngredientCompletenessLevel | null;
  technicalData?: IngredientTechnicalData | null;
  defaultDisplayUnit?: InventoryUnit;
  allowedUnits?: InventoryUnit[];
  measurementDimension?: InventoryUnitDimension;
  summary?: string | null;
} & IngredientTechnicalFields;

export type InventoryListItemDto = {
  id: string;
  ingredientCatalogItemId?: string | null;
  userCustomIngredientId?: string | null;
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
};
