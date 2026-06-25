import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  revalidated: [] as string[],
  favoriteCalls: [] as any[],
  createdPurchaseLinkCalls: [] as any[]
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockState.revalidated.push(path)
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "user-1" })
}));

vi.mock("@/features/ingredients/user-metadata-service", () => ({
  listIngredientPurchaseLinksByReference: vi.fn(async () => []),
  createIngredientPurchaseLink: async (userId: string, reference: unknown, url: string) => {
    mockState.createdPurchaseLinkCalls.push({ userId, reference, url });
    return {
      id: "link-1",
      url: "https://ozon.ru/product/citra",
      normalizedUrl: "https://ozon.ru/product/citra",
      host: "ozon.ru",
      displayHost: "ozon.ru",
      marketplace: "ozon",
      marketplaceLabel: "Ozon",
      position: 0
    };
  },
  updateIngredientPurchaseLink: vi.fn(async () => null),
  deleteIngredientPurchaseLink: vi.fn(async () => undefined),
  setIngredientFavoriteState: async (userId: string, reference: unknown, next: boolean) => {
    mockState.favoriteCalls.push({ userId, reference, next });
    return next;
  }
}));

import {
  createIngredientPurchaseLinkAction,
  toggleIngredientFavoriteAction
} from "../app/(app)/app/ingredients/metadata-actions";

describe("ingredient metadata actions", () => {
  beforeEach(() => {
    mockState.revalidated = [];
    mockState.favoriteCalls = [];
    mockState.createdPurchaseLinkCalls = [];
  });

  it("toggles favorites for catalog ingredients and revalidates catalog plus detail surfaces", async () => {
    const result = await toggleIngredientFavoriteAction({
      reference: {
        source: "catalog",
        id: "catalog-hop-1"
      },
      next: true
    });

    expect(result).toEqual({
      ok: true,
      isFavorite: true
    });
    expect(mockState.favoriteCalls).toEqual([
      {
        userId: "user-1",
        reference: {
          source: "catalog",
          id: "catalog-hop-1"
        },
        next: true
      }
    ]);
    expect(mockState.revalidated).toEqual([
      "/catalog",
      "/app/ingredients",
      "/catalog/system/catalog-hop-1"
    ]);
  });

  it("creates purchase links for custom ingredients and revalidates the custom detail page", async () => {
    const result = await createIngredientPurchaseLinkAction({
      reference: {
        source: "custom",
        id: "custom-hop-1"
      },
      url: "ozon.ru/product/citra"
    });

    expect(result.ok).toBe(true);
    expect(result.link).toMatchObject({
      marketplace: "ozon",
      marketplaceLabel: "Ozon",
      displayHost: "ozon.ru"
    });
    expect(mockState.createdPurchaseLinkCalls).toEqual([
      {
        userId: "user-1",
        reference: {
          source: "custom",
          id: "custom-hop-1"
        },
        url: "ozon.ru/product/citra"
      }
    ]);
    expect(mockState.revalidated).toEqual([
      "/catalog",
      "/app/ingredients",
      "/catalog/custom/custom-hop-1"
    ]);
  });
});
