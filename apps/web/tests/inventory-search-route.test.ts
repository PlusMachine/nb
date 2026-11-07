import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryListItemDto } from "../features/inventory/contracts";
import { restoreInventoryViewDates } from "../features/inventory/query";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), list: vi.fn(), summary: vi.fn(), recipes: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.user }));
vi.mock("@/features/inventory/service", () => ({
  listInventoryForUserWithMeta: mocks.list, getInventorySummaries: mocks.summary
}));
vi.mock("@/features/recipes/match-service", () => ({ findBrewableRecipesForUser: mocks.recipes }));

import { GET } from "../app/api/inventory/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "stock-owner" });
  mocks.list.mockResolvedValue({ items: [], searchRescue: null });
  mocks.summary.mockResolvedValue({ inStockItems: 1 });
  mocks.recipes.mockResolvedValue([]);
});

describe("inventory search endpoint", () => {
  it("requires a session before reading any private stock", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/inventory"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });

  it("uses the session owner and the same filters as the server page", async () => {
    const response = await GET(new Request("http://localhost/api/inventory?search=%D1%86%D0%B8%D1%82%D1%80%D0%B0&category=hop&finished=true&sort=name&userId=someone-else"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith("stock-owner", {
      category: "hop", subtype: undefined, group: undefined,
      search: "цитра", sort: "name", includeEmpty: true, stockState: "all"
    });
    expect(mocks.recipes).not.toHaveBeenCalled();
  });

  it("rejects an overlong query without reading inventory", async () => {
    const response = await GET(new Request("http://localhost/api/inventory?search=" + "x".repeat(181)));
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("restores dates used by stock cards after the JSON response", async () => {
    const date = new Date("2026-11-04T12:00:00Z");
    mocks.list.mockResolvedValue({ items: [{ id: "dated-item", createdAt: date, updatedAt: date, purchasedAt: date, freshnessDate: date, archivedAt: null } as InventoryListItemDto], searchRescue: null });
    const response = await GET(new Request("http://localhost/api/inventory"));
    const view = restoreInventoryViewDates(await response.json());
    expect(view.items[0].purchasedAt?.toLocaleDateString("ru-RU")).toBe("04.11.2026");
    expect(view.items[0].freshnessDate).toEqual(date);
    expect(view.items[0].createdAt).toEqual(date);
    expect(view.items[0].archivedAt).toBeNull();
    expect(mocks.recipes).toHaveBeenCalledWith({ userId: "stock-owner", limit: 6 });
  });
});
