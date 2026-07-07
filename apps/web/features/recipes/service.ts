import {
  and,
  asc,
  brewBatches,
  count,
  db,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  ingredients,
  lte,
  or,
  recipeImages,
  recipeIngredients,
  recipeRatings,
  recipeSaves,
  recipes,
  sql,
  userBrewingSettings,
  userCustomIngredients,
  users
} from "@nb/db";
import {
  calculateAbv,
  calculateBitterness,
  calculateColor,
  calculateOg,
  evaluateStyleFit,
  getBeerStyleById,
  getBjcpArticleHrefByStyleId,
  getStyleRangeById,
  type HopAdditionInput,
  roundTo,
  srmToEbc
} from "@nb/brewing-core";
import { getBjcpStyleHeroImageByBjcpId } from "@nb/content";
import {
  createRecipePayloadSchema,
  defaultRecipeProcessMeta,
  listAuthorRecipesQuerySchema,
  recipeBitternessFormulas,
  recipeCalculationMetaSchema,
  recipeProcessMetaSchema,
  recipeWaterPlanMetaSchema,
  type RecipeCalculationMeta,
  type RecipeCloneSourceDto,
  type RecipeDetailDto,
  type RecipeDraftPreviewDto,
  type RecipeIngredientDto,
  type RecipeListItemDto,
  type OwnerRecipeCardDto,
  type RecipeHopUseType,
  type RecipeImportedIngredientSnapshot,
  type RecipeInventoryIntentMode,
  type RecipeInventorySelectionMeta,
  type RecipeProcessMeta,
  type RecipePublicationState,
  type RecipeWaterPlanMeta,
  type RecipeVersionOptionDto,
  type PublicRecipeFilters,
  type PublicRecipeListItem,
  type PublicRecipeListResult,
  type PublicRecipeSortAvailability,
  recipeRatingInputSchema,
  type RecipeRatingDto,
  type RecipeRatingSummary,
  type RecipeSaveSummary,
  updateRecipePayloadSchema
} from "./contracts";
import {
  resolveFamilyStyleScopes,
  resolvePagination,
  resolvePublicRecipeSort,
  resolveStyleScope,
  type PublicRecipeSortKey
} from "./public-recipe-query";
import { computeBayesianRating } from "./rating-score";
import { isRecipeIndexable, isUnmodifiedClone } from "./seo";
import { equipmentProfileSnapshotSchema, type EquipmentProfileSnapshot } from "../equipment-profiles/contracts";
import { getRecipePublicationFieldErrors } from "./publication-validation";
import { calculateRecipeFgEstimate } from "./fg-estimate";
import { scaleRecipeToVolume } from "./scale";
import {
  normalizeRecipeBatchSize,
  normalizeRecipeIngredientAmountWithSource,
  parseRecipeUnit,
  toBatchVolumeLiters
} from "./units";
import { appendSlugSuffix, toRecipeSlugBase } from "./slug";
import {
  extractIngredientTechnicalData,
  fermentableAppliesMashEfficiency,
  getIngredientAlphaAcidPercent,
  getIngredientColorLovibond,
  getIngredientPotentialPpg
} from "../ingredients/technical-fields";
import { ingredientCategories, ingredientTypes } from "../ingredients/contracts";
import { buildIngredientTypedSummary, resolveIngredientDisplayNames } from "../ingredients/presentation";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype,
  resolveLegacyIngredientType
} from "../ingredients/taxonomy";
import {
  buildCatalogIngredientLinkage,
  buildCustomIngredientLinkage,
  type IngredientSourceLinkage
} from "../ingredients/source-linkage";
import { resolveInventoryUnitProfile } from "../inventory/units";

const DEFAULT_EFFICIENCY = 75;
const DEFAULT_BATCH_SIZE_ENTERED_QUANTITY = 20;
const DEFAULT_BATCH_SIZE_ENTERED_UNIT = "l";
const DEFAULT_BOIL_TIME_MINUTES = 60;
const DEFAULT_NEW_RECIPE_TITLE_PREFIX = "Новый рецепт";

class RecipeValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>, message = "Проверьте заполнение рецепта.") {
    super(message);
    this.name = "RecipeValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const ensureOwnedRecipe = async (authorId: string, recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.authorId, authorId))
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  return recipe;
};

const listRecipeVersions = async (authorId: string, recipeFamilyId: string): Promise<RecipeVersionOptionDto[]> => {
  const rows = await db.query.recipes.findMany({
    where: and(eq(recipes.authorId, authorId), eq(recipes.recipeFamilyId, recipeFamilyId)),
    orderBy: [desc(recipes.versionNumber)]
  });

  return rows.map((row) => ({
    id: row.id,
    versionNumber: row.versionNumber,
    updatedAt: row.updatedAt
  }));
};

const ensureAccessibleRecipe = async (viewerId: string | null, recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    with: {
      ingredients: true
    }
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  const isOwner = viewerId === recipe.authorId;
  if (!isOwner && recipe.publicationState !== "published") {
    throw new Error("FORBIDDEN");
  }

  return recipe;
};

const ensurePublicRecipe = async (recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    with: {
      ingredients: true
    }
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  if (recipe.publicationState !== "published") {
    throw new Error("FORBIDDEN");
  }

  return recipe;
};

const ensurePublicRecipeBySlug = async (slug: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.slug, slug),
    with: {
      ingredients: true
    }
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  if (recipe.publicationState !== "published") {
    throw new Error("FORBIDDEN");
  }

  return recipe;
};

const resolveUniqueRecipeSlug = async (title: string, recipeId?: string) => {
  const base = toRecipeSlugBase(title);
  let index = 1;

  while (index <= 1000) {
    const candidate = appendSlugSuffix(base, index);
    const existing = await db.query.recipes.findFirst({
      where: eq(recipes.slug, candidate)
    });

    if (!existing || existing.id === recipeId) {
      return candidate;
    }

    index += 1;
  }

  throw new Error("SLUG_COLLISION");
};

const isSlugUniqueConstraintError = (error: unknown) => error instanceof Error
  && (error.message.includes("recipes_slug_uidx") || (error as { code?: string }).code === "23505");

const ensureCatalogIngredientExists = async (ingredientCatalogItemId: string) => {
  const catalogItem = await db.query.ingredients.findFirst({
    where: and(
      eq(ingredients.id, ingredientCatalogItemId),
      eq(ingredients.isActive, true)
    )
  });

  if (!catalogItem) {
    throw new Error("CATALOG_INGREDIENT_NOT_FOUND");
  }

  return catalogItem;
};

const ensureOwnedCustomIngredient = async (authorId: string, userCustomIngredientId: string) => {
  const customIngredient = await db.query.userCustomIngredients.findFirst({
    where: and(
      eq(userCustomIngredients.id, userCustomIngredientId),
      eq(userCustomIngredients.userId, authorId)
    )
  });

  if (!customIngredient) {
    throw new Error("CUSTOM_INGREDIENT_NOT_FOUND");
  }

  return customIngredient;
};

const findCatalogIngredientIfAvailable = async (ingredientCatalogItemId: string) => {
  try {
    return await ensureCatalogIngredientExists(ingredientCatalogItemId);
  } catch (error) {
    if (error instanceof Error && error.message === "CATALOG_INGREDIENT_NOT_FOUND") {
      return null;
    }

    throw error;
  }
};

const findOwnedCustomIngredientIfAvailable = async (authorId: string, userCustomIngredientId: string) => {
  try {
    return await ensureOwnedCustomIngredient(authorId, userCustomIngredientId);
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOM_INGREDIENT_NOT_FOUND") {
      return null;
    }

    throw error;
  }
};

