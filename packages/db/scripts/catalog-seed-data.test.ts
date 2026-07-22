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
      "hop_catalog_minimal_v2.json": 248,
      "malt_catalog_minimal_v2.json": 458,
      "fermentables_catalog_minimal_v2.normalized.json": 174,
      "yeasts_catalog_minimal_v2.json": 349,
      "additives_v2_1.json": 118,
      "consumables_v1.json": 28,
      "water_treatment_catalog_minimal_v2.json": 28
    });
  });

  it("prepares canonical ingredients from the new catalog only", () => {
    const prepared = catalogSeedManifest.flatMap((spec) => prepareCatalogSeedFile(spec));

    expect(prepared).toHaveLength(1403);
    expect(prepared.filter((item) => item.ingredient.type === "hop")).toHaveLength(248);
    expect(prepared.filter((item) => item.ingredient.type === "malt")).toHaveLength(458);
    expect(prepared.filter((item) => item.ingredient.type === "fermentable")).toHaveLength(174);
    expect(prepared.filter((item) => item.ingredient.type === "yeast")).toHaveLength(349);
    expect(prepared.filter((item) => item.ingredient.type === "consumable")).toHaveLength(146);
    expect(prepared.filter((item) => item.ingredient.type === "water_treatment")).toHaveLength(28);
  });

  it("seeds package variants for additive/consumable split items, every hop, and branded dry yeast", () => {
    const prepared = catalogSeedManifest.flatMap((spec) => prepareCatalogSeedFile(spec));
    const withPackageVariants = prepared.filter((item) => item.packageVariants.length > 0);
    const withoutConsumablesHopsYeasts = prepared.filter((item) => (
      item.ingredient.type !== "consumable"
      && item.ingredient.type !== "hop"
      && item.ingredient.type !== "yeast"
      && item.packageVariants.length > 0
    ));

    const consumableVariants = withPackageVariants
      .filter((item) => item.ingredient.type === "consumable")
      .flatMap((item) => item.packageVariants);
    const hopItems = prepared.filter((item) => item.ingredient.type === "hop");
    const brandedDryYeastItems = withPackageVariants.filter((item) => item.ingredient.type === "yeast");

    // 125 расходники/добавки (не менялось) + 248 хмелей * 2 фасовки + 83 брендованных сухих дрожжей
    // (Fermentis 28 * 11.5 г, Lallemand 27 * 11 г, Mangrove Jack's 28 * 10 г).
    expect(withPackageVariants.flatMap((item) => item.packageVariants)).toHaveLength(125 + 248 * 2 + 83);
    expect(consumableVariants).toHaveLength(125);
    expect(withoutConsumablesHopsYeasts).toHaveLength(0);

    expect(hopItems).toHaveLength(248);
    for (const hop of hopItems) {
      expect(hop.packageVariants).toHaveLength(2);
      const defaults = hop.packageVariants.filter((variant) => variant.isDefaultForStock);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]?.stockContentAmount).toBe(50);
      expect(defaults[0]?.stockContentUnit).toBe("g");
    }

    expect(brandedDryYeastItems).toHaveLength(83);
    const gramsByBrand: Record<string, number> = {
      Fermentis: 11.5,
      Lallemand: 11,
      "Mangrove Jack's": 10
    };
    const brandedCounts: Record<string, number> = { Fermentis: 0, Lallemand: 0, "Mangrove Jack's": 0 };
    for (const yeast of brandedDryYeastItems) {
      expect(yeast.packageVariants).toHaveLength(1);
      const brand = yeast.ingredient.brand as string;
      expect(gramsByBrand).toHaveProperty(brand);
      brandedCounts[brand] += 1;
      const [variant] = yeast.packageVariants;
      expect(variant.stockContentAmount).toBe(gramsByBrand[brand]);
      expect(variant.stockContentUnit).toBe("g");
      expect(variant.isDefaultForStock).toBe(true);
    }
    expect(brandedCounts).toEqual({ Fermentis: 28, Lallemand: 27, "Mangrove Jack's": 28 });
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

  it("prepares the additive v2.1 seed with the new picker groups", () => {
    const prepared = prepareCatalogSeedFile({
      fileName: "additives_v2_1.json",
      type: "consumable"
    });
    const riceHulls = prepared.find((item) => item.ingredient.id === "rice-hulls-lauter-aid");
    const irishMoss = prepared.find((item) => item.ingredient.id === "kettle-fining-irish-moss");

    expect(prepared).toHaveLength(118);
    expect(riceHulls?.ingredient.category).toBe("lauter_aid");
    expect(riceHulls?.ingredient.subcategory).toBe("Фильтрующая добавка");
    expect(riceHulls?.ingredient.itemKind).toBe("lauter_aid");
    expect(riceHulls?.ingredient.groupName).toBe("Фильтрация затора");
    expect(riceHulls?.ingredient.attributes).toMatchObject({
      picker_group: "lauter_aid",
      beerxml_misc_type: "Other",
      additive_group_ru: "Фильтрация затора"
    });
    expect(riceHulls?.ingredient.quantityDefaults).toMatchObject({
      recipe_unit_default: "g",
      stock_unit_default: "g"
    });
    expect(riceHulls?.aliases.some((alias) => alias.aliasNormalized === "rice hulls")).toBe(true);

    expect(irishMoss?.ingredient.category).toBe("technical_additives");
    expect(irishMoss?.ingredient.subcategory).toBe("fining");
    expect(irishMoss?.ingredient.itemKind).toBe("technical_additives");
    expect(irishMoss?.ingredient.attributes).toMatchObject({
      picker_group: "technical_additives"
    });
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

  it("treats an ordinary 2-letter ISO country code as enough to localize a hop with name_ru", () => {
    const prepared = prepareCatalogSeedFile({
      fileName: "hop_catalog_minimal_v2.json",
      type: "hop"
    });
    const eclipse = prepared.find((item) => item.ingredient.id === "au-eclipse-standard");

    expect(eclipse?.ingredient.countryCode).toBe("AU");
    expect(eclipse?.ingredient.nameRu).toBe("Эклипс");
    expect(eclipse?.ingredient.displayModeRu).toBe("localized_first");
  });

  it("keeps hop name_en out of full-caps for word-like names (codes like ADHA-484/BRU-1/CTZ/XJA 436/92 P 2/4 are exempt)", () => {
    const prepared = prepareCatalogSeedFile({
      fileName: "hop_catalog_minimal_v2.json",
      type: "hop"
    });
    const isWordLikeAllCaps = (value: string) => (
      /^[A-Z][A-Z .]*$/.test(value)
      && value.length > 4
      && value === value.toUpperCase()
    );
    const shoutingNames = prepared
      .map((item) => item.ingredient.nameEn)
      .filter((nameEn): nameEn is string => typeof nameEn === "string" && isWordLikeAllCaps(nameEn));

    expect(shoutingNames).toEqual([]);
  });
});
