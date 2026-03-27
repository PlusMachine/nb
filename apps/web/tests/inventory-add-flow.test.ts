import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  userId: "u1",
  preferredCurrency: "USD",
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
  requireUser: async () => ({ id: mockState.userId, preferredCurrency: mockState.preferredCurrency })
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
import {
  buildCatalogIngredientPayload,
  resolveCatalogIngredientUnitProfile
} from "../components/inventory/catalog-ingredient-form";
import { CustomIngredientForm, getCustomIngredientSubtypeOptions } from "../components/inventory/custom-ingredient-form";
import { getTodayDateInputValue } from "../components/inventory/date-input";

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
    expect(html).toContain(">Все<");
    expect(html).toContain('value="all"');
    expect(html).toContain("Начните вводить название ингредиента");
    expect(html).toContain("autofocus");
    expect(html).toContain("За всё");
    expect(html).toContain("За единицу");
    expect(html).not.toContain("Куплено");
    expect(html).not.toContain("Ед. закупки");
    expect(html).not.toContain(">Валюта<");
  });

  it("renders custom ingredient form without repeated purchase fields", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "fermentable",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(html).toContain("За всё");
    expect(html).toContain("За единицу");
    expect(html).toContain("USD");
    expect(html).not.toContain("Куплено");
    expect(html).not.toContain("Ед. закупки");
    expect(html).not.toContain(">Валюта<");
    expect(html).toContain(`value="${getTodayDateInputValue()}"`);
    expect(html).toContain('aria-label="Очистить дату покупки"');
  });

  it("prefills purchase date in catalog add form with today's date", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModal, { open: true, onClose: () => undefined }));
    expect(html).toContain(`value="${getTodayDateInputValue()}"`);
    expect(html).toContain('aria-label="Очистить дату покупки"');
  });

  it("renders category selector options", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientCategorySelector, { value: "hop", onChange: () => undefined }));
    expect(html).toContain("Хмель");
    expect(html).toContain("Дрожжи");
    expect(html).toContain('value="hop"');
  });

  it("renders all-category option when requested", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientCategorySelector, {
      value: "all",
      onChange: () => undefined,
      includeAll: true
    }));

    expect(html).toContain(">Все<");
    expect(html).toContain('value="all"');
  });

  it("adds catalog ingredient and revalidates inventory page", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    formData.set("enteredQuantity", "120");
    formData.set("enteredUnit", "g");
    formData.set("priceInputAmount", "1250");
    formData.set("priceInputMode", "total");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls).toHaveLength(1);
    expect(mockState.addCatalogCalls[0]).toMatchObject({
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 120,
      enteredUnit: "g",
      priceInputMode: "total",
      priceInputAmountMinor: 125000,
      priceInputCurrency: "USD"
    });
    expect(mockState.revalidated).toContain("/app/ingredients");
  });

  it("passes per-unit price mode through the add flow", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    formData.set("enteredQuantity", "5");
    formData.set("enteredUnit", "kg");
    formData.set("priceInputAmount", "120");
    formData.set("priceInputMode", "per_display_unit");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls[0]).toMatchObject({
      enteredQuantity: 5,
      enteredUnit: "kg",
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 12000,
      priceInputCurrency: "USD"
    });
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
    formData.set("ingredientCatalogItemId", "catalog-item");
    formData.set("enteredQuantity", "0");
    formData.set("enteredUnit", "");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.enteredQuantity).toBeDefined();
  });

  it("builds picker search params with category filter", () => {
    const params = buildIngredientSearchParams({ q: "citra", category: "hop", limit: 8 });

    expect(params.get("q")).toBe("citra");
    expect(params.get("category")).toBe("hop");
    expect(params.get("limit")).toBe("8");
  });

  it("builds picker search params without category for cross-category search", () => {
    const params = buildIngredientSearchParams({ q: "saaz", limit: 8 });

    expect(params.get("q")).toBe("saaz");
    expect(params.has("category")).toBe(false);
    expect(params.get("limit")).toBe("8");
  });

  it("exposes subtype options for custom category flow", () => {
    expect(getCustomIngredientSubtypeOptions("water_treatment")).toContain("acid");
    expect(getCustomIngredientSubtypeOptions("consumable")).toContain("fining");
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
        priceInputMode: "total",
        priceInputAmount: "",
        purchasedAt: "",
        freshnessDate: "",
        notes: ""
      }
    );

    expect(payload.ingredientCatalogItemId).toBe("cat-1");
    expect(() => buildCatalogIngredientPayload(null, {
      enteredQuantity: "100",
      enteredUnit: "g",
      priceInputMode: "total",
      priceInputAmount: "",
      purchasedAt: "",
      freshnessDate: "",
      notes: ""
    })).toThrowError("CATALOG_SELECTION_REQUIRED");
  });

  it("defaults dry yeast catalog additions to pack units", () => {
    const profile = resolveCatalogIngredientUnitProfile("yeast", {
      id: "yeast-1",
      type: "yeast",
      category: "yeast",
      displayName: "US-05",
      defaultUnit: "g",
      technicalData: {
        type: "yeast",
        form: "dry",
        attenuationPctTypical: 78,
        fermentationTempCMin: null,
        fermentationTempCMax: null,
        flocculation: null,
        alcoholToleranceAbvTypical: null,
        packageSize: null,
        packageUnit: null
      },
      source: "catalog"
    });

    expect(profile.defaultUnit).toBe("pack");
    expect(profile.allowedUnits).toEqual(["pack", "g"]);
  });
});
