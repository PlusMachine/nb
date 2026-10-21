import { describe, expect, it } from "vitest";

import {
  formatHopAlphaAcidStatLabel,
  isHopWithUserAlphaOverride,
  resolveCustomIngredientOwnershipBadgeLabel
} from "@/features/ingredients/derived-ingredient-presentation";

describe("derived-ingredient-presentation", () => {
  it("marks hop alpha as пользовательская and hides ИЗМЕНЕННЫЙ when only alpha differs from catalog", () => {
    const item = {
      source: "custom" as const,
      category: "hop" as const,
      derivedFromIngredientId: "cat-hop-1",
      hopAlphaAcidPct: 6.1,
      derivedFromHopAlphaAcidPct: 5.5,
      technicalData: { type: "hop" as const, alphaAcidPctTypical: 6.1 }
    };

    expect(isHopWithUserAlphaOverride(item)).toBe(true);
    expect(resolveCustomIngredientOwnershipBadgeLabel(item)).toBeNull();
    expect(formatHopAlphaAcidStatLabel(6.1, { userOverride: true })).toBe("Альфа 6.1% (пользовательская)");
  });

  it("for legacy derived hops without stored catalog alpha treats missing harvest as user alpha override", () => {
    const item = {
      source: "custom" as const,
      category: "hop" as const,
      derivedFromIngredientId: "cn-magnum-beervingem-standard",
      hopAlphaAcidPct: 13.6,
      derivedFromHopAlphaAcidPct: null,
      harvestYear: null,
      technicalData: { type: "hop" as const, alphaAcidPctTypical: 13.6 }
    };

    expect(isHopWithUserAlphaOverride(item)).toBe(true);
    expect(resolveCustomIngredientOwnershipBadgeLabel(item, "title")).toBeNull();
  });

  it("does not show ИЗМЕНЕННЫЙ for derived hop with harvest year — year is enough on the card", () => {
    const item = {
      source: "custom" as const,
      category: "hop" as const,
      derivedFromIngredientId: "cat-hop-1",
      hopAlphaAcidPct: 5.5,
      derivedFromHopAlphaAcidPct: 5.5,
      harvestYear: 2024,
      technicalData: { type: "hop" as const, alphaAcidPctTypical: 5.5 }
    };

    expect(isHopWithUserAlphaOverride(item)).toBe(false);
    expect(resolveCustomIngredientOwnershipBadgeLabel(item)).toBeNull();
  });
});
