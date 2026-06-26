import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// assertRecipeCloneAllowed и buildRecipeClonePayload — чистые (в БД не ходят).
// Реальный импорт @nb/db в тест-окружении безопасен (соединение ленивое), как и в
// tests/recipes-read-components.test.ts, который тоже тянет service.ts транзитивно.

import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";
import { assertRecipeCloneAllowed, buildCloneTitle, buildRecipeClonePayload } from "../features/recipes/service";

const sourceRecipe: RecipeDetailDto = {
  id: "src-1",
  authorId: "author-1",
  recipeFamilyId: "rf-src",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  title: "West Coast IPA",
  slug: "west-coast-ipa",
  styleId: "american-ipa",
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 72,
  boilTimeMinutes: 75,
  og: 1.062,
  fg: 1.012,
  abv: 6.5,
  ibu: 60,
  color: 8,
  description: "Crisp and bitter",
  authorNotes: "Dry hop day 5",
  processMeta: defaultRecipeProcessMeta,
  heroImageId: null,
  rating: null,
  versions: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: [
    {
      id: "ri-cat",
      recipeId: "src-1",
      persistentKey: "00000000-0000-4000-8000-000000000001",
      displayOrder: 0,
      ingredientCatalogItemId: "cat-pale",
      userCustomIngredientId: null,
      type: "fermentable",
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
      ingredientDisplayName: "Pale Malt",
      amountEnteredQuantity: 5,
      amountEnteredUnit: "kg",
      amountNormalizedQuantity: 5000,
      amountNormalizedUnit: "g",
      stage: "mash",
      timeOffset: null,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    {
      id: "ri-custom",
      recipeId: "src-1",
      persistentKey: "00000000-0000-4000-8000-000000000002",
      displayOrder: 1,
      ingredientCatalogItemId: null,
      userCustomIngredientId: "custom-1",
      type: "yeast",
      ingredientCategory: "yeast",
      ingredientSubtype: "yeast",
      ingredientDisplayName: "House Yeast",
      ingredientDefaultDisplayUnit: "g",
      amountEnteredQuantity: 11,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 11,
      amountNormalizedUnit: "g",
      stage: "fermentation",
      timeOffset: null,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  ]
};

describe("assertRecipeCloneAllowed", () => {
  it("allows cloning any of your OWN recipes regardless of status", () => {
    expect(assertRecipeCloneAllowed({ sourceAuthorId: "me", sourcePublicationState: "draft", userId: "me" })).toEqual({ isOwn: true });
    expect(assertRecipeCloneAllowed({ sourceAuthorId: "me", sourcePublicationState: "private", userId: "me" })).toEqual({ isOwn: true });
    expect(assertRecipeCloneAllowed({ sourceAuthorId: "me", sourcePublicationState: "published", userId: "me" })).toEqual({ isOwn: true });
  });

  it("allows cloning someone else's recipe ONLY when it is published", () => {
    expect(assertRecipeCloneAllowed({ sourceAuthorId: "other", sourcePublicationState: "published", userId: "me" })).toEqual({ isOwn: false });
  });

  it("forbids cloning someone else's non-published recipe", () => {
    expect(() => assertRecipeCloneAllowed({ sourceAuthorId: "other", sourcePublicationState: "draft", userId: "me" })).toThrow("FORBIDDEN");
    expect(() => assertRecipeCloneAllowed({ sourceAuthorId: "other", sourcePublicationState: "private", userId: "me" })).toThrow("FORBIDDEN");
  });
});

describe("buildRecipeClonePayload", () => {
  it("creates a private draft and carries over the recipe-level fields", () => {
    const payload = buildRecipeClonePayload(sourceRecipe, { title: "West Coast IPA", remapPrivateCustomToImported: false });

    expect(payload.title).toBe("West Coast IPA");
    expect(payload.publicationState).toBe("private");
    expect(payload.styleId).toBe("american-ipa");
    expect(payload.batchSizeEnteredQuantity).toBe(20);
    expect(payload.efficiency).toBe(72);
    expect(payload.boilTimeMinutes).toBe(75);
  });

  it("keeps the custom-ingredient link when cloning your OWN recipe (no remap)", () => {
    const payload = buildRecipeClonePayload(sourceRecipe, { title: "copy", remapPrivateCustomToImported: false });

    const custom = payload.ingredients[1] as Record<string, unknown>;
    expect(custom.userCustomIngredientId).toBe("custom-1");
    expect(custom.inventoryIntentMode).toBeNull();
  });

  it("remaps a private custom ingredient to an imported snapshot for cross-user clones", () => {
    const payload = buildRecipeClonePayload(sourceRecipe, { title: "West Coast IPA", remapPrivateCustomToImported: true });

    // каталожный (глобальный) ингредиент переносится как есть
    const catalog = payload.ingredients[0] as Record<string, unknown>;
    expect(catalog.ingredientCatalogItemId).toBe("cat-pale");
    expect(catalog.userCustomIngredientId).toBeNull();

    // приватный кастом чужого автора → imported-снимок (без FK на чужой кастом)
    const remapped = payload.ingredients[1] as Record<string, unknown>;
    expect(remapped.ingredientCatalogItemId).toBeNull();
    expect(remapped.userCustomIngredientId).toBeNull();
    expect(remapped.inventoryIntentMode).toBe("imported");
    expect(remapped.amountEnteredQuantity).toBe(11);

    const snapshot = (remapped.externalImportMeta as { importedIngredient: Record<string, unknown> }).importedIngredient;
    expect(snapshot.version).toBe(1);
    expect(snapshot.name).toBe("House Yeast");
    expect(snapshot.type).toBe("yeast");
    expect(snapshot.category).toBe("yeast");
  });
});

describe("buildCloneTitle", () => {
  it("appends «(клон {имя})» with the cloner's name", () => {
    expect(buildCloneTitle("West Coast IPA", "Артём")).toBe("West Coast IPA (клон Артём)");
  });

  it("trims the base title", () => {
    expect(buildCloneTitle("  Lager  ", "Sam")).toBe("Lager (клон Sam)");
  });

  it("keeps the suffix and stays within 180 chars for very long titles", () => {
    const longBase = "X".repeat(220);
    const title = buildCloneTitle(longBase, "Артём");

    expect(title.length).toBeLessThanOrEqual(180);
    expect(title.endsWith("(клон Артём)")).toBe(true);
  });
});
