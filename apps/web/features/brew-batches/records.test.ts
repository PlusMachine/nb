import { describe, expect, it } from "vitest";
import { batchTaskInputSchema, batchVolumeTargets, calculateBatchCalibration, signedDifference, volumeMeasurementsSchema } from "./records";
import { starterEquipmentProfileDefaults } from "../equipment-profiles/contracts";
import { brewPlanSnapshotSchema } from "./contracts";

const plan = () => brewPlanSnapshotSchema.parse({
  version: "brew_plan_v1", recipe: { id: "10000000-0000-4000-8000-000000000001", title: "Тест", versionNumber: 1, batchSizeL: 20 },
  equipmentProfileSnapshot: { ...starterEquipmentProfileDefaults, id: null, snapshotAt: "2026-10-29T10:00:00Z", evaporationRateLPerHr: 4, fermenterLossL: 2 },
  waterPlanMeta: null, mashSteps: [], boilPlan: { boilTimeMinutes: 90, timedAdditions: [] }, whirlpoolPlan: [], fermentationPlan: null, packagingPlan: null, deviceHints: []
});
describe("batch volume calculations", () => {
  it("compares measurements and targets at 20 C, and keeps fermenter and bottled volumes distinct", () => {
    const targets = batchVolumeTargets(plan());
    expect(targets).toMatchObject({ fermenterL: 20, bottledL: 18, postBoilL: 21 });
    expect(targets.preBoilL).toBeCloseTo(26.76);
  });
  it("does not invent a bottled target for a legacy plan without a profile", () => {
    const p = plan(); p.equipmentProfileSnapshot = null;
    expect(batchVolumeTargets(p)).toEqual({ fermenterL: 20 });
  });
  it("recovers hot evaporation and cold transfer loss from the same measurements", () => {
    expect(calculateBatchCalibration({ preBoilL: 26.76, postBoilL: 21, fermenterL: 20 }, 90, 4)).toEqual({ evaporationRateLPerHr: 4, trubChillerLossL: 1 });
    expect(calculateBatchCalibration({ preBoilL: 26.76, postBoilL: 21, fermenterL: 20 }, 180, 4)?.evaporationRateLPerHr).toBe(2);
  });
  it("rejects incomplete, inverted and invalid measurements rather than saving negative loss", () => {
    for (const volumes of [{}, { preBoilL: 20, postBoilL: 21, fermenterL: 19 }, { preBoilL: 26, postBoilL: 21, fermenterL: 22 }]) expect(calculateBatchCalibration(volumes, 60, 4)).toBeNull();
    expect(calculateBatchCalibration({ preBoilL: 26, postBoilL: 21, fermenterL: 20 }, 0, 4)).toBeNull();
    for (const value of [NaN, Infinity, -1, 0, 10001]) expect(volumeMeasurementsSchema.safeParse({ bottledL: value }).success).toBe(false);
    expect(volumeMeasurementsSchema.safeParse({ bottledL: null }).success).toBe(true);
    expect(volumeMeasurementsSchema.safeParse({ surprise: 4 }).success).toBe(false);
  });
  it("distinguishes missing measurements and zero difference", () => {
    expect(signedDifference(null, 20)).toBe("—");
    expect(signedDifference(20, 20)).toBe("0,0");
    expect(signedDifference(20.8, 20)).toBe("+0,8");
  });
});
describe("task dates", () => {
  it("validates calendar dates, title and optional local time", () => {
    expect(batchTaskInputSchema.safeParse({ title: " Измерить плотность ", dueDate: "2026-10-30", dueTime: null }).success).toBe(true);
    for (const patch of [{ dueDate: "2026-02-30" }, { title: "  " }, { dueTime: "25:00" }]) expect(batchTaskInputSchema.safeParse({ title: "Проверить", dueDate: "2026-10-30", dueTime: "10:00", ...patch }).success).toBe(false);
  });
});