const parseRecipeIngredientUnit = (value: string) => {
  const unit = parseRecipeUnit(value);
  if (!unit) {
    throw new Error("INVALID_UNIT");
  }

  return unit;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const normalizeStoredRecipeCategory = (
  category?: typeof recipeIngredients.$inferSelect.ingredientCategory | null
): RecipeIngredientDto["ingredientCategory"] | null => {
  if (category === "water_prep") {
    return "water_treatment";
  }

  if (category === "misc") {
    return "consumable";
  }

  return category as RecipeIngredientDto["ingredientCategory"] | null;
};

const normalizeStoredRecipeSubtype = (
  category: RecipeIngredientDto["ingredientCategory"] | null,
  subtype?: string | null
): RecipeIngredientDto["ingredientSubtype"] => {
  if (!subtype) {
    return null;
  }

  return resolveIngredientSubtype({
    category: category ?? undefined,
    subtype
  }) as RecipeIngredientDto["ingredientSubtype"];
};

type RecipeStatsSourceRaw = Parameters<typeof getIngredientPotentialPpg>[0];

const isRecipeIngredientType = (value: unknown): value is RecipeIngredientDto["type"] => (
  typeof value === "string" && (ingredientTypes as readonly string[]).includes(value)
);

const isRecipeIngredientCategory = (value: unknown): value is NonNullable<RecipeIngredientDto["ingredientCategory"]> => (
  typeof value === "string" && (ingredientCategories as readonly string[]).includes(value)
);

const parseRecipeUnitOrNull = (value: unknown) => (
  typeof value === "string" ? parseRecipeUnit(value) : null
);

const parseAllowedRecipeUnits = (value: unknown) => (
  Array.isArray(value)
    ? value.map(parseRecipeUnitOrNull).filter((unit): unit is NonNullable<ReturnType<typeof parseRecipeUnitOrNull>> => unit != null)
    : []
);

const readImportedIngredientLinkage = (
  externalImportMeta: Record<string, unknown> | null | undefined
): IngredientSourceLinkage | null => {
  if (!isRecord(externalImportMeta) || !isRecord(externalImportMeta.importedIngredient)) {
    return null;
  }

  const snapshot = externalImportMeta.importedIngredient as Partial<RecipeImportedIngredientSnapshot>;
  if (snapshot.version !== 1 || !isRecipeIngredientType(snapshot.type)) {
    return null;
  }

  const category = isRecipeIngredientCategory(snapshot.category)
    ? snapshot.category
    : resolveIngredientCategory({ type: snapshot.type });
  const subtype = resolveIngredientSubtype({
    type: snapshot.type,
    category,
    subtype: typeof snapshot.subtype === "string" ? snapshot.subtype : undefined
  }) ?? null;
  const technicalData = extractIngredientTechnicalData({
    type: snapshot.type,
    technicalData: snapshot.technicalData ?? undefined
  });
  const defaultDisplayUnit = parseRecipeUnitOrNull(snapshot.defaultDisplayUnit);
  const allowedUnits = parseAllowedRecipeUnits(snapshot.allowedUnits);
  const measurementDimension = snapshot.measurementDimension === "weight"
    || snapshot.measurementDimension === "volume"
    || snapshot.measurementDimension === "count"
    ? snapshot.measurementDimension
    : null;
  const unitProfile = resolveInventoryUnitProfile({
    type: snapshot.type,
    category,
    subtype,
    defaultDisplayUnit,
    allowedUnits: allowedUnits.length ? allowedUnits : undefined,
    measurementDimension,
    technicalData
  });
  const unitPreferred = technicalData?.type === "water_treatment" && typeof technicalData.unitPreferred === "string"
    ? technicalData.unitPreferred
    : null;

  return {
    type: snapshot.type,
    category,
    subtype,
    familyId: null,
    displayName: typeof snapshot.name === "string" && snapshot.name.trim() ? snapshot.name.trim() : "Imported ingredient",
    displayNameRu: null,
    displayNameEn: null,
    familyDisplayName: null,
    summary: buildIngredientTypedSummary({
      type: snapshot.type,
      category,
      subtype,
      technicalData,
      unitPreferred
    }) ?? null,
    brand: null,
    producer: null,
    brandName: null,
    manufacturer: null,
    countryCode: null,
    countryName: null,
    country: null,
    defaultDisplayUnit: defaultDisplayUnit ?? unitProfile.defaultUnit,
    allowedUnits: allowedUnits.length ? allowedUnits : unitProfile.allowedUnits,
    measurementDimension: measurementDimension ?? unitProfile.measurementDimension,
    technicalData
  };
};

const buildRecipeStatsSourceRaw = (source: IngredientSourceLinkage): RecipeStatsSourceRaw => ({
  type: source.type,
  technicalData: source.technicalData ?? undefined,
  properties: source.technicalData ? { technicalData: source.technicalData } : {}
});

const resolveRecipeStyleRange = (styleId: string | null | undefined) => getStyleRangeById(styleId);

const parseRecipeProcessMeta = (processMeta: Record<string, unknown> | null | undefined) => (
  recipeProcessMetaSchema.parse(processMeta ?? defaultRecipeProcessMeta)
);

const sanitizeRecipeProcessMeta = (processMeta: Record<string, unknown> | null | undefined) => (
  parseRecipeProcessMeta(processMeta) as Record<string, unknown>
);

const parseRecipeCalculationMeta = (
  calculationMeta: Record<string, unknown> | null | undefined,
  fallback?: RecipeCalculationMeta
): RecipeCalculationMeta => {
  const parsed = recipeCalculationMetaSchema.safeParse(calculationMeta ?? fallback ?? {});
  return parsed.success ? parsed.data : (fallback ?? recipeCalculationMetaSchema.parse({}));
};

const sanitizeRecipeCalculationMeta = (
  calculationMeta: Record<string, unknown> | null | undefined,
  fallback?: RecipeCalculationMeta
) => parseRecipeCalculationMeta(calculationMeta, fallback) as Record<string, unknown>;

const parseRecipeWaterPlanMeta = (
  waterPlanMeta: Record<string, unknown> | null | undefined
): RecipeWaterPlanMeta | null => {
  if (!waterPlanMeta) {
    return null;
  }

  const parsed = recipeWaterPlanMetaSchema.safeParse(waterPlanMeta);
  return parsed.success ? parsed.data : null;
};

const sanitizeRecipeWaterPlanMeta = (
  waterPlanMeta: Record<string, unknown> | null | undefined
) => {
  const parsed = parseRecipeWaterPlanMeta(waterPlanMeta);
  return parsed ? parsed as Record<string, unknown> : null;
};

const isRecipeBitternessFormula = (value: string): value is RecipeCalculationMeta["bitternessFormula"] => (
  (recipeBitternessFormulas as readonly string[]).includes(value)
);

const getUserRecipeCalculationMeta = async (authorId: string): Promise<RecipeCalculationMeta> => {
  const settings = await db.query.userBrewingSettings.findFirst({
    where: eq(userBrewingSettings.userId, authorId)
  });

  return recipeCalculationMetaSchema.parse({
    bitternessFormula: settings && isRecipeBitternessFormula(settings.preferredBitternessFormula)
      ? settings.preferredBitternessFormula
      : "tinseth_whirlpool_v2",
    bitternessSettings: settings?.bitternessSettings ?? {}
  });
};

const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const coerceFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const coercePositiveNumber = (value: unknown) => {
  const parsed = coerceFiniteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
};

const coercePositiveInteger = (value: unknown) => {
  const parsed = coerceFiniteNumber(value);
  return parsed != null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeCreateRecipePayloadDefaults = (payload: unknown) => {
  if (!isRecord(payload)) {
    return payload;
  }

  return {
    ...payload,
    batchSizeEnteredQuantity: coercePositiveNumber(payload.batchSizeEnteredQuantity) ?? DEFAULT_BATCH_SIZE_ENTERED_QUANTITY,
    batchSizeEnteredUnit: typeof payload.batchSizeEnteredUnit === "string" && payload.batchSizeEnteredUnit.trim()
      ? payload.batchSizeEnteredUnit
      : DEFAULT_BATCH_SIZE_ENTERED_UNIT,
    boilTimeMinutes: coercePositiveInteger(payload.boilTimeMinutes) ?? DEFAULT_BOIL_TIME_MINUTES
  };
};

const normalizeUpdateRecipePayloadDefaults = (payload: unknown) => {
  if (!isRecord(payload)) {
    return payload;
  }

  const normalized: Record<string, unknown> = { ...payload };

  if (hasOwn(payload, "batchSizeEnteredQuantity")) {
    normalized.batchSizeEnteredQuantity = coercePositiveNumber(payload.batchSizeEnteredQuantity) ?? DEFAULT_BATCH_SIZE_ENTERED_QUANTITY;
  }

  if (hasOwn(payload, "batchSizeEnteredUnit")) {
    normalized.batchSizeEnteredUnit = typeof payload.batchSizeEnteredUnit === "string" && payload.batchSizeEnteredUnit.trim()
      ? payload.batchSizeEnteredUnit
      : DEFAULT_BATCH_SIZE_ENTERED_UNIT;
  }

  if (hasOwn(payload, "boilTimeMinutes")) {
    normalized.boilTimeMinutes = coercePositiveInteger(payload.boilTimeMinutes) ?? DEFAULT_BOIL_TIME_MINUTES;
  }

  return normalized;
};

const readStringMeta = (stepMeta: Record<string, unknown> | null | undefined, key: string) => (
  isRecord(stepMeta) && typeof stepMeta[key] === "string" ? stepMeta[key] as string : null
);

const readNumberMeta = (stepMeta: Record<string, unknown> | null | undefined, key: string) => (
  isRecord(stepMeta) && typeof stepMeta[key] === "number" && Number.isFinite(stepMeta[key]) ? stepMeta[key] as number : null
);

const resolveHopUseType = (
  stage: RecipeIngredientDto["stage"],
  stepMeta: Record<string, unknown> | null | undefined
): RecipeHopUseType => {
  const metaUseType = readStringMeta(stepMeta, "useType");
  if (metaUseType === "boil" || metaUseType === "first_wort_hop" || metaUseType === "whirlpool" || metaUseType === "dry_hop" || metaUseType === "dip_hop" || metaUseType === "other") {
    return metaUseType;
  }

  if (stage === "whirlpool") {
    return "whirlpool";
  }

  if (stage === "fermentation") {
    return "dry_hop";
  }

  if (stage === "boil") {
    return "boil";
  }

  return "other";
};

const resolveHopTimeMinutes = (
  ingredient: {
    stage: RecipeIngredientDto["stage"];
    timeOffset: number | null;
    stepMeta?: Record<string, unknown> | null;
  },
  boilTimeMinutes: number
) => {
  const metaTime = readNumberMeta(ingredient.stepMeta ?? null, "timeMinutes");
  if (metaTime != null) {
    return metaTime;
  }

  if (ingredient.timeOffset != null) {
    return ingredient.timeOffset;
  }

  return resolveHopUseType(ingredient.stage, ingredient.stepMeta ?? null) === "boil"
    ? boilTimeMinutes
    : 0;
};

type PreparedRecipeIngredientEntry = {
  persistentKey: string | null;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  source: IngredientSourceLinkage;
  sourceRaw: RecipeStatsSourceRaw;
  amount: ReturnType<typeof normalizeRecipeIngredientAmountWithSource>;
  stage: typeof recipeIngredients.$inferInsert.stage;
  timeOffset: number | null;
  stepMeta: Record<string, unknown> | null;
  inventoryIntentMode: RecipeInventoryIntentMode | null;
  inventorySelectionMeta: RecipeInventorySelectionMeta | null;
  externalImportMeta: Record<string, unknown> | null;
  displayOrder: number;
};

const prepareRecipeIngredientEntries = async (
  authorId: string,
  payloadIngredients: Array<{
    persistentKey?: string | null;
    ingredientCatalogItemId?: string | null;
    userCustomIngredientId?: string | null;
    type?: typeof recipeIngredients.$inferInsert.type;
    category?: RecipeIngredientDto["ingredientCategory"];
    subtype?: string | null;
    familyId?: string | null;
    amountEnteredQuantity: number;
    amountEnteredUnit: string;
    stage: typeof recipeIngredients.$inferInsert.stage;
    timeOffset?: number | null;
    stepMeta?: Record<string, unknown> | null;
    inventoryIntentMode?: RecipeInventoryIntentMode | null;
    inventorySelectionMeta?: RecipeInventorySelectionMeta | null;
    externalImportMeta?: Record<string, unknown> | null;
  }>
) => {
  const preparedValues: PreparedRecipeIngredientEntry[] = [];

  for (const [index, ingredient] of payloadIngredients.entries()) {
    let resolvedSource: IngredientSourceLinkage;
    let rawSource: RecipeStatsSourceRaw;

    if (ingredient.ingredientCatalogItemId) {
      const catalog = await ensureCatalogIngredientExists(ingredient.ingredientCatalogItemId);
      resolvedSource = buildCatalogIngredientLinkage(catalog);
      rawSource = catalog;
      if (ingredient.familyId != null && ingredient.familyId !== resolvedSource.familyId) {
        throw new Error("INGREDIENT_LINKAGE_MISMATCH");
      }
    } else if (ingredient.userCustomIngredientId) {
      const custom = await ensureOwnedCustomIngredient(authorId, ingredient.userCustomIngredientId);
      resolvedSource = buildCustomIngredientLinkage(custom);
      rawSource = custom;
      if (ingredient.familyId != null) {
        throw new Error("INGREDIENT_LINKAGE_MISMATCH");
      }
    } else if (ingredient.inventoryIntentMode === "imported") {
      const importedSource = readImportedIngredientLinkage(ingredient.externalImportMeta ?? null);
      if (!importedSource) {
        throw new Error("INVALID_SOURCE_LINKAGE");
      }
      resolvedSource = importedSource;
      rawSource = buildRecipeStatsSourceRaw(importedSource);
    } else {
      throw new Error("INVALID_SOURCE_LINKAGE");
    }

    if (ingredient.type && resolvedSource.type !== ingredient.type) {
      throw new Error("INGREDIENT_TYPE_MISMATCH");
    }

    if (ingredient.category && resolvedSource.category !== ingredient.category) {
      throw new Error("INGREDIENT_LINKAGE_MISMATCH");
    }

    if (ingredient.subtype) {
      const normalizedPayloadSubtype = resolveIngredientSubtype({
        category: resolvedSource.category ?? undefined,
        subtype: ingredient.subtype
      });

      if (normalizedPayloadSubtype !== (resolvedSource.subtype ?? null)) {
        throw new Error("INGREDIENT_LINKAGE_MISMATCH");
      }
    }

    preparedValues.push({
      persistentKey: ingredient.persistentKey ?? null,
      ingredientCatalogItemId: ingredient.ingredientCatalogItemId ?? null,
      userCustomIngredientId: ingredient.userCustomIngredientId ?? null,
      source: resolvedSource,
      sourceRaw: rawSource,
      amount: normalizeRecipeIngredientAmountWithSource(
        {
          type: resolvedSource.type,
          category: resolvedSource.category,
          subtype: resolvedSource.subtype,
          defaultDisplayUnit: resolvedSource.defaultDisplayUnit,
          allowedUnits: resolvedSource.allowedUnits,
          measurementDimension: resolvedSource.measurementDimension,
          technicalData: resolvedSource.technicalData
        },
        ingredient.amountEnteredQuantity,
        ingredient.amountEnteredUnit
      ),
      stage: ingredient.stage as RecipeIngredientDto["stage"],
      timeOffset: ingredient.timeOffset ?? null,
      stepMeta: sanitizeRecipeStepMeta(ingredient.stepMeta ?? null),
      inventoryIntentMode: ingredient.inventoryIntentMode ?? null,
      inventorySelectionMeta: ingredient.inventorySelectionMeta ?? null,
      externalImportMeta: ingredient.externalImportMeta ?? null,
      displayOrder: index
    });
  }

  return preparedValues;
};

const validateRecipeForPublicationState = (input: {
  publicationState: RecipePublicationState;
  title: string;
  styleId?: string | null;
  description?: string | null;
  boilTimeMinutes?: number | null;
  processMeta: Record<string, unknown> | null | undefined;
  ingredients: PreparedRecipeIngredientEntry[];
}) => {
  parseRecipeProcessMeta(input.processMeta);
  const fieldErrors = getRecipePublicationFieldErrors({
    publicationState: input.publicationState,
    title: input.title,
    description: input.description,
    boilTimeMinutes: input.boilTimeMinutes,
    ingredientCategories: input.ingredients.map((ingredient) => ingredient.source.category)
  });

  if (Object.keys(fieldErrors).length) {
    throw new RecipeValidationError(fieldErrors);
  }
};

type RecipeIngredientResolvedSource = {
  type: RecipeIngredientDto["type"];
  category: RecipeIngredientDto["ingredientCategory"];
  subtype: RecipeIngredientDto["ingredientSubtype"];
  familyId: RecipeIngredientDto["ingredientFamilyId"];
  displayName: RecipeIngredientDto["ingredientDisplayName"];
  displayNameRu: RecipeIngredientDto["ingredientDisplayNameRu"];
  displayNameEn: RecipeIngredientDto["ingredientDisplayNameEn"];
  familyDisplayName: RecipeIngredientDto["ingredientFamilyDisplayName"];
  summary: RecipeIngredientDto["ingredientSummary"];
  brand: RecipeIngredientDto["ingredientBrand"];
  producer: RecipeIngredientDto["ingredientProducer"];
  brandName: RecipeIngredientDto["ingredientBrandName"];
  manufacturer: RecipeIngredientDto["ingredientManufacturer"];
  countryCode: RecipeIngredientDto["ingredientCountryCode"];
  countryName: RecipeIngredientDto["ingredientCountryName"];
  country: RecipeIngredientDto["ingredientCountry"];
  defaultDisplayUnit: RecipeIngredientDto["ingredientDefaultDisplayUnit"];
  allowedUnits: RecipeIngredientDto["ingredientAllowedUnits"];
  measurementDimension: RecipeIngredientDto["ingredientMeasurementDimension"];
  technicalData: IngredientSourceLinkage["technicalData"];
};

const readRecipeIngredientLinkageMeta = (
  stepMeta: Record<string, unknown> | null | undefined
): RecipeIngredientResolvedSource | null => {
  if (!isRecord(stepMeta) || !isRecord(stepMeta.ingredientLinkage)) {
    return null;
  }

  const linkage = stepMeta.ingredientLinkage;
  const allowedUnits = Array.isArray(linkage.allowedUnits)
    ? linkage.allowedUnits.filter((value): value is string => typeof value === "string").map(parseRecipeIngredientUnit)
    : null;
  const defaultDisplayUnit = typeof linkage.defaultDisplayUnit === "string"
    ? parseRecipeIngredientUnit(linkage.defaultDisplayUnit)
    : null;
  const measurementDimension = linkage.measurementDimension === "weight"
    || linkage.measurementDimension === "volume"
    || linkage.measurementDimension === "count"
    ? linkage.measurementDimension
    : null;

  return {
    type: typeof linkage.type === "string" ? linkage.type as RecipeIngredientDto["type"] : "consumable",
    category: typeof linkage.category === "string" ? linkage.category as RecipeIngredientDto["ingredientCategory"] : null,
    subtype: typeof linkage.subtype === "string" ? linkage.subtype as RecipeIngredientDto["ingredientSubtype"] : null,
    familyId: typeof linkage.familyId === "string" ? linkage.familyId : null,
    displayName: typeof linkage.displayName === "string" ? linkage.displayName : null,
    displayNameRu: typeof linkage.displayNameRu === "string" ? linkage.displayNameRu : null,
    displayNameEn: typeof linkage.displayNameEn === "string" ? linkage.displayNameEn : null,
    familyDisplayName: typeof linkage.familyDisplayName === "string" ? linkage.familyDisplayName : null,
    summary: typeof linkage.summary === "string" ? linkage.summary : null,
    brand: typeof linkage.brand === "string" ? linkage.brand : null,
    producer: typeof linkage.producer === "string" ? linkage.producer : null,
    brandName: typeof linkage.brandName === "string" ? linkage.brandName : null,
    manufacturer: typeof linkage.manufacturer === "string" ? linkage.manufacturer : null,
    countryCode: typeof linkage.countryCode === "string" ? linkage.countryCode : null,
    countryName: typeof linkage.countryName === "string" ? linkage.countryName : null,
    country: typeof linkage.country === "string" ? linkage.country : null,
    defaultDisplayUnit,
    allowedUnits,
    measurementDimension,
    technicalData: null
  };
};

const sanitizeRecipeStepMeta = (
  stepMeta: Record<string, unknown> | null | undefined
) => {
  if (!isRecord(stepMeta)) {
    return stepMeta ?? null;
  }

  if (!Object.prototype.hasOwnProperty.call(stepMeta, "ingredientLinkage")) {
    return stepMeta;
  }

  const next = { ...stepMeta };
  delete next.ingredientLinkage;

  return Object.keys(next).length ? next : null;
};

const buildPersistedRecipeResolvedSource = (
  ingredient: typeof recipeIngredients.$inferSelect,
  stepMetaLinkage: RecipeIngredientResolvedSource | null,
  liveLinkage?: IngredientSourceLinkage | null
): RecipeIngredientResolvedSource => {
  const importedLinkage = readImportedIngredientLinkage(ingredient.externalImportMeta as Record<string, unknown> | null | undefined);
  const technicalData = liveLinkage?.technicalData ?? importedLinkage?.technicalData ?? null;
  const category = normalizeStoredRecipeCategory(ingredient.ingredientCategory)
    ?? importedLinkage?.category
    ?? stepMetaLinkage?.category
    ?? resolveIngredientCategory({ type: ingredient.type });
  const subtype = normalizeStoredRecipeSubtype(category, ingredient.ingredientSubtype)
    ?? importedLinkage?.subtype
    ?? stepMetaLinkage?.subtype
    ?? null;
  const type = (
    liveLinkage?.type
    ?? importedLinkage?.type
    ?? resolveLegacyIngredientType({ category, subtype })
    ?? (ingredient.type as RecipeIngredientDto["type"])
  ) as RecipeIngredientDto["type"];
  const unitProfile = resolveInventoryUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnitSnapshot
      ?? importedLinkage?.defaultDisplayUnit
      ?? stepMetaLinkage?.defaultDisplayUnit
      ?? liveLinkage?.defaultDisplayUnit
      ?? null,
    allowedUnits: importedLinkage?.allowedUnits ?? stepMetaLinkage?.allowedUnits ?? liveLinkage?.allowedUnits ?? undefined,
    measurementDimension: ingredient.ingredientMeasurementDimension
      ?? importedLinkage?.measurementDimension
      ?? stepMetaLinkage?.measurementDimension
      ?? liveLinkage?.measurementDimension
      ?? null,
    technicalData
  });

  return {
    type,
    category,
    subtype,
    familyId: ingredient.ingredientFamilyId ?? importedLinkage?.familyId ?? stepMetaLinkage?.familyId ?? liveLinkage?.familyId ?? null,
    displayName: liveLinkage?.displayName ?? ingredient.ingredientDisplayNameSnapshot ?? importedLinkage?.displayName ?? stepMetaLinkage?.displayName ?? null,
    displayNameRu: liveLinkage?.displayNameRu ?? importedLinkage?.displayNameRu ?? stepMetaLinkage?.displayNameRu ?? null,
    displayNameEn: liveLinkage?.displayNameEn ?? importedLinkage?.displayNameEn ?? stepMetaLinkage?.displayNameEn ?? null,
    familyDisplayName: liveLinkage?.familyDisplayName ?? importedLinkage?.familyDisplayName ?? stepMetaLinkage?.familyDisplayName ?? null,
    summary: liveLinkage?.summary ?? importedLinkage?.summary ?? stepMetaLinkage?.summary ?? null,
    brand: liveLinkage?.brand ?? importedLinkage?.brand ?? stepMetaLinkage?.brand ?? null,
    producer: liveLinkage?.producer ?? importedLinkage?.producer ?? stepMetaLinkage?.producer ?? null,
    brandName: liveLinkage?.brandName ?? importedLinkage?.brandName ?? stepMetaLinkage?.brandName ?? null,
    manufacturer: liveLinkage?.manufacturer ?? importedLinkage?.manufacturer ?? stepMetaLinkage?.manufacturer ?? null,
    countryCode: liveLinkage?.countryCode ?? importedLinkage?.countryCode ?? stepMetaLinkage?.countryCode ?? null,
    countryName: liveLinkage?.countryName ?? importedLinkage?.countryName ?? stepMetaLinkage?.countryName ?? null,
    country: liveLinkage?.country ?? importedLinkage?.country ?? stepMetaLinkage?.country ?? null,
    defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnitSnapshot
      ? parseRecipeIngredientUnit(ingredient.ingredientDefaultDisplayUnitSnapshot)
      : importedLinkage?.defaultDisplayUnit ?? unitProfile.defaultUnit,
    allowedUnits: importedLinkage?.allowedUnits ?? unitProfile.allowedUnits,
    measurementDimension: ingredient.ingredientMeasurementDimension ?? importedLinkage?.measurementDimension ?? unitProfile.measurementDimension,
    technicalData
  };
};

