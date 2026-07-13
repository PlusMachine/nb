import { describe, expect, it } from "vitest";

import { beerStyleFixtures } from "./fixtures";
import { BEER_STYLE_TAGLINE_MAX_LENGTH, beerStyleTaglinesRu, getBeerStyleTaglineRu } from "./taglines";

describe("beer style taglines", () => {
  it("covers every BJCP style", () => {
    const missing = beerStyleFixtures
      .filter((style) => !beerStyleTaglinesRu[style.id])
      .map((style) => style.id);
    expect(missing).toEqual([]);
  });

  it("has no taglines for unknown style ids", () => {
    const known = new Set(beerStyleFixtures.map((style) => style.id));
    const orphans = Object.keys(beerStyleTaglinesRu).filter((id) => !known.has(id));
    expect(orphans).toEqual([]);
  });

  it("fits the label description field", () => {
    const tooLong = Object.entries(beerStyleTaglinesRu)
      .filter(([, text]) => text.length > BEER_STYLE_TAGLINE_MAX_LENGTH)
      .map(([id, text]) => `${id}: ${text.length}`);
    expect(tooLong).toEqual([]);
  });

  it("resolves by style id and stays null for unknown styles", () => {
    expect(getBeerStyleTaglineRu("21B-black-ipa")).toContain("Чёрный IPA");
    expect(getBeerStyleTaglineRu("american-pale-ale")).toBeNull();
    expect(getBeerStyleTaglineRu(null)).toBeNull();
  });
});
