import {
  and,
  count,
  db,
  desc,
  eq,
  ingredients,
  recipeIngredients,
  recipes,
  userBrewingSettings,
  userCustomIngredients
} from "@nb/db";
import {
  calculateAbv,
  calculateBitterness,
  calculateColor,
  calculateOg,
  evaluateStyleFit,
  getStyleRangeById,
  type HopAdditionInput,
  roundTo
} from "@nb/brewing-core";
import {
  createRecipePayloadSchema,
  defaultRecipeProcessMeta,
  listAuthorRecipesQuerySchema,
  recipeBitternessFormulas,
  recipeCalculationMetaSchema,
  recipeProcessMetaSchema,
  recipeWaterPlanMetaSchema,
  type RecipeCalculationMeta,
  type RecipeDetailDto,
  type RecipeDraftPreviewDto,
  type RecipeIngredientDto,
  type RecipeListItemDto,
  type RecipeHopUseType,
  type RecipeImportedIngredientSnapshot,
  type RecipeInventoryIntentMode,
  type RecipeInventorySelectionMeta,
  type RecipeProcessMeta,
  type RecipePublicationState,
  type RecipeWaterPlanMeta,
  type RecipeVersionOptionDto,
  updateRecipePayloadSchema
} from "./contracts";
import { equipmentProfileSnapshotSchema, type EquipmentProfileSnapshot } from "../equipment-profiles/contracts";
import { getRecipePublicationFieldErrors } from "./publication-validation";
import { calculateRecipeFgEstimate } from "./fg-estimate";
import {
  normalizeRecipeBatchSize,
  normalizeRecipeIngredientAmountWithSource,
  parseRecipeUnit,
  toBatchVolumeLiters
} from "./units";
import { appendSlugSuffix, toRecipeSlugBase } from "./slug";
import {
  extractIngredientTechnicalData,
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
    styleId: input.styleId,
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

const mapRecipeDetailDto = async (
  recipe: typeof recipes.$inferSelect,
  ingredients: Array<typeof recipeIngredients.$inferSelect>
) => {
  const calculationMeta = parseRecipeCalculationMeta(recipe.calculationMeta as Record<string, unknown> | null | undefined);

  return {
    ...mapRecipeListDto(recipe),
    description: recipe.description,
    authorNotes: recipe.authorNotes,
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
    versions: await listRecipeVersions(recipe.authorId, recipe.recipeFamilyId),
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
  const fermentables: Array<{ id: string; name: string; weightKg: number; potentialPpg: number; colorLovibond: number }> = [];
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
          colorLovibond: getIngredientColorLovibond(ingredient.source.raw, 2)
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
  options?: { recipeFamilyId?: string; versionNumber?: number }
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
        heroImageId: parsed.heroImageId ?? null
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
  const shouldRecomputeSlug = parsed.title !== undefined;

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

export const cloneRecipe = async (authorId: string, recipeId: string) => {
  const recipe = await getOwnedRecipeById(authorId, recipeId);

  return createRecipe(authorId, {
    title: `${recipe.title} (копия)`,
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
  });
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

export const listPublicRecipes = async (limit = 50): Promise<RecipeListItemDto[]> => {
  const rows = await db.query.recipes.findMany({
    where: eq(recipes.publicationState, "published"),
    orderBy: [desc(recipes.updatedAt)],
    limit
  });

  return rows.map(mapRecipeListDto);
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
