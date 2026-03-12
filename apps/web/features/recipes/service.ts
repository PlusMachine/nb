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
  type RecipeStatus,
  updateRecipePayloadSchema
} from "./contracts";
import {
  normalizeRecipeBatchSize,
  normalizeRecipeIngredientAmount,
  parseRecipeUnit,
  toBatchVolumeLiters
} from "./units";
import { appendSlugSuffix, toRecipeSlugBase } from "./slug";
import {
  getIngredientAlphaAcidPercent,
  getIngredientColorLovibond,
  getIngredientPotentialPpg
} from "../ingredients/technical-fields";

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
  if (!isOwner && recipe.status !== "published") {
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

  if (recipe.status !== "published" || recipe.visibility !== "public") {
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

  if (recipe.status !== "published" || recipe.visibility !== "public") {
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

const parseRecipeIngredientUnit = (value: string) => {
  const unit = parseRecipeUnit(value);
  if (!unit) {
    throw new Error("INVALID_UNIT");
  }

  return unit;
};

const mapIngredientDto = (ingredient: typeof recipeIngredients.$inferSelect): RecipeIngredientDto => ({
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

const mapRecipeListDto = (recipe: typeof recipes.$inferSelect): RecipeListItemDto => ({
  id: recipe.id,
  authorId: recipe.authorId,
  status: recipe.status,
  visibility: recipe.visibility,
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

const mapRecipeDetailDto = (
  recipe: typeof recipes.$inferSelect,
  ingredients: Array<typeof recipeIngredients.$inferSelect>
): RecipeDetailDto => ({
  ...mapRecipeListDto(recipe),
  description: recipe.description,
  authorNotes: recipe.authorNotes,
  heroImageId: recipe.heroImageId,
  ingredients: ingredients.map(mapIngredientDto)
});

const replaceRecipeIngredients = async (
  authorId: string,
  recipeId: string,
  payloadIngredients: Array<{
    ingredientCatalogItemId?: string | null;
    userCustomIngredientId?: string | null;
    type: typeof recipeIngredients.$inferInsert.type;
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
    if (ingredient.ingredientCatalogItemId) {
      const catalog = await ensureCatalogIngredientExists(ingredient.ingredientCatalogItemId);
      if (catalog.type !== ingredient.type) {
        throw new Error("INGREDIENT_TYPE_MISMATCH");
      }
    }

    if (ingredient.userCustomIngredientId) {
      const custom = await ensureOwnedCustomIngredient(authorId, ingredient.userCustomIngredientId);
      if (custom.type !== ingredient.type) {
        throw new Error("INGREDIENT_TYPE_MISMATCH");
      }
    }

    const amount = normalizeRecipeIngredientAmount(
      ingredient.type,
      ingredient.amountEnteredQuantity,
      ingredient.amountEnteredUnit
    );

    preparedValues.push({
      recipeId,
      ingredientCatalogItemId: ingredient.ingredientCatalogItemId ?? null,
      userCustomIngredientId: ingredient.userCustomIngredientId ?? null,
      type: ingredient.type,
      amountEnteredQuantity: amount.enteredQuantity,
      amountEnteredUnit: amount.enteredUnit,
      amountNormalizedQuantity: amount.normalizedQuantity,
      amountNormalizedUnit: amount.normalizedUnit,
      stage: ingredient.stage,
      timeOffset: ingredient.timeOffset ?? null,
      stepMeta: ingredient.stepMeta ?? null
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
        status: parsed.status,
        visibility: parsed.visibility,
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
        status: parsed.status ?? current.status,
        visibility: parsed.visibility ?? current.visibility,
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
      parsed.status ? eq(recipes.status, parsed.status as RecipeStatus) : undefined,
      parsed.visibility ? eq(recipes.visibility, parsed.visibility) : undefined
    ),
    orderBy: [asc(recipes.createdAt)],
    limit: parsed.limit
  });

  return rows.map(mapRecipeListDto);
};

export const getRecipeById = async (viewerId: string | null, recipeId: string): Promise<RecipeDetailDto> => {
  const recipe = await ensureAccessibleRecipe(viewerId, recipeId);
  return mapRecipeDetailDto(recipe, recipe.ingredients);
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

  return mapRecipeDetailDto(recipe, recipe.ingredients);
};

export const getPublicRecipeById = async (recipeId: string): Promise<RecipeDetailDto> => {
  const recipe = await ensurePublicRecipe(recipeId);
  return mapRecipeDetailDto(recipe, recipe.ingredients);
};

export const getPublicRecipeBySlug = async (slug: string): Promise<RecipeDetailDto> => {
  const recipe = await ensurePublicRecipeBySlug(slug);
  return mapRecipeDetailDto(recipe, recipe.ingredients);
};

export const listPublicRecipes = async (limit = 50): Promise<RecipeListItemDto[]> => {
  const rows = await db.query.recipes.findMany({
    where: and(eq(recipes.status, "published"), eq(recipes.visibility, "public")),
    orderBy: [desc(recipes.updatedAt)],
    limit
  });

  return rows.map(mapRecipeListDto);
};
