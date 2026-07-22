import { describe, expect, it } from "vitest";

import type { UserCatalogIngredientDto } from "../features/ingredients/contracts";
import {
  buildCatalogItemListJsonLd,
  buildCatalogListMetadata,
  buildIngredientDetailJsonLd,
  buildIngredientDetailMetadata,
  catalogCategoryLandings,
  jsonLdScriptProps,
  resolveCatalogLanding,
  resolveCatalogLandingForFilter
} from "../features/ingredients/seo";

const buildHopItem = (overrides: Partial<UserCatalogIngredientDto> = {}): UserCatalogIngredientDto => ({
  id: "us-citra-standard",
  source: "catalog",
  category: "hop",
  subtype: "hop",
  primaryLabelRu: "Citra",
  secondaryLabelRu: "Цитра",
  brand: "Yakima Chief Hops",
  hopAlphaAcidPct: 12.7,
  hopBetaAcidPct: 4.2,
  hopForm: "pellet",
  technicalData: { type: "hop", hopForm: "pellet" },
  isActive: true,
  status: "active",
  ...overrides
} as UserCatalogIngredientDto);

const buildMaltItem = (overrides: Partial<UserCatalogIngredientDto> = {}): UserCatalogIngredientDto => ({
  id: "weyermann-pilsner",
  source: "catalog",
  category: "fermentable",
  subtype: "malt",
  primaryLabelRu: "Пилснер",
  secondaryLabelRu: null,
  brand: null,
  producer: null,
  brandName: null,
  manufacturer: null,
  fermentableExtractYieldPct: 80,
  technicalData: { type: "malt", colorEbcMin: 3, colorEbcMax: 4 },
  isActive: true,
  status: "active",
  ...overrides
} as UserCatalogIngredientDto);

const buildYeastItem = (overrides: Partial<UserCatalogIngredientDto> = {}): UserCatalogIngredientDto => ({
  id: "us-05",
  source: "catalog",
  category: "yeast",
  subtype: "yeast",
  primaryLabelRu: "US-05",
  secondaryLabelRu: null,
  brand: "Fermentis",
  yeastAttenuationPct: 78,
  yeastMinFermentationTempC: 15,
  yeastMaxFermentationTempC: 22,
  technicalData: { type: "yeast", flocculation: "medium" },
  isActive: true,
  status: "active",
  ...overrides
} as UserCatalogIngredientDto);

const buildFermentableWithoutSubtype = (overrides: Partial<UserCatalogIngredientDto> = {}): UserCatalogIngredientDto => ({
  id: "custom-honey",
  source: "custom",
  category: "fermentable",
  subtype: null,
  primaryLabelRu: "Мёд",
  secondaryLabelRu: null,
  brand: null,
  technicalData: null,
  isActive: true,
  status: "active",
  ...overrides
} as UserCatalogIngredientDto);

describe("catalog landing slugs", () => {
  it("resolves all seven valid slugs", () => {
    const expectedMapping: Record<string, { category: string; subtype?: string; consumableGroup?: string }> = {
      hops: { category: "hop" },
      malts: { category: "fermentable", subtype: "malt" },
      fermentables: { category: "fermentable", subtype: "fermentable" },
      yeast: { category: "yeast" },
      water: { category: "water_treatment" },
      additives: { category: "consumable", consumableGroup: "inventory_additives" },
      consumables: { category: "consumable", consumableGroup: "inventory_supplies" }
    };

    expect(catalogCategoryLandings).toHaveLength(7);

    for (const [slug, expected] of Object.entries(expectedMapping)) {
      const landing = resolveCatalogLanding(slug);
      expect(landing).not.toBeNull();
      expect(landing?.category).toBe(expected.category);
      expect(landing?.subtype).toBe(expected.subtype);
      expect(landing?.consumableGroup).toBe(expected.consumableGroup);
      expect(landing?.h1).toBeTruthy();
      expect(landing?.metaTitle).toBeTruthy();
      expect(landing?.metaDescription).toBeTruthy();
      expect(landing?.intro.length).toBeGreaterThan(0);
    }
  });

  it("returns null for reserved segments and unknown slugs", () => {
    expect(resolveCatalogLanding("system")).toBeNull();
    expect(resolveCatalogLanding("custom")).toBeNull();
    expect(resolveCatalogLanding("new")).toBeNull();
    expect(resolveCatalogLanding("abracadabra")).toBeNull();
  });
});

