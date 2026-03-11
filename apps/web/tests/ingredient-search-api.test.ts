import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("../features/ingredients/service", () => ({
  searchIngredientSuggestions: vi.fn(async () => ([{ id: "1", type: "hop", displayName: "Citra", source: "catalog" }]))
}));

import { GET } from "../app/api/ingredients/search/route";

describe("ingredient search api", () => {
  it("returns typed suggestions shape", async () => {
    const response = await GET(new Request("http://local/api/ingredients/search?q=citra"));
    const data = await response.json() as { items: Array<{ id: string; source: string }> };
    expect(response.status).toBe(200);
    expect(data.items[0]).toMatchObject({ id: "1", source: "catalog" });
  });
});