const mapRecipeIngredientBase = (ingredient: typeof recipeIngredients.$inferSelect) => ({
  id: ingredient.id,
  recipeId: ingredient.recipeId,
  persistentKey: ingredient.persistentKey,
  displayOrder: ingredient.displayOrder ?? 0,
  ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
  userCustomIngredientId: ingredient.userCustomIngredientId,
  type: ingredient.type as RecipeIngredientDto["type"],
  amountEnteredQuantity: ingredient.amountEnteredQuantity,
  amountEnteredUnit: parseRecipeIngredientUnit(ingredient.amountEnteredUnit),
  amountNormalizedQuantity: ingredient.amountNormalizedQuantity,
  amountNormalizedUnit: parseRecipeIngredientUnit(ingredient.amountNormalizedUnit),
  stage: ingredient.stage,
  timeOffset: ingredient.timeOffset,
  stepMeta: ingredient.stepMeta as Record<string, unknown> | null,
  inventoryIntentMode: ingredient.inventoryIntentMode as RecipeInventoryIntentMode | null,
  inventorySelectionMeta: ingredient.inventorySelectionMeta as RecipeInventorySelectionMeta | null,
  externalImportMeta: ingredient.externalImportMeta as Record<string, unknown> | null,
  createdAt: ingredient.createdAt,
  updatedAt: ingredient.updatedAt
});

const hydrateRecipeIngredientDto = async (
  authorId: string,
  ingredient: typeof recipeIngredients.$inferSelect
): Promise<RecipeIngredientDto> => {
  const stepMeta = ingredient.stepMeta as Record<string, unknown> | null;
  const stepMetaLinkage = readRecipeIngredientLinkageMeta(stepMeta);
  let liveLinkage: IngredientSourceLinkage | null = null;

  if (ingredient.ingredientCatalogItemId) {
    const catalog = await findCatalogIngredientIfAvailable(ingredient.ingredientCatalogItemId);
    liveLinkage = catalog ? buildCatalogIngredientLinkage(catalog) : null;
  } else if (ingredient.userCustomIngredientId) {
    const custom = await findOwnedCustomIngredientIfAvailable(authorId, ingredient.userCustomIngredientId);
    liveLinkage = custom ? buildCustomIngredientLinkage(custom) : null;
  }

  const resolvedSource = buildPersistedRecipeResolvedSource(ingredient, stepMetaLinkage, liveLinkage);

  return {
    ...mapRecipeIngredientBase(ingredient),
    ingredientCategory: resolvedSource?.category ?? null,
    ingredientSubtype: resolvedSource?.subtype ?? null,
    ingredientFamilyId: resolvedSource?.familyId ?? null,
    ingredientDisplayName: resolvedSource?.displayName ?? null,
    ingredientDisplayNameRu: resolvedSource?.displayNameRu ?? null,
    ingredientDisplayNameEn: resolvedSource?.displayNameEn ?? null,
    ingredientDisplayNameSnapshot: resolvedSource?.displayName ?? null,
    ingredientFamilyDisplayName: resolvedSource?.familyDisplayName ?? null,
    ingredientSummary: resolvedSource?.summary ?? null,
    ingredientBrand: resolvedSource?.brand ?? null,
    ingredientProducer: resolvedSource?.producer ?? null,
    ingredientBrandName: resolvedSource?.brandName ?? null,
    ingredientManufacturer: resolvedSource?.manufacturer ?? null,
    ingredientCountryCode: resolvedSource?.countryCode ?? null,
    ingredientCountryName: resolvedSource?.countryName ?? null,
    ingredientCountry: resolvedSource?.country ?? null,
    ingredientDefaultDisplayUnit: resolvedSource?.defaultDisplayUnit ?? null,
    ingredientDefaultDisplayUnitSnapshot: resolvedSource?.defaultDisplayUnit ?? null,
    ingredientAllowedUnits: resolvedSource?.allowedUnits ?? null,
    ingredientMeasurementDimension: resolvedSource?.measurementDimension ?? null,
    ingredientMeasurementDimensionSnapshot: resolvedSource?.measurementDimension ?? null,
    ingredientTechnicalData: resolvedSource?.technicalData ?? null
  };
};

const mapRecipeListDto = (recipe: typeof recipes.$inferSelect): RecipeListItemDto => ({
  id: recipe.id,
  authorId: recipe.authorId,
  recipeFamilyId: recipe.recipeFamilyId,
  versionNumber: recipe.versionNumber,
  versionCount: 1,
  publicationState: recipe.publicationState,
  title: recipe.title,
  slug: recipe.slug,
  styleId: recipe.styleId,
  batchSizeEnteredQuantity: recipe.batchSizeEnteredQuantity,
  batchSizeEnteredUnit: parseRecipeIngredientUnit(recipe.batchSizeEnteredUnit),
  batchSizeNormalizedQuantity: recipe.batchSizeNormalizedQuantity,
  batchSizeNormalizedUnit: parseRecipeIngredientUnit(recipe.batchSizeNormalizedUnit),
  efficiency: recipe.efficiency,
  boilTimeMinutes: recipe.boilTimeMinutes ?? DEFAULT_BOIL_TIME_MINUTES,
  og: recipe.og,
  fg: recipe.fg,
  abv: recipe.abv,
  ibu: recipe.ibu,
  color: recipe.color,
  createdAt: recipe.createdAt,
  updatedAt: recipe.updatedAt
});

const parseRecipeEquipmentProfileSnapshot = (
  value: Record<string, unknown> | null | undefined
) => {
  if (!value) {
    return null;
  }

  const parsed = equipmentProfileSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const sortRecipeIngredientsByDisplayOrder = (
  ingredients: Array<typeof recipeIngredients.$inferSelect>
) => [...ingredients].sort((left, right) => {
  const orderDiff = (left.displayOrder ?? 0) - (right.displayOrder ?? 0);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
});

/**
 * Атрибуция клона: резолвит исходный рецепт (название, slug, автор, опубликован
 * ли) по `cloned_from_recipe_id`. Данные неперсональные → деталь остаётся
 * кэшируемой. null, если связи нет либо источник удалён.
 */
const resolveRecipeCloneSource = async (
  clonedFromRecipeId: string | null | undefined
): Promise<RecipeCloneSourceDto | null> => {
  if (!clonedFromRecipeId) {
    return null;
  }

  const [row] = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      slug: recipes.slug,
      authorId: recipes.authorId,
      authorDisplayName: users.displayName,
      publicationState: recipes.publicationState
    })
    .from(recipes)
    .leftJoin(users, eq(users.id, recipes.authorId))
    .where(eq(recipes.id, clonedFromRecipeId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    authorId: row.authorId,
    authorName: row.authorDisplayName ?? null,
    isPublished: row.publicationState === "published"
  };
};

/**
 * Имя автора рецепта для деталки/JSON-LD (Recipe.author). Отдельный дешёвый
 * запрос по authorId — по паттерну {@link resolveRecipeCloneSource} выше: не
 * меняем форму `with: { ingredients: true }` во всех ensureX-выборках ради
 * одного поля.
 */
const resolveAuthorDisplayName = async (authorId: string): Promise<string | null> => {
  const [row] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, authorId))
    .limit(1);

  return row?.displayName ?? null;
};

// Статус партии, который считается «подтверждённой варкой» (4-й сигнал качества
// UGC-гейтинга индексации, isRecipeIndexable в ./seo.ts) — доведённая до конца
// варка, а не planned/brewing/fermenting/cancelled.
const COMPLETED_BREW_BATCH_STATUS = "completed" as const;

/**
 * Число подтверждённых варок одного рецепта (любым пользователем, не только
 * автором) — для деталки/JSON-LD, тот же паттерн, что и {@link resolveAuthorDisplayName}
 * выше: отдельный дешёвый запрос, не меняющий форму основной выборки.
 */
const resolveCompletedBrewCount = async (recipeId: string): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(brewBatches)
    .where(and(eq(brewBatches.recipeId, recipeId), eq(brewBatches.status, COMPLETED_BREW_BATCH_STATUS)))
    .limit(1);

  return row?.value ?? 0;
};

/**
 * Батч-версия {@link resolveCompletedBrewCount} для sitemap (`listRecipeSitemapEntries`):
 * один GROUP BY-запрос по всем кандидатам вместо N+1. recipeId у brew_batches
 * nullable (`ON DELETE SET NULL`), но inArray-фильтр гарантирует, что в
 * результате остаются только строки с recipeId из переданного списка.
 */
const resolveCompletedBrewCountsByRecipeId = async (recipeIds: string[]): Promise<Map<string, number>> => {
  if (recipeIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ recipeId: brewBatches.recipeId, completedCount: count() })
    .from(brewBatches)
    .where(and(inArray(brewBatches.recipeId, recipeIds), eq(brewBatches.status, COMPLETED_BREW_BATCH_STATUS)))
    .groupBy(brewBatches.recipeId);

  return new Map(
    rows
      .filter((row): row is { recipeId: string; completedCount: number } => row.recipeId != null)
      .map((row) => [row.recipeId, row.completedCount])
  );
};

const mapRecipeDetailDto = async (
  recipe: typeof recipes.$inferSelect,
  ingredients: Array<typeof recipeIngredients.$inferSelect>
) => {
  const calculationMeta = parseRecipeCalculationMeta(recipe.calculationMeta as Record<string, unknown> | null | undefined);

  return {
    ...mapRecipeListDto(recipe),
    description: recipe.description,
    authorNotes: recipe.authorNotes,
    authorDisplayName: await resolveAuthorDisplayName(recipe.authorId),
    processMeta: parseRecipeProcessMeta(recipe.processMeta as Record<string, unknown> | null | undefined),
    calculationMeta,
    fgEstimateMode: calculationMeta.fgEstimateMode ?? null,
    fgEstimateDetails: calculationMeta.fgEstimateDetails ?? null,
    draftState: (recipe.draftState as Record<string, unknown> | null | undefined) ?? null,
    importMeta: (recipe.importMeta as Record<string, unknown> | null | undefined) ?? null,
    equipmentProfileId: recipe.equipmentProfileId ?? null,
    equipmentProfileSnapshot: parseRecipeEquipmentProfileSnapshot(recipe.equipmentProfileSnapshot as Record<string, unknown> | null | undefined),
    waterPlanMeta: parseRecipeWaterPlanMeta(recipe.waterPlanMeta as Record<string, unknown> | null | undefined),
    brewPlanMeta: (recipe.brewPlanMeta as Record<string, unknown> | null | undefined) ?? null,
    heroImageId: recipe.heroImageId,
    rating:
      recipe.ratingCount > 0 && recipe.ratingAvg != null
        ? { average: roundTo(recipe.ratingAvg, 1), count: recipe.ratingCount }
        : null,
    versions: await listRecipeVersions(recipe.authorId, recipe.recipeFamilyId),
    clonedFrom: await resolveRecipeCloneSource(recipe.clonedFromRecipeId),
    completedBrewCount: await resolveCompletedBrewCount(recipe.id),
    ingredients: await Promise.all(sortRecipeIngredientsByDisplayOrder(ingredients).map((ingredient) => hydrateRecipeIngredientDto(recipe.authorId, ingredient)))
  };
};

const toRecipeIngredientInsert = (
  recipeId: string,
  ingredient: PreparedRecipeIngredientEntry,
  persistentKey = ingredient.persistentKey ?? crypto.randomUUID()
): typeof recipeIngredients.$inferInsert => ({
  recipeId,
  persistentKey,
  displayOrder: ingredient.displayOrder,
  ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
  userCustomIngredientId: ingredient.userCustomIngredientId,
  ingredientFamilyId: ingredient.source.familyId,
  ingredientCategory: ingredient.source.category,
  ingredientSubtype: ingredient.source.subtype,
  ingredientDisplayNameSnapshot: ingredient.source.displayName,
  ingredientDefaultDisplayUnitSnapshot: ingredient.source.defaultDisplayUnit,
  ingredientMeasurementDimension: ingredient.source.measurementDimension,
  type: ingredient.source.type,
  amountEnteredQuantity: ingredient.amount.enteredQuantity,
  amountEnteredUnit: ingredient.amount.enteredUnit,
  amountNormalizedQuantity: ingredient.amount.normalizedQuantity,
  amountNormalizedUnit: ingredient.amount.normalizedUnit,
  stage: ingredient.stage,
  timeOffset: ingredient.timeOffset,
  stepMeta: ingredient.stepMeta,
  inventoryIntentMode: ingredient.inventoryIntentMode,
  inventorySelectionMeta: ingredient.inventorySelectionMeta as Record<string, unknown> | null,
  externalImportMeta: ingredient.externalImportMeta
});

