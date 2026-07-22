import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие GET /api/ingredients/search: серверный гейт длины запроса (С7) —
// однобуквенный "хвост" без скоуп-параметров не должен грузить и ранжировать
// каталог. @/lib/auth и @nb/auth мокаются напрямую — по образцу
// tests/masters-upload-route.test.ts. Реальная БД не поднимается.

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(async () => null),
  assertRateLimit: vi.fn(async () => {}),
  searchUserCatalogIngredients: vi.fn(async () => ({
    items: [{ id: "hop-1", type: "hop", displayName: "Citra" }],
    refinements: [],
    total: 1,
    isBroadMatch: false,
    hasMore: false,
    appliedManufacturer: null,
    appliedGroup: null,
    appliedFamily: null,
    appliedFavoritesOnly: false,
    appliedCustomOnly: false
  }))
}));

vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@nb/auth", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("@/features/ingredients/catalog-service", () => ({
  searchUserCatalogIngredients: mocks.searchUserCatalogIngredients
}));

const { GET } = await import("../app/api/ingredients/search/route");

describe("ingredients search api — гейт длины запроса", () => {
  beforeEach(() => {
    mocks.searchUserCatalogIngredients.mockClear();
    mocks.assertRateLimit.mockClear();
  });

  it("не зовёт сервис при однобуквенном запросе без скоупа", async () => {
    const response = await GET(new Request("http://local/api/ingredients/search?q=%D0%BC"));
    const data = await response.json() as { items: unknown[]; total: number };

    expect(response.status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(mocks.searchUserCatalogIngredients).not.toHaveBeenCalled();
  });

  it("зовёт сервис при двухбуквенном запросе", async () => {
    const response = await GET(new Request("http://local/api/ingredients/search?q=%D0%BC%D0%BE"));

    expect(response.status).toBe(200);
    expect(mocks.searchUserCatalogIngredients).toHaveBeenCalledTimes(1);
  });

  it("зовёт сервис при пустом запросе со скоупом group (соли воды)", async () => {
    const response = await GET(new Request("http://local/api/ingredients/search?q=&group=water_salt"));

    expect(response.status).toBe(200);
    expect(mocks.searchUserCatalogIngredients).toHaveBeenCalledTimes(1);
  });

  it("зовёт сервис при однобуквенном запросе, если задан скоуп family", async () => {
    const response = await GET(new Request("http://local/api/ingredients/search?q=%D0%BC&family=pilsner"));

    expect(response.status).toBe(200);
    expect(mocks.searchUserCatalogIngredients).toHaveBeenCalledTimes(1);
  });
});
