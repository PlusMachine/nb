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
import { AddIngredientModal } from "../components/inventory/add-ingredient-modal";
import { AddIngredientTrigger } from "../components/inventory/add-ingredient-trigger";
import { IngredientTypeSelector } from "../components/inventory/ingredient-type-selector";

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
  });

  it("renders type selector options", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientTypeSelector, { value: "hop", onChange: () => undefined }));
    expect(html).toContain("Хмель");
    expect(html).toContain("Дрожжи");
    expect(html).toContain('value="hop"');
  });

  it("adds catalog ingredient and revalidates inventory page", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    formData.set("quantity", "120");
    formData.set("unit", "g");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls).toHaveLength(1);
    expect(mockState.revalidated).toContain("/app/ingredients");
  });

  it("adds custom ingredient and then adds it to inventory", async () => {
    const formData = new FormData();
    formData.set("type", "yeast");
    formData.set("displayName", "Kveik");
    formData.set("quantity", "1");
    formData.set("unit", "pack");

    const result = await addCustomIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.createCustomCalls).toHaveLength(1);
    expect(mockState.addCustomCalls[0]?.userCustomIngredientId).toBe("3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    expect(mockState.revalidated).toContain("/app/ingredients");
  });

  it("rejects invalid payload", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "not-a-uuid");
    formData.set("quantity", "0");
    formData.set("unit", "");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.ingredientCatalogItemId).toBeDefined();
  });
});
