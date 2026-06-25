import { describe, expect, it } from "vitest";

import { beerColorFromSrm, pickTextColorForSrm, srmToHex } from "../features/recipes/beer-color";

describe("srmToHex", () => {
  it("returns palette hex for boundary SRM values", () => {
    expect(srmToHex(1)).toBe("#F3F993"); // 1 < 2 → светло-соломенный
    expect(srmToHex(4)).toBe("#FFBF42"); // first entry with 4 < maxSrm (6)
    expect(srmToHex(10)).toBe("#E58500"); // 10 < 12 → светло-янтарный
    expect(srmToHex(20)).toBe("#A63E00"); // 20 < 22 → янтарно-коричневый
  });

  it("clamps high SRM to the darkest fallback", () => {
    expect(srmToHex(40)).toBe("#1A0F0B");
    expect(srmToHex(100)).toBe("#1A0F0B");
  });

  it("stays consistent with beerColorFromSrm", () => {
    for (const srm of [1, 4, 10, 20, 40, 80]) {
      expect(srmToHex(srm)).toBe(beerColorFromSrm(srm).hex);
    }
  });
});

describe("pickTextColorForSrm", () => {
  it("uses dark text on light beer and light text on dark beer", () => {
    expect(pickTextColorForSrm(4)).toBe("#1a1a1a");
    expect(pickTextColorForSrm(11)).toBe("#1a1a1a");
    expect(pickTextColorForSrm(12)).toBe("#ffffff");
    expect(pickTextColorForSrm(20)).toBe("#ffffff");
  });
});
