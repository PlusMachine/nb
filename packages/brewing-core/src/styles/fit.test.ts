import { describe, expect, it } from "vitest";
import { getStyleRangeById } from "./fixtures";
import { evaluateStyleFit } from "./fit";

describe("style fit helper", () => {
  it("returns in-range fit", () => {
    const ipa = getStyleRangeById("21A");
    if (!ipa) throw new Error("fixture missing");

    const result = evaluateStyleFit(ipa, {
      og: 1.062,
      fg: 1.012,
      abv: 6.3,
      ibu: 55,
      srm: 8
    });

    expect(result.overallFit).toBe(true);
    expect(result.ibu.status).toBe("in_range");
  });

  it("returns out-of-range details", () => {
    const stout = getStyleRangeById("15B");
    if (!stout) throw new Error("fixture missing");

    const result = evaluateStyleFit(stout, {
      og: 1.05,
      fg: 1.014,
      abv: 6.2,
      ibu: 20,
      srm: 18
    });

    expect(result.overallFit).toBe(false);
    expect(result.og.status).toBe("above");
    expect(result.ibu.status).toBe("below");
  });
});
