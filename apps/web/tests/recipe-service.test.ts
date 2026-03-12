import { beforeEach, describe, expect, it, vi } from "vitest";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    recipes: { name: "recipes", id: "id", authorId: "authorId", status: "status", visibility: "visibility", createdAt: "createdAt" },
    recipeIngredients: { name: "recipe_ingredients", id: "id", recipeId: "recipeId", ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", type: "type", stage: "stage" },
    ingredientCatalogItems: { name: "ingredientCatalogItems", id: "id", status: "status", type: "type" },
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
          const recipe = mockState.recipesById.get(id);
          if (!recipe) return null;
          if (authorId && recipe.authorId !== authorId) return null;
          if (arg?.with?.ingredients) return { ...recipe, ingredients: mockState.ingredientsByRecipeId.get(recipe.id) ?? [] };
          return recipe;
        },
        findMany: async (arg: any) => {
          const authorId = getEqValue(arg?.where, "authorId");
          return [...mockState.recipesById.values()].filter((recipe) => recipe.authorId === authorId);
        }
      },
      recipeIngredients: {
        findMany: async (arg: any) => {
          const recipeId = getEqValue(arg?.where, "recipeId");
          return mockState.ingredientsByRecipeId.get(recipeId) ?? [];
        }
      },
      ingredientCatalogItems: {
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
    delete: (_table: { name: string }) => ({
      where: async (where: any) => {
        const recipeId = getEqValue(where, "recipeId");
        mockState.ingredientsByRecipeId.set(recipeId, []);
      }
    })
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    asc: (v: unknown) => v,
    eq: (...args: unknown[]) => args,
    recipes: tableRefs.recipes,
    recipeIngredients: tableRefs.recipeIngredients,
    ingredientCatalogItems: tableRefs.ingredientCatalogItems,
    userCustomIngredients: tableRefs.userCustomIngredients
  };
});

import {
  createRecipe,
  getPublicRecipeById,
  getRecipeById,
  listRecipesForAuthor,
  recomputeRecipeStats,
  updateRecipe
} from "../features/recipes/service";

