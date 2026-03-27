import { beforeEach, describe, expect, it, vi } from "vitest";

import { toRecipeSlugBase } from "../features/recipes/slug";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    recipes: { name: "recipes", id: "id", authorId: "authorId", publicationState: "publicationState", slug: "slug", createdAt: "createdAt", updatedAt: "updatedAt" },
    recipeIngredients: { name: "recipe_ingredients", id: "id", recipeId: "recipeId", ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", type: "type", stage: "stage" },
    ingredients: { name: "ingredients", id: "id", isActive: "isActive", type: "type" },
    userCustomIngredients: { name: "userCustomIngredients", id: "id", userId: "userId", type: "type" }
  },
  mockState: {
    idCounter: 0,
    recipesById: new Map<string, any>(),
    ingredientsByRecipeId: new Map<string, any[]>(),
    catalogById: new Map<string, any>(),
    customById: new Map<string, any>()
  }
}));

vi.mock("@nb/db", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const getEqValue = (where: any, key: string) => {
    if (Array.isArray(where) && where.length === 2 && where[0] === key) {
      return where[1];
    }
    const items = Array.isArray(where) ? where : [where];
    const found = items.find((entry) => Array.isArray(entry) && entry[0] === key);
    return found?.[1];
  };

  const db = {
    query: {
      recipes: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          const authorId = getEqValue(arg?.where, "authorId");
          const slug = getEqValue(arg?.where, "slug");

          const recipe = id
            ? mockState.recipesById.get(id)
            : slug
              ? [...mockState.recipesById.values()].find((item) => item.slug === slug)
              : null;

          if (!recipe) return null;
          if (authorId && recipe.authorId !== authorId) return null;
          if (arg?.with?.ingredients) return { ...recipe, ingredients: mockState.ingredientsByRecipeId.get(recipe.id) ?? [] };
          return recipe;
        },
        findMany: async (arg: any) => {
          const authorId = getEqValue(arg?.where, "authorId");
          const publicationState = getEqValue(arg?.where, "publicationState");

          return [...mockState.recipesById.values()]
            .filter((recipe) => (authorId ? recipe.authorId === authorId : true))
            .filter((recipe) => (publicationState ? recipe.publicationState === publicationState : true));
        }
      },
      recipeIngredients: {
        findMany: async (arg: any) => {
          const recipeId = getEqValue(arg?.where, "recipeId");
          return mockState.ingredientsByRecipeId.get(recipeId) ?? [];
        }
      },
      ingredients: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          return mockState.catalogById.get(id) ?? null;
        }
      },
      userCustomIngredients: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          const userId = getEqValue(arg?.where, "userId");
          const item = mockState.customById.get(id) ?? null;
          return item && item.userId === userId ? item : null;
        }
      }
    },
    insert: (table: { name: string }) => ({
      values: (values: any) => {
        if (table.name === "recipe_ingredients") {
          const payload = Array.isArray(values) ? values : [values];
          for (const value of payload) {
            const row = { ...value, id: uuid(++mockState.idCounter), createdAt: now, updatedAt: now };
            const current = mockState.ingredientsByRecipeId.get(row.recipeId) ?? [];
            current.push(row);
            mockState.ingredientsByRecipeId.set(row.recipeId, current);
          }
        }

        return {
          returning: async () => {
            if (table.name === "recipes") {
              const row = { ...values, id: uuid(++mockState.idCounter), createdAt: now, updatedAt: now };
              mockState.recipesById.set(row.id, row);
              return [row];
            }

            return Array.isArray(values) ? values : [values];
          }
        };
      }
    }),
    update: (_table: { name: string }) => ({
      set: (set: any) => ({
        where: (where: any) => ({
          returning: async () => {
            const id = getEqValue(where, "id") ?? [...mockState.recipesById.keys()][0];
            const current = id ? mockState.recipesById.get(id) : null;
            if (!current || !id) return [];
            const updated = { ...current, ...set };
            mockState.recipesById.set(id, updated);
            return [updated];
          }
        })
      })
    }),
    delete: (table: { name: string }) => ({
      where: async (where: any) => {
        if (table.name === "recipe_ingredients") {
          const recipeId = getEqValue(where, "recipeId");
          mockState.ingredientsByRecipeId.set(recipeId, []);
          return;
        }

        if (table.name === "recipes") {
          const id = getEqValue(where, "id");
          if (id) {
            mockState.recipesById.delete(id);
            mockState.ingredientsByRecipeId.delete(id);
          }
        }
      }
    })
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    count: (value: unknown) => value,
    asc: (v: unknown) => v,
    desc: (v: unknown) => v,
    eq: (...args: unknown[]) => args,
    recipes: tableRefs.recipes,
    recipeIngredients: tableRefs.recipeIngredients,
    ingredients: tableRefs.ingredients,
    userCustomIngredients: tableRefs.userCustomIngredients
  };
});

