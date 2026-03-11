import { describe, expect, it } from "vitest";
import { styleRangeFixtures } from "./fixtures";
import { evaluateStyleFit } from "./fit";

describe("style fit helper", () => {
  it("returns in-range fit", () => {
    const apa = styleRangeFixtures[0];
    if (!apa) throw new Error("fixture missing");

    const result = evaluateStyleFit(apa, {
      og: 1.052,
      fg: 1.012,
      abv: 5.2,
      ibu: 38,
      srm: 7
    });

    expect(result.overallFit).toBe(true);
    expect(result.ibu.status).toBe("in_range");
  });

  it("returns out-of-range details", () => {
    const stout = styleRangeFixtures[1];
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
