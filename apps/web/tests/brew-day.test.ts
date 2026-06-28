import { describe, expect, it } from "vitest";

import {
  applyBrewDayStepPatch,
  buildBrewDaySteps,
  normalizeBrewDayProgress,
  summarizeBrewDayProgress
} from "@/features/brew-batches/brew-day";
import type { BrewPlanSnapshot } from "@/features/brew-batches/contracts";

const makeSnapshot = (overrides: Partial<BrewPlanSnapshot> = {}): BrewPlanSnapshot => ({
  version: "brew_plan_v1",
  recipe: { id: "00000000-0000-4000-8000-000000000001", title: "Test", versionNumber: 1, batchSizeL: 20 },
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  mashSteps: [
    { id: "m1", name: "Затирание", targetTemperatureC: 66, durationMinutes: 60 },
    { id: "m2", name: "Меш-аут", targetTemperatureC: 76, durationMinutes: 10 }
  ],
  boilPlan: {
    boilTimeMinutes: 60,
    timedAdditions: [
      { linePersistentKey: "h1", name: "Magnum", category: "hop", stage: "boil", timeOffsetMinutes: 60, amount: { quantity: 20, unit: "g" }, stepMeta: null },
      { linePersistentKey: "h2", name: "Cascade", category: "hop", stage: "boil", timeOffsetMinutes: 10, amount: { quantity: 30, unit: "g" }, stepMeta: null }
    ]
  },
  whirlpoolPlan: [
    { linePersistentKey: "w1", name: "Citra", category: "hop", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 40, unit: "g" }, stepMeta: { temperatureC: 80, timeMinutes: 20 } }
  ],
  fermentationPlan: { primaryTemperatureC: 19, primaryDurationDays: 14 },
  packagingPlan: null,
  deviceHints: [],
  ...overrides
});

describe("buildBrewDaySteps", () => {
  it("groups steps by stage in canonical order", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    expect(groups.map((group) => group.stage)).toEqual(["mash", "boil", "whirlpool", "fermentation"]);
  });

  it("emits mash rests as timer steps with stable ids and seconds", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps[0]).toMatchObject({
      id: "mash:m1",
      kind: "timer",
      title: "Затирание",
      durationSeconds: 3600,
      temperatureC: 66
    });
    expect(mash.steps[0].detail).toContain("66 °C");
    expect(mash.steps[0].detail).toContain("1 ч");
  });

  it("orders boil additions earliest-first (largest minutes-before-end first) and adds a boil timer", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const boil = groups.find((group) => group.stage === "boil")!;
    expect(boil.steps[0]).toMatchObject({ id: "boil:timer", kind: "timer", durationSeconds: 3600 });
    // Magnum @60 before Cascade @10.
    expect(boil.steps[1].id).toBe("boil:add:h1");
    expect(boil.steps[2].id).toBe("boil:add:h2");
    expect(boil.steps[1].detail).toContain("за 60 мин до конца");
    expect(boil.steps[2].detail).toContain("30 g");
  });

  it("reads whirlpool stand temp/time from stepMeta", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const whirlpool = groups.find((group) => group.stage === "whirlpool")!;
    expect(whirlpool.steps[0]).toMatchObject({ id: "whirlpool:w1", kind: "timer", durationSeconds: 1200, temperatureC: 80 });
    expect(whirlpool.steps[0].detail).toContain("выдержка 80 °C");
  });

  it("emits a fermentation task with target temp/duration", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const ferment = groups.find((group) => group.stage === "fermentation")!;
    expect(ferment.steps[0]).toMatchObject({ id: "ferment:primary", kind: "task", temperatureC: 19 });
    expect(ferment.steps[0].detail).toContain("19 °C");
    expect(ferment.steps[0].detail).toContain("14 дн.");
  });

  it("places mash-stage additions under the mash group", () => {
    const snapshot = makeSnapshot({
      boilPlan: {
        boilTimeMinutes: 60,
        timedAdditions: [
          { linePersistentKey: "g1", name: "Рисовая шелуха", category: "other", stage: "mash", timeOffsetMinutes: null, amount: { quantity: 0.5, unit: "kg" }, stepMeta: null }
        ]
      }
    });
    const groups = buildBrewDaySteps(snapshot);
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.some((step) => step.id === "mash:add:g1" && step.kind === "addition")).toBe(true);
  });

  it("skips empty groups and a zero-length boil timer", () => {
    const snapshot = makeSnapshot({
      mashSteps: [],
      boilPlan: { boilTimeMinutes: 0, timedAdditions: [] },
      whirlpoolPlan: [],
      fermentationPlan: null
    });
    expect(buildBrewDaySteps(snapshot)).toEqual([]);
  });

  it("survives weakly-typed / missing fields without throwing", () => {
    const snapshot = makeSnapshot({
      mashSteps: [{ foo: "bar" } as Record<string, unknown>],
      whirlpoolPlan: [{} as Record<string, unknown>]
    });
    const groups = buildBrewDaySteps(snapshot);
    const mash = groups.find((group) => group.stage === "mash")!;
    // No duration → task, not timer; falls back to "Пауза 1".
    expect(mash.steps[0]).toMatchObject({ kind: "task", durationSeconds: null });
    expect(mash.steps[0].title).toContain("Пауза");
  });
});

describe("brew-day progress helpers", () => {
  it("normalizes garbage into a clean progress shape", () => {
    expect(normalizeBrewDayProgress(null)).toEqual({ steps: {}, updatedAt: null });
    expect(normalizeBrewDayProgress({ steps: { a: { done: true, timerStartedAt: "x" }, b: "nope" }, updatedAt: 5 })).toEqual({
      steps: { a: { done: true, timerStartedAt: "x" } },
      updatedAt: null
    });
  });

  it("applies a patch immutably, preserving untouched fields", () => {
    const base = { steps: { s1: { done: false, timerStartedAt: "t0" } }, updatedAt: null };
    const afterDone = applyBrewDayStepPatch(base, "s1", { done: true }, "now");
    expect(afterDone.steps.s1).toEqual({ done: true, timerStartedAt: "t0" });
    expect(afterDone.updatedAt).toBe("now");
    // Original untouched.
    expect(base.steps.s1.done).toBe(false);

    const newStep = applyBrewDayStepPatch(base, "s2", { timerStartedAt: "t1" }, "now");
    expect(newStep.steps.s2).toEqual({ done: false, timerStartedAt: "t1" });
  });

  it("can clear a timer with explicit null", () => {
    const base = { steps: { s1: { done: false, timerStartedAt: "t0" } }, updatedAt: null };
    const cleared = applyBrewDayStepPatch(base, "s1", { timerStartedAt: null }, "now");
    expect(cleared.steps.s1.timerStartedAt).toBeNull();
  });

  it("summarizes done vs total across groups", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const progress = { steps: { "mash:m1": { done: true, timerStartedAt: null }, "boil:timer": { done: true, timerStartedAt: null } }, updatedAt: null };
    const summary = summarizeBrewDayProgress(groups, progress);
    expect(summary.done).toBe(2);
    expect(summary.total).toBeGreaterThanOrEqual(6);
  });
});
