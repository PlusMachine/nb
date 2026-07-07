import { describe, expect, it, vi } from "vitest";

import { allCalculatorSlugs } from "@/features/calculators/catalog";

const mocks = vi.hoisted(() => ({
  listArticles: vi.fn(),
  listCatalogSitemapEntries: vi.fn(),
  listPublishedContentArticles: vi.fn(),
  listRecipeSitemapEntries: vi.fn()
}));

vi.mock("@nb/content", () => ({ listArticles: mocks.listArticles }));
vi.mock("@/features/ingredients/service", () => ({
  listCatalogSitemapEntries: mocks.listCatalogSitemapEntries
}));
vi.mock("@/features/content-articles/service", () => ({
  listPublishedContentArticles: mocks.listPublishedContentArticles
}));
vi.mock("@/features/recipes/service", () => ({
  listRecipeSitemapEntries: mocks.listRecipeSitemapEntries
}));

import sitemap from "../app/sitemap";

const recipeUpdatedAt = new Date("2026-06-15T12:00:00.000Z");
const guideUpdatedAt = new Date("2026-05-01T00:00:00.000Z");

describe("sitemap", () => {
  it("включает рецепты, калькуляторы и /brewforge; статика без lastModified", async () => {
    mocks.listArticles.mockResolvedValue([
      { slug: "bjcp-1a-american-light-lager", updatedAt: "2026-03-01T00:00:00.000Z" }
    ]);
    mocks.listCatalogSitemapEntries.mockResolvedValue([]);
    mocks.listPublishedContentArticles.mockResolvedValue([
      { slug: "kak-svarit-pervoe-pivo", updatedAt: guideUpdatedAt }
    ]);
    mocks.listRecipeSitemapEntries.mockResolvedValue([
      { slug: "hazy-ipa", updatedAt: recipeUpdatedAt }
    ]);

    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    // Рецепт — из мока listRecipeSitemapEntries, дата не «сегодня».
    const recipeEntry = byUrl.get("http://localhost:3000/recipes/hazy-ipa");
    expect(recipeEntry).toBeDefined();
    expect(recipeEntry?.lastModified).toEqual(recipeUpdatedAt);

    // Каждый калькулятор реестра присутствует и БЕЗ lastModified.
    for (const slug of allCalculatorSlugs) {
      const entry = byUrl.get(`http://localhost:3000/calculators/${slug}`);
      expect(entry, `calculators/${slug} должен быть в sitemap`).toBeDefined();
      expect(entry?.lastModified).toBeUndefined();
    }

    // /brewforge теперь в списке статики.
    expect(byUrl.get("http://localhost:3000/brewforge")).toBeDefined();

    // Статические пути (включая /brewforge) — без lastModified: у них нет
    // честной даты изменения, а new Date() в lastModified запрещён.
    const staticPaths = [
      "",
      "/recipes",
      "/catalog",
      "/bjcp",
      "/calculators",
      "/articles",
      "/brewforge",
      "/demo",
      "/legal",
      "/legal/terms",
      "/legal/privacy",
      "/legal/consent",
      "/legal/cookies"
    ];
    for (const path of staticPaths) {
      const entry = byUrl.get(`http://localhost:3000${path}`);
      expect(entry, `${path || "/"} должен быть в sitemap`).toBeDefined();
      expect(entry?.lastModified).toBeUndefined();
    }

    // Гайды контент-CMS строятся от /articles, с честной датой.
    const guideEntry = byUrl.get("http://localhost:3000/articles/kak-svarit-pervoe-pivo");
    expect(guideEntry).toBeDefined();
    expect(guideEntry?.lastModified).toEqual(guideUpdatedAt);

    // BJCP-статьи — без lastModified: updatedAt там фиктивная дата (см.
    // resolvePublishedAt в packages/content/src/bjcp.ts), а не честная дата ревизии.
    const bjcpEntry = byUrl.get("http://localhost:3000/bjcp/bjcp-1a-american-light-lager");
    expect(bjcpEntry).toBeDefined();
    expect(bjcpEntry?.lastModified).toBeUndefined();
  });
});
