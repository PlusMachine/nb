import { describe, expect, it } from "vitest";
import { applyBrewDayStepPatch, normalizeBrewDayProgress } from "../features/brew-batches/brew-day";
import { brewPlanSnapshotSchema, type BrewDayProgress, type BrewPlanSnapshot } from "../features/brew-batches/contracts";
import { buildManualBrewSteps, manualBrewPhases, resolveManualBrewFocus } from "../features/brew-batches/manual-brew";
import { buildBrewPlanSnapshot } from "../features/brew-batches/brew-plan";
import type { RecipeDetailDto } from "../features/recipes/contracts";
import { stepRemainingSeconds } from "../features/brew-batches/components/brew-day-timer";

const hop = (id: string, stage = "boil", meta: Record<string, unknown> = {}, minutes = 60) => ({ linePersistentKey: id, name: id, category: "hop", stage, amount: { quantity: 25, unit: "g" }, timeOffsetMinutes: minutes, stepMeta: meta });
const snapshot = (overrides: Partial<BrewPlanSnapshot> = {}) => brewPlanSnapshotSchema.parse({
  version: "brew_plan_v1", recipe: { id: "00000000-0000-4000-8000-000000000001", title: "IPA", versionNumber: 1, batchSizeL: 20 },
  equipmentProfileSnapshot: null, waterPlanMeta: { mashWaterVolumeL: 17, spargeWaterVolumeL: 13 },
  mashSteps: [{ id: "rest", name: "Осахаривание", targetTemperatureC: 66, durationMinutes: 60 }],
  boilPlan: { boilTimeMinutes: 60, timedAdditions: [hop("early"), hop("late", "boil", {}, 10)] },
  whirlpoolPlan: [hop("stand", "whirlpool", { temperatureC: 80, timeMinutes: 20 })],
  fermentationPlan: { primaryTemperatureC: 20, primaryDurationDays: 12 }, packagingPlan: null, deviceHints: [], ...overrides
});
const at = Date.parse("2026-11-02T09:00:00.000Z");
const phases = (plan = snapshot()) => manualBrewPhases(buildManualBrewSteps(plan));
const ready = (items = phases(), before = "boil"): BrewDayProgress => ({ steps: Object.fromEntries(items.slice(0, items.findIndex(item => item.id === before)).flatMap(item => item.steps).map(step => [step.id, { done: true, timerStartedAt: null }])), updatedAt: null });
const start = (progress: BrewDayProgress, id = "boil:timer", time = at) => applyBrewDayStepPatch(progress, id, { timerStartedAt: new Date(time).toISOString() }, new Date(time).toISOString());
const done = (progress: BrewDayProgress, id: string) => applyBrewDayStepPatch(progress, id, { done: true }, new Date(at).toISOString());

