import {
  and,
  count,
  db,
  desc,
  eq,
  ingredients,
  recipeIngredients,
  recipes,
  userCustomIngredients
} from "@nb/db";
import {
  calculateAbv,
  calculateColor,
  calculateFg,
  calculateIbuTinseth,
  calculateOg,
  evaluateStyleFit,
  getStyleRangeById,
  roundTo
} from "@nb/brewing-core";
import {
  createRecipePayloadSchema,
  defaultRecipeProcessMeta,
  listAuthorRecipesQuerySchema,
  recipeProcessMetaSchema,
  type RecipeDetailDto,
  type RecipeDraftPreviewDto,
  type RecipeIngredientDto,
  type RecipeListItemDto,
  type RecipeHopUseType,
  type RecipePublicationState,
  type RecipeVersionOptionDto,
  updateRecipePayloadSchema
} from "./contracts";
import { getRecipePublicationFieldErrors } from "./publication-validation";
import {
  normalizeRecipeBatchSize,
  normalizeRecipeIngredientAmountWithSource,
  parseRecipeUnit,
  toBatchVolumeLiters
} from "./units";
import { appendSlugSuffix, toRecipeSlugBase } from "./slug";
import {
  getIngredientAlphaAcidPercent,
  getIngredientColorLovibond,
  getIngredientPotentialPpg
} from "../ingredients/technical-fields";
import { resolveIngredientDisplayNames } from "../ingredients/presentation";
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
const DEFAULT_ATTENUATION = 75;
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

const resolveRecipeStyleRange = (styleId: string | null | undefined) => getStyleRangeById(styleId);

const parseRecipeProcessMeta = (processMeta: Record<string, unknown> | null | undefined) => (
  recipeProcessMetaSchema.parse(processMeta ?? defaultRecipeProcessMeta)
);

const sanitizeRecipeProcessMeta = (processMeta: Record<string, unknown> | null | undefined) => (
  parseRecipeProcessMeta(processMeta) as Record<string, unknown>
);

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
  if (metaUseType === "boil" || metaUseType === "whirlpool" || metaUseType === "dry_hop" || metaUseType === "dip_hop" || metaUseType === "other") {
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
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  source: IngredientSourceLinkage;
  sourceRaw: typeof ingredients.$inferSelect | typeof userCustomIngredients.$inferSelect;
  amount: ReturnType<typeof normalizeRecipeIngredientAmountWithSource>;
  stage: typeof recipeIngredients.$inferInsert.stage;
  timeOffset: number | null;
  stepMeta: Record<string, unknown> | null;
};

const prepareRecipeIngredientEntries = async (
  authorId: string,
  payloadIngredients: Array<{
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
  }>
) => {
  const preparedValues: PreparedRecipeIngredientEntry[] = [];

  for (const ingredient of payloadIngredients) {
    let resolvedSource: IngredientSourceLinkage;
    let rawSource: typeof ingredients.$inferSelect | typeof userCustomIngredients.$inferSelect;

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
      stepMeta: sanitizeRecipeStepMeta(ingredient.stepMeta ?? null)
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
  const category = normalizeStoredRecipeCategory(ingredient.ingredientCategory)
    ?? stepMetaLinkage?.category
    ?? resolveIngredientCategory({ type: ingredient.type });
  const subtype = normalizeStoredRecipeSubtype(category, ingredient.ingredientSubtype)
    ?? stepMetaLinkage?.subtype
    ?? null;
  const type = (
    liveLinkage?.type
    ?? resolveLegacyIngredientType({ category, subtype })
    ?? (ingredient.type as RecipeIngredientDto["type"])
  ) as RecipeIngredientDto["type"];
  const unitProfile = resolveInventoryUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnitSnapshot
      ?? stepMetaLinkage?.defaultDisplayUnit
      ?? liveLinkage?.defaultDisplayUnit
      ?? null,
    measurementDimension: ingredient.ingredientMeasurementDimension
      ?? stepMetaLinkage?.measurementDimension
      ?? liveLinkage?.measurementDimension
      ?? null,
    technicalData: liveLinkage?.technicalData ?? null
  });

  return {
    type,
    category,
    subtype,
    familyId: ingredient.ingredientFamilyId ?? stepMetaLinkage?.familyId ?? liveLinkage?.familyId ?? null,
    displayName: liveLinkage?.displayName ?? ingredient.ingredientDisplayNameSnapshot ?? stepMetaLinkage?.displayName ?? null,
    displayNameRu: liveLinkage?.displayNameRu ?? stepMetaLinkage?.displayNameRu ?? null,
    displayNameEn: liveLinkage?.displayNameEn ?? stepMetaLinkage?.displayNameEn ?? null,
    familyDisplayName: liveLinkage?.familyDisplayName ?? stepMetaLinkage?.familyDisplayName ?? null,
    summary: liveLinkage?.summary ?? stepMetaLinkage?.summary ?? null,
    defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnitSnapshot
      ? parseRecipeIngredientUnit(ingredient.ingredientDefaultDisplayUnitSnapshot)
      : unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: ingredient.ingredientMeasurementDimension ?? unitProfile.measurementDimension,
    technicalData: liveLinkage?.technicalData ?? null
  };
};

