import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ orderBy: vi.fn() }));
vi.mock("@nb/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: mocks.orderBy }) }) }) },
  favoriteCalculators: {},
  and: vi.fn(), desc: vi.fn(), eq: vi.fn(), inArray: vi.fn()
}));

import { listFavoriteCalculators } from "../features/calculators/favorites-service";

afterEach(() => vi.unstubAllEnvs());

describe("сохранённые калькуляторы на дашборде", () => {
  it.each([
    ["production", "user", ["abv-attenuation"]],
    ["production", "admin", ["ibu", "abv-attenuation"]],
    ["development", "user", ["ibu", "abv-attenuation"]]
  ] as const)("%s / %s: фильтрует старое избранное, сохраняя порядок записей", async (env, role, expected) => {
    vi.stubEnv("NODE_ENV", env);
    mocks.orderBy.mockResolvedValue([{ slug: "unknown" }, { slug: "ibu" }, { slug: "abv-attenuation" }]);
    expect((await listFavoriteCalculators("test", role)).map((item) => item.slug)).toEqual(expected);
  });
});
