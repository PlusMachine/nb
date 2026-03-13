import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireUser: vi.fn(async () => ({ id: "u-1", preferredCurrency: "EUR" })),
  updateInventoryQuantity: vi.fn(async () => ({})),
  updateInventoryItem: vi.fn(async () => ({})),
  deleteInventoryItem: vi.fn(async () => undefined)
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("../lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("../features/inventory/service", async () => {
  const actual = await vi.importActual<typeof import("../features/inventory/service")>("../features/inventory/service");
  return {
    ...actual,
    updateInventoryQuantity: mocks.updateInventoryQuantity,
    updateInventoryItem: mocks.updateInventoryItem,
    deleteInventoryItem: mocks.deleteInventoryItem
  };
});

import {
  deleteInventoryItemAction,
  updateInventoryInlineAction,
  updateInventoryItemAction
} from "../app/(app)/app/ingredients/actions";

describe("inventory inline actions", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset();
    mocks.requireUser.mockClear();
    mocks.updateInventoryQuantity.mockReset();
    mocks.updateInventoryQuantity.mockResolvedValue({ id: "inv-1" });
    mocks.updateInventoryItem.mockReset();
    mocks.updateInventoryItem.mockResolvedValue({ id: "inv-1" });
    mocks.deleteInventoryItem.mockReset();
    mocks.deleteInventoryItem.mockResolvedValue(undefined);
  });

  it("updates quantity and revalidates page", async () => {
    const result = await updateInventoryInlineAction({
      inventoryItemId: "inv-1",
      enteredQuantity: "3",
      enteredUnit: "kg"
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateInventoryQuantity).toHaveBeenCalledWith("u-1", "inv-1", {
      enteredQuantity: 3,
      enteredUnit: "kg"
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/ingredients");
  });

  it("allows setting quantity to zero through the standard inline update path", async () => {
    const result = await updateInventoryInlineAction({
      inventoryItemId: "inv-1",
      enteredQuantity: "0",
      enteredUnit: "kg"
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateInventoryQuantity).toHaveBeenCalledWith("u-1", "inv-1", {
      enteredQuantity: 0,
      enteredUnit: "kg"
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/ingredients");
  });

  it("rejects invalid unit", async () => {
    const result = await updateInventoryInlineAction({
      inventoryItemId: "inv-1",
      enteredQuantity: "1",
      enteredUnit: "stone"
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.enteredUnit).toBeDefined();
    expect(mocks.updateInventoryQuantity).not.toHaveBeenCalled();
  });

  it("updates full inventory item and revalidates page", async () => {
    const result = await updateInventoryItemAction({
      inventoryItemId: "inv-1",
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      userCustomIngredientId: null,
      enteredQuantity: "4.5",
      enteredUnit: "kg",
      purchasedAt: "2026-03-01",
      freshnessDate: "2026-09-01",
      notes: "Свежая партия"
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateInventoryItem).toHaveBeenCalledWith("u-1", "inv-1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      userCustomIngredientId: null,
      enteredQuantity: 4.5,
      enteredUnit: "kg",
      priceInputMode: null,
      priceInputAmountMinor: null,
      priceInputCurrency: null,
      purchasedAt: new Date("2026-03-01T00:00:00.000Z"),
      freshnessDate: new Date("2026-09-01T00:00:00.000Z"),
      notes: "Свежая партия"
    }, { preferredCurrency: "EUR" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/ingredients");
  });

  it("defaults edited price currency from preferred user currency", async () => {
    const result = await updateInventoryItemAction({
      inventoryItemId: "inv-1",
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      userCustomIngredientId: null,
      enteredQuantity: "5",
      enteredUnit: "kg",
      priceInputAmount: "12.5"
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateInventoryItem).toHaveBeenCalledWith("u-1", "inv-1", expect.objectContaining({
      priceInputMode: null,
      priceInputAmountMinor: 1250,
      priceInputCurrency: "EUR"
    }), { preferredCurrency: "EUR" });
  });

  it("passes per-unit edit mode through to the service", async () => {
    const result = await updateInventoryItemAction({
      inventoryItemId: "inv-1",
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      userCustomIngredientId: null,
      enteredQuantity: "5",
      enteredUnit: "kg",
      priceInputMode: "per_display_unit",
      priceInputAmount: "12.5"
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateInventoryItem).toHaveBeenCalledWith("u-1", "inv-1", expect.objectContaining({
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 1250,
      priceInputCurrency: "EUR"
    }), { preferredCurrency: "EUR" });
  });

  it("rejects full edit without selected ingredient", async () => {
    const result = await updateInventoryItemAction({
      inventoryItemId: "inv-1",
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      enteredQuantity: "1",
      enteredUnit: "kg"
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.ingredientCatalogItemId).toBeDefined();
    expect(mocks.updateInventoryItem).not.toHaveBeenCalled();
  });

  it("deletes inventory item and revalidates page", async () => {
    const result = await deleteInventoryItemAction("inv-1");

    expect(result.ok).toBe(true);
    expect(mocks.deleteInventoryItem).toHaveBeenCalledWith("u-1", "inv-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/ingredients");
  });
});
