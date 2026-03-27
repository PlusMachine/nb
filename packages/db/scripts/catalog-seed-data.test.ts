import { describe, expect, it } from "vitest";

import { seedCatalogItems } from "./catalog-seed-data";

describe("catalog seed data", () => {
  it("loads the catalog from JSON sources", () => {
    expect(seedCatalogItems.length).toBeGreaterThan(1000);
    expect(seedCatalogItems.some((item) => item.category === "fermentable")).toBe(true);
    expect(seedCatalogItems.some((item) => item.category === "hop")).toBe(true);
    expect(seedCatalogItems.some((item) => item.category === "yeast")).toBe(true);
    expect(seedCatalogItems.some((item) => item.category === "water_prep")).toBe(true);
    expect(seedCatalogItems.some((item) => item.category === "misc")).toBe(true);
  });

  it("does not duplicate normalized names within the same ingredient type", () => {
    const keys = seedCatalogItems.map((item) => `${item.type}:${item.normalizedName}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps russian display names primary and english aliases searchable", () => {
    const citra = seedCatalogItems.find((item) => (
      item.type === "hop"
      && item.family.normalizedCanonicalName === "цитра"
      && /yakima chief/i.test(item.manufacturer ?? "")
    ));

    expect(citra?.displayName).toContain("Цитра");
    expect(citra?.aliases).toContain("цитра");
    expect(citra?.aliases).toContain("citra");
  });

  it("covers new water and process-aid catalog branches", () => {
    expect(seedCatalogItems.some((item) => item.category === "water_prep" && item.subtype === "water_source")).toBe(true);
    expect(seedCatalogItems.some((item) => item.category === "water_prep" && item.subtype === "dechlorination")).toBe(true);
    expect(seedCatalogItems.some((item) => item.category === "misc" && item.subtype === "sanitizer")).toBe(true);
    expect(seedCatalogItems.some((item) => item.category === "misc" && item.subtype === "cleaner")).toBe(true);
  });
});