describe("recipe service", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.recipesById.clear();
    mockState.ingredientsByRecipeId.clear();
    mockState.catalogById.clear();
    mockState.customById.clear();

    mockState.catalogById.set(uuid(101), { id: uuid(101), status: "active", type: "fermentable", displayName: "Pale Malt", properties: { potentialPpg: 37, colorLovibond: 2 } });
    mockState.catalogById.set(uuid(102), { id: uuid(102), status: "active", type: "hop", displayName: "Cascade", properties: { alphaAcidPercent: 6 } });
    mockState.customById.set(uuid(201), { id: uuid(201), userId: "u1", type: "hop", displayName: "My Hop", properties: { alphaAcidPercent: 7 } });
  });

  it("create recipe", async () => {
    const recipe = await createRecipe("u1", { title: "Test IPA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    expect(recipe.batchSizeNormalizedQuantity).toBe(20000);
  });

  it("add catalog ingredient to recipe", async () => {
    const recipe = await createRecipe("u1", {
      title: "With catalog",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [{ ingredientCatalogItemId: uuid(101), type: "fermentable", amountEnteredQuantity: 5, amountEnteredUnit: "kg", stage: "mash" }]
    });
    expect(recipe.ingredients[0]?.amountNormalizedQuantity).toBe(5000);
  });

  it("add custom ingredient to private recipe", async () => {
    const recipe = await createRecipe("u1", {
      title: "Private",
      status: "private",
      visibility: "private",
      batchSizeEnteredQuantity: 10,
      batchSizeEnteredUnit: "l",
      ingredients: [{ userCustomIngredientId: uuid(201), type: "hop", amountEnteredQuantity: 50, amountEnteredUnit: "g", stage: "boil" }]
    });
    expect(recipe.ingredients[0]?.userCustomIngredientId).toBe(uuid(201));
  });

  it("invalid source linkage rejected", async () => {
    await expect(createRecipe("u1", {
      title: "Invalid",
      batchSizeEnteredQuantity: 10,
      batchSizeEnteredUnit: "l",
      ingredients: [{ ingredientCatalogItemId: uuid(101), userCustomIngredientId: uuid(201), type: "hop", amountEnteredQuantity: 10, amountEnteredUnit: "g" }]
    })).rejects.toThrow();
  });

  it("recompute stats updates recipe fields", async () => {
    const recipe = await createRecipe("u1", {
      title: "Stats",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      ingredients: [
        { ingredientCatalogItemId: uuid(101), type: "fermentable", amountEnteredQuantity: 4, amountEnteredUnit: "kg", stage: "mash" },
        { ingredientCatalogItemId: uuid(102), type: "hop", amountEnteredQuantity: 40, amountEnteredUnit: "g", stage: "boil", timeOffset: 60 }
      ]
    });
    const updated = await recomputeRecipeStats("u1", recipe.id);
    expect(updated.og).not.toBeNull();
    expect(updated.ibu).not.toBeNull();
  });

  it("list recipes for author", async () => {
    await createRecipe("u1", { title: "R1", batchSizeEnteredQuantity: 10, batchSizeEnteredUnit: "l" });
    await createRecipe("u1", { title: "R2", batchSizeEnteredQuantity: 15, batchSizeEnteredUnit: "l" });
    const list = await listRecipesForAuthor("u1");
    expect(list).toHaveLength(2);
  });

  it("cross-user edit forbidden", async () => {
    const recipe = await createRecipe("u1", { title: "Owned", batchSizeEnteredQuantity: 10, batchSizeEnteredUnit: "l" });
    await expect(updateRecipe("u2", recipe.id, { title: "hack" })).rejects.toThrowError("NOT_FOUND");
  });

  it("integration create-update-recalc and published visibility", async () => {
    const recipe = await createRecipe("u1", { title: "Flow", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    const updated = await updateRecipe("u1", recipe.id, {
      status: "published",
      visibility: "public",
      ingredients: [{ ingredientCatalogItemId: uuid(101), type: "fermentable", amountEnteredQuantity: 3, amountEnteredUnit: "kg", stage: "mash" }]
    });
    expect(updated.status).toBe("published");
    const publicRead = await getRecipeById("u2", recipe.id);
    expect(publicRead.id).toBe(recipe.id);
  });


  it("private ownership rule denies non-owner read", async () => {
    const recipe = await createRecipe("u1", { title: "Private", status: "private", visibility: "private", batchSizeEnteredQuantity: 12, batchSizeEnteredUnit: "l" });
    await expect(getRecipeById("u2", recipe.id)).rejects.toThrowError("FORBIDDEN");
  });

  it("public accessor allows only published public recipes", async () => {
    const recipe = await createRecipe("u1", {
      title: "Public recipe",
      status: "published",
      visibility: "public",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l"
    });

    const publicRead = await getPublicRecipeById(recipe.id);
    expect(publicRead.id).toBe(recipe.id);
  });

  it("public accessor blocks private or draft recipes", async () => {
    const privateRecipe = await createRecipe("u1", {
      title: "Not public",
      status: "published",
      visibility: "private",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l"
    });

    const draftRecipe = await createRecipe("u1", {
      title: "Draft",
      status: "draft",
      visibility: "public",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l"
    });

    await expect(getPublicRecipeById(privateRecipe.id)).rejects.toThrowError("FORBIDDEN");
    await expect(getPublicRecipeById(draftRecipe.id)).rejects.toThrowError("FORBIDDEN");
  });

  it("batch size normalization works", async () => {
    const recipe = await createRecipe("u1", { title: "Batch", batchSizeEnteredQuantity: 5, batchSizeEnteredUnit: "gal" });
    expect(recipe.batchSizeNormalizedUnit).toBe("ml");
    expect(recipe.batchSizeNormalizedQuantity).toBeGreaterThan(18000);
  });
});
