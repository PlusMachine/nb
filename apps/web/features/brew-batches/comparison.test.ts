import { expect, it } from "vitest";
import type { BrewBatchDetail } from "./contracts";
import { buildBatchComparison } from "./comparison";

it("compares dry-hop exposure in days and boil additions relative to the end", () => {
  // Остальные поля DTO форматтер не читает.
  const detail = { batch: { id: "a", name: "Эль", brewNumber: 1, brewPlanSnapshot: {
    recipe: { title: "Эль", versionNumber: 1 }, mashSteps: [],
    boilPlan: { boilTimeMinutes: 60, timedAdditions: [{ name: "Cascade", category: "hop", stage: "boil", amount: { quantity: 20, unit: "g" }, timeOffsetMinutes: 15 }] },
    whirlpoolPlan: [], dryHopPlan: [{ name: "Citra", category: "hop", stage: "fermentation", amount: { quantity: 40, unit: "g" }, timeOffsetMinutes: 0, stepMeta: { durationDays: 3 } }]
  } }, summary: { og: null, fg: null, abv: null } } as unknown as BrewBatchDetail;
  const comparison = buildBatchComparison(detail, { ...detail, batch: { ...detail.batch, id: "b", brewNumber: 2 } }, "sg");
  const hops = comparison.rows.find(row => row.label === "Хмель")!.values[0];
  expect(hops).toContain("Cascade · 20 г · кипячение · за 15 мин до конца");
  expect(hops).toContain("Citra · 40 г · сухое охмеление · 3 дн.");
  expect(hops).not.toContain("сухое охмеление · 0 мин");
});
