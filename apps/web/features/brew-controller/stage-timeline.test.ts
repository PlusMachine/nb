import { describe, expect, it } from "vitest";

import { PROTOCOL_SCHEMA_VERSION, STAGE_NUM, type Telemetry } from "@nb/brewforge-protocol";

import {
  computeStageTimeline,
  DISTILL_MACRO_STAGE_ORDER,
  MACRO_STAGE_ORDER,
  stageTimelineFromTelemetry,
  type StageTimelineInput,
} from "./stage-timeline";

const base: StageTimelineInput = {
  stage: STAGE_NUM.IDLE,
  pausedFrom: STAGE_NUM.IDLE,
  stageElapsedSec: 0,
  stageRemainingSec: 0,
  mashStepIndex: 0,
  nMashSteps: 0,
};

const stateByMacro = (tl: ReturnType<typeof computeStageTimeline>) =>
  Object.fromEntries(tl.segments.map((s) => [s.macro, s.state]));

/** Минимальный валидный снимок телеметрии — под stageTimelineFromTelemetry. */
function telemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return {
    schema: PROTOCOL_SCHEMA_VERSION,
    deviceId: "bf-e9f8",
    fw: "sim-1",
    ts: 0,
    seq: 1,
    uptime: 10,
    stage: STAGE_NUM.IDLE,
    stageName: "IDLE",
    pausedFrom: STAGE_NUM.IDLE,
    appMode: undefined,
    faultMask: 0,
    faults: [],
    heatingPermitted: true,
    sensors: [],
    primary: { c: 20, valid: true },
    setpointC: 20,
    heatMode: 0,
    heatDutyPct: 0,
    heatOn: false,
    spargeHeatOn: false,
    pumpOn: false,
    boilPct: 0,
    stageRemainingSec: 0,
    stageElapsedSec: 0,
    mashStepIndex: 0,
    nMashSteps: 0,
    hopStandIndex: -1,
    prompt: 0,
    promptSeq: 0,
    nextHopAlert: false,
    activeRecipe: -1,
    recipeName: "",
    statusLine: "",
    ...overrides,
  };
}

describe("computeStageTimeline", () => {
  it("IDLE — overlay ожидания, все сегменты future", () => {
    const tl = computeStageTimeline(base);
    expect(tl.overlay).toBe("idle");
    expect(tl.segments).toHaveLength(MACRO_STAGE_ORDER.length);
    expect(tl.segments.every((s) => s.state === "future")).toBe(true);
  });

  it("MASH_STEP — затор текущий, остальные будущие, прошлых нет", () => {
    const tl = computeStageTimeline({ ...base, stage: STAGE_NUM.MASH_STEP });
    const st = stateByMacro(tl);
    expect(st.mash).toBe("current");
    expect(st.boil).toBe("future");
    expect(st.done).toBe("future");
    expect(tl.segments.some((s) => s.state === "done")).toBe(false);
  });

  it("BOILING — затор пройден, кипячение текущее", () => {
    const tl = computeStageTimeline({
      ...base,
      stage: STAGE_NUM.BOILING,
      stageElapsedSec: 30 * 60,
      stageRemainingSec: 30 * 60,
    });
    const st = stateByMacro(tl);
    expect(st.mash).toBe("done");
    expect(st.boil).toBe("current");
    expect(st.hop_stand).toBe("future");
    const boil = tl.segments.find((s) => s.macro === "boil");
    expect(boil?.progress).toBeCloseTo(0.5, 5);
  });

  it("прогресс затора считается по номеру паузы, а не только по таймеру", () => {
    // 3 паузы, идёт вторая (индекс 1), её таймер наполовину → (1 + 0.5)/3 = 0.5.
    const tl = computeStageTimeline({
      ...base,
      stage: STAGE_NUM.MASH_STEP,
      nMashSteps: 3,
      mashStepIndex: 1,
      stageElapsedSec: 10,
      stageRemainingSec: 10,
    });
    const mash = tl.segments.find((s) => s.macro === "mash");
    expect(mash?.progress).toBeCloseTo(0.5, 5);
    expect(tl.substepLabel).toBe("Пауза 2 из 3");
  });

  it("PAUSED позиционируется по pausedFrom и не сбрасывает прогресс", () => {
    const tl = computeStageTimeline({
      ...base,
      stage: STAGE_NUM.PAUSED,
      pausedFrom: STAGE_NUM.BOILING,
    });
    const st = stateByMacro(tl);
    expect(tl.overlay).toBe("paused");
    expect(st.mash).toBe("done");
    expect(st.boil).toBe("current");
    // На паузе таймер стадии не относится к макро-стадии — прогресс не наполняем.
    expect(tl.segments.find((s) => s.macro === "boil")?.progress).toBe(0);
  });

  it("FAULT — overlay аварии, позиция по pausedFrom", () => {
    const tl = computeStageTimeline({
      ...base,
      stage: STAGE_NUM.FAULT,
      pausedFrom: STAGE_NUM.MASH_STEP,
    });
    expect(tl.overlay).toBe("fault");
    expect(stateByMacro(tl).mash).toBe("current");
  });

  it("MANUAL — overlay ручного режима без линейной позиции", () => {
    const tl = computeStageTimeline({ ...base, stage: STAGE_NUM.MANUAL });
    expect(tl.overlay).toBe("manual");
    expect(tl.currentLabel).toBe("Ручной режим");
    expect(tl.segments.every((s) => s.state === "future")).toBe(true);
  });

  it("DONE — все стадии пройдены, финальная текущая с прогрессом 1", () => {
    const tl = computeStageTimeline({ ...base, stage: STAGE_NUM.DONE });
    const st = stateByMacro(tl);
    expect(st.cooling).toBe("done");
    expect(st.done).toBe("current");
    expect(tl.segments.find((s) => s.macro === "done")?.progress).toBe(1);
  });
});

