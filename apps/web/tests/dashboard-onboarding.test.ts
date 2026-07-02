import { describe, expect, it } from "vitest";

import { isNewUserDashboard } from "../features/dashboard/onboarding";

describe("isNewUserDashboard", () => {
  it("is true only when recipes, inventory, and active brews are all at zero", () => {
    expect(isNewUserDashboard({ recipeCount: 0, inventoryTotalItems: 0, activeBrewCount: 0 })).toBe(true);
  });

  it("is false as soon as any dimension has activity", () => {
    expect(isNewUserDashboard({ recipeCount: 1, inventoryTotalItems: 0, activeBrewCount: 0 })).toBe(false);
    expect(isNewUserDashboard({ recipeCount: 0, inventoryTotalItems: 4, activeBrewCount: 0 })).toBe(false);
    expect(isNewUserDashboard({ recipeCount: 0, inventoryTotalItems: 0, activeBrewCount: 1 })).toBe(false);
    expect(isNewUserDashboard({ recipeCount: 3, inventoryTotalItems: 5, activeBrewCount: 1 })).toBe(false);
  });
});
