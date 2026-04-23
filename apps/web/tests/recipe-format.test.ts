import { describe, expect, it } from "vitest";

import { formatBrixFromSg, formatGravityWithPlato, formatPlatoFromSg } from "../features/recipes/format";

describe("gravity format helpers", () => {
  it("formats SG with Plato for display", () => {
    expect(formatPlatoFromSg(1.05)).toBe("12.4 °P");
    expect(formatGravityWithPlato(1.05)).toBe("1.050 (12.4 °P)");
  });

  it("formats SG as Brix for manual gravity display", () => {
    expect(formatBrixFromSg(1.012)).toBe("3.1 °Bx");
  });

  it("clamps sub-1.000 SG display values to zero plato", () => {
    expect(formatPlatoFromSg(0.998)).toBe("0.0 °P");
    expect(formatGravityWithPlato(0.998)).toBe("0.998 (0.0 °P)");
  });
});