const mapRecipeIngredientBase = (ingredient: typeof recipeIngredients.$inferSelect) => ({
  id: ingredient.id,
  recipeId: ingredient.recipeId,
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
    ingredientDefaultDisplayUnit: resolvedSource?.defaultDisplayUnit ?? null,
    ingredientDefaultDisplayUnitSnapshot: resolvedSource?.defaultDisplayUnit ?? null,
    ingredientAllowedUnits: resolvedSource?.allowedUnits ?? null,
    ingredientMeasurementDimension: resolvedSource?.measurementDimension ?? null,
    ingredientMeasurementDimensionSnapshot: resolvedSource?.measurementDimension ?? null
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

const mapRecipeDetailDto = async (
  recipe: typeof recipes.$inferSelect,
  ingredients: Array<typeof recipeIngredients.$inferSelect>
): Promise<RecipeDetailDto> => ({
  ...mapRecipeListDto(recipe),
  description: recipe.description,
  authorNotes: recipe.authorNotes,
  processMeta: parseRecipeProcessMeta(recipe.processMeta as Record<string, unknown> | null | undefined),
  heroImageId: recipe.heroImageId,
  versions: await listRecipeVersions(recipe.authorId, recipe.recipeFamilyId),
  ingredients: await Promise.all(ingredients.map((ingredient) => hydrateRecipeIngredientDto(recipe.authorId, ingredient)))
});

const replaceRecipeIngredients = async (
  authorId: string,
  recipeId: string,
  payloadIngredients: Array<{
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
  }>
) => {
  await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));

  if (!payloadIngredients.length) {
    return;
  }

  const preparedIngredients = await prepareRecipeIngredientEntries(authorId, payloadIngredients);
  const preparedValues: Array<typeof recipeIngredients.$inferInsert> = preparedIngredients.map((ingredient) => ({
    recipeId,
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
    stepMeta: ingredient.stepMeta
  }));

  await db.insert(recipeIngredients).values(preparedValues);
};

const computeRecipeStatsSnapshot = (input: {
  batchSizeNormalizedQuantity: number;
  batchSizeNormalizedUnit: string;
  efficiency: number | null | undefined;
  boilTimeMinutes: number;
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
      raw: typeof ingredients.$inferSelect | typeof userCustomIngredients.$inferSelect;
    };
  }>;
}) => {
  const batchVolumeL = toBatchVolumeLiters(input.batchSizeNormalizedQuantity, input.batchSizeNormalizedUnit);
  const efficiency = input.efficiency ?? DEFAULT_EFFICIENCY;
  const fermentables: Array<{ id: string; name: string; weightKg: number; potentialPpg: number; colorLovibond: number }> = [];
  const hops: Array<{ id: string; name: string; alphaAcidPercent: number; weightG: number; boilTimeMinutes: number; use?: "boil" | "whirlpool" | "dry_hop" }> = [];

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
        : useType === "whirlpool" || useType === "dip_hop"
          ? "whirlpool"
          : "boil";

      hops.push({
        id: ingredient.id,
        name: ingredient.source.displayName,
        alphaAcidPercent: getIngredientAlphaAcidPercent(ingredient.source.raw, 5),
        weightG,
        boilTimeMinutes: resolveHopTimeMinutes(ingredient, input.boilTimeMinutes),
        use
      });
    }
  }

  if (!fermentables.length && !hops.length) {
    return {
      efficiency,
      og: null,
      fg: null,
      abv: null,
      ibu: null,
      color: null
    };
  }

  const og = fermentables.length
    ? calculateOg({ fermentables, batchVolumeL, brewhouseEfficiencyPercent: efficiency })
    : null;
  const fg = og ? calculateFg({ og, attenuationPercent: DEFAULT_ATTENUATION }) : null;
  const abv = og && fg ? calculateAbv(og, fg) : null;
  const ibu = hops.length && og ? calculateIbuTinseth({ og, batchVolumeL, hopAdditions: hops }) : null;
  const color = fermentables.length ? calculateColor(fermentables, batchVolumeL).srm : null;

  return {
    efficiency,
    og,
    fg,
    abv,
    ibu,
    color
  };
};

