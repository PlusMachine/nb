import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  userId: "u1",
  revalidated: [] as string[],
  createdCustomId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
  addCatalogCalls: [] as any[],
  createCustomCalls: [] as any[],
  addCustomCalls: [] as any[]
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockState.revalidated.push(path)
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: mockState.userId })
}));

vi.mock("@/features/inventory/service", () => ({
  addCatalogIngredientToInventory: async (_userId: string, payload: unknown) => {
    mockState.addCatalogCalls.push(payload);
    return { id: "inv-cat" };
  },
  createUserCustomIngredient: async (_userId: string, payload: unknown) => {
    mockState.createCustomCalls.push(payload);
    return { id: mockState.createdCustomId };
  },
  addCustomIngredientToInventory: async (_userId: string, payload: unknown) => {
    mockState.addCustomCalls.push(payload);
    return { id: "inv-custom" };
  }
}));


import { addCatalogIngredientAction, addCustomIngredientAction } from "../app/(app)/app/ingredients/actions";
import { IngredientCategorySelector } from "../components/ingredients/ingredient-category-selector";
import { buildIngredientSearchParams } from "../components/ingredients/ingredient-picker";
import { AddIngredientModal } from "../components/inventory/add-ingredient-modal";
import { AddIngredientTrigger } from "../components/inventory/add-ingredient-trigger";
import { buildCatalogIngredientPayload } from "../components/inventory/catalog-ingredient-form";
import { getCustomIngredientSubtypeOptions } from "../components/inventory/custom-ingredient-form";

describe("inventory add-flow", () => {
  beforeEach(() => {
    mockState.revalidated = [];
    mockState.addCatalogCalls = [];
    mockState.createCustomCalls = [];
    mockState.addCustomCalls = [];
  });

  it("renders CTA trigger", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientTrigger));
    expect(html).toContain("Добавить ингредиент");
  });

  it("renders modal container when open", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModal, { open: true, onClose: () => undefined }));
    expect(html).toContain("Добавить ингредиент");
    expect(html).toContain("Из каталога");
    expect(html).toContain("Категория ингредиента");
    expect(html).toContain("Начните вводить название ингредиента");
  });

  it("renders category selector options", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientCategorySelector, { value: "hop", onChange: () => undefined }));
    expect(html).toContain("Хмель");
    expect(html).toContain("Дрожжи");
    expect(html).toContain('value="hop"');
  });

  it("adds catalog ingredient and revalidates inventory page", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    formData.set("enteredQuantity", "120");
    formData.set("enteredUnit", "g");
    formData.set("purchasePrice", "1250");
    formData.set("purchaseCurrency", "RUB");
    formData.set("purchaseQuantity", "5");
    formData.set("purchaseQuantityUnit", "kg");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls).toHaveLength(1);
    expect(mockState.addCatalogCalls[0]).toMatchObject({
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 120,
      enteredUnit: "g",
      purchasePriceMinor: 125000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg"
    });
    expect(mockState.revalidated).toContain("/app/ingredients");
  });

  it("adds custom ingredient and then adds it to inventory", async () => {
    const formData = new FormData();
    formData.set("category", "yeast");
    formData.set("subtype", "kveik");
    formData.set("displayName", "Kveik");
    formData.set("defaultDisplayUnit", "pack");
    formData.set("enteredQuantity", "1");
    formData.set("enteredUnit", "pack");

    const result = await addCustomIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.createCustomCalls).toHaveLength(1);
    expect(mockState.createCustomCalls[0]).toMatchObject({
      category: "yeast",
      subtype: "kveik",
      defaultDisplayUnit: "pack"
    });
    expect(mockState.addCustomCalls[0]?.userCustomIngredientId).toBe("3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    expect(mockState.addCustomCalls[0]).toMatchObject({
      enteredQuantity: 1,
      enteredUnit: "pack"
    });
    expect(mockState.revalidated).toContain("/app/ingredients");
  });

  it("rejects invalid payload", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "not-a-uuid");
    formData.set("enteredQuantity", "0");
    formData.set("enteredUnit", "");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.ingredientCatalogItemId).toBeDefined();
  });

  it("builds picker search params with category filter", () => {
    const params = buildIngredientSearchParams({ q: "citra", category: "hop", limit: 8 });

    expect(params.get("q")).toBe("citra");
    expect(params.get("category")).toBe("hop");
    expect(params.get("limit")).toBe("8");
  });

  it("exposes subtype options for custom category flow", () => {
    expect(getCustomIngredientSubtypeOptions("water_prep")).toContain("acid");
    expect(getCustomIngredientSubtypeOptions("misc")).toContain("fining");
  });

  it("submits selected catalog entity instead of free text", () => {
    const payload = buildCatalogIngredientPayload(
      {
        id: "cat-1",
        type: "hop",
        displayName: "Citra",
        defaultUnit: "g",
        source: "catalog"
      },
      {
        enteredQuantity: "100",
        enteredUnit: "g",
        purchasePrice: "",
        purchaseCurrency: "RUB",
        purchaseQuantity: "",
        purchaseQuantityUnit: "g",
        purchasedAt: "",
        freshnessDate: "",
        notes: ""
      }
    );

    expect(payload.ingredientCatalogItemId).toBe("cat-1");
    expect(() => buildCatalogIngredientPayload(null, {
      enteredQuantity: "100",
      enteredUnit: "g",
      purchasePrice: "",
      purchaseCurrency: "RUB",
      purchaseQuantity: "",
      purchaseQuantityUnit: "g",
      purchasedAt: "",
      freshnessDate: "",
      notes: ""
    })).toThrowError("CATALOG_SELECTION_REQUIRED");
  });
});