const syncRecipeIngredients = async (
  authorId: string,
  recipeId: string,
  payloadIngredients: Array<{
    persistentKey?: string | null;
    ingredientCatalogItemId?: string | null;
    userCustomIngredientId?: string | null;
    type?: typeof recipeIngredients.$inferInsert.type;
    category?: RecipeIngredientDto["ingredientCategory"];
    subtype?: string | null;
    familyId?: string | null;
    amountEnteredQuantity: number;
    amountEnteredUnit: string;
    stage: typeof recipeIngredients.$inferInsert.stage;
    timeOffset?: number | null;
    stepMeta?: Record<string, unknown> | null;
    inventoryIntentMode?: RecipeInventoryIntentMode | null;
    inventorySelectionMeta?: RecipeInventorySelectionMeta | null;
    externalImportMeta?: Record<string, unknown> | null;
  }>
) => {
  const existingIngredients = await db.query.recipeIngredients.findMany({
    where: eq(recipeIngredients.recipeId, recipeId)
  });
  const preparedIngredients = await prepareRecipeIngredientEntries(authorId, payloadIngredients);
  const existingByPersistentKey = new Map(existingIngredients.map((ingredient) => [ingredient.persistentKey, ingredient]));
  const retainedIds = new Set<string>();

  for (const ingredient of preparedIngredients) {
    const persistentKey = ingredient.persistentKey ?? crypto.randomUUID();
    const existing = existingByPersistentKey.get(persistentKey);
    const nextValue = toRecipeIngredientInsert(recipeId, ingredient, persistentKey);

    if (existing) {
      retainedIds.add(existing.id);
      await db.update(recipeIngredients).set({
        ...nextValue,
        updatedAt: new Date()
      }).where(and(
        eq(recipeIngredients.recipeId, recipeId),
        eq(recipeIngredients.id, existing.id)
      )).returning();
    } else {
      await db.insert(recipeIngredients).values(nextValue);
    }
  }

  for (const existing of existingIngredients) {
    if (!retainedIds.has(existing.id)) {
      await db.delete(recipeIngredients).where(and(
        eq(recipeIngredients.recipeId, recipeId),
        eq(recipeIngredients.id, existing.id)
      ));
    }
  }
};

const computeRecipeStatsSnapshot = (input: {
  batchSizeNormalizedQuantity: number;
  batchSizeNormalizedUnit: string;
  efficiency: number | null | undefined;
  boilTimeMinutes: number;
  processMeta?: RecipeProcessMeta | null;
  calculationMeta: RecipeCalculationMeta;
  equipmentProfileSnapshot?: EquipmentProfileSnapshot | null;
  ingredients: Array<{
    id: string;
    type: RecipeIngredientDto["type"];
    amountNormalizedQuantity: number;
    amountNormalizedUnit: string;
    stage: RecipeIngredientDto["stage"];
    timeOffset: number | null;
    stepMeta: Record<string, unknown> | null | undefined;
    source: {
      displayName: string;
      category: RecipeIngredientDto["ingredientCategory"];
      technicalData: IngredientSourceLinkage["technicalData"];
      raw: RecipeStatsSourceRaw;
    };
  }>;
}) => {
  const batchVolumeL = toBatchVolumeLiters(input.batchSizeNormalizedQuantity, input.batchSizeNormalizedUnit);
  const efficiency = input.efficiency ?? DEFAULT_EFFICIENCY;
  const fermentables: Array<{ id: string; name: string; weightKg: number; potentialPpg: number; colorLovibond: number; appliesBrewhouseEfficiency: boolean }> = [];
  const hops: HopAdditionInput[] = [];

  for (const ingredient of input.ingredients) {
    if (ingredient.type === "fermentable" || ingredient.type === "malt") {
      const weightKg = ingredient.amountNormalizedUnit === "g"
        ? roundTo(ingredient.amountNormalizedQuantity / 1000, 3)
        : 0;

      if (weightKg > 0) {
        fermentables.push({
          id: ingredient.id,
          name: ingredient.source.displayName,
          weightKg,
          potentialPpg: getIngredientPotentialPpg(ingredient.source.raw, 36),
          colorLovibond: getIngredientColorLovibond(ingredient.source.raw, 2),
          appliesBrewhouseEfficiency: fermentableAppliesMashEfficiency(
            ingredient.source.technicalData,
            ingredient.type === "malt"
          )
        });
      }
    }

    if (ingredient.type === "hop") {
      const weightG = ingredient.amountNormalizedUnit === "g" ? ingredient.amountNormalizedQuantity : 0;
      if (weightG <= 0) {
        continue;
      }

      const useType = resolveHopUseType(ingredient.stage, ingredient.stepMeta);
      const use = useType === "dry_hop"
        ? "dry_hop"
        : useType === "first_wort_hop"
          ? "first_wort_hop"
          : useType === "whirlpool" || useType === "dip_hop"
            ? useType
            : useType === "other"
              ? "other"
              : "boil";

      hops.push({
        id: ingredient.id,
        name: ingredient.source.displayName,
        alphaAcidPercent: getIngredientAlphaAcidPercent(ingredient.source.raw, 5),
        weightG,
        boilTimeMinutes: resolveHopTimeMinutes(ingredient, input.boilTimeMinutes),
        use,
        temperatureC: readNumberMeta(ingredient.stepMeta, "temperatureC")
      });
    }
  }

  if (!fermentables.length && !hops.length) {
    return {
      efficiency,
      og: null,
      fg: null,
      fgEstimateMode: "unavailable" as const,
      fgEstimateDetails: null,
      abv: null,
      ibu: null,
      bitternessFormula: input.calculationMeta.bitternessFormula,
      color: null
    };
  }

  const og = fermentables.length
    ? calculateOg({ fermentables, batchVolumeL, brewhouseEfficiencyPercent: efficiency })
    : null;
  const fgEstimate = calculateRecipeFgEstimate({
    og,
    fermentables: fermentables.map((fermentable, index) => ({
      name: fermentable.name,
      weightKg: fermentable.weightKg,
      potentialPpg: fermentable.potentialPpg,
      technicalData: input.ingredients.find((ingredient) => ingredient.id === fermentable.id)?.source.technicalData ?? null
    })),
    yeasts: input.ingredients
      .filter((ingredient) => ingredient.type === "yeast")
      .map((ingredient) => ({
        name: ingredient.source.displayName,
        technicalData: ingredient.source.technicalData ?? null
      })),
    processMeta: input.processMeta ?? null,
    calculationMeta: input.calculationMeta
  });
  const fg = fgEstimate.predictedFg;
  const abv = og && fg ? calculateAbv(og, fg) : null;
  const postBoilVolumeL = batchVolumeL;
  const fermentableGravityPoints = og ? (og - 1) * 1000 * postBoilVolumeL : null;
  const whirlpoolAdditions = hops.filter((hop) => hop.use === "whirlpool" || hop.use === "dip_hop");
  const whirlpoolTimeMinutes = whirlpoolAdditions.reduce((max, hop) => Math.max(max, hop.boilTimeMinutes), 0);
  const whirlpoolTemperatureC = whirlpoolAdditions.reduce<number | null>((current, hop) => (
    current ?? hop.temperatureC ?? null
  ), null);
  const bitternessSettings = input.calculationMeta.bitternessSettings ?? {};
  const ibu = hops.length && og
    ? calculateBitterness({
      formula: input.calculationMeta.bitternessFormula,
      og,
      batchVolumeL,
      boilTimeMinutes: input.boilTimeMinutes,
      hopAdditions: hops,
      preBoilVolumeL: null,
      postBoilVolumeL,
      fermentableGravityPoints,
      hopUtilizationFactor: 1,
      hopFormUtilizationFactor: bitternessSettings.hopFormUtilizationFactor ?? 1,
      whirlpoolUtilizationFactor: bitternessSettings.whirlpoolUtilizationFactor ?? 1,
      includeBoilCarryoverIntoWhirlpool: bitternessSettings.includeBoilCarryoverIntoWhirlpool ?? true,
      whirlpoolTimeMinutes,
      whirlpoolTemperatureC,
      firstWortHopMode: bitternessSettings.firstWortHopMode ?? "bonus_10pct",
      altitudeM: 0
    }).ibu
    : null;
  const color = fermentables.length ? calculateColor(fermentables, batchVolumeL).srm : null;

  return {
    efficiency,
    og,
    fg,
    fgEstimateMode: fgEstimate.fgEstimateMode,
    fgEstimateDetails: fgEstimate.fgEstimateDetails,
    abv,
    ibu,
    color,
    bitternessFormula: input.calculationMeta.bitternessFormula
  };
};

export const recomputeRecipeStats = async (authorId: string, recipeId: string) => {
  const recipe = await ensureOwnedRecipe(authorId, recipeId);
  const ingredients = await db.query.recipeIngredients.findMany({
    where: eq(recipeIngredients.recipeId, recipeId)
  });
  const hydratedIngredients = await Promise.all(ingredients.map(async (ingredient) => {
    let liveLinkage: IngredientSourceLinkage | null = null;
    let rawSource: RecipeStatsSourceRaw | null = null;

    if (ingredient.ingredientCatalogItemId) {
      const catalog = await ensureCatalogIngredientExists(ingredient.ingredientCatalogItemId);
      liveLinkage = buildCatalogIngredientLinkage(catalog);
      rawSource = catalog;
    } else if (ingredient.userCustomIngredientId) {
      const custom = await ensureOwnedCustomIngredient(authorId, ingredient.userCustomIngredientId);
      liveLinkage = buildCustomIngredientLinkage(custom);
      rawSource = custom;
    }

    const stepMetaLinkage = readRecipeIngredientLinkageMeta(ingredient.stepMeta as Record<string, unknown> | null);
    const resolvedSource = buildPersistedRecipeResolvedSource(ingredient, stepMetaLinkage, liveLinkage);
    const resolvedType = (
      resolveLegacyIngredientType({
        category: resolvedSource.category,
        subtype: resolvedSource.subtype
      })
      ?? resolvedSource.type
    ) as RecipeIngredientDto["type"];

    return {
      id: ingredient.id,
      type: resolvedType,
      amountNormalizedQuantity: ingredient.amountNormalizedQuantity,
      amountNormalizedUnit: ingredient.amountNormalizedUnit,
      stage: ingredient.stage,
      timeOffset: ingredient.timeOffset,
      stepMeta: ingredient.stepMeta as Record<string, unknown> | null,
      source: {
        displayName: resolvedSource.displayName ?? "Ingredient",
        category: resolvedSource.category,
        technicalData: resolvedSource.technicalData,
        raw: rawSource ?? buildRecipeStatsSourceRaw({
          type: resolvedSource.type,
          category: resolvedSource.category ?? resolveIngredientCategory({ type: resolvedType }),
          subtype: resolvedSource.subtype ?? null,
          familyId: resolvedSource.familyId ?? null,
          displayName: resolvedSource.displayName ?? "Ingredient",
          displayNameRu: resolvedSource.displayNameRu ?? null,
          displayNameEn: resolvedSource.displayNameEn ?? null,
          familyDisplayName: resolvedSource.familyDisplayName ?? null,
          summary: resolvedSource.summary ?? null,
          brand: resolvedSource.brand ?? null,
          producer: resolvedSource.producer ?? null,
          brandName: resolvedSource.brandName ?? null,
          manufacturer: resolvedSource.manufacturer ?? null,
          countryCode: resolvedSource.countryCode ?? null,
          countryName: resolvedSource.countryName ?? null,
          country: resolvedSource.country ?? null,
          defaultDisplayUnit: resolvedSource.defaultDisplayUnit ?? "g",
          allowedUnits: resolvedSource.allowedUnits ?? [resolvedSource.defaultDisplayUnit ?? "g"],
          measurementDimension: resolvedSource.measurementDimension ?? "weight",
          technicalData: resolvedSource.technicalData
        })
      }
    };
  }));

  const calculationMeta = parseRecipeCalculationMeta(
    recipe.calculationMeta as Record<string, unknown> | null | undefined,
    await getUserRecipeCalculationMeta(authorId)
  );
  const stats = computeRecipeStatsSnapshot({
    batchSizeNormalizedQuantity: recipe.batchSizeNormalizedQuantity,
    batchSizeNormalizedUnit: recipe.batchSizeNormalizedUnit,
    efficiency: recipe.efficiency,
    boilTimeMinutes: recipe.boilTimeMinutes ?? DEFAULT_BOIL_TIME_MINUTES,
    processMeta: parseRecipeProcessMeta(recipe.processMeta as Record<string, unknown> | null | undefined),
    calculationMeta,
    equipmentProfileSnapshot: parseRecipeEquipmentProfileSnapshot(recipe.equipmentProfileSnapshot as Record<string, unknown> | null | undefined),
    ingredients: hydratedIngredients.filter((ingredient): ingredient is NonNullable<typeof ingredient> => Boolean(ingredient))
  });
  const nextCalculationMeta = sanitizeRecipeCalculationMeta({
    ...calculationMeta,
    fgEstimateMode: stats.fgEstimateMode,
    fgEstimateDetails: stats.fgEstimateDetails
  });

  const [updated] = await db.update(recipes).set({
    efficiency: stats.efficiency,
    og: stats.og,
    fg: stats.fg,
    abv: stats.abv,
    ibu: stats.ibu,
    color: stats.color,
    calculationMeta: nextCalculationMeta,
    updatedAt: new Date()
  }).where(eq(recipes.id, recipeId)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapRecipeListDto(updated);
};

export const createRecipe = async (
  authorId: string,
  payload: unknown,
  options?: { recipeFamilyId?: string; versionNumber?: number; clonedFromRecipeId?: string | null }
) => {
  const parsed = createRecipePayloadSchema.parse(normalizeCreateRecipePayloadDefaults(payload));
  const preparedIngredients = await prepareRecipeIngredientEntries(authorId, parsed.ingredients);
  const nextProcessMeta = parseRecipeProcessMeta(parsed.processMeta ?? null);
  const nextCalculationMeta = parsed.calculationMeta != null
    ? parseRecipeCalculationMeta(parsed.calculationMeta)
    : null;
  const nextWaterPlanMeta = parsed.waterPlanMeta != null
    ? sanitizeRecipeWaterPlanMeta(parsed.waterPlanMeta as Record<string, unknown>)
    : null;
  validateRecipeForPublicationState({
    publicationState: parsed.publicationState,
    title: parsed.title,
    styleId: parsed.styleId ?? null,
    description: parsed.description ?? null,
    boilTimeMinutes: parsed.boilTimeMinutes,
    processMeta: nextProcessMeta as Record<string, unknown>,
    ingredients: preparedIngredients
  });
  const batchSize = normalizeRecipeBatchSize(parsed.batchSizeEnteredQuantity, parsed.batchSizeEnteredUnit);
  let [created] = [] as Array<typeof recipes.$inferSelect>;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = await resolveUniqueRecipeSlug(parsed.title);

    try {
      [created] = await db.insert(recipes).values({
        authorId,
        recipeFamilyId: options?.recipeFamilyId ?? crypto.randomUUID(),
        versionNumber: options?.versionNumber ?? 1,
        publicationState: parsed.publicationState,
        title: parsed.title,
        slug,
        styleId: parsed.styleId ?? null,
        batchSizeEnteredQuantity: batchSize.enteredQuantity,
        batchSizeEnteredUnit: batchSize.enteredUnit,
        batchSizeNormalizedQuantity: batchSize.normalizedQuantity,
        batchSizeNormalizedUnit: batchSize.normalizedUnit,
        efficiency: parsed.efficiency ?? null,
        boilTimeMinutes: parsed.boilTimeMinutes,
        description: parsed.description ?? null,
        authorNotes: parsed.authorNotes ?? null,
        processMeta: sanitizeRecipeProcessMeta(nextProcessMeta as Record<string, unknown>),
        calculationMeta: nextCalculationMeta ? sanitizeRecipeCalculationMeta(nextCalculationMeta as Record<string, unknown>) : null,
        draftState: parsed.draftState ?? null,
        importMeta: parsed.importMeta ?? null,
        equipmentProfileId: parsed.equipmentProfileId ?? null,
        equipmentProfileSnapshot: (parsed.equipmentProfileSnapshot as Record<string, unknown> | null | undefined) ?? null,
        waterPlanMeta: nextWaterPlanMeta,
        brewPlanMeta: parsed.brewPlanMeta ?? null,
        heroImageId: parsed.heroImageId ?? null,
        clonedFromRecipeId: options?.clonedFromRecipeId ?? null
      }).returning();
      break;
    } catch (error) {
      if (!isSlugUniqueConstraintError(error) || attempt === 4) {
        throw error;
      }
    }
  }

  if (!created) {
    throw new Error("CREATE_FAILED");
  }

  await syncRecipeIngredients(authorId, created.id, parsed.ingredients);
  await recomputeRecipeStats(authorId, created.id);

  return getRecipeById(authorId, created.id);
};

