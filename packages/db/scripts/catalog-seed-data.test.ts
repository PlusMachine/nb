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
      "hop_catalog_minimal_v2.json": 218,
      "malt_catalog_minimal_v2.json": 442,
      "fermentables_catalog_minimal_v2.normalized.json": 173,
      "yeasts_catalog_minimal_v2.json": 191,
      "additives_v1.json": 29,
      "consumables_v1.json": 28,
      "water_treatment_catalog_minimal_v2.json": 28
    });
  });

  it("prepares canonical ingredients from the new catalog only", () => {
    const prepared = catalogSeedManifest.flatMap((spec) => prepareCatalogSeedFile(spec));

    expect(prepared).toHaveLength(1109);
    expect(prepared.filter((item) => item.ingredient.type === "hop")).toHaveLength(218);
    expect(prepared.filter((item) => item.ingredient.type === "malt")).toHaveLength(442);
    expect(prepared.filter((item) => item.ingredient.type === "fermentable")).toHaveLength(173);
    expect(prepared.filter((item) => item.ingredient.type === "yeast")).toHaveLength(191);
    expect(prepared.filter((item) => item.ingredient.type === "consumable")).toHaveLength(57);
    expect(prepared.filter((item) => item.ingredient.type === "water_treatment")).toHaveLength(28);
  });

  it("seeds package variants only for additive/consumable split items", () => {
    const prepared = catalogSeedManifest.flatMap((spec) => prepareCatalogSeedFile(spec));
    const withPackageVariants = prepared.filter((item) => item.packageVariants.length > 0);
    const withoutConsumables = prepared.filter((item) => (
      item.ingredient.type !== "consumable"
      && item.packageVariants.length > 0
    ));

    expect(withPackageVariants).toHaveLength(57);
    expect(withPackageVariants.flatMap((item) => item.packageVariants)).toHaveLength(125);
    expect(withoutConsumables).toHaveLength(0);
  });

  it("preserves runtime/search fields when split manifests resolve legacy consumable data", () => {
    const prepared = prepareCatalogSeedFile({
      fileName: "consumables_v1.json",
      type: "consumable"
    });
    const starSan = prepared.find((item) => item.ingredient.id === "star-san-acid-no-rinse-sanitizer");
    const attributes = starSan?.ingredient.attributes ?? {};

    expect(attributes).toMatchObject({
      family_key: "acid_no_rinse_sanitizer",
      picker_group: "sanitizer",
      picker_function_ru: "Кислотный no-rinse санитайзер",
      picker_usage_ru: "Финальная дезинфекция без смывания",
      brand_family_mode: "matched_variant_brand"
    });
    expect(Array.isArray(attributes.market_names_en) ? attributes.market_names_en : []).toContain("Star San");
    expect(Array.isArray(attributes.search_priority_terms_ru) ? attributes.search_priority_terms_ru : []).toContain("санитайзер без смывания");
    expect(starSan?.aliases.some((alias) => alias.source === "seed_market_name" && alias.alias === "Star San")).toBe(true);
    expect(starSan?.aliases.some((alias) => alias.source === "seed_priority_term" && alias.alias === "санитайзер без смывания")).toBe(true);
    expect(starSan?.packageVariants.some((variant) => variant.productNameEn === "Star San")).toBe(true);
  });

  it("normalizes aliases for search without mutating display text", () => {
    expect(normalizeCatalogAlias("  Star—San Ё  ")).toBe("star san е");
    expect(normalizeCatalogAlias("Calcium   Chloride")).toBe("calcium chloride");
  });

  it("derives yeast country code from producer country names", () => {
    const prepared = prepareCatalogSeedFile({
      fileName: "yeasts_catalog_minimal_v2.json",
      type: "yeast"
    });
    const phillySour = prepared.find((item) => item.ingredient.id === "lallemand-philly-sour");

    expect(phillySour?.ingredient.countryName).toBe("Canada");
    expect(phillySour?.ingredient.countryCode).toBe("CA");
  });

  it("derives fermentable country codes from country names used in the catalog", () => {
    const prepared = prepareCatalogSeedFile({
      fileName: "fermentables_catalog_minimal_v2.normalized.json",
      type: "fermentable"
    });

    expect(prepared.find((item) => item.ingredient.countryName === "Австралия")?.ingredient.countryCode).toBe("AU");
    expect(prepared.find((item) => item.ingredient.countryName === "Индонезия")?.ingredient.countryCode).toBe("ID");
    expect(prepared.find((item) => item.ingredient.countryName === "Таиланд")?.ingredient.countryCode).toBe("TH");
    expect(prepared.find((item) => item.ingredient.countryName === "Латвия")?.ingredient.countryCode).toBe("LV");
    expect(prepared.find((item) => item.ingredient.countryName === "Вьетнам")?.ingredient.countryCode).toBe("VN");
  });

  it("keeps fermentables file classification authoritative even for malt extract source tokens", () => {
    const prepared = prepareCatalogSeedFile({
      fileName: "fermentables_catalog_minimal_v2.normalized.json",
      type: "fermentable"
    });
    const bavarianPilsner = prepared.find((item) => item.ingredient.id === "muntons-premium-pilsner-ekstrakty-kontsentraty");

    expect(bavarianPilsner?.ingredient.type).toBe("fermentable");
    expect(bavarianPilsner?.ingredient.itemKind).toBe("malt_extract");
    expect(bavarianPilsner?.ingredient.producer).toBe("Muntons");
    expect((bavarianPilsner?.ingredient.attributes ?? {}).extract_form).toBe("liquid");
    expect((bavarianPilsner?.ingredient.attributes ?? {}).display_type_ru).toBe("Жидкий охмелённый солодовый экстракт");
    expect((bavarianPilsner?.ingredient.attributes ?? {}).product_family).toBe("extract_concentrate");
    expect((bavarianPilsner?.ingredient.attributes ?? {}).subtype_key).toBe("malt_extract");
  });
});
