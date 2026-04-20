import { describe, expect, it } from "vitest";

import {
  beerStyleFixtures,
  getBeerStyleById,
  getBjcpArticleHrefByStyleId,
  getStyleRangeById,
  styleRangeFixtures
} from "./fixtures";

describe("style fixtures", () => {
  it("loads the full BJCP catalog with unique application ids", () => {
    expect(beerStyleFixtures.length).toBe(115);
    expect(new Set(beerStyleFixtures.map((style) => style.id)).size).toBe(beerStyleFixtures.length);
    expect(styleRangeFixtures.length).toBe(104);
  });

  it("keeps duplicate BJCP codes distinct for picker storage", () => {
    const belgianIpa = getBeerStyleById("21B-belgian-ipa");
    const blackIpa = getBeerStyleById("21B-black-ipa");

    expect(belgianIpa?.bjcpId).toBe("21B");
    expect(blackIpa?.bjcpId).toBe("21B");
    expect(belgianIpa?.name).toBe("Belgian IPA");
    expect(blackIpa?.name).toBe("Black IPA");
  });

  it("exposes variable styles for selection without pretending they have fixed ranges", () => {
    const fruitBeer = getBeerStyleById("29A");

    expect(fruitBeer?.name).toBe("Fruit Beer");
    expect(getStyleRangeById("29A")).toBeNull();
  });

  it("keeps legacy style ids readable after catalog upgrade", () => {
    expect(getBeerStyleById("american-pale-ale")?.name).toBe("American Pale Ale");
    expect(getStyleRangeById("dry-stout")?.name).toBe("Dry Stout");
  });

  it("builds hrefs that match public BJCP article routes", () => {
    expect(getBjcpArticleHrefByStyleId("1A")).toBe("/bjcp/bjcp-1a-american-light-lager");
    expect(getBjcpArticleHrefByStyleId("5B")).toBe("/bjcp/bjcp-5b-k-lsch");
    expect(getBjcpArticleHrefByStyleId("24C")).toBe("/bjcp/bjcp-24c-bi-re-de-garde");
    expect(getBjcpArticleHrefByStyleId("27-kellerbier")).toBe("/bjcp/bjcp-27-kellerbier");
    expect(getBjcpArticleHrefByStyleId("21B-belgian-ipa")).toBe("/bjcp/bjcp-21b-belgian-ipa");
    expect(getBjcpArticleHrefByStyleId("american-pale-ale")).toBeNull();
  });
});
