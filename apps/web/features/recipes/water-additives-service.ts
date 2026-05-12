import {
  and,
  db,
  eq,
  inArray,
  ingredients,
  isNull,
  userCustomIngredients,
  userIngredients,
} from "@nb/db";

import { readCustomIngredientMetadata } from "../ingredients/custom-metadata";
import { buildCustomIngredientLinkage } from "../ingredients/source-linkage";
import { extractIngredientTechnicalData } from "../ingredients/technical-fields";
import {
  normalizeWaterTreatmentConcentrationPct,
  readInventoryWaterTreatmentConcentrationPct,
  readWaterTreatmentConcentrationPct,
} from "../ingredients/water-treatment";
import { parseInventoryUnit, type InventoryUnit } from "../inventory/units";

export type RecipeWaterAdditiveStockRequirement = {
  catalogIngredientId: string;
  kind?: "salt" | "acid";
  concentrationPct?: number | null;
};

export type RecipeWaterAdditiveStockStatusDto = {
  catalogIngredientId: string;
  inventoryItemId: string;
  displayName: string | null;
  availableNormalizedQuantity: number;
  normalizedUnit: InventoryUnit | null;
  concentrationPct: number | null;
};

const recipeWaterDefaultAcidConcentrationPctByCatalogId: Record<string, number> = {
  "lactic-acid": 88,
  "phosphoric-acid-75-85": 85,
};

const sanitizeIds = (
  requirements: readonly (string | RecipeWaterAdditiveStockRequirement)[],
): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const requirement of requirements) {
    const id =
      typeof requirement === "string"
        ? requirement
        : requirement.catalogIngredientId;

    if (typeof id !== "string") {
      continue;
    }

    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
};

const inferCustomAcidCatalogId = ({
  ids,
  displayName,
  metadataNames,
}: {
  ids: Set<string>;
  displayName: string;
  metadataNames: Array<string | null | undefined>;
}) => {
  const text = [displayName, ...metadataNames]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е");

  if (!text) {
    return null;
  }

  if (ids.has("lactic-acid") && (text.includes("молоч") || text.includes("lactic"))) {
    return "lactic-acid";
  }

  if (
    ids.has("phosphoric-acid-75-85")
    && (text.includes("фосфор") || text.includes("phosphor"))
  ) {
    return "phosphoric-acid-75-85";
  }

  return null;
};

const resolveCatalogStockConcentrationPct = (
  catalogIngredientId: string,
  technicalData: ReturnType<typeof extractIngredientTechnicalData>,
) => (
  readWaterTreatmentConcentrationPct(technicalData)
  ?? recipeWaterDefaultAcidConcentrationPctByCatalogId[catalogIngredientId]
  ?? null
);

/**
 * Returns inventory status for the requested catalog ingredient ids that the
 * user owns. Used to render a quick "in stock / not in stock" hint next to
 * salts and acids computed by the water plan, without changing the main
 * `RecipeStockCoverage` contract (which is keyed by `recipe_ingredients`).
 */
export const listRecipeWaterAdditivesStockStatus = async (
  userId: string,
  requirements: readonly (string | RecipeWaterAdditiveStockRequirement)[],
): Promise<RecipeWaterAdditiveStockStatusDto[]> => {
  const ids = sanitizeIds(requirements);
  if (!ids.length) {
    return [];
  }

  const idSet = new Set(ids);

  const catalogRows = await db
    .select({
      inventoryId: userIngredients.id,
      catalogIngredientId: ingredients.id,
      catalogType: ingredients.type,
      catalogAttributes: ingredients.attributes,
      catalogNameRu: ingredients.nameRu,
      catalogNameEn: ingredients.nameEn,
      displayNameSnapshot: userIngredients.ingredientDisplayNameSnapshot,
      normalizedQuantity: userIngredients.normalizedQuantity,
      normalizedUnit: userIngredients.normalizedUnit,
      inventoryProperties: userIngredients.properties,
    })
    .from(userIngredients)
    .innerJoin(
      ingredients,
      eq(ingredients.id, userIngredients.ingredientCatalogItemId),
    )
    .where(
      and(
        eq(userIngredients.userId, userId),
        isNull(userIngredients.archivedAt),
        inArray(ingredients.id, ids),
      ),
    );

  const customRows = await db
    .select({
      inventoryId: userIngredients.id,
      displayNameSnapshot: userIngredients.ingredientDisplayNameSnapshot,
      normalizedQuantity: userIngredients.normalizedQuantity,
      normalizedUnit: userIngredients.normalizedUnit,
      inventoryProperties: userIngredients.properties,
      custom: userCustomIngredients,
    })
    .from(userIngredients)
    .innerJoin(
      userCustomIngredients,
      eq(userCustomIngredients.id, userIngredients.userCustomIngredientId),
    )
    .where(
      and(
        eq(userIngredients.userId, userId),
        isNull(userIngredients.archivedAt),
        eq(userIngredients.ingredientCategory, "water_treatment"),
      ),
    );

  const catalogStatuses = catalogRows.map((row) => {
    const quantity = Number(row.normalizedQuantity);
    const technicalData = extractIngredientTechnicalData({
      type: row.catalogType,
      attributes: row.catalogAttributes,
    });

    return {
      catalogIngredientId: row.catalogIngredientId,
      inventoryItemId: row.inventoryId,
      displayName:
        row.displayNameSnapshot ??
        row.catalogNameRu ??
        row.catalogNameEn ??
        null,
      availableNormalizedQuantity: Number.isFinite(quantity) ? quantity : 0,
      normalizedUnit: parseInventoryUnit(row.normalizedUnit),
      concentrationPct:
        readInventoryWaterTreatmentConcentrationPct(row.inventoryProperties)
        ?? resolveCatalogStockConcentrationPct(
          row.catalogIngredientId,
          technicalData,
        ),
    } satisfies RecipeWaterAdditiveStockStatusDto;
  });

  const customStatuses = customRows.flatMap((row) => {
    const metadata = readCustomIngredientMetadata(row.custom);
    const linkage = buildCustomIngredientLinkage(row.custom);
    const catalogIngredientId =
      metadata.derivedFromIngredientId && idSet.has(metadata.derivedFromIngredientId)
        ? metadata.derivedFromIngredientId
        : metadata.category === "water_treatment" && metadata.subtype === "acid"
          ? inferCustomAcidCatalogId({
            ids: idSet,
            displayName: row.custom.displayName,
            metadataNames: [
              metadata.nameRu,
              metadata.nameEn,
              metadata.derivedFromDisplayName,
            ],
          })
          : null;

    if (!catalogIngredientId) {
      return [];
    }

    const quantity = Number(row.normalizedQuantity);
    const concentrationPct =
      readInventoryWaterTreatmentConcentrationPct(row.inventoryProperties)
      ?? readWaterTreatmentConcentrationPct(linkage.technicalData)
      ?? normalizeWaterTreatmentConcentrationPct(metadata.properties.waterTreatmentConcentrationPct)
      ?? normalizeWaterTreatmentConcentrationPct(metadata.properties.concentration);

    return [{
      catalogIngredientId,
      inventoryItemId: row.inventoryId,
      displayName: row.displayNameSnapshot ?? linkage.displayName ?? row.custom.displayName,
      availableNormalizedQuantity: Number.isFinite(quantity) ? quantity : 0,
      normalizedUnit: parseInventoryUnit(row.normalizedUnit),
      concentrationPct,
    } satisfies RecipeWaterAdditiveStockStatusDto];
  });

  return [...catalogStatuses, ...customStatuses];
};