export const recomputeRecipeStats = async (authorId: string, recipeId: string) => {
  const recipe = await ensureOwnedRecipe(authorId, recipeId);
  const ingredients = await db.query.recipeIngredients.findMany({
    where: eq(recipeIngredients.recipeId, recipeId)
  });
  const hydratedIngredients = await Promise.all(ingredients.map(async (ingredient) => {
    const source = ingredient.ingredientCatalogItemId
      ? await ensureCatalogIngredientExists(ingredient.ingredientCatalogItemId)
      : ingredient.userCustomIngredientId
        ? await ensureOwnedCustomIngredient(authorId, ingredient.userCustomIngredientId)
        : null;

    if (!source) {
      return null;
    }

    const sourceDisplayName = "displayName" in source
      ? source.displayName
      : resolveIngredientDisplayNames({
        type: source.type as RecipeIngredientDto["type"],
        countryCode: "countryCode" in source ? source.countryCode : null,
        countryName: "countryName" in source ? source.countryName : null,
        nameRu: "nameRu" in source ? source.nameRu : null,
        nameEn: "nameEn" in source ? source.nameEn : null,
        displayModeRu: "displayModeRu" in source
          ? source.displayModeRu as "auto" | "localized_first" | "source_first"
          : "auto",
        displayNameOverrideRu: "displayNameOverrideRu" in source ? source.displayNameOverrideRu : null,
        secondaryNameOverrideRu: "secondaryNameOverrideRu" in source ? source.secondaryNameOverrideRu : null,
        hideSecondaryNameRu: "hideSecondaryNameRu" in source ? source.hideSecondaryNameRu : false
      }).primaryName;
    const resolvedType = (
      resolveLegacyIngredientType({
        category: normalizeStoredRecipeCategory(ingredient.ingredientCategory),
        subtype: ingredient.ingredientSubtype
      })
      ?? source.type
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
        displayName: sourceDisplayName,
        category: normalizeStoredRecipeCategory(ingredient.ingredientCategory) ?? resolveIngredientCategory({ type: resolvedType }),
        technicalData: null,
        raw: source
      }
    };
  }));

  const stats = computeRecipeStatsSnapshot({
    batchSizeNormalizedQuantity: recipe.batchSizeNormalizedQuantity,
    batchSizeNormalizedUnit: recipe.batchSizeNormalizedUnit,
    efficiency: recipe.efficiency,
    boilTimeMinutes: recipe.boilTimeMinutes ?? DEFAULT_BOIL_TIME_MINUTES,
    ingredients: hydratedIngredients.filter((ingredient): ingredient is NonNullable<typeof ingredient> => Boolean(ingredient))
  });

  const [updated] = await db.update(recipes).set({
    efficiency: stats.efficiency,
    og: stats.og,
    fg: stats.fg,
    abv: stats.abv,
    ibu: stats.ibu,
    color: stats.color,
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

  await replaceRecipeIngredients(authorId, created.id, parsed.ingredients);
  await recomputeRecipeStats(authorId, created.id);

  return getRecipeById(authorId, created.id);
};

export const updateRecipe = async (authorId: string, recipeId: string, payload: unknown) => {
  const parsed = updateRecipePayloadSchema.parse(normalizeUpdateRecipePayloadDefaults(payload));
  const current = await ensureOwnedRecipe(authorId, recipeId);
  const nextIngredientsPayload = parsed.ingredients ?? (await getOwnedRecipeById(authorId, recipeId)).ingredients.map((ingredient) => ({
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
    stepMeta: ingredient.stepMeta
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
    await replaceRecipeIngredients(authorId, recipeId, parsed.ingredients);
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
      stepMeta: ingredient.stepMeta
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
      stepMeta: ingredient.stepMeta
    }))
  }, {
    recipeFamilyId: currentRecipe.recipeFamilyId,
    versionNumber: nextVersionNumber
  });
};

export const setRecipeIngredients = async (authorId: string, recipeId: string, ingredientsPayload: unknown) => {
  const parsed = createRecipePayloadSchema.shape.ingredients.parse(ingredientsPayload);
  await ensureOwnedRecipe(authorId, recipeId);
  await replaceRecipeIngredients(authorId, recipeId, parsed);
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
  const stats = computeRecipeStatsSnapshot({
    batchSizeNormalizedQuantity: batchSize.normalizedQuantity,
    batchSizeNormalizedUnit: batchSize.normalizedUnit,
    efficiency: parsed.efficiency,
    boilTimeMinutes: parsed.boilTimeMinutes,
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
    abv: stats.abv,
    ibu: stats.ibu,
    color: stats.color,
    styleId: parsed.styleId ?? null,
    styleRange,
    styleFit
  };
};
