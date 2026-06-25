import { and, db, eq, inArray, ingredients, recipeIngredients, recipes } from "@nb/db";
import { roundTo } from "@nb/brewing-core";

import {
  resolveIngredientMatchKey,
  type IngredientMatchKey,
  type IngredientMatchProfile
} from "../ingredients/match-group";
import type { IngredientCategory } from "../ingredients/taxonomy";
import type { IngredientType } from "../ingredients/contracts";
import { extractIngredientTechnicalData } from "../ingredients/technical-fields";
import {
  getInventoryUnitDimension,
  parseInventoryUnit,
  type InventoryUnit,
  type InventoryUnitDimension
} from "../inventory/units";
import { listInventoryForUser } from "../inventory/service";
import type { InventoryListItemDto } from "../inventory/contracts";
import { listEquipmentProfiles } from "../equipment-profiles/service";
import { getRecipeById } from "./service";
import { toBatchVolumeLiters } from "./units";
import type {
  BrewableRecipeDto,
  RecipeIngredientDto,
  RecipeMatchDto,
  RecipeMatchLabel,
  RecipeMatchLineDto,
  RecipeMatchLineStatus
} from "./contracts";

// Значимость строки в итоговом %: отсутствие базового солода/дрожжей бьёт
// сильнее, чем недостача щепотки соли.
const categoryWeight: Record<string, number> = {
  fermentable: 5,
  yeast: 4,
  hop: 3,
  water_treatment: 1,
  consumable: 1
};

const weightForCategory = (category: string | null | undefined): number => (
  category ? categoryWeight[category] ?? 2 : 2
);

// Raw-строки рецепта несут DB-enum категории (7 значений); резолвер работает с
// taxonomy-категориями (5). Приводим, water_prep → water_treatment.
const toMatchCategory = (value: string | null | undefined): IngredientCategory | null => {
  switch (value) {
    case "fermentable":
    case "hop":
    case "yeast":
    case "consumable":
    case "water_treatment":
      return value;
    case "water_prep":
      return "water_treatment";
    default:
      return null;
  }
};

const toMatchType = (value: string | null | undefined): IngredientType | null => {
  switch (value) {
    case "malt":
    case "fermentable":
    case "hop":
    case "yeast":
    case "consumable":
    case "water_treatment":
      return value;
    default:
      return null;
  }
};

const FALLBACK_BATCH_VOLUME_L = 20;

export type MatchLineInput = {
  id: string;
  persistentKey: string;
  displayOrder: number;
  displayName: string | null;
  profile: IngredientMatchProfile;
  requiredNormalizedQuantity: number;
  normalizedUnit: InventoryUnit | null;
};

export type InventoryMatchEntry = {
  itemId: string;
  key: IngredientMatchKey;
  available: number;
  normalizedUnit: InventoryUnit | null;
};

// --- профили для резолвера ------------------------------------------------

const profileFromRecipeIngredientDto = (line: RecipeIngredientDto): IngredientMatchProfile => ({
  category: line.ingredientCategory ?? null,
  type: line.type ?? null,
  name: line.ingredientDisplayName ?? line.ingredientDisplayNameSnapshot ?? null,
  nameEn: line.ingredientDisplayNameEn ?? null,
  subtype: line.ingredientSubtype ?? null,
  technicalData: line.ingredientTechnicalData ?? null,
  catalogItemId: line.ingredientCatalogItemId ?? null,
  customId: line.userCustomIngredientId ?? null,
  dimension: parseInventoryUnit(line.amountNormalizedUnit)
    ? getInventoryUnitDimension(line.amountNormalizedUnit)
    : null
});

const profileFromInventoryItem = (item: InventoryListItemDto): IngredientMatchProfile => ({
  category: item.source.category ?? item.ingredientCategory ?? null,
  type: item.source.type ?? null,
  name: item.source.displayName ?? item.source.nameRu ?? item.ingredientDisplayNameSnapshot ?? null,
  nameEn: item.source.nameEn ?? item.source.displayNameEn ?? null,
  subtype: item.source.subtype ?? item.ingredientSubtype ?? null,
  technicalData: item.source.technicalData ?? null,
  catalogItemId: item.ingredientCatalogItemId ?? null,
  customId: item.userCustomIngredientId ?? null,
  dimension: item.unitDimension ?? getInventoryUnitDimension(item.normalizedUnit)
});

