import { describe, expect, it } from "vitest";

import { STAGE_NUM } from "@nb/brewforge-protocol";

import { deriveStageTransitions, stageShortLabel } from "./telemetry-annotations";

describe("deriveStageTransitions", () => {
  it("метит только фронты смены стадии (первая — без метки)", () => {
    const points = [
      { ts: 1, stage: STAGE_NUM.MASH_STEP },
      { ts: 2, stage: STAGE_NUM.MASH_STEP },
      { ts: 3, stage: STAGE_NUM.BOILING },
      { ts: 4, stage: STAGE_NUM.BOILING },
      { ts: 5, stage: STAGE_NUM.COOLING },
    ];
    const t = deriveStageTransitions(points);
    expect(t.map((x) => x.toStage)).toEqual([STAGE_NUM.BOILING, STAGE_NUM.COOLING]);
    expect(t[0].fromStage).toBe(STAGE_NUM.MASH_STEP);
    expect(t[0].ts).toBe(3);
    expect(t[0].label).toBe("Кипение");
  });

  it("не рвёт детект фронта на точках без стадии (null)", () => {
    const points = [
      { ts: 1, stage: STAGE_NUM.MASH_STEP },
      { ts: 2, stage: null },
      { ts: 3, stage: STAGE_NUM.MASH_STEP },
      { ts: 4, stage: STAGE_NUM.BOILING },
    ];
    const t = deriveStageTransitions(points);
    // Дыра в MASH_STEP не должна давать ложный переход MASH_STEP→MASH_STEP.
    expect(t).toHaveLength(1);
    expect(t[0].toStage).toBe(STAGE_NUM.BOILING);
    expect(t[0].ts).toBe(4);
  });

  it("помечает переход в аварию флагом isFault", () => {
    const t = deriveStageTransitions([
      { ts: 1, stage: STAGE_NUM.BOILING },
      { ts: 2, stage: STAGE_NUM.FAULT },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].isFault).toBe(true);
    expect(t[0].label).toBe("Авария");
  });

  it("stageShortLabel даёт запасную подпись для незнакомой стадии", () => {
    expect(stageShortLabel(999)).toBe("#999");
    expect(stageShortLabel(STAGE_NUM.HOP_STAND)).toBe("Вирпул");
  });
});
