import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("../features/ingredients/catalog-service", () => ({
  searchUserCatalogIngredients: vi.fn(async () => ({
    items: [{ id: "1", type: "hop", displayName: "Citra", defaultUnit: "g", source: "catalog" }],
    refinements: [{ type: "manufacturer", label: "Yakima Chief", normalizedLabel: "yakima chief", count: 3, score: 80 }],
    total: 12,
    isBroadMatch: true,
    hasMore: true,
    appliedManufacturer: null
  }))
}));

import { GET } from "../app/api/ingredients/search/route";

describe("ingredient search api", () => {
  it("returns structured picker search shape", async () => {
    const response = await GET(new Request("http://local/api/ingredients/search?q=citra&manufacturer=Yakima%20Chief"));
    const data = await response.json() as {
      items: Array<{ id: string; source: string }>;
      refinements: Array<{ label: string }>;
      total: number;
      isBroadMatch: boolean;
      hasMore: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.items[0]).toMatchObject({ id: "1", source: "catalog" });
    expect(data.refinements[0]).toMatchObject({ label: "Yakima Chief" });
    expect(data.total).toBe(12);
    expect(data.isBroadMatch).toBe(true);
    expect(data.hasMore).toBe(true);
  });
});
