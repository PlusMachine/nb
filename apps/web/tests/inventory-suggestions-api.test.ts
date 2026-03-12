import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("../features/inventory/service", () => ({
  searchInventorySuggestions: vi.fn(async () => ([{ id: "cat-1", type: "hop", displayName: "Citra", defaultUnit: "g", source: "catalog" }]))
}));

import { GET } from "../app/api/inventory/suggestions/route";

describe("inventory suggestions api", () => {
  it("returns inventory-backed ingredient suggestions", async () => {
    const response = await GET(new Request("http://local/api/inventory/suggestions?q=citra"));
    const data = await response.json() as { items: Array<{ id: string; source: string }> };

    expect(response.status).toBe(200);
    expect(data.items[0]).toMatchObject({ id: "cat-1", source: "catalog" });
  });
});