describe("resolveCatalogLandingForFilter", () => {
  it("resolves categories without a subtype directly", () => {
    expect(resolveCatalogLandingForFilter("hop")?.slug).toBe("hops");
    expect(resolveCatalogLandingForFilter("yeast")?.slug).toBe("yeast");
    expect(resolveCatalogLandingForFilter("water_treatment")?.slug).toBe("water");
  });

  it("requires an exact subtype match for fermentable", () => {
    expect(resolveCatalogLandingForFilter("fermentable", "malt")?.slug).toBe("malts");
    expect(resolveCatalogLandingForFilter("fermentable", "fermentable")?.slug).toBe("fermentables");
    expect(resolveCatalogLandingForFilter("fermentable")).toBeNull();
    expect(resolveCatalogLandingForFilter("fermentable", null)).toBeNull();
  });

  it("requires an exact broad group match for consumable", () => {
    expect(resolveCatalogLandingForFilter("consumable")).toBeNull();
    expect(resolveCatalogLandingForFilter("consumable", null, null)).toBeNull();
    expect(resolveCatalogLandingForFilter("consumable", null, "inventory_additives")?.slug).toBe("additives");
    expect(resolveCatalogLandingForFilter("consumable", null, "inventory_supplies")?.slug).toBe("consumables");
  });

  it("returns null when no category is given", () => {
    expect(resolveCatalogLandingForFilter(undefined)).toBeNull();
  });

  it("resolves a landing from subtype alone when category is omitted", () => {
    expect(resolveCatalogLandingForFilter(undefined, "malt")?.slug).toBe("malts");
    expect(resolveCatalogLandingForFilter(undefined, "fermentable")?.slug).toBe("fermentables");
  });
});

