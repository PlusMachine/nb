import { describe, expect, it, vi } from "vitest";

vi.mock("../features/ingredients/permissions", () => ({ requireCatalogRole: vi.fn(async () => ({ id: "m1" })) }));
vi.mock("../features/ingredients/service", () => ({
  applyModerationAction: vi.fn(async () => ({ status: "approved", targetIngredientId: "ing-1" }))
}));

import { PATCH } from "../app/api/admin/proposed-ingredients/[id]/route";

describe("moderation api", () => {
  it("executes pending queue action", async () => {
    const response = await PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ action: "approve" }) }), {
      params: Promise.resolve({ id: "prop-1" })
    });

    expect(response.status).toBe(200);
    const data = await response.json() as { status: string };
    expect(data.status).toBe("approved");
  });
});