import {
  createRecipe,
  deleteRecipe,
  getNextDefaultRecipeTitle,
  getPublicRecipeBySlug,
  getRecipeById,
  listPublicRecipes,
  previewRecipeDraft,
  recomputeRecipeStats,
  updateRecipe
} from "../features/recipes/service";

const buildReadyPrivatePayload = (overrides: Record<string, unknown> = {}) => ({
  title: "Ready private recipe",
  publicationState: "private",
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  boilTimeMinutes: 60,
  ingredients: [
    {
      ingredientCatalogItemId: uuid(101),
      type: "malt",
      category: "fermentable",
      amountEnteredQuantity: 4,
      amountEnteredUnit: "kg",
      stage: "mash"
    },
    {
      ingredientCatalogItemId: uuid(102),
      type: "hop",
      category: "hop",
      amountEnteredQuantity: 40,
      amountEnteredUnit: "g",
      stage: "boil",
      timeOffset: 60
    }
  ],
  ...overrides
});

const buildReadyPublicPayload = (overrides: Record<string, unknown> = {}) => ({
  ...buildReadyPrivatePayload({
    title: "Ready public recipe",
    publicationState: "published",
    styleId: "21A",
    description: "Публичное описание рецепта.",
    ingredients: [
      {
        ingredientCatalogItemId: uuid(101),
        type: "malt",
        category: "fermentable",
        amountEnteredQuantity: 4,
        amountEnteredUnit: "kg",
        stage: "mash"
      },
      {
        ingredientCatalogItemId: uuid(102),
        type: "hop",
        category: "hop",
        amountEnteredQuantity: 40,
        amountEnteredUnit: "g",
        stage: "boil",
        timeOffset: 60
      },
      {
        ingredientCatalogItemId: uuid(103),
        type: "yeast",
        category: "yeast",
        amountEnteredQuantity: 11,
        amountEnteredUnit: "g",
        stage: "fermentation"
      }
    ]
  }),
  ...overrides
});

