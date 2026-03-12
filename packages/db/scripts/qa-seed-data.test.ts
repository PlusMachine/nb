import { describe, expect, it } from "vitest";

import { seedCatalogItems } from "./qa-seed-data";

describe("QA seed catalog coverage", () => {
  it("contains at least ten items for every ingredient type", () => {
    const counts = seedCatalogItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      fermentable: 10,
      hop: 10,
      yeast: 10,
      sugar: 10,
      adjunct: 10,
      fining: 10,
      misc: 10
    });
  });

  it("does not duplicate normalized names within the same ingredient type", () => {
    const keys = seedCatalogItems.map((item) => `${item.type}:${item.normalizedName}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
