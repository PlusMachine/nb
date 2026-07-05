import { describe, expect, it } from "vitest";

import {
  countActiveRecipeFilters,
  mergeRecipeQuery,
  recipeSortOptions,
  resolveVisibleSortOptions
} from "../features/recipes/recipes-url";

const params = (init: string) => new URLSearchParams(init);

describe("mergeRecipeQuery", () => {
  it("resets page when a filter changes and preserves other params", () => {
    const result = mergeRecipeQuery(params("q=ipa&sort=abv_desc&page=3"), { family: "ipa_hoppy" });
    const out = new URLSearchParams(result);
    expect(out.get("family")).toBe("ipa_hoppy");
    expect(out.get("q")).toBe("ipa");
    expect(out.get("sort")).toBe("abv_desc");
    expect(out.has("page")).toBe(false);
  });

  it("removes a key when the patch value is null (chip removal)", () => {
    const result = mergeRecipeQuery(params("q=ipa&family=ipa_hoppy&page=2"), { family: null });
    const out = new URLSearchParams(result);
    expect(out.has("family")).toBe(false);
    expect(out.get("q")).toBe("ipa");
    expect(out.has("page")).toBe(false);
  });

  it("treats an empty string like removal", () => {
    const result = mergeRecipeQuery(params("q=ipa"), { q: "" });
    expect(new URLSearchParams(result).has("q")).toBe(false);
  });

  it("does not write default values (sort=newest, view=grid, page=1)", () => {
    const result = mergeRecipeQuery(params("family=ipa_hoppy"), { sort: "newest", view: "grid", page: "1" });
    const out = new URLSearchParams(result);
    expect(out.has("sort")).toBe(false);
    expect(out.has("view")).toBe(false);
    expect(out.has("page")).toBe(false);
    expect(out.get("family")).toBe("ipa_hoppy");
  });

  it("keeps page and filters when paginating (resetPage:false)", () => {
    const result = mergeRecipeQuery(params("family=ipa_hoppy&abvMin=6"), { page: "2" }, { resetPage: false });
    const out = new URLSearchParams(result);
    expect(out.get("page")).toBe("2");
    expect(out.get("family")).toBe("ipa_hoppy");
    expect(out.get("abvMin")).toBe("6");
  });

  it("does not reset page when only the view changes (resetPage:false)", () => {
    const result = mergeRecipeQuery(params("page=4"), { view: "list" }, { resetPage: false });
    const out = new URLSearchParams(result);
    expect(out.get("view")).toBe("list");
    expect(out.get("page")).toBe("4");
  });

  it("builds the search query from a value and resets page", () => {
    const result = mergeRecipeQuery(params("page=5&sort=name"), { q: "stout" });
    const out = new URLSearchParams(result);
    expect(out.get("q")).toBe("stout");
    expect(out.get("sort")).toBe("name");
    expect(out.has("page")).toBe(false);
  });
});

describe("countActiveRecipeFilters", () => {
  it("counts each filter dimension once and ignores sort/page/view", () => {
    expect(countActiveRecipeFilters(params(""))).toBe(0);
    expect(countActiveRecipeFilters(params("sort=abv_desc&page=2&view=list"))).toBe(0);
    expect(countActiveRecipeFilters(params("q=ipa"))).toBe(1);
    expect(countActiveRecipeFilters(params("colorMin=3&colorMax=6"))).toBe(1);
    expect(countActiveRecipeFilters(params("q=ipa&family=x&style=21A&colorMin=3&abvMin=5&ibuMax=40"))).toBe(6);
  });
});

describe("recipeSortOptions", () => {
  it("exposes working sorts including rating (Phase D) and popular (по сохранениям)", () => {
    const values = recipeSortOptions.map((option) => option.value);
    expect(values).toEqual([
      "newest",
      "popular",
      "rating",
      "abv_desc",
      "abv_asc",
      "ibu_desc",
      "ibu_asc",
      "color_asc",
      "color_desc",
      "name"
    ]);
    expect(values).toContain("rating");
    expect(values).toContain("popular");
  });
});

describe("resolveVisibleSortOptions (count-conditional)", () => {
  const values = (avail: { ratedRecipes: number; savedRecipes: number }, active: Parameters<typeof resolveVisibleSortOptions>[1] = "newest") =>
    resolveVisibleSortOptions(avail, active).map((option) => option.value);

  it("hides rating and popular on a cold start (below thresholds)", () => {
    const out = values({ ratedRecipes: 0, savedRecipes: 0 });
    expect(out).not.toContain("rating");
    expect(out).not.toContain("popular");
    // Прочие сорты остаются.
    expect(out).toContain("newest");
    expect(out).toContain("abv_desc");
  });

  it("shows a sort once its threshold is reached (>= 5)", () => {
    expect(values({ ratedRecipes: 5, savedRecipes: 0 })).toContain("rating");
    expect(values({ ratedRecipes: 5, savedRecipes: 0 })).not.toContain("popular");
    expect(values({ ratedRecipes: 0, savedRecipes: 5 })).toContain("popular");
  });

  it("keeps the active sort visible even when it is below threshold (deep link)", () => {
    // Пришли по прямой ссылке ?sort=rating при пустой базе — селект не должен «терять» выбор.
    expect(values({ ratedRecipes: 0, savedRecipes: 0 }, "rating")).toContain("rating");
    expect(values({ ratedRecipes: 0, savedRecipes: 0 }, "popular")).toContain("popular");
  });
});
