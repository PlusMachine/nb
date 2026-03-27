import { describe, expect, it } from "vitest";

import {
  catalogSeedManifest,
  loadCatalogSeedItems,
  normalizeCatalogAlias,
  prepareCatalogSeedFile
} from "./catalog-seed";

describe("catalog seed data", () => {
  it("loads every new source file with the expected root shape support", () => {
    const counts = Object.fromEntries(
      catalogSeedManifest.map((spec) => [spec.fileName, loadCatalogSeedItems(spec.fileName).length])
    );

    expect(counts).toEqual({
      "hop_catalog_minimal_v2.json": 187,
      "malt_catalog_minimal_v2.json": 503,
      "fermentables_catalog_minimal_v2.json": 173,
      "yeasts_catalog_minimal_v2.json": 176,
      "consumables_unified_catalog_v3.json": 32,
      "water_treatment_catalog_minimal_v2.json": 24
    });
  });

  it("prepares canonical ingredients from the new catalog only", () => {
    const prepared = catalogSeedManifest.flatMap((spec) => prepareCatalogSeedFile(spec));

    expect(prepared).toHaveLength(1095);
    expect(prepared.filter((item) => item.ingredient.type === "hop")).toHaveLength(187);
    expect(prepared.filter((item) => item.ingredient.type === "malt")).toHaveLength(503);
    expect(prepared.filter((item) => item.ingredient.type === "fermentable")).toHaveLength(173);
    expect(prepared.filter((item) => item.ingredient.type === "yeast")).toHaveLength(176);
    expect(prepared.filter((item) => item.ingredient.type === "consumable")).toHaveLength(32);
    expect(prepared.filter((item) => item.ingredient.type === "water_treatment")).toHaveLength(24);
  });

  it("seeds package variants only for consumables", () => {
    const prepared = catalogSeedManifest.flatMap((spec) => prepareCatalogSeedFile(spec));
    const withPackageVariants = prepared.filter((item) => item.packageVariants.length > 0);
    const withoutConsumables = prepared.filter((item) => (
      item.ingredient.type !== "consumable"
      && item.packageVariants.length > 0
    ));

    expect(withPackageVariants).toHaveLength(32);
    expect(withPackageVariants.flatMap((item) => item.packageVariants)).toHaveLength(86);
    expect(withoutConsumables).toHaveLength(0);
  });

  it("normalizes aliases for search without mutating display text", () => {
    expect(normalizeCatalogAlias("  Star—San Ё  ")).toBe("star san е");
    expect(normalizeCatalogAlias("Calcium   Chloride")).toBe("calcium chloride");
  });
});
