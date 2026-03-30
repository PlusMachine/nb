import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getArticleBySlug, listArticleCategories, listArticles, listFeaturedArticles } from "./bjcp";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const bjcpDir = resolve(moduleDir, "../../../ingredients/bjcp");

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
    const internationalLager = categories.find((category) => category.id === "2");
    const specialtyIpa = categories.find((category) => category.id === "21");
    const historicalBeer = categories.find((category) => category.id === "27");

    expect(featured.length).toBeGreaterThan(0);
    expect(categories.some((category) => category.id === "1")).toBe(true);
    expect(internationalLager).toMatchObject({
      firstStyleId: "2A",
      lastStyleId: "2C",
      styleCodeRange: "2A–2C"
    });
    expect(specialtyIpa?.styleCodeRange).toBe("21A–21C");
    expect(historicalBeer?.styleCodeRange).toBe("27");
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

  it("loads IBU stats from normalized BJCP vital statistics", async () => {
    const articles = await listArticles();
    const weissbier = articles.find((article) => article.bjcpId === "10A");
    const czechDarkLager = articles.find((article) => article.bjcpId === "3D");
    const woodAgedBeer = articles.find((article) => article.bjcpId === "33A");

    expect(weissbier?.stats.find((stat) => stat.label === "IBU")?.value).toBe("8-15");
    expect(czechDarkLager?.stats.find((stat) => stat.label === "IBU")?.value).toBe("18 - 34");
    expect(woodAgedBeer?.stats.find((stat) => stat.label === "IBU")?.value).toBe("varies with base style");
  });

  it("keeps BJCP vital_statistics keys normalized for IBU-compatible fields", async () => {
    const fileNames = (await readdir(bjcpDir)).filter((fileName) => /^bjcp_styles_.*\.json$/i.test(fileName));
    const legacyKeys = new Set(["IBU", "IBUs", "ibus", "OG", "FG", "ABV", "SRM"]);

    for (const fileName of fileNames) {
      const raw = await readFile(resolve(bjcpDir, fileName), "utf8");
      const data = JSON.parse(raw) as {
        styles?: Array<{ bjcp_id?: string; vital_statistics?: Record<string, string | null | undefined> }>;
      };

      for (const style of data.styles ?? []) {
        const keys = Object.keys(style.vital_statistics ?? {});
        expect(
          keys.filter((key) => legacyKeys.has(key)),
          `${fileName} ${style.bjcp_id ?? "unknown"} has legacy vital_statistics keys`
        ).toEqual([]);
      }
    }
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