// --- инвентарь как индекс -------------------------------------------------

const buildInventoryEntries = (items: InventoryListItemDto[]): InventoryMatchEntry[] => (
  items
    .filter((item) => item.normalizedQuantity > 0 && !item.archivedAt)
    .map((item) => ({
      itemId: item.id,
      key: resolveIngredientMatchKey(profileFromInventoryItem(item)),
      available: item.normalizedQuantity,
      normalizedUnit: parseInventoryUnit(item.normalizedUnit)
    }))
);

export const indexInventoryEntries = (entries: InventoryMatchEntry[]) => {
  const byExact = new Map<string, InventoryMatchEntry[]>();
  const byGroup = new Map<string, InventoryMatchEntry[]>();

  for (const entry of entries) {
    if (entry.key.exactKey) {
      const list = byExact.get(entry.key.exactKey) ?? [];
      list.push(entry);
      byExact.set(entry.key.exactKey, list);
    }
    if (entry.key.groupKey) {
      const list = byGroup.get(entry.key.groupKey) ?? [];
      list.push(entry);
      byGroup.set(entry.key.groupKey, list);
    }
  }

  return { byExact, byGroup };
};

const dimensionMatches = (
  lineKey: IngredientMatchKey,
  lineUnit: InventoryUnit | null,
  entry: InventoryMatchEntry
): boolean => {
  if (!lineKey.dimension || !entry.key.dimension || lineKey.dimension !== entry.key.dimension) {
    return false;
  }

  // Вес→g и объём→ml всегда сводятся к одной канонической единице, count (item/
  // pack) — нет, поэтому для count требуем точного совпадения единицы.
  if (lineKey.dimension === "count") {
    return Boolean(lineUnit && entry.normalizedUnit && lineUnit === entry.normalizedUnit);
  }

  return true;
};

// --- ядро матчинга --------------------------------------------------------

const resolveLineStatus = (input: {
  hasCandidates: boolean;
  required: number;
  availableExact: number;
  availableTotal: number;
}): RecipeMatchLineStatus => {
  if (!input.hasCandidates || input.availableTotal <= 0) {
    return "missing";
  }
  if (input.required <= 0 || input.availableExact >= input.required) {
    return "covered";
  }
  if (input.availableTotal >= input.required) {
    return "substitute";
  }
  return "partial";
};

export const matchLineAgainstInventory = (
  line: MatchLineInput,
  index: ReturnType<typeof indexInventoryEntries>,
  factor: number
): RecipeMatchLineDto => {
  const lineKey = resolveIngredientMatchKey(line.profile);
  const required = roundTo(line.requiredNormalizedQuantity * factor, 3);

  const chosen = new Map<string, { entry: InventoryMatchEntry; tier: "exact" | "substitute" }>();

  if (lineKey.exactKey) {
    for (const entry of index.byExact.get(lineKey.exactKey) ?? []) {
      if (dimensionMatches(lineKey, line.normalizedUnit, entry)) {
        chosen.set(entry.itemId, { entry, tier: "exact" });
      }
    }
  }

  if (lineKey.matchPolicy === "family_compatible" && lineKey.groupKey) {
    for (const entry of index.byGroup.get(lineKey.groupKey) ?? []) {
      if (chosen.has(entry.itemId)) {
        continue;
      }
      if (dimensionMatches(lineKey, line.normalizedUnit, entry)) {
        chosen.set(entry.itemId, { entry, tier: "substitute" });
      }
    }
  }

  let availableExact = 0;
  let availableTotal = 0;
  for (const { entry, tier } of chosen.values()) {
    availableTotal += entry.available;
    if (tier === "exact") {
      availableExact += entry.available;
    }
  }
  availableExact = roundTo(availableExact, 3);
  availableTotal = roundTo(availableTotal, 3);

  const status = resolveLineStatus({
    hasCandidates: chosen.size > 0,
    required,
    availableExact,
    availableTotal
  });

  const coverage = required > 0 ? Math.min(availableTotal / required, 1) : (chosen.size > 0 ? 1 : 0);

  return {
    recipeIngredientId: line.id,
    persistentKey: line.persistentKey,
    displayOrder: line.displayOrder,
    ingredientDisplayName: line.displayName,
    category: line.profile.category ?? null,
    status,
    coveragePercent: Math.round(coverage * 100),
    requiredQuantityNormalized: required,
    availableQuantityNormalized: availableTotal,
    shortfallNormalized: roundTo(Math.max(required - availableTotal, 0), 3),
    normalizedUnit: line.normalizedUnit,
    viaSubstitute: availableExact < required && availableTotal > availableExact
  };
};