describe("computeStageTimeline — режим distill (веб-HMI §5/§7)", () => {
  const stateByMacroDistill = stateByMacro;

  it("DISTILL_PREHEAT — разогрев текущий, остальные будущие", () => {
    const tl = computeStageTimeline({ ...base, stage: STAGE_NUM.DISTILL_PREHEAT }, "distill");
    expect(tl.segments).toHaveLength(DISTILL_MACRO_STAGE_ORDER.length);
    const st = stateByMacroDistill(tl);
    expect(st.distill_preheat).toBe("current");
    expect(st.heads).toBe("future");
    expect(tl.currentLabel).toBe("Разогрев");
  });

  it("DISTILL_HEADS — разогрев пройден, головы текущие, прогресс по таймеру стадии", () => {
    const tl = computeStageTimeline(
      { ...base, stage: STAGE_NUM.DISTILL_HEADS, stageElapsedSec: 15, stageRemainingSec: 45 },
      "distill",
    );
    const st = stateByMacroDistill(tl);
    expect(st.distill_preheat).toBe("done");
    expect(st.heads).toBe("current");
    expect(tl.currentLabel).toBe("Головы");
    expect(tl.segments.find((s) => s.macro === "heads")?.progress).toBeCloseTo(0.25, 5);
  });

  it("DISTILL_HEARTS — головы пройдены, тело текущее", () => {
    const tl = computeStageTimeline({ ...base, stage: STAGE_NUM.DISTILL_HEARTS }, "distill");
    const st = stateByMacroDistill(tl);
    expect(st.heads).toBe("done");
    expect(st.hearts).toBe("current");
    expect(tl.currentLabel).toBe("Тело");
  });

  it("DISTILL_TAILS — тело пройдено, хвосты текущие", () => {
    const tl = computeStageTimeline({ ...base, stage: STAGE_NUM.DISTILL_TAILS }, "distill");
    const st = stateByMacroDistill(tl);
    expect(st.hearts).toBe("done");
    expect(st.tails).toBe("current");
    expect(tl.currentLabel).toBe("Хвосты");
  });

  it("DONE в режиме distill — все фракции пройдены, «Готово» текущее с прогрессом 1", () => {
    const tl = computeStageTimeline({ ...base, stage: STAGE_NUM.DONE }, "distill");
    const st = stateByMacroDistill(tl);
    expect(st.tails).toBe("done");
    expect(st.distill_done).toBe("current");
    expect(tl.segments.find((s) => s.macro === "distill_done")?.progress).toBe(1);
    expect(tl.currentLabel).toBe("Готово");
  });

  it("PAUSED из DISTILL_HEARTS держит «Тело» текущим (пауза не сбрасывает фракцию)", () => {
    const tl = computeStageTimeline(
      { ...base, stage: STAGE_NUM.PAUSED, pausedFrom: STAGE_NUM.DISTILL_HEARTS },
      "distill",
    );
    expect(tl.overlay).toBe("paused");
    const st = stateByMacroDistill(tl);
    expect(st.heads).toBe("done");
    expect(st.hearts).toBe("current");
    expect(tl.segments.find((s) => s.macro === "hearts")?.progress).toBe(0);
  });

  it("FAULT из DISTILL_TAILS позиционируется на «Хвосты»", () => {
    const tl = computeStageTimeline(
      { ...base, stage: STAGE_NUM.FAULT, pausedFrom: STAGE_NUM.DISTILL_TAILS },
      "distill",
    );
    expect(tl.overlay).toBe("fault");
    expect(stateByMacroDistill(tl).tails).toBe("current");
  });
});

describe("stageTimelineFromTelemetry — режимы прибора (веб-HMI §5)", () => {
  it("distill: строит полосу фракций по DISTILL_HEARTS", () => {
    const tl = stageTimelineFromTelemetry(telemetry({ stage: STAGE_NUM.DISTILL_HEARTS, stageName: "DISTILL_HEARTS" }));
    expect(tl).not.toBeNull();
    expect(tl?.segments.map((s) => s.macro)).toEqual(DISTILL_MACRO_STAGE_ORDER);
    expect(tl?.currentLabel).toBe("Тело");
  });

  it("ferment: недельный процесс без линейной полосы стадий — null", () => {
    const tl = stageTimelineFromTelemetry(telemetry({ stage: STAGE_NUM.FERMENT, stageName: "FERMENT" }));
    expect(tl).toBeNull();
  });

  it("brew: поведение не изменилось — MASH_STEP строит варочную полосу", () => {
    const tl = stageTimelineFromTelemetry(
      telemetry({ stage: STAGE_NUM.MASH_STEP, stageName: "MASH_STEP", nMashSteps: 1, mashStepIndex: 0 }),
    );
    expect(tl).not.toBeNull();
    expect(tl?.segments.map((s) => s.macro)).toEqual(MACRO_STAGE_ORDER);
  });
});
