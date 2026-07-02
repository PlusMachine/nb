import { describe, expect, it } from "vitest";

import {
  applyBrewDayStepPatch,
  buildBrewDaySteps,
  normalizeBrewDayProgress,
  summarizeBrewDayProgress
} from "@/features/brew-batches/brew-day";
import { brewPlanSnapshotSchema, type BrewPlanSnapshot } from "@/features/brew-batches/contracts";

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
  dryHopPlan: [],
  fermentationPlan: { primaryTemperatureC: 19, primaryDurationDays: 14 },
  packagingPlan: null,
  packagingAdditions: [],
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

  it("adds dryHopPlan entries to the fermentation group after the primary task, with amount/days", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      dryHopPlan: [
        { linePersistentKey: "dh1", name: "Mosaic", category: "hop", stage: "fermentation", timeOffsetMinutes: null, amount: { quantity: 60, unit: "g" }, stepMeta: { useType: "dry_hop", durationDays: 4 } },
        { linePersistentKey: "dh2", name: "Дубовые чипсы", category: "other", stage: "fermentation", timeOffsetMinutes: null, amount: { quantity: 20, unit: "g" }, stepMeta: null }
      ]
    }));
    const fermentation = groups.find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps[0].id).toBe("ferment:primary");
    expect(fermentation.steps[1]).toMatchObject({ id: "ferment:add:dh1", kind: "addition", title: "Внести на брожении: Mosaic" });
    expect(fermentation.steps[1].detail).toContain("60 g");
    expect(fermentation.steps[1].detail).toContain("4 дн.");
    // Не-хмелевая fermentation-добавка тоже долетает до гида.
    expect(fermentation.steps[2]).toMatchObject({ id: "ferment:add:dh2", kind: "addition", title: "Внести на брожении: Дубовые чипсы" });
  });

  it("tolerates a legacy snapshot with no dryHopPlan key at all (pre-migration data)", () => {
    const legacy = makeSnapshot();
    delete (legacy as Record<string, unknown>).dryHopPlan;
    expect(() => buildBrewDaySteps(legacy)).not.toThrow();
    const fermentation = buildBrewDaySteps(legacy).find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps).toHaveLength(1);
    expect(fermentation.steps[0].id).toBe("ferment:primary");
  });

  it("adds cold crash / conditioning steps only when explicitly enabled in the fermentation profile", () => {
    const enabled = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        coldCrash: { enabled: true, temperatureC: 2, durationDays: 2 },
        conditioning: { enabled: true, temperatureC: 12, durationDays: 14 }
      }
    })).find((group) => group.stage === "fermentation")!;
    const coldCrash = enabled.steps.find((step) => step.id === "ferment:cold_crash");
    const conditioning = enabled.steps.find((step) => step.id === "ferment:conditioning");
    expect(coldCrash).toMatchObject({ kind: "task", title: "Колд-краш", temperatureC: 2 });
    expect(coldCrash?.detail).toBe("2 °C · 2 дн.");
    expect(conditioning).toMatchObject({ kind: "task", title: "Выдержка", temperatureC: 12 });
    expect(conditioning?.detail).toBe("12 °C · 14 дн.");

    const disabled = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        coldCrash: { enabled: false, temperatureC: 2, durationDays: 2 },
        conditioning: { enabled: false, temperatureC: 12, durationDays: 14 }
      }
    })).find((group) => group.stage === "fermentation")!;
    expect(disabled.steps.some((step) => step.id === "ferment:cold_crash")).toBe(false);
    expect(disabled.steps.some((step) => step.id === "ferment:conditioning")).toBe(false);
  });

  it("renders no packaging group when packagingPlan is null", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    expect(groups.some((group) => group.stage === "packaging")).toBe(false);
  });

  it("renders packaging/carbonation steps from packagingPlan fields", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      packagingPlan: {
        method: "bottle",
        notes: "Дать отдохнуть 3 дня перед розливом",
        targetCo2Volumes: 2.4,
        primingSugarType: "Декстроза",
        primingSugarGrams: 120
      }
    }));
    const packaging = groups.find((group) => group.stage === "packaging")!;
    expect(packaging).toBeDefined();
    expect(packaging.steps[0]).toMatchObject({ id: "packaging:method", kind: "task", title: "Розлив в бутылки" });
    expect(packaging.steps[0].detail).toContain("Дать отдохнуть");
    expect(packaging.steps[1]).toMatchObject({ id: "packaging:carbonation", kind: "task", title: "Карбонизация" });
    expect(packaging.steps[1].detail).toContain("2.4 об. CO2");
    expect(packaging.steps[1].detail).toContain("120 г");
    expect(packaging.steps[1].detail).toContain("Декстроза");
  });

  it("adds packagingAdditions entries (priming sugar) to the packaging group", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      packagingAdditions: [
        { linePersistentKey: "p1", name: "Декстроза", category: "consumable", stage: "packaging", timeOffsetMinutes: null, amount: { quantity: 120, unit: "g" }, stepMeta: null }
      ]
    }));
    const packaging = groups.find((group) => group.stage === "packaging")!;
    expect(packaging).toBeDefined();
    expect(packaging.steps[0]).toMatchObject({ id: "packaging:add:p1", kind: "addition", title: "Внести при розливе: Декстроза" });
    expect(packaging.steps[0].detail).toContain("120 g");
  });

  it("renders both packagingPlan settings and packagingAdditions ingredient lines together", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      packagingPlan: { method: "keg" },
      packagingAdditions: [
        { linePersistentKey: "p1", name: "Декстроза", category: "consumable", stage: "packaging", timeOffsetMinutes: null, amount: { quantity: 120, unit: "g" }, stepMeta: null }
      ]
    }));
    const packaging = groups.find((group) => group.stage === "packaging")!;
    expect(packaging.steps.map((step) => step.id)).toEqual(["packaging:method", "packaging:add:p1"]);
  });

  it("tolerates a legacy snapshot with no packagingAdditions key at all (pre-migration data)", () => {
    const legacy = makeSnapshot();
    delete (legacy as Record<string, unknown>).packagingAdditions;
    expect(() => buildBrewDaySteps(legacy)).not.toThrow();
    expect(buildBrewDaySteps(legacy).some((group) => group.stage === "packaging")).toBe(false);
  });

  it("renders custom fermentation extraSteps (e.g. diacetyl rest) between the primary task and cold crash", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        extraSteps: [
          { id: "diacetyl", name: "Diacetyl rest", temperatureC: 20, durationDays: 2 }
        ],
        coldCrash: { enabled: true, temperatureC: 2, durationDays: 2 }
      }
    }));
    const fermentation = groups.find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps.map((step) => step.id)).toEqual(["ferment:primary", "ferment:extra:diacetyl", "ferment:cold_crash"]);
    expect(fermentation.steps[1]).toMatchObject({ kind: "task", title: "Diacetyl rest", temperatureC: 20 });
    expect(fermentation.steps[1].detail).toContain("20 °C");
    expect(fermentation.steps[1].detail).toContain("2 дн.");
  });

  it("skips empty custom fermentation extraSteps with neither temperature nor duration set", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        extraSteps: [{ id: "empty", name: "Пустой шаг", temperatureC: null, durationDays: null }]
      }
    }));
    const fermentation = groups.find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps.some((step) => step.id === "ferment:extra:empty")).toBe(false);
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

describe("brewPlanSnapshotSchema backward compatibility", () => {
  it("parses a pre-dryHopPlan snapshot row from the DB, defaulting dryHopPlan to []", () => {
    const legacyRow = makeSnapshot();
    delete (legacyRow as Record<string, unknown>).dryHopPlan;

    const parsed = brewPlanSnapshotSchema.parse(legacyRow);
    expect(parsed.dryHopPlan).toEqual([]);
    // И построение шагов из уже распарсенного (реальный путь service.ts) не падает.
    expect(() => buildBrewDaySteps(parsed)).not.toThrow();
  });

  it("parses a pre-packagingAdditions snapshot row from the DB, defaulting packagingAdditions to []", () => {
    const legacyRow = makeSnapshot();
    delete (legacyRow as Record<string, unknown>).packagingAdditions;

    const parsed = brewPlanSnapshotSchema.parse(legacyRow);
    expect(parsed.packagingAdditions).toEqual([]);
    expect(() => buildBrewDaySteps(parsed)).not.toThrow();
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