const resolveMatchLabel = (matchPercent: number): RecipeMatchLabel => {
  if (matchPercent >= 100) return "ready";
  if (matchPercent >= 70) return "almost";
  if (matchPercent >= 1) return "partial";
  return "none";
};

export const summarizeMatch = (recipeId: string, lines: RecipeMatchLineDto[], context: {
  targetBatchVolumeL: number;
  recipeBatchVolumeL: number;
}): RecipeMatchDto => {
  let weightSum = 0;
  let weightedCoverage = 0;
  for (const line of lines) {
    const weight = weightForCategory(line.category);
    weightSum += weight;
    weightedCoverage += weight * (line.coveragePercent / 100);
  }

  const matchPercent = weightSum > 0 ? Math.round((weightedCoverage / weightSum) * 100) : 0;
  const coveredLines = lines.filter((line) => line.status === "covered" || line.status === "substitute").length;
  const missingCount = lines.filter((line) => line.status === "missing").length;

  return {
    recipeId,
    matchPercent,
    label: resolveMatchLabel(matchPercent),
    totalLines: lines.length,
    coveredLines,
    missingCount,
    lines: lines.sort((a, b) => a.displayOrder - b.displayOrder),
    targetBatchVolumeL: roundTo(context.targetBatchVolumeL, 2),
    recipeBatchVolumeL: roundTo(context.recipeBatchVolumeL, 2),
    scaledToInventory: Math.abs(context.targetBatchVolumeL - context.recipeBatchVolumeL) > 0.001
  };
};

// --- объём партии ---------------------------------------------------------

const safeRecipeBatchVolumeL = (normalizedQuantity: number, normalizedUnit: string): number => {
  try {
    const volume = toBatchVolumeLiters(normalizedQuantity, normalizedUnit);
    return volume > 0 ? volume : FALLBACK_BATCH_VOLUME_L;
  } catch {
    return FALLBACK_BATCH_VOLUME_L;
  }
};

const resolveDefaultBatchVolumeL = async (userId: string): Promise<number | null> => {
  const profiles = await listEquipmentProfiles(userId);
  const target = profiles[0]?.targetBatchVolumeL;
  return typeof target === "number" && target > 0 ? target : null;
};

// --- публичный API: рецепт → % по складу ----------------------------------

export const computeRecipeMatch = async (input: {
  userId: string;
  recipeId: string;
  targetBatchVolumeL?: number | null;
}): Promise<RecipeMatchDto> => {
  const [recipe, inventoryItems, defaultBatchVolumeL] = await Promise.all([
    getRecipeById(input.userId, input.recipeId),
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL ? Promise.resolve(null) : resolveDefaultBatchVolumeL(input.userId)
  ]);

  const recipeBatchVolumeL = safeRecipeBatchVolumeL(
    recipe.batchSizeNormalizedQuantity,
    recipe.batchSizeNormalizedUnit
  );
  const targetBatchVolumeL = input.targetBatchVolumeL && input.targetBatchVolumeL > 0
    ? input.targetBatchVolumeL
    : defaultBatchVolumeL ?? recipeBatchVolumeL;
  const factor = recipeBatchVolumeL > 0 ? targetBatchVolumeL / recipeBatchVolumeL : 1;

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems));

  const lines = recipe.ingredients.map((ingredient): RecipeMatchLineDto => matchLineAgainstInventory(
    {
      id: ingredient.id,
      persistentKey: ingredient.persistentKey,
      displayOrder: ingredient.displayOrder,
      displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? null,
      profile: profileFromRecipeIngredientDto(ingredient),
      requiredNormalizedQuantity: ingredient.amountNormalizedQuantity,
      normalizedUnit: parseInventoryUnit(ingredient.amountNormalizedUnit)
    },
    index,
    factor
  ));

  return summarizeMatch(recipe.id, lines, { targetBatchVolumeL, recipeBatchVolumeL });
};

// --- публичный API: склад → подходящие рецепты ----------------------------

