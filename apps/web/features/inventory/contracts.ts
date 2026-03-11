import { z } from "zod";

import { ingredientTypes, type IngredientType } from "../ingredients/contracts";
import { inventoryUnits, type InventoryUnit, type InventoryUnitDimension } from "./units";

const baseInventoryFieldsSchema = z.object({
  enteredQuantity: z.coerce.number().positive(),
  enteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits)),
  purchasedAt: z.coerce.date().optional().nullable(),
  freshnessDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export const createUserCustomIngredientSchema = z.object({
  type: z.enum(ingredientTypes),
  displayName: z.string().trim().min(2).max(180),
  properties: z.record(z.string(), z.unknown()).default({}),
  visibility: z.enum(["private", "shared"]).default("private")
});

export const addCatalogInventoryItemSchema = baseInventoryFieldsSchema.extend({
  ingredientCatalogItemId: z.string().uuid()
});

export const addCustomInventoryItemSchema = baseInventoryFieldsSchema.extend({
  userCustomIngredientId: z.string().uuid()
});

export const inventorySourceLinkageSchema = z.object({
  ingredientCatalogItemId: z.string().uuid().optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable()
}).refine((value) => Boolean(value.ingredientCatalogItemId) !== Boolean(value.userCustomIngredientId), {
  message: "Exactly one source is required",
  path: ["ingredientCatalogItemId"]
});

export const updateInventoryQuantitySchema = z.object({
  enteredQuantity: z.coerce.number().positive(),
  enteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits))
});

export const inventoryListQuerySchema = z.object({
  includeArchived: z.coerce.boolean().default(false),
  type: z.enum(ingredientTypes).optional(),
  search: z.string().trim().max(180).optional().default("")
});

export type InventorySourceDto = {
  sourceKind: "catalog" | "custom";
  sourceId: string;
  type: IngredientType;
  displayName: string;
  normalizedName: string;
};

export type InventoryListItemDto = {
  id: string;
  enteredQuantity: number;
  enteredUnit: InventoryUnit;
  normalizedQuantity: number;
  normalizedUnit: InventoryUnit;
  unitDimension: InventoryUnitDimension;
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
  activeItems: number;
  archivedItems: number;
  byType: Record<IngredientType, number>;
};
