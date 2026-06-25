import { describe, expect, it } from "vitest";

import type { InventoryListItemDto } from "../features/inventory/contracts";
import {
  convertInventoryNormalizedToUnit,
  resolveInventoryConsumeContext,
  resolveInventoryConsumeState,
  resolveInventoryRemainingInUnit
} from "../features/inventory/consume";

type TechnicalData = InventoryListItemDto["source"]["technicalData"];

const makeMaltItem = (overrides?: Partial<InventoryListItemDto>): InventoryListItemDto => ({
  id: "inv-malt-1",
  enteredQuantity: 2.5,
  enteredUnit: "kg",
  normalizedQuantity: 2500,
  normalizedUnit: "g",
  unitDimension: "weight",
  purchasedAt: null,
  freshnessDate: null,
  notes: null,
  archivedAt: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  source: {
    sourceKind: "catalog",
    sourceId: "cat-malt-1",
    type: "malt",
    category: "fermentable",
    subtype: "malt",
    primaryLabelRu: "Пилснер солод",
    secondaryLabelRu: "Pilsner Malt",
    displayName: "Пилснер солод",
    normalizedName: "pilsner-malt"
  },
  ...overrides
});

const makeDryYeastItem = (normalizedQuantity: number): InventoryListItemDto => ({
  id: "inv-yeast-1",
  enteredQuantity: normalizedQuantity / 11,
  enteredUnit: "pack",
  normalizedQuantity,
  normalizedUnit: "g",
  unitDimension: "weight",
  purchasedAt: null,
  freshnessDate: null,
  notes: null,
  archivedAt: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  source: {
    sourceKind: "catalog",
    sourceId: "cat-yeast-1",
    type: "yeast",
    category: "yeast",
    subtype: null,
    primaryLabelRu: "US-05",
    secondaryLabelRu: "Safale US-05",
    displayName: "US-05",
    normalizedName: "us-05",
    technicalData: { type: "yeast", form: "dry" } as TechnicalData
  }
});

describe("resolveInventoryConsumeContext", () => {
  it("uses the human-facing display unit as the default consume unit", () => {
    const context = resolveInventoryConsumeContext(makeMaltItem());
    expect(context.defaultUnit).toBe("kg");
    expect(context.remainingDisplay).toMatchObject({ quantity: 2.5, unit: "kg" });
    expect(context.packEquivalent).toBeNull();
  });

  it("resolves a pack equivalent for dry yeast", () => {
    const context = resolveInventoryConsumeContext(makeDryYeastItem(33));
    expect(context.packEquivalent).toEqual({ normalizedUnit: "g", normalizedQuantity: 11 });
    expect(context.defaultUnit).toBe("pack");
  });
});

describe("resolveInventoryConsumeState", () => {
  it("subtracts an amount in the display unit", () => {
    const item = makeMaltItem();
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 0.5, unit: "kg" });

    expect(state.error).toBeNull();
    expect(state.consumedNormalized).toBe(500);
    expect(state.newNormalized).toBe(2000);
    expect(state.newRemainingDisplay).toMatchObject({ quantity: 2, unit: "kg" });
    expect(state.submitQuantity).toBe("2");
    expect(state.submitUnit).toBe("kg");
    expect(state.willEmpty).toBe(false);
  });

  it("converts a consumed amount entered in a different unit", () => {
    const item = makeMaltItem();
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 500, unit: "g" });

    expect(state.consumedNormalized).toBe(500);
    expect(state.newNormalized).toBe(2000);
    expect(state.newRemainingDisplay).toMatchObject({ quantity: 2, unit: "kg" });
  });

  it("clamps the remaining quantity at zero when consuming more than available", () => {
    const item = makeMaltItem();
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 5, unit: "kg" });

    expect(state.newNormalized).toBe(0);
    expect(state.willEmpty).toBe(true);
    expect(state.submitQuantity).toBe("0");
  });

  it("treats consuming the full amount as emptying the item", () => {
    const item = makeMaltItem();
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 2.5, unit: "kg" });

    expect(state.newNormalized).toBe(0);
    expect(state.willEmpty).toBe(true);
  });

  it("consumes one pack of dry yeast using the pack equivalent", () => {
    const item = makeDryYeastItem(33);
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 1, unit: "pack" });

    expect(state.error).toBeNull();
    expect(state.consumedNormalized).toBe(11);
    expect(state.newNormalized).toBe(22);
    expect(state.newRemainingDisplay).toMatchObject({ quantity: 2, unit: "pack" });
  });

  it("adds the purchased amount when restocking", () => {
    const item = makeMaltItem();
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 1, unit: "kg", direction: "restock" });

    expect(state.error).toBeNull();
    expect(state.consumedNormalized).toBe(1000);
    expect(state.newNormalized).toBe(3500);
    expect(state.newRemainingDisplay).toMatchObject({ quantity: 3.5, unit: "kg" });
    expect(state.willEmpty).toBe(false);
  });

  it("restocks a finished item back into stock", () => {
    const item = makeMaltItem({ enteredQuantity: 0, normalizedQuantity: 0 });
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 2, unit: "kg", direction: "restock" });

    expect(state.newNormalized).toBe(2000);
    expect(state.newRemainingDisplay).toMatchObject({ quantity: 2, unit: "kg" });
  });

  it("reports an error for a non-positive amount", () => {
    const item = makeMaltItem();
    const context = resolveInventoryConsumeContext(item);
    const state = resolveInventoryConsumeState({ item, context, amount: 0, unit: "kg" });

    expect(state.error).not.toBeNull();
    expect(state.newNormalized).toBe(2500);
  });
});

describe("unit conversion helpers", () => {
  it("converts the remaining quantity into the requested unit", () => {
    const item = makeMaltItem();
    expect(resolveInventoryRemainingInUnit(item, "kg")).toBe(2.5);
    expect(resolveInventoryRemainingInUnit(item, "g")).toBe(2500);
  });

  it("converts normalized grams into packs via the pack equivalent", () => {
    expect(convertInventoryNormalizedToUnit(33, "g", "pack", { normalizedUnit: "g", normalizedQuantity: 11 })).toBe(3);
  });
});
