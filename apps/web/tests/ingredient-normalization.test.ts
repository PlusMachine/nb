import { describe, expect, it } from "vitest";

import {
  buildQueryVariants,
  normalizeAliasList,
  normalizeSearchText
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
    const latinVariants = buildQueryVariants("pilsen");
    const layoutVariants = buildQueryVariants("зшдытук");

    expect(typoVariants).toContain("пилснер");
    expect(typoVariants).toContain("pilsner");
    expect(latinVariants).toContain("pilsner");
    expect(layoutVariants).toContain("pilsner");
  });
});
