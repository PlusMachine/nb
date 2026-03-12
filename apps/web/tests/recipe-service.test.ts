import { beforeEach, describe, expect, it, vi } from "vitest";

import { toRecipeSlugBase } from "../features/recipes/slug";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    recipes: { name: "recipes", id: "id", authorId: "authorId", publicationState: "publicationState", slug: "slug", createdAt: "createdAt", updatedAt: "updatedAt" },
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
    desc: (v: unknown) => v,
    eq: (...args: unknown[]) => args,
    recipes: tableRefs.recipes,
    recipeIngredients: tableRefs.recipeIngredients,
    ingredientCatalogItems: tableRefs.ingredientCatalogItems,
    userCustomIngredients: tableRefs.userCustomIngredients
  };
});

import {
  createRecipe,
  getPublicRecipeBySlug,
  getRecipeById,
  listPublicRecipes,
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

  it("builds transliterated kebab slug base", () => {
    expect(toRecipeSlugBase("Каскад цветочный")).toContain("kaskad");
    expect(toRecipeSlugBase("American IPA")).toBe("american-ipa");
  });

  it("create recipe generates slug", async () => {
    const recipe = await createRecipe("u1", { title: "Test IPA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    expect(recipe.slug).toBe("test-ipa");
  });

  it("slug uniqueness appends numeric suffix", async () => {
    const first = await createRecipe("u1", { title: "American IPA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    const second = await createRecipe("u1", { title: "American IPA", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    expect(first.slug).toBe("american-ipa");
    expect(second.slug).toBe("american-ipa-2");
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

  it("cross-user edit forbidden", async () => {
    const recipe = await createRecipe("u1", { title: "Owned", batchSizeEnteredQuantity: 10, batchSizeEnteredUnit: "l" });
    await expect(updateRecipe("u2", recipe.id, { title: "hack" })).rejects.toThrowError("NOT_FOUND");
  });

  it("public accessor by slug allows only published public recipes", async () => {
    const recipe = await createRecipe("u1", {
      title: "Public recipe",
      publicationState: "published",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l"
    });

    const publicRead = await getPublicRecipeBySlug(recipe.slug);
    expect(publicRead.id).toBe(recipe.id);
  });

  it("public accessor by slug blocks private or draft recipes", async () => {
    const privateRecipe = await createRecipe("u1", {
      title: "Not public",
      publicationState: "private",
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l"
    });

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
    await createRecipe("u1", { title: "Public 1", publicationState: "published", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    await createRecipe("u1", { title: "Private", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });
    await createRecipe("u1", { title: "Draft", publicationState: "draft", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l" });

    const list = await listPublicRecipes();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Public 1");
  });

  it("private ownership rule denies non-owner read", async () => {
    const recipe = await createRecipe("u1", { title: "Private", publicationState: "private", batchSizeEnteredQuantity: 12, batchSizeEnteredUnit: "l" });
    await expect(getRecipeById("u2", recipe.id)).rejects.toThrowError("FORBIDDEN");
  });
});
