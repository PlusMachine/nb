import { describe, expect, it } from "vitest";

import { ingredientSearchQuerySchema } from "../features/ingredients/contracts";

describe("ingredient search contracts", () => {
  it("accepts type filter", () => {
    const parsed = ingredientSearchQuerySchema.parse({ q: "citra", type: "hop" });
    expect(parsed.type).toBe("hop");
  });
});