export const updateRecipe = async (authorId: string, recipeId: string, payload: unknown) => {
  const parsed = updateRecipePayloadSchema.parse(normalizeUpdateRecipePayloadDefaults(payload));
  const current = await ensureOwnedRecipe(authorId, recipeId);
  const nextIngredientsPayload = parsed.ingredients ?? (await getOwnedRecipeById(authorId, recipeId)).ingredients.map((ingredient) => ({
    persistentKey: ingredient.persistentKey,
    ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
    userCustomIngredientId: ingredient.userCustomIngredientId,
    type: ingredient.type,
    category: ingredient.ingredientCategory ?? undefined,
    subtype: ingredient.ingredientSubtype ?? null,
    familyId: ingredient.ingredientFamilyId ?? null,
    amountEnteredQuantity: ingredient.amountEnteredQuantity,
    amountEnteredUnit: ingredient.amountEnteredUnit,
    stage: ingredient.stage,
    timeOffset: ingredient.timeOffset,
    stepMeta: ingredient.stepMeta,
    inventoryIntentMode: ingredient.inventoryIntentMode ?? null,
    inventorySelectionMeta: ingredient.inventorySelectionMeta ?? null,
    externalImportMeta: ingredient.externalImportMeta ?? null
  }));
  const preparedIngredients = await prepareRecipeIngredientEntries(authorId, nextIngredientsPayload);

  const batchSize = parsed.batchSizeEnteredQuantity !== undefined || parsed.batchSizeEnteredUnit !== undefined
    ? normalizeRecipeBatchSize(
      parsed.batchSizeEnteredQuantity ?? current.batchSizeEnteredQuantity,
      parsed.batchSizeEnteredUnit ?? current.batchSizeEnteredUnit
    )
    : null;

  const nextTitle = parsed.title ?? current.title;
  const nextProcessMeta = parsed.processMeta !== undefined
    ? parseRecipeProcessMeta(parsed.processMeta ?? null)
    : parseRecipeProcessMeta(current.processMeta as Record<string, unknown> | null | undefined);
  const nextCalculationMeta = parsed.calculationMeta !== undefined
    ? parsed.calculationMeta == null ? null : parseRecipeCalculationMeta(parsed.calculationMeta)
    : parseRecipeCalculationMeta(current.calculationMeta as Record<string, unknown> | null | undefined, await getUserRecipeCalculationMeta(authorId));
  validateRecipeForPublicationState({
    publicationState: parsed.publicationState ?? current.publicationState,
    title: nextTitle,
    styleId: parsed.styleId !== undefined ? parsed.styleId : current.styleId,
    description: parsed.description !== undefined ? parsed.description : current.description,
    boilTimeMinutes: parsed.boilTimeMinutes ?? current.boilTimeMinutes,
    processMeta: nextProcessMeta as Record<string, unknown>,
    ingredients: preparedIngredients
  });
  // URL опубликованного рецепта канонический — смена названия не меняет slug
  // (история слагов/redirect на переименование — отдельная задача). Для
  // draft/private рецепт ещё не проиндексирован, слаг подстраивается под
  // название, как раньше.
  const shouldRecomputeSlug = parsed.title !== undefined && current.publicationState !== "published";

  let [updated] = [] as Array<typeof recipes.$inferSelect>;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = shouldRecomputeSlug ? await resolveUniqueRecipeSlug(nextTitle, recipeId) : current.slug;

    try {
      [updated] = await db.update(recipes).set({
        publicationState: parsed.publicationState ?? current.publicationState,
        title: nextTitle,
        slug,
        styleId: parsed.styleId !== undefined ? parsed.styleId : current.styleId,
        batchSizeEnteredQuantity: batchSize?.enteredQuantity ?? current.batchSizeEnteredQuantity,
        batchSizeEnteredUnit: batchSize?.enteredUnit ?? current.batchSizeEnteredUnit,
        batchSizeNormalizedQuantity: batchSize?.normalizedQuantity ?? current.batchSizeNormalizedQuantity,
        batchSizeNormalizedUnit: batchSize?.normalizedUnit ?? current.batchSizeNormalizedUnit,
        efficiency: parsed.efficiency !== undefined ? parsed.efficiency : current.efficiency,
        boilTimeMinutes: parsed.boilTimeMinutes ?? current.boilTimeMinutes,
        description: parsed.description !== undefined ? parsed.description : current.description,
        authorNotes: parsed.authorNotes !== undefined ? parsed.authorNotes : current.authorNotes,
        processMeta: parsed.processMeta !== undefined
          ? sanitizeRecipeProcessMeta(nextProcessMeta as Record<string, unknown>)
          : current.processMeta,
        calculationMeta: parsed.calculationMeta !== undefined
          ? nextCalculationMeta == null ? null : sanitizeRecipeCalculationMeta(nextCalculationMeta as Record<string, unknown>)
          : current.calculationMeta,
        draftState: parsed.draftState !== undefined ? parsed.draftState : current.draftState,
        importMeta: parsed.importMeta !== undefined ? parsed.importMeta : current.importMeta,
        equipmentProfileId: parsed.equipmentProfileId !== undefined ? parsed.equipmentProfileId : current.equipmentProfileId,
        equipmentProfileSnapshot: parsed.equipmentProfileSnapshot !== undefined
          ? parsed.equipmentProfileSnapshot as Record<string, unknown> | null
          : current.equipmentProfileSnapshot,
        waterPlanMeta: parsed.waterPlanMeta !== undefined
          ? parsed.waterPlanMeta == null ? null : sanitizeRecipeWaterPlanMeta(parsed.waterPlanMeta as Record<string, unknown>)
          : current.waterPlanMeta,
        brewPlanMeta: parsed.brewPlanMeta !== undefined ? parsed.brewPlanMeta : current.brewPlanMeta,
        heroImageId: parsed.heroImageId !== undefined ? parsed.heroImageId : current.heroImageId,
        updatedAt: new Date()
      }).where(eq(recipes.id, recipeId)).returning();
      break;
    } catch (error) {
      if (!isSlugUniqueConstraintError(error) || attempt === 4) {
        throw error;
      }
    }
  }

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  if (parsed.ingredients) {
    await syncRecipeIngredients(authorId, recipeId, parsed.ingredients);
  }

  if (parsed.recomputeStats) {
    await recomputeRecipeStats(authorId, recipeId);
  }

  return getRecipeById(authorId, recipeId);
};

export const deleteRecipe = async (authorId: string, recipeId: string) => {
  const recipe = await ensureOwnedRecipe(authorId, recipeId);
  await db.delete(recipes).where(eq(recipes.id, recipeId));
  return recipe;
};

/**
 * Строит payload одного ингредиента для клона. По умолчанию переносит связку как
 * есть (каталог/кастом/imported). При `remapPrivateCustomToImported` строки с
 * приватным кастомом ЧУЖОГО автора преобразуются в imported-снимок: перенести их
 * по FK нельзя (`ensureOwnedCustomIngredient` упадёт, а `recipe_ingredients_
 * source_linkage_chk` запрещает чужой userCustomIngredientId), поэтому сохраняем
 * имя/единицы/тех-данные снимком — рецепт остаётся валидным у нового владельца.
 * Каталожные (глобальные) и уже-imported ингредиенты переносятся без изменений.
 */
const buildRecipeCloneIngredientPayload = (
  ingredient: RecipeIngredientDto,
  options: { remapPrivateCustomToImported: boolean }
) => {
  if (options.remapPrivateCustomToImported && ingredient.userCustomIngredientId) {
    const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
    const importedIngredient: RecipeImportedIngredientSnapshot = {
      version: 1,
      source: "cloned-recipe",
      name: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? "Ингредиент",
      type: ingredient.type,
      category,
      subtype: ingredient.ingredientSubtype ?? null,
      defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.ingredientDefaultDisplayUnitSnapshot ?? null,
      allowedUnits: ingredient.ingredientAllowedUnits ?? null,
      measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? null,
      technicalData: ingredient.ingredientTechnicalData ?? null
    };

    return {
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      type: ingredient.type,
      category,
      subtype: ingredient.ingredientSubtype ?? null,
      amountEnteredQuantity: ingredient.amountEnteredQuantity,
      amountEnteredUnit: ingredient.amountEnteredUnit,
      stage: ingredient.stage,
      timeOffset: ingredient.timeOffset,
      stepMeta: ingredient.stepMeta,
      inventoryIntentMode: "imported" as const,
      externalImportMeta: { source: "cloned-recipe", importedIngredient }
    };
  }

  return {
    ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
    userCustomIngredientId: ingredient.userCustomIngredientId,
    type: ingredient.type,
    category: ingredient.ingredientCategory ?? undefined,
    subtype: ingredient.ingredientSubtype ?? null,
    familyId: ingredient.ingredientFamilyId ?? null,
    amountEnteredQuantity: ingredient.amountEnteredQuantity,
    amountEnteredUnit: ingredient.amountEnteredUnit,
    stage: ingredient.stage,
    timeOffset: ingredient.timeOffset,
    stepMeta: ingredient.stepMeta,
    inventoryIntentMode: ingredient.inventoryIntentMode ?? null,
    inventorySelectionMeta: ingredient.inventorySelectionMeta ?? null,
    externalImportMeta: ingredient.externalImportMeta ?? null
  };
};

/**
 * Пур-правило авторизации клона. Свой рецепт можно клонировать в любом статусе;
 * чужой — только если он published. Бросает FORBIDDEN иначе. Возвращает isOwn,
 * чтобы вызывающий выбрал загрузчик и режим ремапа кастомов.
 */
export const assertRecipeCloneAllowed = (input: {
  sourceAuthorId: string;
  sourcePublicationState: RecipePublicationState;
  userId: string;
}): { isOwn: boolean } => {
  const isOwn = input.sourceAuthorId === input.userId;
  if (!isOwn && input.sourcePublicationState !== "published") {
    throw new Error("FORBIDDEN");
  }
  return { isOwn };
};

const RECIPE_TITLE_MAX_LENGTH = 180;

/**
 * Имя клонирующего для суффикса названия копии: displayName, иначе локальная часть
 * email, иначе «копия». Берётся по userId (а не по автору источника).
 */
const resolveCloneAuthorLabel = async (userId: string): Promise<string> => {
  const author = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { displayName: true, email: true }
  });
  const displayName = author?.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  const emailLocal = author?.email?.split("@")[0]?.trim();
  return emailLocal || "копия";
};

/**
 * Название клона: исходное название + суффикс «(клон {имя клонирующего})».
 * Если вместе с суффиксом не влезает в varchar(180) — подрезаем базовую часть,
 * суффикс всегда сохраняется целиком.
 */
export const buildCloneTitle = (baseTitle: string, authorLabel: string): string => {
  const base = baseTitle.trim();
  const suffix = ` (клон ${authorLabel})`;
  const room = Math.max(0, RECIPE_TITLE_MAX_LENGTH - suffix.length);
  const trimmedBase = base.length > room ? base.slice(0, room).trimEnd() : base;
  return `${trimmedBase}${suffix}`;
};

/** Общий билдер payload для клона: копия как ЧЕРНОВИК (private), полные данные. */
export const buildRecipeClonePayload = (
  recipe: RecipeDetailDto,
  options: { title: string; remapPrivateCustomToImported: boolean }
) => ({
  title: options.title,
  publicationState: "private" as const,
  styleId: recipe.styleId,
  batchSizeEnteredQuantity: recipe.batchSizeEnteredQuantity,
  batchSizeEnteredUnit: recipe.batchSizeEnteredUnit,
  efficiency: recipe.efficiency,
  boilTimeMinutes: recipe.boilTimeMinutes,
  description: recipe.description,
  authorNotes: recipe.authorNotes,
  processMeta: recipe.processMeta,
  calculationMeta: recipe.calculationMeta ?? null,
  equipmentProfileId: recipe.equipmentProfileId ?? null,
  equipmentProfileSnapshot: recipe.equipmentProfileSnapshot ?? null,
  waterPlanMeta: recipe.waterPlanMeta ?? null,
  ingredients: recipe.ingredients.map((ingredient) =>
    buildRecipeCloneIngredientPayload(ingredient, {
      remapPrivateCustomToImported: options.remapPrivateCustomToImported
    })
  )
});

/**
 * Дубликат СВОЕГО рецепта (любой статус) → новый черновик-копия в моём владении.
 * Новый recipeFamilyId (не версия). Связь clonedFrom не ставится (это свой рецепт).
 */
export const cloneRecipe = async (authorId: string, recipeId: string) => {
  const recipe = await getOwnedRecipeById(authorId, recipeId);
  const authorLabel = await resolveCloneAuthorLabel(authorId);

  return createRecipe(
    authorId,
    buildRecipeClonePayload(recipe, {
      title: buildCloneTitle(recipe.title, authorLabel),
      remapPrivateCustomToImported: false
    })
  );
};

/**
 * Точечная поддержка «клонировать в другом объёме» (этап 6b, #6). Если передан
 * валидный targetBatchVolumeLitres — отдаёт эфемерно пересчитанную (scaleRecipeToVolume,
 * чистая функция) копию рецепта: батч и количества ингредиентов, сопоставленные по
 * persistentKey. Ничего не пишет в БД сама — только готовит вход для buildRecipeClonePayload.
 * Без параметра или при factor=1 — рецепт без изменений (клон в исходном объёме).
 */
const applyCloneTargetVolume = (
  recipe: RecipeDetailDto,
  targetBatchVolumeLitres: number | null | undefined
): RecipeDetailDto => {
  if (targetBatchVolumeLitres == null || !Number.isFinite(targetBatchVolumeLitres) || targetBatchVolumeLitres <= 0) {
    return recipe;
  }

  const scaled = scaleRecipeToVolume(recipe, targetBatchVolumeLitres);
  if (!scaled.scaled) {
    return recipe;
  }

  const scaledByKey = new Map(scaled.ingredients.map((item) => [item.persistentKey, item]));
  return {
    ...recipe,
    batchSizeEnteredQuantity: scaled.batchSizeEnteredQuantity,
    ingredients: recipe.ingredients.map((ingredient) => {
      const scaledIngredient = scaledByKey.get(ingredient.persistentKey);
      return scaledIngredient
        ? { ...ingredient, amountEnteredQuantity: scaledIngredient.amountEnteredQuantity }
        : ingredient;
    })
  };
};

