import { describe, expect, it } from "vitest";

import { getArticleBySlug, listArticleCategories, listArticles, listFeaturedArticles } from "./bjcp";

describe("BJCP content index", () => {
  it("loads translated BJCP styles from the content folder", async () => {
    const articles = await listArticles();

    expect(articles.length).toBeGreaterThan(10);
    expect(articles[0]?.slug).toMatch(/^bjcp-/);
  });

  it("builds featured entries and category summaries", async () => {
    const [featured, categories] = await Promise.all([
      listFeaturedArticles(),
      listArticleCategories()
    ]);

    expect(featured.length).toBeGreaterThan(0);
    expect(categories.some((category) => category.id === "1")).toBe(true);
  });

  it("finds an article by slug", async () => {
    const article = await getArticleBySlug("bjcp-1a-american-light-lager");

    expect(article?.bjcpId).toBe("1A");
    expect(article?.sections.length).toBeGreaterThan(4);
  });
});
