import { describe, expect, it } from "vitest";

import { TelemetrySchema } from "./telemetry";
import { stageName, appModeName } from "./enums";

// =============================================================================
//  Юнит-тесты TelemetrySchema — пакет 4-B (P1 аудита comms-portal.md):
//   1) точный кадр реальной прошивки (v6/v9/v10/§1.6-поля) проходит валидацию;
//   2) СТАРЫЙ кадр (Phase 1 / до пакета 4-A, без новых полей вообще) ТОЖЕ
//      проходит — старые прошивки не должны ронять парсинг (см. комментарий
//      в telemetry.ts: optional, не .default());
//   3) стадии дистилляции/ферментации (bf_stage_t 17..21) не проходили StageSchema
//      до пакета 4-B — это была полная порча кадра телеметрии, не «лишнее поле»;
//   4) H0: appMode (bf_app_mode_t) присутствует/отсутствует — старая прошивка
//      (до v11) его не шлёт, кадр всё равно валиден.
// =============================================================================

/** Минимальный конверт + обязательные поля — общий каркас для обоих кадров. */
const baseFrame = {
  schema: 1 as const,
  deviceId: "bf-ab12",
  fw: "2.0.0",
  ts: 1719400000,
  seq: 12345,
  uptime: 3600,
  stage: 5,
  stageName: "MASH_STEP" as const,
  pausedFrom: 0,
  faultMask: 0,
  faults: [],
  heatingPermitted: true,
  sensors: [{ i: 0, c: 65.4, valid: true }],
  primary: { c: 65.4, valid: true },
  setpointC: 67.0,
  heatMode: 1,
  heatDutyPct: 42,
  heatOn: true,
  spargeHeatOn: false,
  pumpOn: true,
  boilPct: 0,
  stageRemainingSec: 1200,
  stageElapsedSec: 600,
  mashStepIndex: 1,
  nMashSteps: 3,
  hopStandIndex: 0,
  prompt: 0,
  promptSeq: 7,
  nextHopAlert: false,
  activeRecipe: 6,
  recipeName: "IPA",
  statusLine: "Затирание",
};

describe("TelemetrySchema", () => {
  it("принимает точный кадр прошивки со всеми v6/v9/v10/§1.6-полями (bf_proto_telemetry_json)", () => {
    const frame = {
      ...baseFrame,
      pump2On: false,
      valveOn: false,
      coolOn: false,
      indirectActive: false,
      hxTempC: 68.1,
      nextHopName: "Citra",
      nextHopG: 30,
      hopsAlerted: 0,
      actionReady: false,
      coolLockS: 0,
    };
    const parsed = TelemetrySchema.parse(frame);
    expect(parsed.pump2On).toBe(false);
    expect(parsed.hxTempC).toBe(68.1);
    expect(parsed.nextHopName).toBe("Citra");
  });

  it("принимает hxTempC ОТСУТСТВУЮЩИМ (hx_valid=false на устройстве опускает поле целиком)", () => {
    const frame = { ...baseFrame, pump2On: false, valveOn: false, coolOn: false, indirectActive: false };
    const parsed = TelemetrySchema.parse(frame);
    expect(parsed.hxTempC).toBeUndefined();
  });

  it("СТАРЫЙ кадр (Phase 1, без единого нового поля) по-прежнему валиден — не роняет старые прошивки", () => {
    const parsed = TelemetrySchema.parse(baseFrame);
    expect(parsed.pump2On).toBeUndefined();
    expect(parsed.valveOn).toBeUndefined();
    expect(parsed.coolOn).toBeUndefined();
    expect(parsed.indirectActive).toBeUndefined();
    expect(parsed.nextHopName).toBeUndefined();
    expect(parsed.actionReady).toBeUndefined();
    expect(parsed.coolLockS).toBeUndefined();
  });

  it("незнакомое ЛИШНЕЕ поле в кадре молча отбрасывается (Zod z.object по умолчанию), не роняет парсинг", () => {
    const parsed = TelemetrySchema.parse({ ...baseFrame, someFutureField: 42 });
    expect(parsed).not.toHaveProperty("someFutureField");
  });

  it("принимает appMode (H0: bf_app_mode_t) вместе с остальным кадром", () => {
    const parsed = TelemetrySchema.parse({ ...baseFrame, appMode: 1 });
    expect(parsed.appMode).toBe(1);
    expect(appModeName(parsed.appMode!)).toBe("distill");
  });

  it("СТАРЫЙ кадр без appMode (прошивка до v11) по-прежнему валиден", () => {
    const parsed = TelemetrySchema.parse(baseFrame);
    expect(parsed.appMode).toBeUndefined();
  });

  it.each([
    [0, "brew"],
    [1, "distill"],
    [2, "ferment"],
  ] as const)("appModeName(%i) === %s", (num, name) => {
    expect(appModeName(num)).toBe(name);
  });

  it("appModeName бросает на неизвестном значении", () => {
    expect(() => appModeName(99)).toThrow();
  });

  it.each([
    [17, "DISTILL_PREHEAT"],
    [18, "DISTILL_HEADS"],
    [19, "DISTILL_HEARTS"],
    [20, "DISTILL_TAILS"],
    [21, "FERMENT"],
  ] as const)(
    "стадия %i (%s, Фаза 4) проходит StageSchema — до пакета 4-B ронялся ВЕСЬ кадр телеметрии",
    (num, name) => {
      expect(stageName(num)).toBe(name);
      const parsed = TelemetrySchema.parse({ ...baseFrame, stage: num, stageName: name });
      expect(parsed.stageName).toBe(name);
    },
  );
});