/**
 * Мост «сохранённое/публичное → мои рецепты»: клонирует ЧУЖОЙ published-рецепт
 * (или свой в любом статусе) в новый ЧЕРНОВИК (private) во владении пользователя.
 * Проставляет clonedFromRecipeId для атрибуции. Гард: чужой можно клонировать
 * только если он published. userId приходит из серверной сессии — не из клиента.
 * targetBatchVolumeLitres — опциональный целевой объём (см. applyCloneTargetVolume):
 * мост с эфемерным пересчётом на публичной странице (`RecipeScalePanel`) — клон
 * сразу заводится в объёме, который пользователь выбрал для предпросмотра.
 */
export const cloneRecipeFromPublic = async (
  userId: string,
  sourceRecipeId: string,
  options?: { targetBatchVolumeLitres?: number | null }
): Promise<RecipeDetailDto> => {
  const guard = await db.query.recipes.findFirst({
    where: eq(recipes.id, sourceRecipeId),
    columns: { authorId: true, publicationState: true }
  });

  if (!guard) {
    throw new Error("NOT_FOUND");
  }

  const { isOwn } = assertRecipeCloneAllowed({
    sourceAuthorId: guard.authorId,
    sourcePublicationState: guard.publicationState,
    userId
  });

  const source = isOwn
    ? await getOwnedRecipeById(userId, sourceRecipeId)
    : await getPublicRecipeById(sourceRecipeId);
  const authorLabel = await resolveCloneAuthorLabel(userId);
  const scaledSource = applyCloneTargetVolume(source, options?.targetBatchVolumeLitres);

  return createRecipe(
    userId,
    buildRecipeClonePayload(scaledSource, {
      title: buildCloneTitle(source.title, authorLabel),
      remapPrivateCustomToImported: !isOwn
    }),
    { clonedFromRecipeId: sourceRecipeId }
  );
};

export const createRecipeVersion = async (authorId: string, recipeId: string) => {
  const currentRecipe = await ensureOwnedRecipe(authorId, recipeId);
  const recipe = await getOwnedRecipeById(authorId, recipeId);
  const familyVersions = await db.query.recipes.findMany({
    where: and(eq(recipes.authorId, authorId), eq(recipes.recipeFamilyId, currentRecipe.recipeFamilyId))
  });
  const nextVersionNumber = familyVersions.reduce((maxVersion, item) => (
    item.versionNumber > maxVersion ? item.versionNumber : maxVersion
  ), 0) + 1;

  return createRecipe(authorId, {
    title: recipe.title,
    publicationState: "private",
    styleId: recipe.styleId,
    batchSizeEnteredQuantity: recipe.batchSizeEnteredQuantity,
    batchSizeEnteredUnit: recipe.batchSizeEnteredUnit,
    efficiency: recipe.efficiency,
    boilTimeMinutes: recipe.boilTimeMinutes,
    description: recipe.description,
    authorNotes: recipe.authorNotes,
    processMeta: recipe.processMeta,
    calculationMeta: recipe.calculationMeta ?? null,
    equipmentProfileId: recipe.equipmentProfileId ?? null,
    equipmentProfileSnapshot: recipe.equipmentProfileSnapshot ?? null,
    waterPlanMeta: recipe.waterPlanMeta ?? null,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
      userCustomIngredientId: ingredient.userCustomIngredientId,
      type: ingredient.type,
      category: ingredient.ingredientCategory ?? undefined,
      subtype: ingredient.ingredientSubtype ?? null,
      familyId: ingredient.ingredientFamilyId ?? null,
      amountEnteredQuantity: ingredient.amountEnteredQuantity,
      amountEnteredUnit: ingredient.amountEnteredUnit,
      stage: ingredient.stage,
      timeOffset: ingredient.timeOffset,
      stepMeta: ingredient.stepMeta,
      inventoryIntentMode: ingredient.inventoryIntentMode ?? null,
      inventorySelectionMeta: ingredient.inventorySelectionMeta ?? null,
      externalImportMeta: ingredient.externalImportMeta ?? null
    }))
  }, {
    recipeFamilyId: currentRecipe.recipeFamilyId,
    versionNumber: nextVersionNumber
  });
};

export const setRecipeIngredients = async (authorId: string, recipeId: string, ingredientsPayload: unknown) => {
  const parsed = createRecipePayloadSchema.shape.ingredients.parse(ingredientsPayload);
  await ensureOwnedRecipe(authorId, recipeId);
  await syncRecipeIngredients(authorId, recipeId, parsed);
  await recomputeRecipeStats(authorId, recipeId);

  return getRecipeById(authorId, recipeId);
};

/** Число рецептов автора (все версии) одним индексным count — для статистики
 *  дашборда без загрузки строк/версий. Совпадает с числом карточек в галерее
 *  `/app/recipes` (она тоже показывает по карточке на версию). */
export const countRecipesForAuthor = async (authorId: string): Promise<number> => {
  const [row] = await db.select({ value: count() }).from(recipes).where(eq(recipes.authorId, authorId));
  return row?.value ?? 0;
};

export const listRecipesForAuthor = async (authorId: string, query: unknown = {}): Promise<RecipeListItemDto[]> => {
  const parsed = listAuthorRecipesQuerySchema.parse(query);

  const rows = await db.query.recipes.findMany({
    where: and(
      eq(recipes.authorId, authorId),
      parsed.publicationState ? eq(recipes.publicationState, parsed.publicationState as RecipePublicationState) : undefined
    ),
    orderBy: [desc(recipes.updatedAt)],
    limit: parsed.limit
  });

  // Получаем количество версий для каждого рецепта
  const recipeFamilyIds = [...new Set(rows.map(row => row.recipeFamilyId))];
  const versionCounts = new Map<string, number>();

  for (const familyId of recipeFamilyIds) {
    const countResult = await db.select({ count: count() })
      .from(recipes)
      .where(and(eq(recipes.authorId, authorId), eq(recipes.recipeFamilyId, familyId)));
    
    versionCounts.set(familyId, countResult[0]?.count ?? 1);
  }

  return rows.map(row => ({
    ...mapRecipeListDto(row),
    versionCount: versionCounts.get(row.recipeFamilyId) ?? 1
  }));
};

/**
 * Карточки рецептов владельца для галереи `/app/recipes` ({@link OwnerRecipeCardDto}).
 * В отличие от {@link listRecipesForAuthor}, тянет hero-фото (join `recipeImages`) и
 * разрешает на сервере обложку (фото → картинка BJCP-стиля → заливка по SRM),
 * стиль и итог style-fit — тем же способом, что публичная витрина, чтобы карточки
 * рабочей зоны выглядели как `/recipes`. Версии считаются одним сгруппированным
 * запросом (без N+1).
 */
export const listAuthorRecipeCards = async (authorId: string): Promise<OwnerRecipeCardDto[]> => {
  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      styleId: recipes.styleId,
      recipeFamilyId: recipes.recipeFamilyId,
      versionNumber: recipes.versionNumber,
      publicationState: recipes.publicationState,
      og: recipes.og,
      fg: recipes.fg,
      abv: recipes.abv,
      ibu: recipes.ibu,
      color: recipes.color,
      updatedAt: recipes.updatedAt,
      heroImageId: recipes.heroImageId,
      heroThumbKey: recipeImages.storageKeyThumb,
      heroBlurDataUrl: recipeImages.blurDataUrl
    })
    .from(recipes)
    .leftJoin(recipeImages, eq(recipeImages.id, recipes.heroImageId))
    .where(eq(recipes.authorId, authorId))
    .orderBy(desc(recipes.updatedAt));

  // Число версий по семейству (для бейджа vN) — один сгруппированный запрос.
  const familyIds = [...new Set(rows.map((row) => row.recipeFamilyId))];
  const versionCounts = new Map<string, number>();
  if (familyIds.length > 0) {
    const counts = await db
      .select({ familyId: recipes.recipeFamilyId, value: count() })
      .from(recipes)
      .where(and(eq(recipes.authorId, authorId), inArray(recipes.recipeFamilyId, familyIds)))
      .groupBy(recipes.recipeFamilyId);
    for (const entry of counts) {
      versionCounts.set(entry.familyId, entry.value);
    }
  }

  // Карта фото BJCP-стилей (как на `/bjcp`) — дешёвый кешированный lookup, не N+1.
  const styleHeroImageByBjcpId = await getBjcpStyleHeroImageByBjcpId();

  return rows.map((row) => {
    const style = getBeerStyleById(row.styleId);
    const heroImage =
      row.heroImageId && row.heroThumbKey
        ? { thumbUrl: `/api/recipe-images/${row.heroImageId}/thumb`, blurDataUrl: row.heroBlurDataUrl ?? null }
        : null;
    // Фото BJCP-стиля показываем только когда у рецепта нет своего фото.
    const styleImageUrl = !heroImage && style ? styleHeroImageByBjcpId.get(style.bjcpId) ?? null : null;

    const styleRange = getStyleRangeById(row.styleId);
    const fit =
      styleRange && row.og != null && row.fg != null && row.abv != null && row.ibu != null && row.color != null
        ? evaluateStyleFit(styleRange, { og: row.og, fg: row.fg, abv: row.abv, ibu: row.ibu, srm: row.color })
        : null;

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      publicationState: row.publicationState,
      versionNumber: row.versionNumber,
      versionCount: versionCounts.get(row.recipeFamilyId) ?? 1,
      updatedAt: row.updatedAt,
      styleName: style ? style.nameRu ?? style.name : null,
      styleCode: style ? style.bjcpId : null,
      styleHref: getBjcpArticleHrefByStyleId(row.styleId),
      og: row.og,
      abv: row.abv,
      ibu: row.ibu,
      colorSrm: row.color,
      heroImage,
      styleImageUrl,
      styleFit: fit ? (fit.overallFit ? "in_style" : "deviations") : null
    } satisfies OwnerRecipeCardDto;
  });
};

export const getNextDefaultRecipeTitle = async (authorId: string) => {
  const rows = await db.query.recipes.findMany({
    where: eq(recipes.authorId, authorId)
  });
  const pattern = new RegExp(`^${DEFAULT_NEW_RECIPE_TITLE_PREFIX} (\\d+)$`);
  const maxSuffix = rows.reduce((max, recipe) => {
    const match = recipe.title.trim().match(pattern);
    if (!match) {
      return max;
    }

    const suffix = Number(match[1]);
    return Number.isInteger(suffix) && suffix > max ? suffix : max;
  }, 0);

  return `${DEFAULT_NEW_RECIPE_TITLE_PREFIX} ${maxSuffix + 1}`;
};

export const getRecipeById = async (viewerId: string | null, recipeId: string): Promise<RecipeDetailDto> => {
  const recipe = await ensureAccessibleRecipe(viewerId, recipeId);
  return await mapRecipeDetailDto(recipe, recipe.ingredients);
};

export const getOwnedRecipeById = async (authorId: string, recipeId: string): Promise<RecipeDetailDto> => {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.authorId, authorId)),
    with: {
      ingredients: true
    }
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  return await mapRecipeDetailDto(recipe, recipe.ingredients);
};

export const getPublicRecipeById = async (recipeId: string): Promise<RecipeDetailDto> => {
  const recipe = await ensurePublicRecipe(recipeId);
  return await mapRecipeDetailDto(recipe, recipe.ingredients);
};

export const getPublicRecipeBySlug = async (slug: string): Promise<RecipeDetailDto> => {
  const recipe = await ensurePublicRecipeBySlug(slug);
  return await mapRecipeDetailDto(recipe, recipe.ingredients);
};

const publicRecipeSortColumns = {
  updatedAt: recipes.updatedAt,
  abv: recipes.abv,
  ibu: recipes.ibu,
  color: recipes.color,
  title: recipes.title,
  // Сортировка «По рейтингу» идёт по байесовскому скору, а не по голому среднему
  // (см. rating-score.ts). Наружу по-прежнему отдаём ratingAvg.
  rating: recipes.ratingBayes,
  saveCount: recipes.saveCount
} satisfies Record<PublicRecipeSortKey, unknown>;

type PublicRecipeRow = {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  styleId: string | null;
  og: number | null;
  fg: number | null;
  abv: number | null;
  ibu: number | null;
  color: number | null;
  batchSizeNormalizedQuantity: number;
  batchSizeNormalizedUnit: string;
  updatedAt: Date;
  createdAt: Date;
  heroImageId: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  saveCount: number;
  featuredAt: Date | null;
  authorDisplayName: string | null;
  authorImage: string | null;
  heroThumbKey: string | null;
  heroBlurDataUrl: string | null;
};

const mapPublicRecipeListItem = (
  row: PublicRecipeRow,
  styleHeroImageByBjcpId: Map<string, string>
): PublicRecipeListItem => {
  const style = getBeerStyleById(row.styleId);
  const colorSrm = row.color;
  const heroImage =
    row.heroImageId && row.heroThumbKey
      ? { thumbUrl: `/api/recipe-images/${row.heroImageId}/thumb`, blurDataUrl: row.heroBlurDataUrl ?? null }
      : null;
  // Фото BJCP-стиля показываем только когда у рецепта нет своего фото.
  const styleImageUrl = !heroImage && style ? styleHeroImageByBjcpId.get(style.bjcpId) ?? null : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    author: {
      id: row.authorId,
      displayName: row.authorDisplayName ?? null,
      image: row.authorImage ?? null
    },
    style: style ? { code: style.bjcpId, name: style.nameRu ?? style.name } : null,
    styleHref: getBjcpArticleHrefByStyleId(row.styleId),
    og: row.og,
    fg: row.fg,
    abv: row.abv,
    ibu: row.ibu,
    colorSrm,
    colorEbc: colorSrm == null ? null : roundTo(srmToEbc(colorSrm), 0),
    batchSizeL: row.batchSizeNormalizedUnit === "ml" ? roundTo(row.batchSizeNormalizedQuantity / 1000, 2) : null,
    method: null, // не персистится на рецепте (Phase A)
    heroImage,
    styleImageUrl,
    cloneCount: 0, // клоны не трекаются (Phase A)
    // Нет оценок → null. Бейдж «Новый» в карточке теперь решается по createdAt
    // (окно NEW_RECIPE_WINDOW_DAYS), а не по отсутствию рейтинга.
    rating:
      row.ratingCount > 0 && row.ratingAvg != null
        ? { average: roundTo(row.ratingAvg, 1), count: row.ratingCount }
        : null,
    featured: row.featuredAt != null,
    saveCount: row.saveCount,
    publishedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  };
};

/**
 * Публичная витрина `/recipes`: фильтрация/сортировка/пагинация целиком в SQL
 * (Drizzle), без N+1 (автор и hero-image — join-ами, стиль — из статических
 * фикстур). Возвращает только `published`-рецепты.
 */
/**
 * Число опубликованных рецептов в каждом семействе BJCP (`familyId -> count`).
 * Семейства без рецептов в карту НЕ попадают — фильтр прячет пустые табы.
 * Один `GROUP BY styleId` + маппинг через {@link resolveFamilyStyleScopes}
 * (тот же резолвинг, что и в фильтре), без изменения URL/SQL-контракта витрины.
 */
export const getPublicRecipeFamilyCounts = async (): Promise<Record<string, number>> => {
  const rows = await db
    .select({ styleId: recipes.styleId, value: count() })
    .from(recipes)
    .where(eq(recipes.publicationState, "published"))
    .groupBy(recipes.styleId);

  const countByStyleId = new Map<string, number>();
  for (const row of rows) {
    if (row.styleId) {
      countByStyleId.set(row.styleId, Number(row.value));
    }
  }

  const familyScopes = await resolveFamilyStyleScopes();
  const counts: Record<string, number> = {};
  for (const [familyId, styleIds] of familyScopes) {
    let total = 0;
    for (const styleId of styleIds) {
      total += countByStyleId.get(styleId) ?? 0;
    }
    if (total > 0) {
      counts[familyId] = total;
    }
  }

  return counts;
};

