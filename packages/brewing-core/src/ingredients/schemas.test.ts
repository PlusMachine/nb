import { describe, expect, it } from "vitest";
import { brewingIngredientSchema } from "./schemas";

describe("ingredient schemas", () => {
  it("validates fermentable and hop contracts", () => {
    const fermentable = brewingIngredientSchema.safeParse({
      id: "f1",
      name: "Pilsner Malt",
      type: "fermentable",
      potentialPpg: 37,
      colorLovibond: 1.8
    });

    const hop = brewingIngredientSchema.safeParse({
      id: "h1",
      name: "Saaz",
      type: "hop",
      alphaAcidPercent: 3.5,
      form: "leaf"
    });

    expect(fermentable.success).toBe(true);
    expect(hop.success).toBe(true);
  });
});
