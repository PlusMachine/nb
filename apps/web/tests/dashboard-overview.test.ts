import { describe, expect, it } from "vitest";

import type { ActiveBrewProgressItem } from "../features/brew-batches/contracts";
import { buildDashboardOnboarding, splitActiveBrews } from "../features/dashboard/overview";

const NOW = new Date("2026-07-06T12:00:00Z");

const baseBatch: ActiveBrewProgressItem = {
  id: "bb-1",
  name: "Batch",
  brewNumber: 1,
  status: "planned",
  recipeId: "r-1",
  recipeTitle: "Recipe",
  hasDevice: false,
  plannedFor: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-07-01T10:00:00Z"),
  updatedAt: new Date("2026-07-01T10:00:00Z"),
  lastMeasurementAt: null,
  measurementCount: 0
};

const batch = (overrides: Partial<ActiveBrewProgressItem>): ActiveBrewProgressItem => ({
  ...baseBatch,
  ...overrides
});

describe("splitActiveBrews", () => {
  it("keeps brewing/fermenting in attention and planned in the compact list", () => {
    const items = [
      batch({ id: "p-1", status: "planned" }),
      batch({ id: "b-1", status: "brewing", startedAt: new Date("2026-07-05T10:00:00Z") }),
      batch({ id: "f-1", status: "fermenting", startedAt: new Date("2026-07-01T10:00:00Z"), measurementCount: 1, lastMeasurementAt: new Date("2026-07-05T10:00:00Z") })
    ];

    const { attention, planned } = splitActiveBrews(items, NOW);

    expect(attention.map((c) => c.batch.id).sort()).toEqual(["b-1", "f-1"]);
    expect(planned.map((b) => b.id)).toEqual(["p-1"]);
  });

  it("promotes an overdue planned batch into attention", () => {
    const items = [
      batch({ id: "p-due", status: "planned", plannedFor: new Date("2026-07-01T00:00:00Z") }),
      batch({ id: "p-future", status: "planned", plannedFor: new Date("2026-08-01T00:00:00Z") })
    ];

    const { attention, planned } = splitActiveBrews(items, NOW);

    expect(attention.map((c) => c.batch.id)).toEqual(["p-due"]);
    expect(attention[0]?.nudge.tone).toBe("action");
    expect(planned.map((b) => b.id)).toEqual(["p-future"]);
  });

  it("orders attention by nudge urgency: action, warn, info", () => {
    const items = [
      // fermenting with fresh measurement -> info
      batch({ id: "f-info", status: "fermenting", startedAt: new Date("2026-07-01T10:00:00Z"), measurementCount: 2, lastMeasurementAt: new Date("2026-07-05T10:00:00Z") }),
      // fermenting with stale measurement -> warn
      batch({ id: "f-warn", status: "fermenting", startedAt: new Date("2026-06-20T10:00:00Z"), measurementCount: 1, lastMeasurementAt: new Date("2026-06-25T10:00:00Z") }),
      // brewing with no OG logged -> action
      batch({ id: "b-action", status: "brewing", startedAt: new Date("2026-07-06T08:00:00Z") })
    ];

    const { attention } = splitActiveBrews(items, NOW);

    expect(attention.map((c) => c.batch.id)).toEqual(["b-action", "f-warn", "f-info"]);
  });

  it("computes a 1-based fermentation day only for fermenting batches", () => {
    const items = [
      batch({ id: "f-1", status: "fermenting", startedAt: new Date("2026-07-01T12:00:00Z"), measurementCount: 1, lastMeasurementAt: new Date("2026-07-05T10:00:00Z") }),
      batch({ id: "b-1", status: "brewing", startedAt: new Date("2026-07-06T08:00:00Z") })
    ];

    const { attention } = splitActiveBrews(items, NOW);
    const byId = new Map(attention.map((c) => [c.batch.id, c]));

    expect(byId.get("f-1")?.fermentationDay).toBe(6);
    expect(byId.get("b-1")?.fermentationDay).toBeNull();
  });

  it("sorts planned batches by nearest date, undated last", () => {
    const items = [
      batch({ id: "p-none", status: "planned", createdAt: new Date("2026-07-03T10:00:00Z") }),
      batch({ id: "p-far", status: "planned", plannedFor: new Date("2026-09-01T00:00:00Z") }),
      batch({ id: "p-near", status: "planned", plannedFor: new Date("2026-07-10T00:00:00Z") })
    ];

    const { planned } = splitActiveBrews(items, NOW);

    expect(planned.map((b) => b.id)).toEqual(["p-near", "p-far", "p-none"]);
  });
});

describe("buildDashboardOnboarding", () => {
  it("walks stock -> recipe -> brew and reports the first incomplete step", () => {
    const onboarding = buildDashboardOnboarding({
      inventoryTotalItems: 4,
      recipeCount: 0,
      savedRecipeCount: 0,
      brewBatchCount: 0
    });

    expect(onboarding.steps.map((s) => s.key)).toEqual(["stock", "recipe", "brew"]);
    expect(onboarding.steps.map((s) => s.done)).toEqual([true, false, false]);
    expect(onboarding.currentKey).toBe("recipe");
    expect(onboarding.complete).toBe(false);
  });

  it("counts a saved community recipe toward the recipe step", () => {
    const onboarding = buildDashboardOnboarding({
      inventoryTotalItems: 1,
      recipeCount: 0,
      savedRecipeCount: 2,
      brewBatchCount: 0
    });

    expect(onboarding.steps.find((s) => s.key === "recipe")?.done).toBe(true);
    expect(onboarding.currentKey).toBe("brew");
  });

  it("completes once all three steps are done", () => {
    const onboarding = buildDashboardOnboarding({
      inventoryTotalItems: 1,
      recipeCount: 1,
      savedRecipeCount: 0,
      brewBatchCount: 1
    });

    expect(onboarding.complete).toBe(true);
    expect(onboarding.currentKey).toBeNull();
  });
});
