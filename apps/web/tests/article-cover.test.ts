import { describe, expect, it } from "vitest";

import { articleCoverFromSlug, articleCoverSrm } from "@/features/content-articles/article-cover";

describe("articleCoverSrm", () => {
  it("is deterministic for the same slug", () => {
    expect(articleCoverSrm("kak-svarit-ipa")).toBe(articleCoverSrm("kak-svarit-ipa"));
    expect(articleCoverSrm("obzor-refraktometra")).toBe(articleCoverSrm("obzor-refraktometra"));
  });

  it("stays within the light..dark cover band", () => {
    const slugs = ["kak-svarit-ipa", "obzor-refraktometra", "stout-guide", "a", "sanitaciya-i-gigiena"];
    for (const slug of slugs) {
      const srm = articleCoverSrm(slug);
      expect(srm).toBeGreaterThanOrEqual(3);
      expect(srm).toBeLessThanOrEqual(35);
    }
  });

  it("spreads different slugs across different SRM bands", () => {
    const slugs = ["kak-svarit-ipa", "obzor-refraktometra", "stout-guide", "sanitaciya-i-gigiena", "chto-takoe-dry-hopping"];
    const values = new Set(slugs.map((slug) => articleCoverSrm(slug)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("articleCoverFromSlug", () => {
  it("returns the same cover for the same slug", () => {
    expect(articleCoverFromSlug("kak-svarit-ipa")).toEqual(articleCoverFromSlug("kak-svarit-ipa"));
  });

  it("produces a gradient background and a readable text color", () => {
    const cover = articleCoverFromSlug("kak-svarit-ipa");
    expect(cover.background).toMatch(/^linear-gradient\(/);
    expect(["#ffffff", "#1a1a1a"]).toContain(cover.textColor);
  });
});
