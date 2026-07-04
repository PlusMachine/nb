import { describe, expect, it } from "vitest";

import {
  detectFermentEdges,
  detectTelemetryEdges,
  FAULT_BITS,
  isManualHeatActive,
  PROMPT_NUM,
  STAGE_NUM,
  type EdgeState,
  type FermentEdgeState,
  type FermentFrame,
  type Stage,
  type Telemetry,
  type TelemetryEdge,
} from "@nb/brewforge-protocol";
import { fermentWatchdogNotification, notificationFor } from "@nb/push";

// Узкий фрейм: базовые тесты (промпт/авария) читают из next только
// prompt/promptSeq/faultMask — stage/actionReady не заданы (undefined), что
// безопасно: isDistillStage(undefined) вычисляется в false, дистилляционные
// фронты в них не участвуют.
const frame = (prompt: number, promptSeq: number, faultMask: number): Telemetry =>
  ({ prompt, promptSeq, faultMask } as unknown as Telemetry);

// stage=IDLE(0)/actionReady=false — нейтральный дефолт: не DISTILL_*, поэтому
// дистилляционные фронты (H2) в базовых prompt/fault-тестах не всплывают.
const st = (prompt: number, promptSeq: number, faultMask: number): EdgeState => ({
  prompt,
  promptSeq,
  faultMask,
  stage: STAGE_NUM.IDLE,
  actionReady: false,
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

// =============================================================================
//  detectTelemetryEdges — дистилляция (H2, §12.2): «смените приёмную ёмкость»
//  (actionReady false→true в стадиях DISTILL_*) и «фракция завершена» (stage
//  сменился внутри цепочки PREHEAT→HEADS→HEARTS→TAILS→DONE, в т.ч. через
//  SKIP_STAGE). Оба события заведены внутрь detectTelemetryEdges/EdgeState
//  (см. комментарий в notify.ts пакета) — отдельного детектора/памяти нет.
// =============================================================================
describe("detectTelemetryEdges — дистилляция (H2)", () => {
  const dst = (stage: number, actionReady: boolean): EdgeState => ({
    prompt: 0,
    promptSeq: 0,
    faultMask: 0,
    stage,
    actionReady,
  });
  const dframe = (stage: number, actionReady: boolean): Telemetry =>
    ({ prompt: 0, promptSeq: 0, faultMask: 0, stage, actionReady }) as unknown as Telemetry;

  it("первый кадр (prev=null) в DISTILL_HEADS с actionReady=true — только сидирование, событий нет", () => {
    expect(detectTelemetryEdges(null, dframe(STAGE_NUM.DISTILL_HEADS, true))).toEqual([]);
  });

  it("actionReady false→true в DISTILL_HEADS → «смените приёмную ёмкость»", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEADS, false), dframe(STAGE_NUM.DISTILL_HEADS, true));
    expect(edges).toEqual([{ kind: "distill-action-ready" }]);
  });

  it("actionReady держится true — без повтора", () => {
    expect(
      detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEADS, true), dframe(STAGE_NUM.DISTILL_HEADS, true)),
    ).toEqual([]);
  });

  it("actionReady сбросился (фронт), затем снова поднялся → событие повторяется", () => {
    const afterReset = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEADS, true), dframe(STAGE_NUM.DISTILL_HEADS, false));
    expect(afterReset).toEqual([]);
    const edges = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEADS, false), dframe(STAGE_NUM.DISTILL_HEADS, true));
    expect(edges).toEqual([{ kind: "distill-action-ready" }]);
  });

  it("actionReady=true вне дистилляции (напр. MASH_STEP) — события нет", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.MASH_STEP, false), dframe(STAGE_NUM.MASH_STEP, true));
    expect(edges).toEqual([]);
  });

  it("стадия сменилась HEADS→HEARTS → «фракция завершена»", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEADS, false), dframe(STAGE_NUM.DISTILL_HEARTS, false));
    expect(edges).toEqual([
      { kind: "distill-fraction-done", fromStage: STAGE_NUM.DISTILL_HEADS, toStage: STAGE_NUM.DISTILL_HEARTS },
    ]);
  });

  it("TAILS→DONE (в т.ч. через SKIP_STAGE) → «фракция завершена» с toStage=DONE", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_TAILS, false), dframe(STAGE_NUM.DONE, false));
    expect(edges).toEqual([
      { kind: "distill-fraction-done", fromStage: STAGE_NUM.DISTILL_TAILS, toStage: STAGE_NUM.DONE },
    ]);
  });

  it("вход в дистилляцию извне (IDLE→PREHEAT) не считается завершением фракции", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.IDLE, false), dframe(STAGE_NUM.DISTILL_PREHEAT, false));
    expect(edges).toEqual([]);
  });

  it("выход из дистилляции в PAUSED не считается завершением фракции", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEARTS, false), dframe(STAGE_NUM.PAUSED, false));
    expect(edges).toEqual([]);
  });

  it("та же стадия — без события фракции", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEADS, false), dframe(STAGE_NUM.DISTILL_HEADS, false));
    expect(edges).toEqual([]);
  });

  it("actionReady и смена стадии в одном кадре → оба события", () => {
    const edges = detectTelemetryEdges(dst(STAGE_NUM.DISTILL_HEARTS, false), dframe(STAGE_NUM.DISTILL_TAILS, true));
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.kind).sort()).toEqual(["distill-action-ready", "distill-fraction-done"]);
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