/**
 * Сколько опубликованных рецептов реально оценено / сохранено — для
 * count-conditional показа опций сортировки «По рейтингу» / «Популярные» в
 * тулбаре витрины (на холодном старте пустые сорты не выставляем). URL-контракт
 * при этом не трогаем: `?sort=rating|popular` валиден всегда (прямые ссылки со
 * страниц стилей). Один дешёвый агрегатный запрос без сканирования строк наружу.
 */
export const getPublicRecipeSortAvailability = async (): Promise<PublicRecipeSortAvailability> => {
  const [row] = await db
    .select({
      ratedRecipes: sql<number>`count(*) filter (where ${recipes.ratingCount} > 0)`,
      savedRecipes: sql<number>`count(*) filter (where ${recipes.saveCount} > 0)`
    })
    .from(recipes)
    .where(eq(recipes.publicationState, "published"));

  return {
    ratedRecipes: Number(row?.ratedRecipes ?? 0),
    savedRecipes: Number(row?.savedRecipes ?? 0)
  };
};

/**
 * Для sitemap (см. app/sitemap.ts): только `published`-рецепты, прошедшие тот
 * же порог качества, что и noindex на детальной странице (S1, §12
 * SEO-плейбука) — критерий берём из {@link isRecipeIndexable}, чтобы не
 * заводить второй набор магических чисел. Клоны без существенных правок (S2,
 * см. {@link isUnmodifiedClone}) тоже не попадают — их канонический URL уже
 * представлен записью источника.
 *
 * Источник резолвится отдельным батч-запросом (а не self-join), чтобы не
 * тащить в этот файл `alias()` ради одной выборки для sitemap.
 */
export const listRecipeSitemapEntries = async (): Promise<Array<{ slug: string; updatedAt: Date }>> => {
  const candidates = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      updatedAt: recipes.updatedAt,
      title: recipes.title,
      description: recipes.description,
      heroImageId: recipes.heroImageId,
      ratingCount: recipes.ratingCount,
      clonedFromRecipeId: recipes.clonedFromRecipeId
    })
    .from(recipes)
    .where(eq(recipes.publicationState, "published"));

  // 4-й сигнал качества (подтверждённые варки) — один батч-запрос GROUP BY по
  // всем кандидатам сразу, без N+1 (см. resolveCompletedBrewCountsByRecipeId выше).
  const completedBrewCountByRecipeId = await resolveCompletedBrewCountsByRecipeId(
    candidates.map((candidate) => candidate.id)
  );

  const cloneSourceIds = [...new Set(
    candidates
      .map((candidate) => candidate.clonedFromRecipeId)
      .filter((id): id is string => id != null)
  )];

  const cloneSources = cloneSourceIds.length > 0
    ? await db
        .select({
          id: recipes.id,
          title: recipes.title,
          publicationState: recipes.publicationState
        })
        .from(recipes)
        .where(inArray(recipes.id, cloneSourceIds))
    : [];
  const cloneSourceById = new Map(cloneSources.map((source) => [source.id, source]));

  return candidates
    .filter((candidate) => {
      if (!isRecipeIndexable({
        description: candidate.description,
        heroImageId: candidate.heroImageId,
        ratingCount: candidate.ratingCount,
        completedBrewCount: completedBrewCountByRecipeId.get(candidate.id) ?? 0
      })) {
        return false;
      }

      const source = candidate.clonedFromRecipeId ? cloneSourceById.get(candidate.clonedFromRecipeId) : null;
      if (source && isUnmodifiedClone({
        cloneTitle: candidate.title,
        sourceTitle: source.title,
        sourceIsPublished: source.publicationState === "published"
      })) {
        return false;
      }

      return true;
    })
    .map((candidate) => ({ slug: candidate.slug, updatedAt: candidate.updatedAt }));
};

export const searchPublicRecipes = async (filters: PublicRecipeFilters): Promise<PublicRecipeListResult> => {
  const conditions = [eq(recipes.publicationState, "published")];

  if (filters.q) {
    const term = `%${filters.q}%`;
    const match = or(ilike(recipes.title, term), ilike(users.displayName, term));
    if (match) {
      conditions.push(match);
    }
  }

  const styleScope = await resolveStyleScope(filters);
  if (styleScope) {
    // Пустой scope (неизвестное семейство) → inArray([]) → 0 строк, без падения.
    conditions.push(inArray(recipes.styleId, styleScope));
  }

  if (filters.colorMinSrm != null) {
    conditions.push(gte(recipes.color, filters.colorMinSrm));
  }
  if (filters.colorMaxSrm != null) {
    conditions.push(lte(recipes.color, filters.colorMaxSrm));
  }
  if (filters.abvMin != null) {
    conditions.push(gte(recipes.abv, filters.abvMin));
  }
  if (filters.abvMax != null) {
    conditions.push(lte(recipes.abv, filters.abvMax));
  }
  if (filters.ibuMin != null) {
    conditions.push(gte(recipes.ibu, filters.ibuMin));
  }
  if (filters.ibuMax != null) {
    conditions.push(lte(recipes.ibu, filters.ibuMax));
  }
  // filters.method не применяется в Phase A — метод нигде не хранится.

  const whereClause = and(...conditions);

  const { limit, offset, page, pageSize } = resolvePagination(filters.page, filters.pageSize);
  const sortPlan = resolvePublicRecipeSort(filters.sort);
  const sortColumn = publicRecipeSortColumns[sortPlan.key];
  // NULLS LAST (рейтинг): рецепты без оценок уходят в конец. drizzle desc()/asc()
  // не выражают NULLS LAST → строим порядок через sql.
  const primaryOrder = sortPlan.nullsLast
    ? sql`${sortColumn} ${sql.raw(sortPlan.direction)} nulls last`
    : sortPlan.direction === "asc"
      ? asc(sortColumn)
      : desc(sortColumn);
  // Вторичный ключ updatedAt desc для стабильности (кроме случая, когда он же первичный).
  const orderBy = sortPlan.key === "updatedAt" ? [primaryOrder] : [primaryOrder, desc(recipes.updatedAt)];

  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      authorId: recipes.authorId,
      styleId: recipes.styleId,
      og: recipes.og,
      fg: recipes.fg,
      abv: recipes.abv,
      ibu: recipes.ibu,
      color: recipes.color,
      batchSizeNormalizedQuantity: recipes.batchSizeNormalizedQuantity,
      batchSizeNormalizedUnit: recipes.batchSizeNormalizedUnit,
      updatedAt: recipes.updatedAt,
      createdAt: recipes.createdAt,
      heroImageId: recipes.heroImageId,
      ratingAvg: recipes.ratingAvg,
      ratingCount: recipes.ratingCount,
      saveCount: recipes.saveCount,
      featuredAt: recipes.featuredAt,
      authorDisplayName: users.displayName,
      authorImage: users.image,
      heroThumbKey: recipeImages.storageKeyThumb,
      heroBlurDataUrl: recipeImages.blurDataUrl
    })
    .from(recipes)
    .leftJoin(users, eq(users.id, recipes.authorId))
    .leftJoin(recipeImages, eq(recipeImages.id, recipes.heroImageId))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ value: count() })
    .from(recipes)
    .leftJoin(users, eq(users.id, recipes.authorId))
    .where(whereClause);
  const total = totalRows[0]?.value ?? 0;

  // Фото BJCP-стилей (как на `/bjcp`) для рецептов без своего фото. Карта
  // кешируется в `@nb/content`, так что это дешёвый lookup, не N+1.
  const styleHeroImageByBjcpId = await getBjcpStyleHeroImageByBjcpId();

  return {
    items: rows.map((row) => mapPublicRecipeListItem(row, styleHeroImageByBjcpId)),
    total,
    page,
    pageSize
  };
};

/**
 * Топ публичных рецептов сообщества в конкретном BJCP-стиле — для блока «Что
 * варят в стиле» на странице стиля `/bjcp/[slug]`. Сортировка по популярности
 * (число сохранений). `total` — сколько всего опубликованных рецептов в стиле
 * (для ссылки «Все рецепты в стиле» и решения, показывать ли её).
 *
 * @param styleCode — BJCP-код стиля (`article.bjcpId`, напр. "1A"); тот же ключ,
 *   что и фильтр `?style=` на витрине `/recipes` (см. resolveStyleScope).
 */
export const listPublicRecipesForStyle = async (
  styleCode: string,
  limit = 6
): Promise<PublicRecipeListResult> =>
  searchPublicRecipes({
    styleCode,
    sort: "popular",
    page: 1,
    pageSize: limit
  });

/**
 * «Рецепты с этим ингредиентом» — блок детальной страницы каталога
 * (notes/catalog-refactor-plan.md, этап 5.4). Связь строго через
 * `recipeIngredients.ingredientCatalogItemId` (не по снапшот-имени — после
 * мерджа/переименования системного ингредиента снапшот может разойтись с
 * актуальным названием). `total` — все published-рецепты с этим ингредиентом,
 * `items` — top-`limit` самых свежих по `updatedAt`. Отдельная узкая функция
 * (по образцу {@link listPublicRecipesForStyle}), а не расширение
 * `PublicRecipeFilters` — чтобы не трогать общий путь `searchPublicRecipes`.
 */
export const listPublicRecipesForIngredient = async (
  ingredientCatalogItemId: string,
  limit = 5
): Promise<{ total: number; items: PublicRecipeListItem[] }> => {
  const linkedRows = await db
    .select({ recipeId: recipeIngredients.recipeId })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.ingredientCatalogItemId, ingredientCatalogItemId));
  const recipeIds = Array.from(new Set(linkedRows.map((row) => row.recipeId)));

  if (recipeIds.length === 0) {
    return { total: 0, items: [] };
  }

  const whereClause = and(eq(recipes.publicationState, "published"), inArray(recipes.id, recipeIds));

  const totalRows = await db
    .select({ value: count() })
    .from(recipes)
    .where(whereClause);
  const total = totalRows[0]?.value ?? 0;

  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      authorId: recipes.authorId,
      styleId: recipes.styleId,
      og: recipes.og,
      fg: recipes.fg,
      abv: recipes.abv,
      ibu: recipes.ibu,
      color: recipes.color,
      batchSizeNormalizedQuantity: recipes.batchSizeNormalizedQuantity,
      batchSizeNormalizedUnit: recipes.batchSizeNormalizedUnit,
      updatedAt: recipes.updatedAt,
      createdAt: recipes.createdAt,
      heroImageId: recipes.heroImageId,
      ratingAvg: recipes.ratingAvg,
      ratingCount: recipes.ratingCount,
      saveCount: recipes.saveCount,
      featuredAt: recipes.featuredAt,
      authorDisplayName: users.displayName,
      authorImage: users.image,
      heroThumbKey: recipeImages.storageKeyThumb,
      heroBlurDataUrl: recipeImages.blurDataUrl
    })
    .from(recipes)
    .leftJoin(users, eq(users.id, recipes.authorId))
    .leftJoin(recipeImages, eq(recipeImages.id, recipes.heroImageId))
    .where(whereClause)
    .orderBy(desc(recipes.updatedAt))
    .limit(limit);

  const styleHeroImageByBjcpId = await getBjcpStyleHeroImageByBjcpId();

  return {
    total,
    items: rows.map((row) => mapPublicRecipeListItem(row, styleHeroImageByBjcpId))
  };
};

// ─── Рейтинги публичных рецептов (Phase D, §3.4) ─────────────────────────────
// Жёсткие правила (первый write-path): userId только с сервера; нельзя оценивать
// свой рецепт; оценивать можно только published; UNIQUE(recipe,user) → upsert;
// агрегаты rating_avg/rating_count пересчитываются транзакционно (row-lock).

type RecipeRatingMutationExecutor = Pick<typeof db, "execute" | "select" | "insert" | "update" | "delete">;

/** Лочит строку рецепта на время транзакции — сериализует пересчёт агрегатов. */
const lockRecipeForRatingMutation = async (tx: RecipeRatingMutationExecutor, recipeId: string) => {
  await tx.execute(sql`select ${recipes.id} from ${recipes} where ${recipes.id} = ${recipeId} for update`);
};

/**
 * Пересчитывает денормализованные rating_avg/rating_count из источника
 * (recipe_ratings) в ТОЙ ЖЕ транзакции, что и запись — расхождение невозможно.
 */
const recomputeRecipeRatingAggregates = async (
  tx: RecipeRatingMutationExecutor,
  recipeId: string
): Promise<RecipeRatingSummary> => {
  const [agg] = await tx
    .select({ average: sql<number | null>`avg(${recipeRatings.stars})`, total: count() })
    .from(recipeRatings)
    .where(eq(recipeRatings.recipeId, recipeId));

  const ratingCount = Number(agg?.total ?? 0);
  const ratingAvg = ratingCount > 0 && agg?.average != null ? Number(agg.average) : null;
  // Байесовский скор — только для сортировки; наружу отдаём честный ratingAvg.
  const ratingBayes = computeBayesianRating(ratingAvg, ratingCount);

  await tx.update(recipes).set({ ratingAvg, ratingCount, ratingBayes }).where(eq(recipes.id, recipeId));

  return { average: ratingAvg == null ? 0 : roundTo(ratingAvg, 1), count: ratingCount };
};

/** Текущая оценка пользователя по рецепту (для предзаполнения формы). */
export const getUserRecipeRating = async (userId: string, recipeId: string): Promise<RecipeRatingDto | null> => {
  const rating = await db.query.recipeRatings.findFirst({
    where: and(eq(recipeRatings.recipeId, recipeId), eq(recipeRatings.userId, userId)),
    columns: { stars: true, body: true }
  });

  return rating ? { stars: rating.stars, body: rating.body } : null;
};

/**
 * Состояние оценивания для текущего пользователя (UX-гард формы): может ли он
 * оценить рецепт (published и не свой) + его текущая оценка. Доменная логика —
 * в сервисе, не в action/компоненте. Реальный запрет — в {@link rateRecipe}.
 */
export const getViewerRecipeRatingState = async (
  userId: string,
  recipeId: string
): Promise<{ canRate: boolean; rating: RecipeRatingDto | null }> => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { authorId: true, publicationState: true }
  });

  const canRate = !!recipe && recipe.publicationState === "published" && recipe.authorId !== userId;
  const rating = await getUserRecipeRating(userId, recipeId);

  return { canRate, rating };
};

/**
 * Создаёт или обновляет оценку (upsert по UNIQUE(recipe_id,user_id)) и
 * пересчитывает агрегаты в той же транзакции. Бросает OWN_RECIPE при попытке
 * оценить свой рецепт, NOT_FOUND/FORBIDDEN для несуществующего/неопубликованного.
 */