describe("buildCatalogListMetadata", () => {
  it("marks search results as noindex without a canonical", () => {
    const metadata = buildCatalogListMetadata({ q: "citra" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
  });

  it("marks the 'mine' view as noindex without a canonical", () => {
    const metadata = buildCatalogListMetadata({ view: "mine" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
  });

  it("ignores blank search queries", () => {
    const metadata = buildCatalogListMetadata({ q: "   " });
    expect(metadata.robots).toBeUndefined();
  });

  it("resolves the landing canonical from category+subtype", () => {
    const metadata = buildCatalogListMetadata({ category: "fermentable", subtype: "malt" });
    expect(metadata.title).toBe("Солод для пивоварения — каталог");
    expect(metadata.alternates).toEqual({ canonical: "/catalog/malts" });
  });

  it("uses an explicitly provided landing over category+subtype", () => {
    const hopsLanding = resolveCatalogLanding("hops");
    const metadata = buildCatalogListMetadata({ landing: hopsLanding });
    expect(metadata.alternates).toEqual({ canonical: "/catalog/hops" });
  });

  it("подключает брендовую обложку лендинга каталога (Ф3, docs/specs/og-images.md)", () => {
    const hopsLanding = resolveCatalogLanding("hops");
    const metadata = buildCatalogListMetadata({ landing: hopsLanding });
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: "/api/og/sections/catalog-hops" })
    ]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("лендинг: openGraph несёт locale/siteName (страница замещает openGraph родительского layout целиком)", () => {
    const hopsLanding = resolveCatalogLanding("hops");
    const metadata = buildCatalogListMetadata({ landing: hopsLanding });
    expect(metadata.openGraph).toMatchObject({ locale: "ru_RU" });
    expect((metadata.openGraph as { siteName?: string } | undefined)?.siteName).toBeTruthy();
  });

  it("appends a page suffix to the landing title and canonical", () => {
    const metadata = buildCatalogListMetadata({ category: "hop", page: 2 });
    expect(metadata.title).toBe("Хмель для пивоварения — каталог сортов — страница 2");
    expect(metadata.alternates).toEqual({ canonical: "/catalog/hops?page=2" });
  });

  it("falls back to the base catalog metadata without category/landing", () => {
    const metadata = buildCatalogListMetadata({});
    expect(metadata.title).toBe("Каталог ингредиентов для пивоварения");
    expect(metadata.alternates).toEqual({ canonical: "/catalog" });
  });

  it("подключает брендовую обложку хаба /catalog (Ф3, docs/specs/og-images.md)", () => {
    const metadata = buildCatalogListMetadata({});
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: "/api/og/sections/catalog" })
    ]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("хаб: openGraph несёт locale/siteName (страница замещает openGraph родительского layout целиком)", () => {
    const metadata = buildCatalogListMetadata({});
    expect(metadata.openGraph).toMatchObject({ locale: "ru_RU" });
    expect((metadata.openGraph as { siteName?: string } | undefined)?.siteName).toBeTruthy();
  });

  it("keeps the base canonical clean for ?page=N — the hub has no pagination of its own", () => {
    const metadata = buildCatalogListMetadata({ page: 3 });
    expect(metadata.title).toBe("Каталог ингредиентов для пивоварения");
    expect(metadata.alternates).toEqual({ canonical: "/catalog" });
  });

  it("resolves the landing canonical from subtype alone when category is omitted", () => {
    const metadata = buildCatalogListMetadata({ subtype: "malt" });
    expect(metadata.title).toBe("Солод для пивоварения — каталог");
    expect(metadata.alternates).toEqual({ canonical: "/catalog/malts" });
  });

  it("collapses a non-landing category filter (fermentable without subtype) to the base canonical", () => {
    const metadata = buildCatalogListMetadata({ category: "fermentable" });
    expect(metadata.title).toBe("Каталог ингредиентов для пивоварения");
    expect(metadata.alternates).toEqual({ canonical: "/catalog" });
  });

  it("drops both the non-landing category filter and the page param from the base canonical", () => {
    const metadata = buildCatalogListMetadata({ category: "fermentable", page: 2 });
    expect(metadata.alternates).toEqual({ canonical: "/catalog" });
  });
});

describe("buildIngredientDetailMetadata", () => {
  it("formats the title for a hop with a brand and secondary name", () => {
    const metadata = buildIngredientDetailMetadata(buildHopItem(), { source: "system", id: "us-citra-standard" });
    expect(metadata.title).toBe("Citra (Цитра) — хмель Yakima Chief Hops");
    expect(metadata.alternates).toEqual({ canonical: "/catalog/system/us-citra-standard" });
  });

  it("formats the title for a malt without a brand or secondary name", () => {
    const metadata = buildIngredientDetailMetadata(buildMaltItem(), { source: "system", id: "weyermann-pilsner" });
    expect(metadata.title).toBe("Пилснер — солод");
  });

  it("marks custom ingredients as noindex,nofollow without a canonical", () => {
    const metadata = buildIngredientDetailMetadata(
      buildFermentableWithoutSubtype(),
      { source: "custom", id: "custom-honey" }
    );
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
  });

  it("does not set robots for an active system ingredient", () => {
    const metadata = buildIngredientDetailMetadata(buildHopItem(), { source: "system", id: "us-citra-standard" });
    expect(metadata.robots).toBeUndefined();
  });

  it("marks an archived system ingredient as noindex,follow but keeps the canonical", () => {
    const metadata = buildIngredientDetailMetadata(
      buildHopItem({ status: "archived", isActive: false }),
      { source: "system", id: "us-citra-standard" }
    );
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toEqual({ canonical: "/catalog/system/us-citra-standard" });
  });

  it("includes category-specific facts in the description", () => {
    const metadata = buildIngredientDetailMetadata(buildYeastItem(), { source: "system", id: "us-05" });
    expect(metadata.description).toContain("Аттенюация: 78%");
    expect(metadata.description).toContain("15–22°C");
  });

  it("uses the first paragraph of descriptionRu instead of the fact generator when present", () => {
    const metadata = buildIngredientDetailMetadata(
      buildHopItem({ descriptionRu: "Цитра — американский ароматный хмель с нотами цитрусовых и тропических фруктов.\n\nВторой абзац не попадает в description." }),
      { source: "system", id: "us-citra-standard" }
    );

    expect(metadata.description).toBe("Цитра — американский ароматный хмель с нотами цитрусовых и тропических фруктов.");
    expect(metadata.description).not.toContain("Второй абзац");
  });

  it("truncates a long descriptionRu paragraph at a word boundary around 200 chars", () => {
    const longSentence = "Слово".repeat(1).concat(" ") + "оченьдлинноеслововописании ".repeat(20);
    const metadata = buildIngredientDetailMetadata(
      buildHopItem({ descriptionRu: longSentence.trim() }),
      { source: "system", id: "us-citra-standard" }
    );

    expect(metadata.description?.length).toBeLessThanOrEqual(201);
    expect(metadata.description?.endsWith("…")).toBe(true);
    expect(metadata.description?.[metadata.description.length - 2]).not.toBe(" ");
  });

  it("falls back to the fact generator when descriptionRu is blank", () => {
    const metadata = buildIngredientDetailMetadata(buildHopItem({ descriptionRu: "   " }), { source: "system", id: "us-citra-standard" });
    expect(metadata.description).toContain("Альфа-кислота: 12.7%");
  });
});

describe("jsonLdScriptProps", () => {
  it("escapes '<' so a closing </script> tag cannot break out of the JSON-LD block", () => {
    const props = jsonLdScriptProps({ name: "</script><script>alert(1)</script>" });
    expect(props.type).toBe("application/ld+json");
    expect(props.dangerouslySetInnerHTML.__html).not.toContain("<");
    expect(props.dangerouslySetInnerHTML.__html).toContain("\\u003c");
  });
});

describe("buildIngredientDetailJsonLd", () => {
  it("returns a BreadcrumbList and a Product with the category landing as a crumb", () => {
    const schemas = buildIngredientDetailJsonLd(buildHopItem(), {
      baseUrl: "https://example.test",
      source: "system",
      id: "us-citra-standard"
    });

    expect(schemas).toHaveLength(2);
    const [breadcrumbList, product] = schemas as Array<Record<string, unknown>>;

    expect(breadcrumbList["@type"]).toBe("BreadcrumbList");
    const crumbs = breadcrumbList.itemListElement as Array<Record<string, unknown>>;
    expect(crumbs).toHaveLength(4);
    expect(crumbs[0]).toMatchObject({ name: "Главная", item: "https://example.test" });
    expect(crumbs[1]).toMatchObject({ name: "Каталог", item: "https://example.test/catalog" });
    expect(crumbs[2]).toMatchObject({ name: "Хмель для пивоварения", item: "https://example.test/catalog/hops" });
    expect(crumbs[3]).toMatchObject({ name: "Citra", item: "https://example.test/catalog/system/us-citra-standard" });

    expect(product["@type"]).toBe("Product");
    expect(product.brand).toEqual({ "@type": "Brand", name: "Yakima Chief Hops" });
    expect(product.additionalProperty).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "@type": "PropertyValue", value: "12.7%" })
      ])
    );
    expect(product.description).toContain("Альфа-кислота: 12.7%");
  });

  it("uses descriptionRu for Product.description, matching the metadata description", () => {
    const item = buildHopItem({ descriptionRu: "Цитра — американский ароматный хмель." });
    const metadata = buildIngredientDetailMetadata(item, { source: "system", id: "us-citra-standard" });
    const schemas = buildIngredientDetailJsonLd(item, {
      baseUrl: "https://example.test",
      source: "system",
      id: "us-citra-standard"
    });

    const [, product] = schemas as Array<Record<string, unknown>>;
    expect(product.description).toBe("Цитра — американский ароматный хмель.");
    expect(product.description).toBe(metadata.description);
  });

  it("omits the category crumb and brand when neither is available", () => {
    const schemas = buildIngredientDetailJsonLd(buildFermentableWithoutSubtype(), {
      baseUrl: "https://example.test",
      source: "custom",
      id: "custom-honey"
    });

    const [breadcrumbList, product] = schemas as Array<Record<string, unknown>>;
    const crumbs = breadcrumbList.itemListElement as Array<Record<string, unknown>>;
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toMatchObject({ name: "Главная" });
    expect(product).not.toHaveProperty("brand");
  });
});

describe("buildCatalogItemListJsonLd", () => {
  it("lists only system ingredients, preserving absolute position with offset", () => {
    const items = [
      buildHopItem({ id: "hop-1", primaryLabelRu: "Хмель 1" }),
      buildFermentableWithoutSubtype({ id: "custom-1", source: "custom", primaryLabelRu: "Кастомный" }),
      buildMaltItem({ id: "malt-1", primaryLabelRu: "Солод 1" })
    ];

    const jsonLd = buildCatalogItemListJsonLd(items, {
      baseUrl: "https://example.test/",
      path: "/catalog/hops",
      offset: 20
    }) as { itemListElement: Array<Record<string, unknown>> };

    expect(jsonLd.itemListElement).toHaveLength(2);
    expect(jsonLd.itemListElement[0]).toMatchObject({
      position: 21,
      url: "https://example.test/catalog/system/hop-1"
    });
    expect(jsonLd.itemListElement[1]).toMatchObject({
      position: 23,
      url: "https://example.test/catalog/system/malt-1"
    });
  });
});
