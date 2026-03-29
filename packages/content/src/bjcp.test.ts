import { describe, expect, it } from "vitest";

import { getArticleBySlug, listArticleCategories, listArticles, listFeaturedArticles } from "./bjcp";

describe("BJCP content index", () => {
  it("loads translated BJCP styles from the content folder", async () => {
    const articles = await listArticles();

    expect(articles).toHaveLength(128);
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

  it("includes commercial examples from the source JSON in article sections", async () => {
    const article = await getArticleBySlug("bjcp-1b-american-lager");

    expect(article?.bjcpId).toBe("1B");
    expect(article?.sections.some((section) => (
      section.id === "commercial_examples"
      && section.label === "Коммерческие примеры"
      && section.content.includes("Budweiser")
    ))).toBe(true);
  });

  it("uses a style-specific hero image when one is available", async () => {
    const [withImage, withoutImage] = await Promise.all([
      getArticleBySlug("bjcp-1a-american-light-lager"),
      getArticleBySlug("bjcp-12a-british-golden-ale")
    ]);

    expect(withImage?.heroImageUrl).toBe("/images/bjcp/1A%20%E2%80%94%20American%20Light%20Lager.png");
    expect(withoutImage?.heroImageUrl).toBe("/images/bjcp-placeholder.png");
  });

  it("loads specialty IPA substyles as separate BJCP 2021 entries", async () => {
    const articles = await listArticles();
    const specialtyIpas = articles.filter((article) => article.bjcpId.startsWith("21B"));

    expect(specialtyIpas.map((article) => article.bjcpId)).toEqual([
      "21B",
      "21B-Belgian IPA",
      "21B-Black IPA",
      "21B-Brown IPA",
      "21B-Brut IPA",
      "21B-Red IPA",
      "21B-Rye IPA",
      "21B-White IPA"
    ]);
  });

  it("resolves both canonical and legacy alias slugs for specialty IPA substyles", async () => {
    const [canonical, legacyAlias] = await Promise.all([
      getArticleBySlug("bjcp-21b-rye-ipa"),
      getArticleBySlug("bjcp-21b-rye-rye-ipa")
    ]);

    expect(canonical?.bjcpId).toBe("21B-Rye IPA");
    expect(canonical?.slug).toBe("bjcp-21b-rye-ipa");
    expect(legacyAlias?.bjcpId).toBe("21B-Rye IPA");
    expect(legacyAlias?.slug).toBe("bjcp-21b-rye-ipa");
  });
});
