import { describe, expect, it } from "vitest";

import {
  detectTelemetryEdges,
  FAULT_BITS,
  isManualHeatActive,
  PROMPT_NUM,
  type EdgeState,
  type Stage,
  type Telemetry,
  type TelemetryEdge,
} from "@nb/brewforge-protocol";
import { notificationFor } from "@nb/push";

// Узкий фрейм: detectTelemetryEdges читает из next только prompt/promptSeq/faultMask.
const frame = (prompt: number, promptSeq: number, faultMask: number): Telemetry =>
  ({ prompt, promptSeq, faultMask } as unknown as Telemetry);

const st = (prompt: number, promptSeq: number, faultMask: number): EdgeState => ({
  prompt,
  promptSeq,
  faultMask,
});

describe("detectTelemetryEdges", () => {
  it("первый кадр (prev=null) только сидирует — событий нет", () => {
    expect(detectTelemetryEdges(null, frame(PROMPT_NUM.ADD_MALT, 1, FAULT_BITS.ESTOP))).toEqual([]);
  });

  it("новый промпт по смене promptSeq → prompt-фронт", () => {
    const edges = detectTelemetryEdges(st(0, 0, 0), frame(PROMPT_NUM.ADD_MALT, 1, 0));
    expect(edges).toEqual([{ kind: "prompt", prompt: "ADD_MALT", promptSeq: 1 }]);
  });

  it("тот же промпт (seq не менялся) → без повторов", () => {
    expect(detectTelemetryEdges(st(PROMPT_NUM.ADD_MALT, 1, 0), frame(PROMPT_NUM.ADD_MALT, 1, 0))).toEqual([]);
  });

  it("снятие промпта (prompt→NONE, seq сменился) не порождает пуш", () => {
    expect(detectTelemetryEdges(st(PROMPT_NUM.ADD_MALT, 1, 0), frame(0, 2, 0))).toEqual([]);
  });

  it("вновь поднятая авария → fault-фронт по новым битам", () => {
    const edges = detectTelemetryEdges(st(0, 0, 0), frame(0, 0, FAULT_BITS.OVERHEAT_ABS));
    expect(edges).toEqual([{ kind: "fault", faults: ["OVERHEAT_ABS"] }]);
  });

  it("держащаяся авария (тот же бит) не повторяется", () => {
    const mask = FAULT_BITS.SENSOR;
    expect(detectTelemetryEdges(st(0, 0, mask), frame(0, 0, mask))).toEqual([]);
  });

  it("при новой аварии поверх активной пушим только НОВЫЙ бит", () => {
    const edges = detectTelemetryEdges(
      st(0, 0, FAULT_BITS.SENSOR),
      frame(0, 0, FAULT_BITS.SENSOR | FAULT_BITS.ESTOP),
    );
    expect(edges).toEqual([{ kind: "fault", faults: ["ESTOP"] }]);
  });

  it("промпт и авария в одном кадре → два фронта", () => {
    const edges = detectTelemetryEdges(st(0, 0, 0), frame(PROMPT_NUM.SPARGE_WATER, 5, FAULT_BITS.FLOAT_DRY));
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.kind).sort()).toEqual(["fault", "prompt"]);
  });
});

describe("notificationFor", () => {
  const ctx = { deviceId: "dev-1", deviceName: "Пивоварня на кухне" };

  it("промпт → терсовый текст + диплинк на пульт", () => {
    const edge: TelemetryEdge = { kind: "prompt", prompt: "ADD_MALT", promptSeq: 1 };
    expect(notificationFor(edge, ctx)).toEqual({
      title: "Пивоварня на кухне",
      body: "Засыпьте солод",
      tag: "dev-1:prompt",
      url: "/app/devices/dev-1",
    });
  });

  it("авария → заголовок с ⚠ и метками аварий", () => {
    const edge: TelemetryEdge = { kind: "fault", faults: ["OVERHEAT_ABS", "SENSOR"] };
    const payload = notificationFor(edge, ctx);
    expect(payload.title).toBe("⚠ Пивоварня на кухне");
    expect(payload.body).toBe("Авария: перегрев (абсолютный), отказ датчика");
    expect(payload.tag).toBe("dev-1:fault");
    expect(payload.url).toBe("/app/devices/dev-1");
  });
});

describe("isManualHeatActive (cloud-плечо dead-man)", () => {
  const t = (stageName: Stage, heatOn: boolean, heatDutyPct: number) =>
    ({ stageName, heatOn, heatDutyPct }) as Pick<Telemetry, "stageName" | "heatOn" | "heatDutyPct">;

  it("MANUAL + нагрев ВКЛ → активен", () => {
    expect(isManualHeatActive(t("MANUAL", true, 0))).toBe(true);
  });

  it("MANUAL + ненулевая скважность (SSR мгновенно OFF) → активен", () => {
    expect(isManualHeatActive(t("MANUAL", false, 60))).toBe(true);
  });

  it("MANUAL без нагрева и скважности → не активен", () => {
    expect(isManualHeatActive(t("MANUAL", false, 0))).toBe(false);
  });

  it("нагрев в НЕ-ручной стадии не считается ручным нагревом", () => {
    expect(isManualHeatActive(t("BOILING", true, 100))).toBe(false);
    expect(isManualHeatActive(t("IDLE", true, 50))).toBe(false);
  });
});
