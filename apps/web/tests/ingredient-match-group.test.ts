import { describe, expect, it } from "vitest";

import {
  resolveCanonicalFamilyBucket,
  resolveIngredientMatchKey,
  type IngredientMatchProfile
} from "../features/ingredients/match-group";

const maltProfile = (
  overrides: Partial<IngredientMatchProfile> & { name: string }
): IngredientMatchProfile => ({
  category: "fermentable",
  type: "malt",
  nameEn: overrides.name,
  dimension: "weight",
  ...overrides
});

const hopProfile = (
  overrides: Partial<IngredientMatchProfile> & { nameEn: string }
): IngredientMatchProfile => ({
  category: "hop",
  type: "hop",
  dimension: "weight",
  technicalData: { type: "hop", alphaAcidPctTypical: 5.5 },
  ...overrides
});

describe("resolveCanonicalFamilyBucket", () => {
  it("maps brand-specific pilsner names (ru/en) to the same bucket", () => {
    expect(resolveCanonicalFamilyBucket(["Pilsner Malt"])).toBe("pilsner");
    expect(resolveCanonicalFamilyBucket(["Пилснер курский"])).toBe("pilsner");
    expect(resolveCanonicalFamilyBucket(["Extra Pale Premium Pilsner"])).toBe("pilsner");
  });

  it("separates distinct malt sub-types", () => {
    expect(resolveCanonicalFamilyBucket(["Munich malt"])).toBe("munich");
    expect(resolveCanonicalFamilyBucket(["Caramel 40"])).toBe("caramel");
    expect(resolveCanonicalFamilyBucket(["Crystal 150"])).toBe("caramel");
    expect(resolveCanonicalFamilyBucket(["Chocolate malt"])).toBe("roasted");
  });

  it("returns null for unknown names", () => {
    expect(resolveCanonicalFamilyBucket(["Какой-то редкий солод"])).toBeNull();
    expect(resolveCanonicalFamilyBucket([null, undefined, ""])).toBeNull();
  });
});

describe("resolveIngredientMatchKey — fermentables", () => {
  it("matches the same pilsner across different brands (group key) but keeps distinct exact keys", () => {
    const kursk = resolveIngredientMatchKey(maltProfile({
      name: "Pilsner",
      catalogItemId: "kursk--pilsner",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 }
    }));
    const soufflet = resolveIngredientMatchKey(maltProfile({
      name: "Pilsner",
      catalogItemId: "soufflet--pilsner",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 3, colorEbcMax: 4.5 }
    }));

    expect(kursk.groupKey).toBe("fermentable:pilsner");
    expect(soufflet.groupKey).toBe("fermentable:pilsner");
    expect(kursk.groupKey).toBe(soufflet.groupKey);
    expect(kursk.exactKey).not.toBe(soufflet.exactKey);
    expect(kursk.matchPolicy).toBe("family_compatible");
  });

  it("does NOT match pilsner with munich (different base sub-type)", () => {
    const pilsner = resolveIngredientMatchKey(maltProfile({
      name: "Pilsner",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 }
    }));
    const munich = resolveIngredientMatchKey(maltProfile({
      name: "Munich",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 14, colorEbcMax: 18 }
    }));

    expect(pilsner.groupKey).toBe("fermentable:pilsner");
    expect(munich.groupKey).toBe("fermentable:munich");
    expect(pilsner.groupKey).not.toBe(munich.groupKey);
  });

  it("does NOT match crystal/caramel with pilsner, and splits caramel by colour band", () => {
    const pilsner = resolveIngredientMatchKey(maltProfile({
      name: "Pilsner",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 }
    }));
    const caramelLight = resolveIngredientMatchKey(maltProfile({
      name: "Caramel 40",
      technicalData: { type: "malt", maltType: "caramel", colorEbcMin: 25, colorEbcMax: 35 }
    }));
    const caramelDark = resolveIngredientMatchKey(maltProfile({
      name: "Crystal 150",
      technicalData: { type: "malt", maltType: "caramel", colorEbcMin: 140, colorEbcMax: 160 }
    }));

    expect(caramelLight.groupKey).not.toBe(pilsner.groupKey);
    expect(caramelLight.groupKey?.startsWith("fermentable:caramel:")).toBe(true);
    expect(caramelDark.groupKey?.startsWith("fermentable:caramel:")).toBe(true);
    expect(caramelLight.groupKey).not.toBe(caramelDark.groupKey);
  });
});

describe("resolveIngredientMatchKey — hops", () => {
  it("matches the same hop variety across producers", () => {
    const a = resolveIngredientMatchKey(hopProfile({ nameEn: "Cascade", catalogItemId: "barth--cascade" }));
    const b = resolveIngredientMatchKey(hopProfile({ nameEn: "Cascade", catalogItemId: "yakima--cascade" }));

    expect(a.groupKey).toBe("hop:cascade");
    expect(b.groupKey).toBe("hop:cascade");
    expect(a.exactKey).not.toBe(b.exactKey);
    expect(a.matchPolicy).toBe("family_compatible");
  });

  it("does not match different hop varieties", () => {
    const cascade = resolveIngredientMatchKey(hopProfile({ nameEn: "Cascade" }));
    const saaz = resolveIngredientMatchKey(hopProfile({ nameEn: "Saaz" }));

    expect(cascade.groupKey).not.toBe(saaz.groupKey);
  });
});

describe("resolveIngredientMatchKey — policy & dimension", () => {
  it("treats yeast as exact-only", () => {
    const yeast = resolveIngredientMatchKey({
      category: "yeast",
      type: "yeast",
      name: "Safale US-05",
      catalogItemId: "fermentis--us-05",
      dimension: "count",
      technicalData: { type: "yeast", yeastFamily: "US-05", form: "dry" }
    });

    expect(yeast.matchPolicy).toBe("exact_only");
    expect(yeast.dimension).toBe("count");
  });

  it("carries the measurement dimension through", () => {
    const key = resolveIngredientMatchKey(maltProfile({
      name: "Pilsner",
      dimension: "weight",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 }
    }));

    expect(key.dimension).toBe("weight");
  });
});
