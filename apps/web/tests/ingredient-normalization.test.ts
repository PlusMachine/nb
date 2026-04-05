import { describe, expect, it } from "vitest";

import {
  buildQueryVariants,
  normalizeAliasList,
  normalizeSearchText,
  rewriteIngredientQueryForManufacturer
} from "../features/ingredients/normalization";

describe("ingredient normalization", () => {
  it("normalizes casing, spaces and punctuation", () => {
    expect(normalizeSearchText("  Citra,  Pellet  ")).toBe("citra pellet");
    expect(normalizeSearchText(" Пильзнер / Pilsener (2RP) ")).toBe("пильзнер pilsener 2rp");
  });

  it("deduplicates aliases", () => {
    expect(normalizeAliasList(["Citra", " citra ", "CITRA"])).toEqual(["citra"]);
  });

  it("builds ru/en typo and layout query variants", () => {
    const typoVariants = buildQueryVariants("пильзнер");
    const shortFamilyVariants = buildQueryVariants("pil");
    const latinVariants = buildQueryVariants("pilsen");
    const familyVariants = buildQueryVariants("pils");
    const familyVariantsRu = buildQueryVariants("пилс");
    const layoutVariants = buildQueryVariants("зшдытук");

    expect(typoVariants).toContain("пилснер");
    expect(typoVariants).toContain("pilsner");
    expect(shortFamilyVariants).toContain("pilsner");
    expect(latinVariants).toContain("pilsner");
    expect(familyVariants).toContain("pilsner");
    expect(familyVariants).toContain("pilsener");
    expect(familyVariantsRu).toContain("пильзен");
    expect(layoutVariants).toContain("pilsner");
  });

  it("consumes manufacturer-like query fully for brand-first refinements", () => {
    expect(rewriteIngredientQueryForManufacturer({
      query: "cast",
      manufacturer: "Castle Malting"
    })).toBe("");

    expect(rewriteIngredientQueryForManufacturer({
      query: "castle",
      manufacturer: "Castle Malting"
    })).toBe("");
  });

  it("keeps only product-specific remainder for mixed manufacturer queries", () => {
    expect(rewriteIngredientQueryForManufacturer({
      query: "castle pil",
      manufacturer: "Castle Malting"
    })).toBe("pil");

    expect(rewriteIngredientQueryForManufacturer({
      query: "castle pilsner",
      manufacturer: "Castle Malting"
    })).toBe("pilsner");
  });

  it("preserves non-manufacturer product tokens when scoping by brand", () => {
    expect(rewriteIngredientQueryForManufacturer({
      query: "пил",
      manufacturer: "Castle Malting"
    })).toBe("пил");

    expect(rewriteIngredientQueryForManufacturer({
      query: "2rs",
      manufacturer: "Castle Malting"
    })).toBe("2rs");
  });
});
