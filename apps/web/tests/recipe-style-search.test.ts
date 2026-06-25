import { describe, expect, it } from "vitest";

import type { BjcpCatalogData } from "@nb/content";

import {
  buildRecipeStyleSearchIndex,
  findStyleByCode,
  orderedFamilies,
  orderedFamiliesWithCounts,
  searchRecipeStyles,
  type RecipeStyleSearchIndex
} from "../features/recipes/style-search";

const index: RecipeStyleSearchIndex = {
  families: [
    { id: "ipa_hoppy", nameRu: "IPA и хмелевые", nameEn: "IPA & Hoppy", styleCount: 12, sortOrder: 3 },
    { id: "porters_stouts", nameRu: "Портеры и стауты", nameEn: "Porters & Stouts", styleCount: 9, sortOrder: 7 },
    { id: "pale_lagers", nameRu: "Светлые лагеры", nameEn: "Pale Lagers", styleCount: 8, sortOrder: 1 }
  ],
  styles: [
    { code: "21A", title: "American IPA", titleEn: "American IPA", familyIds: ["ipa_hoppy"], familyNameRu: "IPA и хмелевые" },
    { code: "22A", title: "Double IPA", titleEn: "Double IPA", familyIds: ["ipa_hoppy"], familyNameRu: "IPA и хмелевые" },
    { code: "20B", title: "Американский стаут", titleEn: "American Stout", familyIds: ["porters_stouts"], familyNameRu: "Портеры и стауты" },
    { code: "1A", title: "American Light Lager", titleEn: "American Light Lager", familyIds: ["pale_lagers"], familyNameRu: "Светлые лагеры" }
  ]
};

describe("searchRecipeStyles", () => {
  it("returns empty for queries shorter than 2 chars", () => {
    expect(searchRecipeStyles("i", index)).toEqual({ families: [], styles: [] });
    expect(searchRecipeStyles("", index)).toEqual({ families: [], styles: [] });
  });

  it("matches both family and styles for «ipa»", () => {
    const result = searchRecipeStyles("ipa", index);
    expect(result.families.map((entry) => entry.id)).toContain("ipa_hoppy");
    const codes = result.styles.map((entry) => entry.code);
    expect(codes).toContain("21A");
    expect(codes).toContain("22A");
    // Лагер/стаут не должны попадать в выдачу по «ipa».
    expect(codes).not.toContain("1A");
    expect(codes).not.toContain("20B");
  });

  it("matches by BJCP code", () => {
    const result = searchRecipeStyles("21A", index);
    expect(result.styles.map((entry) => entry.code)).toContain("21A");
  });

  it("matches cyrillic style title («стаут»)", () => {
    const result = searchRecipeStyles("стаут", index);
    expect(result.styles.map((entry) => entry.code)).toContain("20B");
  });

  it("ranks higher scores first and caps results", () => {
    const result = searchRecipeStyles("lager", index);
    expect(result.styles.length).toBeLessThanOrEqual(8);
    expect(result.families.length).toBeLessThanOrEqual(4);
  });
});

describe("orderedFamilies", () => {
  it("orders families by sortOrder", () => {
    expect(orderedFamilies(index).map((entry) => entry.id)).toEqual([
      "pale_lagers",
      "ipa_hoppy",
      "porters_stouts"
    ]);
  });
});

describe("orderedFamiliesWithCounts", () => {
  it("attaches recipe counts, drops empty families and keeps sortOrder", () => {
    const result = orderedFamiliesWithCounts(index, { ipa_hoppy: 5, pale_lagers: 2 });
    // porters_stouts отсутствует в counts (0) → скрыто; порядок по sortOrder.
    expect(result.map((entry) => entry.id)).toEqual(["pale_lagers", "ipa_hoppy"]);
    expect(result.map((entry) => entry.recipeCount)).toEqual([2, 5]);
  });

  it("drops families with an explicit zero count", () => {
    const result = orderedFamiliesWithCounts(index, { ipa_hoppy: 0, pale_lagers: 1 });
    expect(result.map((entry) => entry.id)).toEqual(["pale_lagers"]);
  });
});

describe("findStyleByCode", () => {
  it("returns the style entry for a code", () => {
    expect(findStyleByCode(index, "21A")?.title).toBe("American IPA");
  });

  it("returns null for unknown or empty codes", () => {
    expect(findStyleByCode(index, "ZZZ")).toBeNull();
    expect(findStyleByCode(index, null)).toBeNull();
  });
});

describe("buildRecipeStyleSearchIndex", () => {
  it("projects the full catalog into a compact index", () => {
    const catalog = {
      families: [
        {
          id: "ipa_hoppy",
          nameRu: "IPA и хмелевые",
          nameEn: "IPA & Hoppy",
          styleCount: 12,
          sortOrder: 3,
          // лишние поля каталога должны игнорироваться
          descriptionRu: "…",
          primaryStyleCount: 10,
          styleIds: ["21A"],
          crossListedStyleIds: [],
          hasCrossListings: false
        }
      ],
      styles: [
        {
          bjcpId: "21A",
          title: "American IPA",
          titleEn: "American IPA",
          familyIds: ["ipa_hoppy"],
          familyNameRu: "IPA и хмелевые",
          slug: "american-ipa"
        }
      ],
      categories: [],
      uiStrategy: {}
    } as unknown as BjcpCatalogData;

    const built = buildRecipeStyleSearchIndex(catalog);
    expect(built.families).toEqual([
      { id: "ipa_hoppy", nameRu: "IPA и хмелевые", nameEn: "IPA & Hoppy", styleCount: 12, sortOrder: 3 }
    ]);
    expect(built.styles).toEqual([
      { code: "21A", title: "American IPA", titleEn: "American IPA", familyIds: ["ipa_hoppy"], familyNameRu: "IPA и хмелевые" }
    ]);
  });
});
