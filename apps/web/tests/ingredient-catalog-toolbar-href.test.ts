import { describe, expect, it } from "vitest";

import {
  buildContextualHref,
  resolveLandingPath
} from "../components/ingredients/ingredient-catalog-toolbar";

// Регрессия P1 (notes/catalog-hub-redesign.md): на категорийном лендинге href
// поиска/сортировки не должен писать ?category= в query — иначе легаси-редирект
// в app/(public)/catalog/page.tsx уводит обратно на тот же лендинг лишним 308.

describe("resolveLandingPath", () => {
  it("резолвит fermentable+subtype в собственные лендинги", () => {
    expect(resolveLandingPath("fermentable", "malt")).toBe("/catalog/malts");
    expect(resolveLandingPath("fermentable", "fermentable")).toBe("/catalog/fermentables");
  });

  it("резолвит остальные категории без subtype", () => {
    expect(resolveLandingPath("hop", null)).toBe("/catalog/hops");
    expect(resolveLandingPath("yeast", null)).toBe("/catalog/yeast");
    expect(resolveLandingPath("water_treatment", null)).toBe("/catalog/water");
  });

  it("резолвит consumable+broad group в собственные лендинги", () => {
    expect(resolveLandingPath("consumable", null, "inventory_additives")).toBe("/catalog/additives");
    expect(resolveLandingPath("consumable", null, "inventory_supplies")).toBe("/catalog/consumables");
  });

  it("возвращает null для хаба, для неоднозначного fermentable без subtype и consumable без broad group", () => {
    expect(resolveLandingPath("all", null)).toBeNull();
    expect(resolveLandingPath("fermentable", null)).toBeNull();
    expect(resolveLandingPath("consumable", null)).toBeNull();
  });
});

describe("buildContextualHref", () => {
  it("на лендинге строит href прямо на его путь, без category/subtype в query", () => {
    const href = buildContextualHref(resolveLandingPath("hop", null), "/catalog", {
      view: "all",
      q: "citra",
      category: "hop",
      subtype: null,
      sort: "alpha"
    });

    expect(href).toBe("/catalog/hops?q=citra&sort=alpha");
    expect(href).not.toContain("category=");
  });

  it("на лендинге с fermentable-подтипом тоже не пишет category/subtype", () => {
    const href = buildContextualHref(resolveLandingPath("fermentable", "malt"), "/catalog", {
      view: "all",
      q: "",
      category: "fermentable",
      subtype: "malt",
      sort: "color"
    });

    expect(href).toBe("/catalog/malts?sort=color");
  });

  it("на хабе строит href на /catalog с ?category= в query, как раньше", () => {
    const href = buildContextualHref(null, "/catalog", {
      view: "all",
      q: "citra",
      category: "hop",
      subtype: null,
      sort: "alpha"
    });

    expect(href).toBe("/catalog?q=citra&category=hop&sort=alpha");
  });

  it("на хабе без category/sort/q даёт чистый /catalog", () => {
    const href = buildContextualHref(null, "/catalog", {
      view: "all",
      q: "",
      category: "all",
      subtype: null,
      sort: "name"
    });

    expect(href).toBe("/catalog");
  });
});
