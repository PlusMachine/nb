import { z } from "zod";
import type { recipeIngredients } from "@nb/db";
import { roundTo } from "@nb/brewing-core";

import { ingredientCategories, ingredientTypes } from "../ingredients/contracts";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import { inventoryUnitDimensions, inventoryUnits } from "../inventory/units";
import { resolveInventoryPackEquivalent } from "../inventory/pack";
import { recipeIngredientStages, type RecipeDetailDto, type RecipeIngredientDto } from "../recipes/contracts";

const nullableText = z.string().nullable();
const lineSchema = z.object({
  id: z.string().uuid(),
  persistentKey: z.string().uuid(),
  displayOrder: z.number().int().nonnegative(),
  ingredientCatalogItemId: nullableText,
  userCustomIngredientId: z.string().uuid().nullable(),
  ingredientFamilyId: z.string().uuid().nullable(),
  ingredientCategory: z.enum(ingredientCategories),
  ingredientSubtype: nullableText,
  ingredientDisplayNameSnapshot: nullableText,
  ingredientDisplayNameEnSnapshot: nullableText.optional().default(null),
  ingredientDefaultDisplayUnitSnapshot: z.enum(inventoryUnits).nullable(),
  ingredientMeasurementDimension: z.enum(inventoryUnitDimensions).nullable(),
  type: z.enum(ingredientTypes),
  amountEnteredQuantity: z.number().finite().nonnegative(),
  amountEnteredUnit: z.enum(inventoryUnits),
  amountNormalizedQuantity: z.number().finite().nonnegative(),
  amountNormalizedUnit: z.enum(inventoryUnits),
  stage: z.enum(recipeIngredientStages),
  timeOffset: z.number().finite().nullable(),
  inventorySelectionMeta: z.object({ inventoryItemId: z.string().uuid() }).nullable(),
  technicalData: z.object({ type: z.enum(ingredientTypes) }).passthrough().nullable()
});

export const brewInventorySnapshotSchema = z.object({
  version: z.literal(1),
  recipeId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  lines: z.array(lineSchema).max(200)
}).superRefine((snapshot, ctx) => {
  for (const key of ["id", "persistentKey"] as const) {
    if (new Set(snapshot.lines.map((line) => line[key])).size !== snapshot.lines.length) {
      ctx.addIssue({ code: "custom", message: `Duplicate inventory line ${key}`, path: ["lines"] });
    }
  }
});

export type BrewInventorySnapshot = z.infer<typeof brewInventorySnapshotSchema>;

const snapshotNormalizedAmount = (line: RecipeIngredientDto) => {
  const pack = line.amountNormalizedUnit === "pack" ? resolveInventoryPackEquivalent(line.ingredientTechnicalData) : null;
  return {
    amountNormalizedQuantity: pack ? roundTo(line.amountNormalizedQuantity * pack.normalizedQuantity, 3) : line.amountNormalizedQuantity,
    amountNormalizedUnit: pack?.normalizedUnit ?? line.amountNormalizedUnit
  };
};

/** Recipe уже масштабирован под партию: повторный пересчёт при списании запрещён. */
export const buildBrewInventorySnapshot = (recipe: RecipeDetailDto, userId: string): BrewInventorySnapshot => (
  brewInventorySnapshotSchema.parse({
    version: 1,
    recipeId: recipe.id,
    capturedAt: new Date().toISOString(),
    lines: recipe.ingredients.map((line) => ({
      id: line.id,
      persistentKey: line.persistentKey,
      displayOrder: line.displayOrder,
      ingredientCatalogItemId: line.ingredientCatalogItemId ?? null,
      userCustomIngredientId: line.userCustomIngredientId ?? null,
      ingredientFamilyId: line.ingredientFamilyId ?? null,
      ingredientCategory: line.ingredientCategory ?? resolveIngredientCategory({ type: line.type }),
      ingredientSubtype: line.ingredientSubtype ?? null,
      ingredientDisplayNameSnapshot: line.ingredientDisplayName ?? line.ingredientDisplayNameSnapshot ?? null,
      ingredientDisplayNameEnSnapshot: line.ingredientDisplayNameEn ?? null,
      ingredientDefaultDisplayUnitSnapshot: line.ingredientDefaultDisplayUnit ?? line.ingredientDefaultDisplayUnitSnapshot ?? null,
      ingredientMeasurementDimension: line.ingredientMeasurementDimension ?? line.ingredientMeasurementDimensionSnapshot ?? null,
      type: line.type,
      amountEnteredQuantity: line.amountEnteredQuantity,
      amountEnteredUnit: line.amountEnteredUnit,
      ...snapshotNormalizedAmount(line),
      stage: line.stage,
      timeOffset: line.timeOffset ?? null,
      inventorySelectionMeta: recipe.authorId === userId && line.inventorySelectionMeta?.inventoryItemId
        ? { inventoryItemId: line.inventorySelectionMeta.inventoryItemId }
        : null,
      technicalData: line.ingredientTechnicalData ?? null
    }))
  })
);

export const readBrewInventorySnapshot = (recipeSnapshot: Record<string, unknown> | null | undefined): BrewInventorySnapshot | null => {
  const parsed = brewInventorySnapshotSchema.safeParse(recipeSnapshot?.inventory);
  return parsed.success ? parsed.data : null;
};

/** Адаптер к общему движку склада; id здесь — идентификатор снимка, а не FK. */
export const snapshotInventoryLines = (snapshot: BrewInventorySnapshot): Array<typeof recipeIngredients.$inferSelect> => (
  snapshot.lines.map((line) => ({
    ...line,
    recipeId: snapshot.recipeId,
    stepMeta: null,
    inventoryIntentMode: null,
    externalImportMeta: null,
    createdAt: new Date(snapshot.capturedAt),
    updatedAt: new Date(snapshot.capturedAt)
  }))
);

export const BATCH_INVENTORY_SNAPSHOT_MESSAGE = "В этой партии не сохранён полный состав для списания. Учтите фактический расход вручную на складе. Журнал партии и возврат прежних списаний доступны.";