describe("recipe service", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.recipesById.clear();
    mockState.ingredientsByRecipeId.clear();
    mockState.catalogById.clear();
    mockState.customById.clear();

    mockState.catalogById.set(uuid(101), {
      id: uuid(101),
      isActive: true,
      type: "malt",
      itemKind: "malt",
      nameRu: null,
      nameEn: "Pale Malt",
      displayModeRu: "source_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: null,
      countryName: null,
      brand: null,
      producer: null,
      productCode: null,
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      quantityDefaults: null,
      attributes: { extract_pct_dry_basis: 80, color_lovibond: 2 }
    });
    mockState.catalogById.set(uuid(102), {
      id: uuid(102),
      isActive: true,
      type: "hop",
      itemKind: "hop",
      nameRu: null,
      nameEn: "Cascade",
      displayModeRu: "source_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: null,
      countryName: null,
      brand: null,
      producer: null,
      productCode: null,
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      quantityDefaults: null,
      attributes: { alpha_acid_pct_typical: 6 }
    });
    mockState.catalogById.set(uuid(103), {
      id: uuid(103),
      isActive: true,
      type: "yeast",
      itemKind: "yeast",
      nameRu: "US-05",
      nameEn: "US-05",
      displayModeRu: "source_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: null,
      countryName: null,
      brand: null,
      producer: null,
      productCode: "US-05",
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      quantityDefaults: null,
      attributes: {
        form: "dry",
        attenuation_pct_typical: 78,
        package_size: 11,
        package_unit: "g"
      }
    });
    mockState.customById.set(uuid(201), {
      id: uuid(201),
      userId: "u1",
      type: "hop",
      displayName: "My Hop",
      properties: {
        category: "hop",
        subtype: "hop",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "oz"],
        measurementDimension: "weight",
        alphaAcidPercent: 7
      }
    });
  });

  it("builds transliterated kebab slug base", () => {
    expect(toRecipeSlugBase("Каскад цветочный")).toContain("kaskad");
    expect(toRecipeSlugBase("American IPA")).toBe("american-ipa");
  });

  it("create recipe generates slug", async () => {
    const recipe = await createRecipe("u1", { title: "Test IPA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    expect(recipe.slug).toBe("test-ipa");
  });

  it("create falls back to default batch parameters and private visibility", async () => {
    const recipe = await createRecipe("u1", { title: "Loose draft" });

    expect(recipe.publicationState).toBe("private");
    expect(recipe.batchSizeEnteredQuantity).toBe(20);
    expect(recipe.batchSizeEnteredUnit).toBe("l");
    expect(recipe.boilTimeMinutes).toBe(60);
  });

  it("slug uniqueness appends numeric suffix", async () => {
    const first = await createRecipe("u1", { title: "American IPA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    const second = await createRecipe("u1", { title: "American IPA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    expect(first.slug).toBe("american-ipa");
    expect(second.slug).toBe("american-ipa-2");
  });

  it("suggests next default title from existing numbered drafts", async () => {
    await createRecipe("u1", { title: "Новый рецепт 1" });
    await createRecipe("u1", { title: "Новый рецепт 2" });
    await createRecipe("u1", { title: "Dry Stout" });

    await expect(getNextDefaultRecipeTitle("u1")).resolves.toBe("Новый рецепт 3");
  });

  it("recompute stats updates recipe fields", async () => {
    const recipe = await createRecipe("u1", {
      title: "Stats",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [
        { ingredientCatalogItemId: uuid(101), type: "malt", amountEnteredQuantity: 4, amountEnteredUnit: "kg", stage: "mash" },
        { ingredientCatalogItemId: uuid(102), type: "hop", amountEnteredQuantity: 40, amountEnteredUnit: "g", stage: "boil", timeOffset: 60 }
      ]
    });
    const updated = await recomputeRecipeStats("u1", recipe.id);
    expect(updated.og).not.toBeNull();
    expect(updated.ibu).not.toBeNull();
  });

  it("preview draft recalculates stats even without title", async () => {
    const preview = await previewRecipeDraft("u1", {
      title: "",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      boilTimeMinutes: 60,
      ingredients: [
        { ingredientCatalogItemId: uuid(101), type: "malt", amountEnteredQuantity: 4, amountEnteredUnit: "kg", stage: "mash" },
        { ingredientCatalogItemId: uuid(102), type: "hop", amountEnteredQuantity: 40, amountEnteredUnit: "g", stage: "boil", timeOffset: 60 }
      ]
    });

    expect(preview.og).not.toBeNull();
    expect(preview.ibu).not.toBeNull();
  });

  it("persists taxonomy snapshot columns on recipe ingredients", async () => {
    const recipe = await createRecipe("u1", {
      title: "Snapshot recipe",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [
        {
          ingredientCatalogItemId: uuid(101),
          type: "malt",
          category: "fermentable",
          subtype: "malt",
          familyId: null,
          amountEnteredQuantity: 4,
          amountEnteredUnit: "kg",
          stage: "mash"
        }
      ]
    });

    const persisted = mockState.ingredientsByRecipeId.get(recipe.id) ?? [];

    expect(persisted[0]).toMatchObject({
      ingredientCatalogItemId: uuid(101),
      ingredientFamilyId: null,
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
      ingredientDisplayNameSnapshot: "Pale Malt",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight"
    });
    expect(persisted[0]?.stepMeta ?? null).toBeNull();
  });

  it("hydrates recipe dto from persisted snapshot when source row is unavailable", async () => {
    const recipe = await createRecipe("u1", {
      title: "Persisted only",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l"
    });

    mockState.ingredientsByRecipeId.set(recipe.id, [
      {
        id: uuid(777),
        recipeId: recipe.id,
        ingredientCatalogItemId: uuid(999),
        userCustomIngredientId: null,
        ingredientFamilyId: uuid(302),
        ingredientCategory: "hop",
          ingredientSubtype: "hop",
        ingredientDisplayNameSnapshot: "Old Cascade",
        ingredientDefaultDisplayUnitSnapshot: "g",
        ingredientMeasurementDimension: "weight",
        type: "hop",
        amountEnteredQuantity: 50,
        amountEnteredUnit: "g",
        amountNormalizedQuantity: 50,
        amountNormalizedUnit: "g",
        stage: "boil",
        timeOffset: 60,
        stepMeta: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);
    mockState.catalogById.delete(uuid(999));

    const hydrated = await getRecipeById("u1", recipe.id);

    expect(hydrated.ingredients[0]).toMatchObject({
      ingredientFamilyId: uuid(302),
      ingredientCategory: "hop",
      ingredientSubtype: "hop",
      ingredientDisplayName: "Old Cascade",
      ingredientDisplayNameSnapshot: "Old Cascade",
      ingredientDefaultDisplayUnit: "g",
      ingredientDefaultDisplayUnitSnapshot: "g",
      ingredientMeasurementDimension: "weight",
      ingredientMeasurementDimensionSnapshot: "weight"
    });
  });

  it("cross-user edit forbidden", async () => {
    const recipe = await createRecipe("u1", { title: "Owned", batchSizeEnteredQuantity: 10, batchSizeEnteredUnit: "l" });
    await expect(updateRecipe("u2", recipe.id, { title: "hack" })).rejects.toThrowError("NOT_FOUND");
  });

  it("delete removes owned recipe", async () => {
    const recipe = await createRecipe("u1", { title: "To delete", batchSizeEnteredQuantity: 10, batchSizeEnteredUnit: "l" });

    await deleteRecipe("u1", recipe.id);

    await expect(getRecipeById("u1", recipe.id)).rejects.toThrowError("NOT_FOUND");
  });

  it("public accessor by slug allows only published public recipes", async () => {
    const recipe = await createRecipe("u1", buildReadyPublicPayload({
      title: "Public recipe"
    }));

    const publicRead = await getPublicRecipeBySlug(recipe.slug);
    expect(publicRead.id).toBe(recipe.id);
  });

  it("public accessor by slug blocks private or draft recipes", async () => {
    const privateRecipe = await createRecipe("u1", buildReadyPrivatePayload({
      title: "Not public"
    }));

    const draftRecipe = await createRecipe("u1", {
      title: "Draft",
      publicationState: "draft",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l"
    });

    await expect(getPublicRecipeBySlug(privateRecipe.slug)).rejects.toThrowError("FORBIDDEN");
    await expect(getPublicRecipeBySlug(draftRecipe.slug)).rejects.toThrowError("FORBIDDEN");
  });

  it("listPublicRecipes returns only published public recipes", async () => {
    await createRecipe("u1", buildReadyPublicPayload({ title: "Public 1" }));
    await createRecipe("u1", buildReadyPrivatePayload({ title: "Private" }));
    await createRecipe("u1", { title: "Draft", publicationState: "draft", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });

    const list = await listPublicRecipes();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Public 1");
  });

  it("private ownership rule denies non-owner read", async () => {
    const recipe = await createRecipe("u1", buildReadyPrivatePayload({
      title: "Private",
      batchSizeEnteredQuantity: 12
    }));
    await expect(getRecipeById("u2", recipe.id)).rejects.toThrowError("FORBIDDEN");
  });

  it("private recipe can be created with only a title", async () => {
    const recipe = await createRecipe("u1", {
      title: "Bare private",
      publicationState: "private"
    });

    expect(recipe.publicationState).toBe("private");
    expect(recipe.ingredients).toEqual([]);
  });

  it("published recipe requires style, description and yeast", async () => {
    await expect(createRecipe("u1", {
      title: "Broken public",
      publicationState: "published",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [
        {
          ingredientCatalogItemId: uuid(101),
          type: "malt",
          category: "fermentable",
          amountEnteredQuantity: 4,
          amountEnteredUnit: "kg",
          stage: "mash"
        },
        {
          ingredientCatalogItemId: uuid(102),
          type: "hop",
          category: "hop",
          amountEnteredQuantity: 40,
          amountEnteredUnit: "g",
          stage: "boil",
          timeOffset: 60
        }
      ]
    })).rejects.toMatchObject({
      name: "RecipeValidationError",
      fieldErrors: {
        styleId: "Выберите стиль BJCP.",
        description: "Добавьте описание рецепта.",
        "ingredients.yeast": "Для публичного рецепта добавьте дрожжи."
      }
    });
  });
});
