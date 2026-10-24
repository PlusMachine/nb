import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), details: vi.fn(), labels: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.user }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ SITE_NAME: "NB", APP_URL: "http://localhost:3000" }) }));
vi.mock("@/features/home/home-data-cache", () => ({ getHomeLatestPublicRecipes: async () => ({ items: [] }), getHomePublicRecipeDetails: mocks.details, getHomeFeaturedContentArticles: async () => [] }));
vi.mock("@/features/home/landing-data", () => ({ getHomeIngredients: async () => [], getHomeLabelImages: mocks.labels }));
vi.mock("@/features/beer-page/service", () => ({ getBeerPresentationBySlug: async () => null }));
vi.mock("@nb/content", () => ({ getBjcpCatalogData: async () => ({ styles: [] }) }));
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(null); mocks.details.mockResolvedValue([]); });
describe("homepage access and unpublished content", () => {
  it("does not invent recipes, stock availability or published articles in an empty database", async () => {
    const { default: HomePage } = await import("../app/(public)/page");
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Рецепты сообщества пока не опубликованы");
    expect(html).toContain("Готовим к публикации");
    expect(html).not.toContain("Можно варить");
    expect(html).not.toContain('href="/articles/');
    expect(html).toContain("Создать свой рецепт");
    expect(mocks.labels).not.toHaveBeenCalled();
  });
  it("keeps the existing redirect to the workshop for signed-in users", async () => {
    mocks.user.mockResolvedValue({ id: "qa-user" });
    const { default: HomePage } = await import("../app/(public)/page");
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.details).not.toHaveBeenCalled();
  });
});
