import {
  and,
  asc,
  db,
  desc,
  eq,
  ingredientCatalogItems,
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
  roundTo
} from "@nb/brewing-core";

import {
  createRecipePayloadSchema,
  listAuthorRecipesQuerySchema,
  type RecipeDetailDto,
  type RecipeIngredientDto,
  type RecipeListItemDto,
  type RecipePublicationState,
  updateRecipePayloadSchema
} from "./contracts";
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

const ensureOwnedRecipe = async (authorId: string, recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.authorId, authorId))
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  return recipe;
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
  const catalogItem = await db.query.ingredientCatalogItems.findFirst({
    where: and(
      eq(ingredientCatalogItems.id, ingredientCatalogItemId),
      eq(ingredientCatalogItems.status, "active")
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

type RecipeIngredientResolvedSource = {
  type: RecipeIngredientDto["type"];
  category: RecipeIngredientDto["ingredientCategory"];
  subtype: RecipeIngredientDto["ingredientSubtype"];
  familyId: RecipeIngredientDto["ingredientFamilyId"];
  displayName: RecipeIngredientDto["ingredientDisplayName"];
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
    type: typeof linkage.type === "string" ? linkage.type as RecipeIngredientDto["type"] : "misc",
    category: typeof linkage.category === "string" ? linkage.category as RecipeIngredientDto["ingredientCategory"] : null,
    subtype: typeof linkage.subtype === "string" ? linkage.subtype as RecipeIngredientDto["ingredientSubtype"] : null,
    familyId: typeof linkage.familyId === "string" ? linkage.familyId : null,
    displayName: typeof linkage.displayName === "string" ? linkage.displayName : null,
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
  const category = ingredient.ingredientCategory
    ?? stepMetaLinkage?.category
    ?? resolveIngredientCategory({ type: ingredient.type });
  const subtype = (ingredient.ingredientSubtype as RecipeIngredientDto["ingredientSubtype"])
    ?? stepMetaLinkage?.subtype
    ?? null;
  const type = resolveLegacyIngredientType({
    category,
    subtype
  }) ?? liveLinkage?.type ?? ingredient.type;
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
    displayName: ingredient.ingredientDisplayNameSnapshot ?? stepMetaLinkage?.displayName ?? liveLinkage?.displayName ?? null,
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
  type: ingredient.type,
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
  publicationState: recipe.publicationState,
  title: recipe.title,
  slug: recipe.slug,
  styleId: recipe.styleId,
  batchSizeEnteredQuantity: recipe.batchSizeEnteredQuantity,
  batchSizeEnteredUnit: parseRecipeIngredientUnit(recipe.batchSizeEnteredUnit),
  batchSizeNormalizedQuantity: recipe.batchSizeNormalizedQuantity,
  batchSizeNormalizedUnit: parseRecipeIngredientUnit(recipe.batchSizeNormalizedUnit),
  efficiency: recipe.efficiency,
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
  heroImageId: recipe.heroImageId,
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

  const preparedValues: Array<typeof recipeIngredients.$inferInsert> = [];

  for (const ingredient of payloadIngredients) {
    let resolvedSource: IngredientSourceLinkage;

    if (ingredient.ingredientCatalogItemId) {
      const catalog = await ensureCatalogIngredientExists(ingredient.ingredientCatalogItemId);
      resolvedSource = buildCatalogIngredientLinkage(catalog);
      if (ingredient.familyId != null && ingredient.familyId !== resolvedSource.familyId) {
        throw new Error("INGREDIENT_LINKAGE_MISMATCH");
      }
    } else if (ingredient.userCustomIngredientId) {
      const custom = await ensureOwnedCustomIngredient(authorId, ingredient.userCustomIngredientId);
      resolvedSource = buildCustomIngredientLinkage(custom);
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

    const amount = normalizeRecipeIngredientAmountWithSource(
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
    );

    preparedValues.push({
      recipeId,
      ingredientCatalogItemId: ingredient.ingredientCatalogItemId ?? null,
      userCustomIngredientId: ingredient.userCustomIngredientId ?? null,
      ingredientFamilyId: resolvedSource.familyId,
      ingredientCategory: resolvedSource.category,
      ingredientSubtype: resolvedSource.subtype,
      ingredientDisplayNameSnapshot: resolvedSource.displayName,
      ingredientDefaultDisplayUnitSnapshot: resolvedSource.defaultDisplayUnit,
      ingredientMeasurementDimension: resolvedSource.measurementDimension,
      type: resolvedSource.type,
      amountEnteredQuantity: amount.enteredQuantity,
      amountEnteredUnit: amount.enteredUnit,
      amountNormalizedQuantity: amount.normalizedQuantity,
      amountNormalizedUnit: amount.normalizedUnit,
      stage: ingredient.stage,
      timeOffset: ingredient.timeOffset ?? null,
      stepMeta: sanitizeRecipeStepMeta(ingredient.stepMeta ?? null)
    });
  }

  await db.insert(recipeIngredients).values(preparedValues);
};

export const recomputeRecipeStats = async (authorId: string, recipeId: string) => {
  const recipe = await ensureOwnedRecipe(authorId, recipeId);
  const ingredients = await db.query.recipeIngredients.findMany({
    where: eq(recipeIngredients.recipeId, recipeId)
  });

  const batchVolumeL = toBatchVolumeLiters(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit);
  const efficiency = recipe.efficiency ?? DEFAULT_EFFICIENCY;

  const fermentables = [] as Array<{ id: string; name: string; weightKg: number; potentialPpg: number; colorLovibond: number }>;
  const hops = [] as Array<{ id: string; name: string; alphaAcidPercent: number; weightG: number; boilTimeMinutes: number; use?: "boil" | "whirlpool" | "dry_hop" }>;

  for (const ingredient of ingredients) {
    const source = ingredient.ingredientCatalogItemId
      ? await ensureCatalogIngredientExists(ingredient.ingredientCatalogItemId)
      : ingredient.userCustomIngredientId
        ? await ensureOwnedCustomIngredient(authorId, ingredient.userCustomIngredientId)
        : null;

    if (!source) {
      continue;
    }
    if (ingredient.type === "fermentable" || ingredient.type === "sugar") {
      const weightKg = ingredient.amountNormalizedUnit === "g"
        ? roundTo(ingredient.amountNormalizedQuantity / 1000, 3)
        : 0;
      if (weightKg <= 0) {
        continue;
      }

      fermentables.push({
        id: ingredient.id,
        name: source.displayName,
        weightKg,
        potentialPpg: getIngredientPotentialPpg(source, 36),
        colorLovibond: getIngredientColorLovibond(source, 2)
      });
    }

    if (ingredient.type === "hop") {
      const weightG = ingredient.amountNormalizedUnit === "g" ? ingredient.amountNormalizedQuantity : 0;
      if (weightG <= 0) {
        continue;
      }

      const stageUse = ingredient.stage === "whirlpool"
        ? "whirlpool"
        : ingredient.stage === "fermentation"
          ? "dry_hop"
          : "boil";

      hops.push({
        id: ingredient.id,
        name: source.displayName,
        alphaAcidPercent: getIngredientAlphaAcidPercent(source, 5),
        weightG,
        boilTimeMinutes: ingredient.timeOffset ?? 60,
        use: stageUse
      });
    }
  }

  if (!fermentables.length && !hops.length) {
    const [updatedEmpty] = await db.update(recipes).set({
      og: null,
      fg: null,
      abv: null,
      ibu: null,
      color: null,
      updatedAt: new Date()
    }).where(eq(recipes.id, recipeId)).returning();

    if (!updatedEmpty) {
      throw new Error("NOT_FOUND");
    }

    return mapRecipeListDto(updatedEmpty);
  }

  const og = fermentables.length
    ? calculateOg({ fermentables, batchVolumeL, brewhouseEfficiencyPercent: efficiency })
    : null;
  const fg = og ? calculateFg({ og, attenuationPercent: DEFAULT_ATTENUATION }) : null;
  const abv = og && fg ? calculateAbv(og, fg) : null;
  const ibu = hops.length && og ? calculateIbuTinseth({ og, batchVolumeL, hopAdditions: hops }) : null;
  const color = fermentables.length ? calculateColor(fermentables, batchVolumeL).srm : null;

  const [updated] = await db.update(recipes).set({
    efficiency,
    og,
    fg,
    abv,
    ibu,
    color,
    updatedAt: new Date()
  }).where(eq(recipes.id, recipeId)).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapRecipeListDto(updated);
};

export const createRecipe = async (authorId: string, payload: unknown) => {
  const parsed = createRecipePayloadSchema.parse(payload);
  const batchSize = normalizeRecipeBatchSize(parsed.batchSizeEnteredQuantity, parsed.batchSizeEnteredUnit);
  let [created] = [] as Array<typeof recipes.$inferSelect>;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = await resolveUniqueRecipeSlug(parsed.title);

    try {
      [created] = await db.insert(recipes).values({
        authorId,
        publicationState: parsed.publicationState,
        title: parsed.title,
        slug,
        styleId: parsed.styleId ?? null,
        batchSizeEnteredQuantity: batchSize.enteredQuantity,
        batchSizeEnteredUnit: batchSize.enteredUnit,
        batchSizeNormalizedQuantity: batchSize.normalizedQuantity,
        batchSizeNormalizedUnit: batchSize.normalizedUnit,
        efficiency: parsed.efficiency ?? null,
        description: parsed.description ?? null,
        authorNotes: parsed.authorNotes ?? null,
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
  const parsed = updateRecipePayloadSchema.parse(payload);
  const current = await ensureOwnedRecipe(authorId, recipeId);

  const batchSize = parsed.batchSizeEnteredQuantity !== undefined || parsed.batchSizeEnteredUnit !== undefined
    ? normalizeRecipeBatchSize(
      parsed.batchSizeEnteredQuantity ?? current.batchSizeEnteredQuantity,
      parsed.batchSizeEnteredUnit ?? current.batchSizeEnteredUnit
    )
    : null;

  const nextTitle = parsed.title ?? current.title;
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
        description: parsed.description !== undefined ? parsed.description : current.description,
        authorNotes: parsed.authorNotes !== undefined ? parsed.authorNotes : current.authorNotes,
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
    orderBy: [asc(recipes.createdAt)],
    limit: parsed.limit
  });

  return rows.map(mapRecipeListDto);
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