describe("notificationFor — дистилляция (H2)", () => {
  const ctx = { deviceId: "dev-1", deviceName: "Дистиллятор" };

  it("distill-action-ready → «Смените приёмную ёмкость»", () => {
    const edge: TelemetryEdge = { kind: "distill-action-ready" };
    expect(notificationFor(edge, ctx)).toEqual({
      title: "Дистиллятор",
      body: "Смените приёмную ёмкость",
      tag: "dev-1:distill-action-ready",
      url: "/app/devices/dev-1",
    });
  });

  it("PREHEAT→HEADS → «Разогрев завершён — начат отбор голов»", () => {
    const edge: TelemetryEdge = {
      kind: "distill-fraction-done",
      fromStage: STAGE_NUM.DISTILL_PREHEAT,
      toStage: STAGE_NUM.DISTILL_HEADS,
    };
    expect(notificationFor(edge, ctx).body).toBe("Разогрев завершён — начат отбор голов");
  });

  it("HEADS→HEARTS → «Головы отобраны — начат отбор тела»", () => {
    const edge: TelemetryEdge = {
      kind: "distill-fraction-done",
      fromStage: STAGE_NUM.DISTILL_HEADS,
      toStage: STAGE_NUM.DISTILL_HEARTS,
    };
    expect(notificationFor(edge, ctx)).toEqual({
      title: "Дистиллятор",
      body: "Головы отобраны — начат отбор тела",
      tag: "dev-1:distill-fraction",
      url: "/app/devices/dev-1",
    });
  });

  it("HEARTS→TAILS → «Тело отобрано — начат отбор хвостов»", () => {
    const edge: TelemetryEdge = {
      kind: "distill-fraction-done",
      fromStage: STAGE_NUM.DISTILL_HEARTS,
      toStage: STAGE_NUM.DISTILL_TAILS,
    };
    expect(notificationFor(edge, ctx).body).toBe("Тело отобрано — начат отбор хвостов");
  });

  it("TAILS→DONE → «Хвосты отобраны — перегон завершён»", () => {
    const edge: TelemetryEdge = {
      kind: "distill-fraction-done",
      fromStage: STAGE_NUM.DISTILL_TAILS,
      toStage: STAGE_NUM.DONE,
    };
    expect(notificationFor(edge, ctx)).toEqual({
      title: "Дистиллятор",
      body: "Хвосты отобраны — перегон завершён",
      tag: "dev-1:distill-fraction",
      url: "/app/devices/dev-1",
    });
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

// =============================================================================
//  detectFermentEdges (H3, §12.2): отклонение от уставки (окно/кулдаун) и
//  конец ступени профиля в режиме ферментации.
// =============================================================================
describe("detectFermentEdges", () => {
  const ff = (opts: Partial<FermentFrame> & { primaryC?: number; primaryValid?: boolean }): FermentFrame => ({
    stage: opts.stage ?? STAGE_NUM.FERMENT,
    primary: { c: opts.primaryC ?? 18, valid: opts.primaryValid ?? true },
    setpointC: opts.setpointC ?? 18,
    mashStepIndex: opts.mashStepIndex ?? 0,
    nMashSteps: opts.nMashSteps ?? 3,
  });

  it("первый кадр устройства (prev=null) только сидирует — событий нет, даже если уже отклонился", () => {
    const { edges, nextState } = detectFermentEdges(null, ff({ primaryC: 25, setpointC: 18 }), 0);
    expect(edges).toEqual([]);
    expect(nextState.lastStepIndex).toBe(0);
  });

  it("вне FERMENT — детектор молчит и сбрасывает слежение", () => {
    const prev: FermentEdgeState = { deviationSinceMs: 0, lastDeviationPushMs: null, lastStepIndex: 0 };
    const { edges, nextState } = detectFermentEdges(prev, ff({ stage: STAGE_NUM.MASH_STEP }), 1_000);
    expect(edges).toEqual([]);
    expect(nextState).toEqual({ deviationSinceMs: null, lastDeviationPushMs: null, lastStepIndex: null });
  });

  it("отклонение началось — до 10 мин не пушит", () => {
    // Кадр в момент t=0, когда деvиация только зафиксирована (seed).
    const seed = detectFermentEdges(null, ff({ primaryC: 20.5, setpointC: 18 }), 0);
    const { edges } = detectFermentEdges(seed.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 9 * 60_000);
    expect(edges).toEqual([]);
  });

  it("отклонение непрерывно ≥10 мин → пуш один раз", () => {
    const seed = detectFermentEdges(null, ff({ primaryC: 20.5, setpointC: 18 }), 0);
    const { edges, nextState } = detectFermentEdges(seed.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 10 * 60_000);
    expect(edges).toEqual([{ kind: "ferment-deviation", primaryC: 20.5, setpointC: 18 }]);
    expect(nextState.lastDeviationPushMs).toBe(10 * 60_000);
  });

  it("ровно на пороге 1.5° — ещё не отклонение (нужно строго больше)", () => {
    const seed = detectFermentEdges(null, ff({ primaryC: 19.5, setpointC: 18 }), 0);
    const { edges } = detectFermentEdges(seed.nextState, ff({ primaryC: 19.5, setpointC: 18 }), 20 * 60_000);
    expect(edges).toEqual([]);
  });

  it("после пуша повторно не пушит внутри 4ч кулдауна, даже если отклонение продолжается", () => {
    const seed = detectFermentEdges(null, ff({ primaryC: 20.5, setpointC: 18 }), 0);
    const first = detectFermentEdges(seed.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 10 * 60_000);
    expect(first.edges).toHaveLength(1);
    const second = detectFermentEdges(first.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 3 * 60 * 60_000);
    expect(second.edges).toEqual([]);
  });

  it("после 4ч кулдауна при продолжающемся отклонении пушит снова", () => {
    const seed = detectFermentEdges(null, ff({ primaryC: 20.5, setpointC: 18 }), 0);
    const first = detectFermentEdges(seed.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 10 * 60_000);
    const later = detectFermentEdges(first.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 10 * 60_000 + 4 * 60 * 60_000);
    expect(later.edges).toEqual([{ kind: "ferment-deviation", primaryC: 20.5, setpointC: 18 }]);
  });

  it("коридор восстановился (даже кратко) — окно 10 мин сбрасывается", () => {
    const seed = detectFermentEdges(null, ff({ primaryC: 20.5, setpointC: 18 }), 0);
    const backInRange = detectFermentEdges(seed.nextState, ff({ primaryC: 18.2, setpointC: 18 }), 9 * 60_000);
    expect(backInRange.nextState.deviationSinceMs).toBeNull();
    // Отклонился заново в 9 мин, к 9+9=18 мин ещё не наберёт 10 мин с НОВОГО старта.
    const deviatesAgain = detectFermentEdges(backInRange.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 9 * 60_000 + 1);
    const stillNotEnough = detectFermentEdges(deviatesAgain.nextState, ff({ primaryC: 20.5, setpointC: 18 }), 9 * 60_000 + 9 * 60_000);
    expect(stillNotEnough.edges).toEqual([]);
  });

  it("невалидный датчик не считается отклонением", () => {
    const seed = detectFermentEdges(null, ff({ primaryC: 30, setpointC: 18, primaryValid: false }), 0);
    const { edges, nextState } = detectFermentEdges(seed.nextState, ff({ primaryC: 30, setpointC: 18, primaryValid: false }), 20 * 60_000);
    expect(edges).toEqual([]);
    expect(nextState.deviationSinceMs).toBeNull();
  });

  it("смена mashStepIndex → событие конца ступени с новым индексом/уставкой", () => {
    const seed = detectFermentEdges(null, ff({ mashStepIndex: 0, setpointC: 18 }), 0);
    const { edges } = detectFermentEdges(seed.nextState, ff({ mashStepIndex: 1, nMashSteps: 3, setpointC: 20 }), 1_000);
    expect(edges).toEqual([{ kind: "ferment-step-done", stepIndex: 1, nSteps: 3, setpointC: 20 }]);
  });

  it("тот же mashStepIndex — без события", () => {
    const seed = detectFermentEdges(null, ff({ mashStepIndex: 1 }), 0);
    const { edges } = detectFermentEdges(seed.nextState, ff({ mashStepIndex: 1 }), 1_000);
    expect(edges).toEqual([]);
  });

  it("вход в FERMENT из другой стадии не даёт ложного step-done на первом кадре", () => {
    const prev: FermentEdgeState = { deviationSinceMs: null, lastDeviationPushMs: null, lastStepIndex: null };
    const { edges, nextState } = detectFermentEdges(prev, ff({ mashStepIndex: 0 }), 0);
    expect(edges).toEqual([]);
    expect(nextState.lastStepIndex).toBe(0);
  });

  it("отклонение и конец ступени в одном кадре → два события", () => {
    const seed = detectFermentEdges(null, ff({ primaryC: 20.5, setpointC: 18, mashStepIndex: 0 }), 0);
    const { edges } = detectFermentEdges(
      seed.nextState,
      ff({ primaryC: 20.5, setpointC: 18, mashStepIndex: 1, nMashSteps: 3 }),
      10 * 60_000,
    );
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.kind).sort()).toEqual(["ferment-deviation", "ferment-step-done"]);
  });
});

describe("notificationFor — ферментация (H3)", () => {
  const ctx = { deviceId: "dev-1", deviceName: "Ферментер" };

  it("ferment-deviation → текст с фактом/уставкой", () => {
    const edge: TelemetryEdge = { kind: "ferment-deviation", primaryC: 20.3, setpointC: 18 };
    expect(notificationFor(edge, ctx)).toEqual({
      title: "Ферментер",
      body: "Отклонение от уставки: 20.3° при уставке 18.0°",
      tag: "dev-1:ferment-deviation",
      url: "/app/devices/dev-1",
    });
  });

  it("ferment-step-done → текст без имени шага (прибор имена не хранит)", () => {
    const edge: TelemetryEdge = { kind: "ferment-step-done", stepIndex: 1, nSteps: 3, setpointC: 20 };
    expect(notificationFor(edge, ctx)).toEqual({
      title: "Ферментер",
      body: "Ступень брожения завершена — держит 20.0°",
      tag: "dev-1:ferment-step",
      url: "/app/devices/dev-1",
    });
  });
});

describe("fermentWatchdogNotification (H3, офлайн-watchdog §12.2)", () => {
  it("заголовок с ⚠, тело с числом минут", () => {
    const payload = fermentWatchdogNotification({ deviceId: "dev-1", deviceName: "Ферментер" }, 45);
    expect(payload).toEqual({
      title: "⚠ Ферментер",
      body: "Прибор молчит 45 мин",
      tag: "dev-1:ferment-watchdog",
      url: "/app/devices/dev-1",
    });
  });
});