describe("manual brew recipe and scheduling", () => {
  it("separates water, runoff, chilling and transfer without changing persisted IDs", () => {
    const items = phases();
    expect(items.map(item => item.id)).toEqual(["water", "mash", "sparge", "boil", "whirlpool", "chill", "finish"]);
    expect(items.flatMap(item => item.steps).map(step => step.id)).toContain("mash:rest");
    expect(items.at(-1)?.steps.map(step => step.id)).toEqual(["brew:transfer", "brew:pitch"]);
  });
  it("places first-wort hops before runoff and excludes them from the boil countdown", () => {
    const items = phases(snapshot({ boilPlan: { boilTimeMinutes: 60, timedAdditions: [hop("fwh", "boil", { useType: "first_wort_hop" })] } }));
    expect(items.find(item => item.id === "sparge")?.steps.map(step => step.id)).toEqual(["boil:add:fwh", "mash:lauter"]);
    expect(items.find(item => item.id === "boil")?.steps.map(step => step.id)).toEqual(["boil:timer"]);
    expect(items.find(item => item.id === "sparge")!.steps[0].detail).toContain("в первое сусло");
  });
  it("puts mash hops before rests and leaves dry hops in fermentation", () => {
    const groups = buildManualBrewSteps(snapshot({ boilPlan: { boilTimeMinutes: 60, timedAdditions: [hop("mash", "mash")] }, dryHopPlan: [hop("dry", "fermentation", { useType: "dry_hop", durationDays: 3 })] }));
    const mash = manualBrewPhases(groups).find(item => item.id === "mash")!.steps;
    expect(mash.findIndex(step => step.id === "mash:add:mash")).toBeLessThan(mash.findIndex(step => step.id === "mash:rest"));
    expect(groups.find(group => group.stage === "fermentation")?.steps.find(step => step.id === "ferment:add:dry")?.detail).toContain("держать 3");
    expect(groups.find(group => group.stage === "fermentation")?.steps.find(step => step.id === "ferment:add:dry")?.instructions).toContain("Держите 3");
    expect(manualBrewPhases(groups).flatMap(item => item.steps).some(step => step.id === "ferment:add:dry")).toBe(false);
  });
  it("preserves recipe order for rests with and without a timer", () => {
    const items = phases(snapshot({ mashSteps: [{ id: "rest", name: "Осахаривание", durationMinutes: 60, targetTemperatureC: 66 }, { id: "heat-out", name: "Нагрев перед сливом", durationMinutes: 0, targetTemperatureC: 76 }] }));
    expect(items.find(item => item.id === "mash")!.steps.map(step => step.id)).toEqual(["mash:dough-in", "mash:rest", "mash:heat-out"]);
  });
  it("uses recipe step metadata in preference to legacy boil offsets", () => {
    const items = phases(snapshot({ boilPlan: { boilTimeMinutes: 60, timedAdditions: [hop("meta", "boil", { timeMinutes: 60 }, 5)] } }));
    expect(items.find(item => item.id === "boil")!.steps[1].boilSecondsBeforeEnd).toBe(3600);
  });
  it("shows the start action before boiling, then the due hop while the boil stays unfinished", () => {
    const items = phases(); const progress = ready(items);
    expect(resolveManualBrewFocus(items, progress, at).current?.id).toBe("boil:timer");
    const running = start(progress);
    expect(resolveManualBrewFocus(items, running, at + 1000).current?.id).toBe("boil:add:early");
    const after = done(running, "boil:add:early");
    expect(after.steps["boil:timer"].done).toBe(false);
    const focus = resolveManualBrewFocus(items, after, at + 30 * 60000);
    expect(focus.current?.id).toBe("boil:timer");
    expect(focus.next?.id).toBe("boil:add:late");
    expect(resolveManualBrewFocus(items, after, at + 50 * 60000).current?.id).toBe("boil:add:late");
  });
  it("keeps an overdue addition visible and prioritizes it over an undone earlier phase", () => {
    const items = phases(); const running = start(ready(items));
    running.steps["mash:rest"].done = false;
    expect(resolveManualBrewFocus(items, running, at + 5 * 60000).current?.id).toBe("boil:add:early");
  });
  it("presents simultaneous additions together with separate stored states", () => {
    const items = phases(snapshot({ boilPlan: { boilTimeMinutes: 60, timedAdditions: [hop("one"), hop("two")] } }));
    const focus = resolveManualBrewFocus(items, start(ready(items)), at);
    expect(focus.companions.map(step => step.id)).toEqual(["boil:add:one", "boil:add:two"]);
    const after = done(start(ready(items)), "boil:add:one");
    expect(resolveManualBrewFocus(items, after, at).current?.id).toBe("boil:add:two");
  });
  it("finishes flameout additions before leaving the boil phase", () => {
    const items = phases(snapshot({ boilPlan: { boilTimeMinutes: 60, timedAdditions: [hop("flameout", "boil", {}, 0)] } }));
    const running = start(ready(items));
    expect(resolveManualBrewFocus(items, running, at + 3600000).current?.id).toBe("boil:add:flameout");
    expect(resolveManualBrewFocus(items, done(running, "boil:add:flameout"), at + 3600000).current?.id).toBe("boil:timer");
  });
  it("schedules 20/10-minute whirlpool contacts inside one stand and reschedules after an extension", () => {
    const items = phases(snapshot({ whirlpoolPlan: [hop("long", "whirlpool", { temperatureC: 80, timeMinutes: 20 }), hop("short", "whirlpool", { temperatureC: 80, timeMinutes: 10 })] }));
    const progress = start(ready(items, "whirlpool"), "whirlpool:long");
    expect(resolveManualBrewFocus(items, progress, at + 9 * 60000).current?.id).toBe("whirlpool:long");
    const due = resolveManualBrewFocus(items, progress, at + 10 * 60000);
    expect(due.current?.id).toBe("whirlpool:short");
    expect(due.holdRemaining).toBe(600);
    expect(due.next?.id).toBe("whirlpool:long");
    expect(due.nextUntilSeconds).toBeNull();
    const extended = applyBrewDayStepPatch(progress, "whirlpool:long", { timerDurationSeconds: 1500 }, new Date(at).toISOString());
    expect(resolveManualBrewFocus(items, extended, at + 10 * 60000).current?.id).toBe("whirlpool:long");
    expect(resolveManualBrewFocus(items, extended, at + 15 * 60000).current?.id).toBe("whirlpool:short");
    const both = start(progress, "whirlpool:short", at + 10 * 60000);
    const holding = resolveManualBrewFocus(items, both, at + 19 * 60000);
    expect(holding.companions).toHaveLength(2);
    expect(holding.holdRemaining).toBe(60);
  });
  it("groups identical whirlpool contacts and keeps different temperatures separate", () => {
    const items = phases(snapshot({ whirlpoolPlan: [hop("a", "whirlpool", { temperatureC: 80, timeMinutes: 20 }), hop("b", "whirlpool", { temperatureC: 80, timeMinutes: 20 }), hop("c", "whirlpool", { temperatureC: 70, timeMinutes: 20 })] }));
    expect(resolveManualBrewFocus(items, ready(items, "whirlpool"), at).companions.map(step => step.id)).toEqual(["whirlpool:a", "whirlpool:b"]);
  });
  it("orders contacts within a whirlpool stand by their actual addition time", () => {
    const items = phases(snapshot({ whirlpoolPlan: [hop("short", "whirlpool", { temperatureC: 80, timeMinutes: 10 }), hop("long", "whirlpool", { temperatureC: 80, timeMinutes: 20 })] }));
    expect(items.find(item => item.id === "whirlpool")!.steps.map(step => step.id)).toEqual(["whirlpool:long", "whirlpool:short"]);
  });
  it("retains dip-hopping once in a legacy snapshot that duplicated it on fermentation", () => {
    const addition = hop("dip", "fermentation", { useType: "dip_hop", timeMinutes: 15, temperatureC: 70 });
    const groups = buildManualBrewSteps(snapshot({ whirlpoolPlan: [addition], dryHopPlan: [addition] }));
    const matches = groups.flatMap(group => group.steps).filter(step => step.ingredientName === "dip");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("whirlpool:dip");
    expect(manualBrewPhases(groups).find(item => item.id === "dip")?.steps).toHaveLength(1);
  });
  it("does not invent a whirlpool hold when the recipe contains none", () => {
    const item = buildManualBrewSteps(snapshot({ whirlpoolPlan: [hop("plain", "whirlpool")] })).flatMap(group => group.steps).find(step => step.id === "whirlpool:plain");
    expect(item).toMatchObject({ kind: "addition", durationSeconds: null });
  });
  it("keeps hops without a scheduled stage visible without inventing a late addition time", () => {
    const items = phases(snapshot({ otherAdditions: [hop("unscheduled", "other", { stageLabel: "По своему плану" })] }));
    expect(items.find(item => item.id === "other")?.unordered).toBe(true);
    const progress = ready(items, "finish");
    expect(resolveManualBrewFocus(items, progress, at).current?.id).toBe("brew:transfer");
    delete progress.steps["brew:other:unscheduled"];
    expect(resolveManualBrewFocus(items, progress, at).current?.id).toBe("brew:transfer");
    expect(resolveManualBrewFocus(items, done(progress, "brew:other:unscheduled"), at).current?.id).toBe("brew:transfer");
  });
  it("persists corrected timers, pH, explicit skips and actual completion time", () => {
    const value = { done: true, timerStartedAt: new Date(at).toISOString(), timerDurationSeconds: 4200, measurementValue: 5.4, completedAt: new Date(at).toISOString(), skipped: false };
    const progress = normalizeBrewDayProgress({ steps: { rest: value } });
    expect(progress.steps.rest).toEqual(value);
    expect(stepRemainingSeconds({ durationSeconds: 3600 }, progress.steps.rest, at + 600000)).toBe(3600);
    expect(applyBrewDayStepPatch(progress, "rest", { done: false }, new Date(at).toISOString()).steps.rest.timerDurationSeconds).toBe(4200);
  });
  it("classifies every hop exactly once when a recipe's use type differs from its legacy stage", () => {
    const ingredients = [hop("dip", "fermentation", { useType: "dip_hop" }), hop("dry", "boil", { useType: "dry_hop" }), hop("dry-from-pack", "packaging", { useType: "dry_hop" }), hop("fwh", "mash", { useType: "first_wort_hop" }), hop("other", "other", { useType: "other" }), hop("unmatched", "other", { useType: "other" })].map(raw => ({ persistentKey: raw.linePersistentKey, ingredientCategory: raw.linePersistentKey === "unmatched" ? null : "hop", ingredientDisplayName: raw.name, stage: raw.stage, stepMeta: raw.stepMeta, amountEnteredQuantity: 25, amountEnteredUnit: "g", amountNormalizedQuantity: 25, amountNormalizedUnit: "g" }));
    const plan = buildBrewPlanSnapshot({ id: "recipe", title: "IPA", versionNumber: 1, batchSizeNormalizedQuantity: 20000, batchSizeNormalizedUnit: "ml", efficiency: 70, equipmentProfileSnapshot: null, waterPlanMeta: null, processMeta: { mashProfile: { steps: [] }, fermentationProfile: {} }, boilTimeMinutes: 60, ingredients } as unknown as RecipeDetailDto);
    expect(plan.boilPlan.timedAdditions.map(item => item.linePersistentKey)).toEqual(["fwh"]);
    expect(plan.whirlpoolPlan.map(item => item.linePersistentKey)).toEqual(["dip"]);
    expect(plan.dryHopPlan.map(item => item.linePersistentKey)).toEqual(["dry", "dry-from-pack"]);
    expect(plan.packagingAdditions).toHaveLength(0);
    expect(plan.otherAdditions?.map(item => item.linePersistentKey)).toEqual(["other", "unmatched"]);
  });
});
