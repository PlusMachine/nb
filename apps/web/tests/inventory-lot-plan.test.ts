import { describe, expect, it } from "vitest";
import { planInventoryLotUse } from "../features/inventory/lot-plan";

describe("inventory lot budget", () => {
  it("shares the same lots across additions and reports the actual shortfall", () => {
    const remaining = new Map<string, number>();
    const lots = [{ inventoryItemId: "a", availableQuantity: 12 }, { inventoryItemId: "b", availableQuantity: 10 }];
    const results = [8, 8, 8].map(amount => planInventoryLotUse(amount, lots, remaining));
    expect(results.map(result => result.takes.reduce((sum, take) => sum + take.quantity, 0))).toEqual([8, 8, 6]);
    expect(results.map(result => result.shortfall)).toEqual([0, 0, 2]);
    expect([...remaining.values()]).toEqual([0, 0]);
  });

  it("conserves quantity for fractional stock across many balances and requests", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const balances = [seed % 17, (seed * 7) % 23, (seed * 13) % 31].map(value => value / 1000);
      const lots = balances.map((availableQuantity, index) => ({ inventoryItemId: String(index), availableQuantity }));
      const remaining = new Map<string, number>();
      let used = 0;
      let required = 0;
      for (const amount of [seed % 11, (seed * 3) % 19, (seed * 5) % 41].map(value => value / 1000)) {
        const result = planInventoryLotUse(amount, lots, remaining);
        const total = result.takes.reduce((sum, take) => sum + take.quantity, 0);
        expect(total + result.shortfall).toBeCloseTo(amount, 6);
        expect(result.takes.every(take => take.quantity > 0)).toBe(true);
        used += total;
        required += amount;
      }
      expect(used).toBeCloseTo(Math.min(required, balances.reduce((sum, value) => sum + value, 0)), 6);
      expect(used + [...remaining.values()].reduce((sum, value) => sum + value, 0)).toBeCloseTo(balances.reduce((sum, value) => sum + value, 0), 6);
      expect([...remaining.values()].every(value => value >= 0)).toBe(true);
    }
  });
});