type CandidateRecipeRow = typeof recipes.$inferSelect & {
  ingredients: (typeof recipeIngredients.$inferSelect)[];
};

const profileFromRecipeIngredientRow = (
  row: typeof recipeIngredients.$inferSelect,
  catalog: typeof ingredients.$inferSelect | undefined
): IngredientMatchProfile => {
  const technicalData = catalog
    ? extractIngredientTechnicalData({ type: catalog.type, attributes: catalog.attributes })
    : null;

  return {
    category: toMatchCategory(row.ingredientCategory),
    type: toMatchType(row.type),
    name: catalog?.nameRu ?? row.ingredientDisplayNameSnapshot ?? null,
    nameEn: catalog?.nameEn ?? null,
    subtype: row.ingredientSubtype ?? null,
    technicalData,
    catalogItemId: row.ingredientCatalogItemId ?? null,
    customId: row.userCustomIngredientId ?? null,
    dimension: parseInventoryUnit(row.amountNormalizedUnit)
      ? getInventoryUnitDimension(row.amountNormalizedUnit as InventoryUnit)
      : null
  };
};

export const findBrewableRecipesForUser = async (input: {
  userId: string;
  targetBatchVolumeL?: number | null;
  minMatchPercent?: number;
  limit?: number;
  candidatePoolSize?: number;
}): Promise<BrewableRecipeDto[]> => {
  const minMatchPercent = input.minMatchPercent ?? 1;
  const limit = input.limit ?? 12;
  const candidatePoolSize = input.candidatePoolSize ?? 80;

  const [inventoryItems, defaultBatchVolumeL] = await Promise.all([
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL ? Promise.resolve(null) : resolveDefaultBatchVolumeL(input.userId)
  ]);

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems));
  if (index.byExact.size === 0 && index.byGroup.size === 0) {
    return [];
  }

  const candidates = await db.query.recipes.findMany({
    where: eq(recipes.publicationState, "published"),
    with: { ingredients: true },
    orderBy: (table, { desc }) => [desc(table.saveCount), desc(table.updatedAt)],
    limit: candidatePoolSize
  }) as CandidateRecipeRow[];

  const catalogIds = [...new Set(
    candidates.flatMap((recipe) => recipe.ingredients
      .map((line) => line.ingredientCatalogItemId)
      .filter((id): id is string => Boolean(id)))
  )];
  const catalogRows = catalogIds.length
    ? await db.query.ingredients.findMany({ where: inArray(ingredients.id, catalogIds) })
    : [];
  const catalogById = new Map(catalogRows.map((row) => [row.id, row]));

  const matches = candidates
    .filter((recipe) => recipe.ingredients.length > 0)
    .map((recipe) => {
      const recipeBatchVolumeL = safeRecipeBatchVolumeL(
        recipe.batchSizeNormalizedQuantity,
        recipe.batchSizeNormalizedUnit
      );
      const targetBatchVolumeL = input.targetBatchVolumeL && input.targetBatchVolumeL > 0
        ? input.targetBatchVolumeL
        : defaultBatchVolumeL ?? recipeBatchVolumeL;
      const factor = recipeBatchVolumeL > 0 ? targetBatchVolumeL / recipeBatchVolumeL : 1;

      const lines = recipe.ingredients.map((row) => matchLineAgainstInventory(
        {
          id: row.id,
          persistentKey: row.persistentKey,
          displayOrder: row.displayOrder,
          displayName: row.ingredientDisplayNameSnapshot ?? null,
          profile: profileFromRecipeIngredientRow(row, catalogById.get(row.ingredientCatalogItemId ?? "")),
          requiredNormalizedQuantity: row.amountNormalizedQuantity,
          normalizedUnit: parseInventoryUnit(row.amountNormalizedUnit)
        },
        index,
        factor
      ));

      const summary = summarizeMatch(recipe.id, lines, { targetBatchVolumeL, recipeBatchVolumeL });
      return {
        recipeId: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        matchPercent: summary.matchPercent,
        label: summary.label,
        totalLines: summary.totalLines,
        coveredLines: summary.coveredLines,
        missingCount: summary.missingCount
      } satisfies BrewableRecipeDto;
    })
    .filter((recipe) => recipe.matchPercent >= minMatchPercent)
    .sort((a, b) => b.matchPercent - a.matchPercent || b.coveredLines - a.coveredLines)
    .slice(0, limit);

  return matches;
};