export const rateRecipe = async (
  userId: string,
  recipeId: string,
  payload: unknown
): Promise<RecipeRatingSummary> => {
  const input = recipeRatingInputSchema.parse(payload);

  return await db.transaction(async (tx) => {
    // Лочим строку рецепта первой, затем читаем published/author ПОД локом —
    // нет TOCTOU между проверкой и записью/пересчётом агрегатов.
    await lockRecipeForRatingMutation(tx, recipeId);

    const [recipe] = await tx
      .select({ authorId: recipes.authorId, publicationState: recipes.publicationState })
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .limit(1);

    if (!recipe) {
      throw new Error("NOT_FOUND");
    }
    if (recipe.publicationState !== "published") {
      throw new Error("FORBIDDEN");
    }
    if (recipe.authorId === userId) {
      throw new Error("OWN_RECIPE");
    }

    await tx
      .insert(recipeRatings)
      .values({ recipeId, userId, stars: input.stars, body: input.body })
      .onConflictDoUpdate({
        target: [recipeRatings.recipeId, recipeRatings.userId],
        set: { stars: input.stars, body: input.body, updatedAt: new Date() }
      });

    return await recomputeRecipeRatingAggregates(tx, recipeId);
  });
};

/** Удаляет оценку пользователя и пересчитывает агрегаты в той же транзакции. */
export const deleteRecipeRating = async (userId: string, recipeId: string): Promise<RecipeRatingSummary> => {
  return await db.transaction(async (tx) => {
    await lockRecipeForRatingMutation(tx, recipeId);

    await tx
      .delete(recipeRatings)
      .where(and(eq(recipeRatings.recipeId, recipeId), eq(recipeRatings.userId, userId)));

    return await recomputeRecipeRatingAggregates(tx, recipeId);
  });
};

// ─── «Выбор редакции» ────────────────────────────────────────────────────────
// Кураторская метка, ставит только editor+ (гейт requireRole — в server action).
// Это НЕ буст ранжирования: featuredAt на сортировку витрины не влияет, только
// показывает бейдж. Отмечать можно лишь published-рецепты.

/** Текущее состояние «Выбора редакции» для рецепта (для тумблера куратора). */
export const getRecipeFeaturedState = async (
  recipeId: string
): Promise<{ exists: boolean; published: boolean; featured: boolean }> => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { publicationState: true, featuredAt: true }
  });
  if (!recipe) {
    return { exists: false, published: false, featured: false };
  }
  return {
    exists: true,
    published: recipe.publicationState === "published",
    featured: recipe.featuredAt != null
  };
};

/**
 * Ставит/снимает «Выбор редакции». Разрешено только для published-рецептов
 * (снять можно всегда — на случай, если рецепт сняли с публикации после отметки).
 * Возвращает новое состояние. Проверку роли делает вызывающий server action.
 */
export const setRecipeFeatured = async (recipeId: string, featured: boolean): Promise<{ featured: boolean }> => {
  const state = await getRecipeFeaturedState(recipeId);
  if (!state.exists) {
    throw new Error("NOT_FOUND");
  }
  if (featured && !state.published) {
    throw new Error("FORBIDDEN");
  }
  await db.update(recipes).set({ featuredAt: featured ? new Date() : null }).where(eq(recipes.id, recipeId));
  return { featured };
};

// ─── Сохранения публичных рецептов («Избранные») ─────────────────────────────
// Аналог рейтинга: userId только с сервера; сохранять можно только published;
// UNIQUE(recipe,user) → idempotent; денормализованный save_count пересчитывается
// транзакционно под row-lock рецепта (тот же лок, что и у рейтинга).

/** Пересчитывает денормализованный save_count из источника (recipe_saves). */
const recomputeRecipeSaveCount = async (
  tx: RecipeRatingMutationExecutor,
  recipeId: string
): Promise<number> => {
  const [agg] = await tx
    .select({ total: count() })
    .from(recipeSaves)
    .where(eq(recipeSaves.recipeId, recipeId));

  const saveCount = Number(agg?.total ?? 0);
  await tx.update(recipes).set({ saveCount }).where(eq(recipes.id, recipeId));

  return saveCount;
};

/**
 * Сохраняет/снимает рецепт из «Избранных» текущего пользователя и пересчитывает
 * save_count в той же транзакции. Сохранять можно только опубликованный рецепт
 * (NOT_FOUND/FORBIDDEN иначе). Идемпотентно: повторный save не плодит строк.
 */
export const setRecipeSave = async (
  userId: string,
  recipeId: string,
  next: boolean
): Promise<RecipeSaveSummary> => {
  return await db.transaction(async (tx) => {
    await lockRecipeForRatingMutation(tx, recipeId);

    const [recipe] = await tx
      .select({ publicationState: recipes.publicationState })
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .limit(1);

    if (!recipe) {
      throw new Error("NOT_FOUND");
    }
    if (recipe.publicationState !== "published") {
      throw new Error("FORBIDDEN");
    }

    if (next) {
      await tx
        .insert(recipeSaves)
        .values({ recipeId, userId })
        .onConflictDoNothing({ target: [recipeSaves.recipeId, recipeSaves.userId] });
    } else {
      await tx
        .delete(recipeSaves)
        .where(and(eq(recipeSaves.recipeId, recipeId), eq(recipeSaves.userId, userId)));
    }

    const saveCount = await recomputeRecipeSaveCount(tx, recipeId);
    return { saved: next, count: saveCount };
  });
};

/** Сохранён ли рецепт текущим пользователем (для подсветки флажка). */
export const getViewerRecipeSaveState = async (
  userId: string,
  recipeId: string
): Promise<{ saved: boolean }> => {
  const save = await db.query.recipeSaves.findFirst({
    where: and(eq(recipeSaves.recipeId, recipeId), eq(recipeSaves.userId, userId)),
    columns: { id: true }
  });

  return { saved: !!save };
};

/**
 * Батч-проверка: какие из `recipeIds` сохранены текущим пользователем. Возвращает
 * Set сохранённых id — витрина грузит состояние флажков одним запросом после
 * гидрации, не де-кэшируя сам документ.
 */
export const getSavedRecipeIds = async (userId: string, recipeIds: string[]): Promise<Set<string>> => {
  if (recipeIds.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ recipeId: recipeSaves.recipeId })
    .from(recipeSaves)
    .where(and(eq(recipeSaves.userId, userId), inArray(recipeSaves.recipeId, recipeIds)));

  return new Set(rows.map((row) => row.recipeId));
};

/**
 * Число сохранённых пользователем рецептов — для бейджа «Избранные» на витрине.
 * Считаем только published, чтобы счётчик совпадал с тем, что реально видно
 * на `/app/saved` (см. {@link listSavedRecipes}).
 */
export const countSavedRecipes = async (userId: string): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(recipeSaves)
    .innerJoin(recipes, eq(recipes.id, recipeSaves.recipeId))
    .where(and(eq(recipeSaves.userId, userId), eq(recipes.publicationState, "published")));

  return row?.value ?? 0;
};

/**
 * Сохранённые пользователем рецепты («Избранные») — только published, в порядке
 * сохранения (новые сверху). Маппинг — через тот же {@link mapPublicRecipeListItem}.
 */
export const listSavedRecipes = async (userId: string): Promise<PublicRecipeListItem[]> => {
  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      authorId: recipes.authorId,
      styleId: recipes.styleId,
      og: recipes.og,
      fg: recipes.fg,
      abv: recipes.abv,
      ibu: recipes.ibu,
      color: recipes.color,
      batchSizeNormalizedQuantity: recipes.batchSizeNormalizedQuantity,
      batchSizeNormalizedUnit: recipes.batchSizeNormalizedUnit,
      updatedAt: recipes.updatedAt,
      createdAt: recipes.createdAt,
      heroImageId: recipes.heroImageId,
      ratingAvg: recipes.ratingAvg,
      ratingCount: recipes.ratingCount,
      saveCount: recipes.saveCount,
      featuredAt: recipes.featuredAt,
      authorDisplayName: users.displayName,
      authorImage: users.image,
      heroThumbKey: recipeImages.storageKeyThumb,
      heroBlurDataUrl: recipeImages.blurDataUrl
    })
    .from(recipeSaves)
    .innerJoin(recipes, eq(recipes.id, recipeSaves.recipeId))
    .leftJoin(users, eq(users.id, recipes.authorId))
    .leftJoin(recipeImages, eq(recipeImages.id, recipes.heroImageId))
    .where(and(eq(recipeSaves.userId, userId), eq(recipes.publicationState, "published")))
    .orderBy(desc(recipeSaves.createdAt));

  const styleHeroImageByBjcpId = await getBjcpStyleHeroImageByBjcpId();
  return rows.map((row) => mapPublicRecipeListItem(row, styleHeroImageByBjcpId));
};

// Ссылка на «свой» рецепт вместе с презентацией карточки (S4): обложка
// (фото → фото BJCP-стиля → заливка по SRM), код/название стиля и ссылка на
// BJCP — ровно то, что нужно RecipeThumb/StyleChip карточки «Почти хватает на:»
// раздела «Чего не хватает». Метрики матча (проценты, нехватки) сюда не входят —
// вызывающий сам зовёт батч-матч по id.
export type OwnRecipeRefDto = {
  id: string;
  slug: string;
  title: string;
  styleCode: string | null;
  styleName: string | null;
  styleHref: string | null;
  heroImage: { thumbUrl: string; blurDataUrl: string | null } | null;
  styleImageUrl: string | null;
  colorSrm: number | null;
};

// Результат listOwnRecipeRefs: схлопнутые до последней версии ссылки (refs) +
// принадлежность К СЕМЕЙСТВУ ЛЮБОЙ версии пользователя (familyIdByVersionId),
// не только последней. Второе поле нужно потребителям, которым важно узнать
// семейство по recipeId старой версии — например, список покупок (FIX-4):
// запланированная варка или избранная запись могут ссылаться на НЕ-последнюю
// версию, и без этой карты семейство этой версии было бы не найти без
// дополнительного запроса.
export type OwnRecipeRefsResult = {
  refs: OwnRecipeRefDto[];
  familyIdByVersionId: Map<string, string>;
};

/**
 * Свои рецепты пользователя (любой статус публикации). `refs` — схлопнутые до
 * последней версии в семействе, как на дашборде
 * ({@link findBrewableOwnRecipesForUser}), чтобы «IPA v1»/«IPA v2» не
 * дублировались как два разных «своих рецепта». `familyIdByVersionId` —
 * принадлежность ВСЕХ версий (до схлопывания) к семейству.
 */
export const listOwnRecipeRefs = async (authorId: string): Promise<OwnRecipeRefsResult> => {
  // ОДИН запрос: join recipeImages по heroImageId даёт обложку сразу для всех
  // версий, стиль/цвет резолвятся ниже кеш-хелперами (без похода в БД).
  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      recipeFamilyId: recipes.recipeFamilyId,
      versionNumber: recipes.versionNumber,
      styleId: recipes.styleId,
      color: recipes.color,
      heroImageId: recipes.heroImageId,
      heroThumbKey: recipeImages.storageKeyThumb,
      heroBlurDataUrl: recipeImages.blurDataUrl
    })
    .from(recipes)
    .leftJoin(recipeImages, eq(recipeImages.id, recipes.heroImageId))
    .where(eq(recipes.authorId, authorId));

  const latestByFamily = new Map<string, (typeof rows)[number]>();
  const familyIdByVersionId = new Map<string, string>();
  for (const row of rows) {
    familyIdByVersionId.set(row.id, row.recipeFamilyId);
    const previous = latestByFamily.get(row.recipeFamilyId);
    if (!previous || row.versionNumber > previous.versionNumber) {
      latestByFamily.set(row.recipeFamilyId, row);
    }
  }

  // Карта фото BJCP-стилей (как на `/bjcp`) — дешёвый кешированный lookup, не N+1.
  const styleHeroImageByBjcpId = await getBjcpStyleHeroImageByBjcpId();

  const refs: OwnRecipeRefDto[] = [...latestByFamily.values()].map((row) => {
    const style = getBeerStyleById(row.styleId);
    const heroImage =
      row.heroImageId && row.heroThumbKey
        ? { thumbUrl: `/api/recipe-images/${row.heroImageId}/thumb`, blurDataUrl: row.heroBlurDataUrl ?? null }
        : null;
    // Фото BJCP-стиля показываем только когда у рецепта нет своего фото.
    const styleImageUrl = !heroImage && style ? styleHeroImageByBjcpId.get(style.bjcpId) ?? null : null;

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      styleCode: style ? style.bjcpId : null,
      styleName: style ? style.nameRu ?? style.name : null,
      styleHref: getBjcpArticleHrefByStyleId(row.styleId),
      heroImage,
      styleImageUrl,
      colorSrm: row.color
    };
  });

  return { refs, familyIdByVersionId };
};

export const previewRecipeDraft = async (authorId: string, payload: unknown): Promise<RecipeDraftPreviewDto> => {
  const normalizedPayload = isRecord(payload)
    ? {
      ...(normalizeCreateRecipePayloadDefaults(payload) as Record<string, unknown>),
      title: typeof payload.title === "string" && payload.title.trim() ? payload.title : DEFAULT_NEW_RECIPE_TITLE_PREFIX,
      publicationState: "draft",
    }
    : payload;
  const parsed = createRecipePayloadSchema.parse(normalizedPayload);
  const batchSize = normalizeRecipeBatchSize(parsed.batchSizeEnteredQuantity, parsed.batchSizeEnteredUnit);
  const preparedIngredients = await prepareRecipeIngredientEntries(authorId, parsed.ingredients);
  const calculationMeta = parseRecipeCalculationMeta(
    parsed.calculationMeta ?? null,
    await getUserRecipeCalculationMeta(authorId)
  );
  const stats = computeRecipeStatsSnapshot({
    batchSizeNormalizedQuantity: batchSize.normalizedQuantity,
    batchSizeNormalizedUnit: batchSize.normalizedUnit,
    efficiency: parsed.efficiency,
    boilTimeMinutes: parsed.boilTimeMinutes,
    processMeta: parseRecipeProcessMeta(parsed.processMeta ?? null),
    calculationMeta,
    equipmentProfileSnapshot: parsed.equipmentProfileSnapshot ?? null,
    ingredients: preparedIngredients.map((ingredient, index) => ({
      id: `${index + 1}`,
      type: ingredient.source.type,
      amountNormalizedQuantity: ingredient.amount.normalizedQuantity,
      amountNormalizedUnit: ingredient.amount.normalizedUnit,
      stage: ingredient.stage as RecipeIngredientDto["stage"],
      timeOffset: ingredient.timeOffset,
      stepMeta: ingredient.stepMeta,
      source: {
        displayName: ingredient.source.displayName,
        category: ingredient.source.category,
        technicalData: ingredient.source.technicalData,
        raw: ingredient.sourceRaw
      }
    }))
  });
  const styleRange = resolveRecipeStyleRange(parsed.styleId ?? null);
  const hasAnyMetric = stats.og != null || stats.fg != null || stats.abv != null || stats.ibu != null || stats.color != null;
  const styleFit = styleRange && hasAnyMetric
    ? evaluateStyleFit(styleRange, {
      og: stats.og ?? 0,
      fg: stats.fg ?? 0,
      abv: stats.abv ?? 0,
      ibu: stats.ibu ?? 0,
      srm: stats.color ?? 0
    })
    : null;

  return {
    batchSizeEnteredQuantity: batchSize.enteredQuantity,
    batchSizeEnteredUnit: batchSize.enteredUnit,
    boilTimeMinutes: parsed.boilTimeMinutes,
    og: stats.og,
    fg: stats.fg,
    fgEstimateMode: stats.fgEstimateMode,
    fgEstimateDetails: stats.fgEstimateDetails,
    abv: stats.abv,
    ibu: stats.ibu,
    bitternessFormula: stats.bitternessFormula,
    color: stats.color,
    styleId: parsed.styleId ?? null,
    styleRange,
    styleFit
  };
};
