import { describe, expect, it } from "vitest";

import { STAGE_NUM } from "./enums";
import { shouldPersistTelemetry, type PersistGateState } from "./persist-gate";

// =============================================================================
//  Юнит-тесты shouldPersistTelemetry — режимный даунсэмпл персиста моста (§14):
//  FERMENT раз в 300 с, остальные стадии раз в 10 с; границы (смена стадии,
//  новая авария) пишутся немедленно вне гейта.
// =============================================================================

const MASH = STAGE_NUM.MASH_STEP; // 5 — обычная (не-ferment) стадия
const FERMENT = STAGE_NUM.FERMENT; // 21

describe("shouldPersistTelemetry", () => {
  it("первый кадр устройства (prev=null) всегда пишется", () => {
    const decision = shouldPersistTelemetry(null, { nowMs: 1000, stage: MASH, faultMask: 0 });
    expect(decision.persist).toBe(true);
    expect(decision.reason).toBe("first");
    expect(decision.nextState).toEqual({ lastPersistedAtMs: 1000, lastStage: MASH, lastFaultMask: 0 });
  });

  it("обычная стадия: следующий кадр раньше 10с — не пишется (throttled)", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: MASH, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 9_999, stage: MASH, faultMask: 0 });
    expect(decision.persist).toBe(false);
    expect(decision.reason).toBe("throttled");
    // lastPersistedAtMs не двигается при throttled — ждём интервал от последнего реального персиста.
    expect(decision.nextState.lastPersistedAtMs).toBe(0);
  });

  it("обычная стадия: кадр на 10с ровно (и позже) — пишется (interval)", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: MASH, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 10_000, stage: MASH, faultMask: 0 });
    expect(decision.persist).toBe(true);
    expect(decision.reason).toBe("interval");
    expect(decision.nextState.lastPersistedAtMs).toBe(10_000);
  });

  it("FERMENT: кадр через 10с — НЕ пишется (интервал 300с, не 10с)", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: FERMENT, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 10_000, stage: FERMENT, faultMask: 0 });
    expect(decision.persist).toBe(false);
    expect(decision.reason).toBe("throttled");
  });

  it("FERMENT: кадр через 300с — пишется", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: FERMENT, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 300_000, stage: FERMENT, faultMask: 0 });
    expect(decision.persist).toBe(true);
    expect(decision.reason).toBe("interval");
  });

  it("FERMENT: кадр через 299999мс — ещё не пишется", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: FERMENT, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 299_999, stage: FERMENT, faultMask: 0 });
    expect(decision.persist).toBe(false);
  });

  it("смена стадии пишется немедленно, даже если интервал не истёк", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: MASH, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 1, stage: STAGE_NUM.MASH_OUT, faultMask: 0 });
    expect(decision.persist).toBe(true);
    expect(decision.reason).toBe("stage-change");
  });

  it("выход в FERMENT из другой стадии пишется немедленно (граница процесса)", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: MASH, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 1, stage: FERMENT, faultMask: 0 });
    expect(decision.persist).toBe(true);
    expect(decision.reason).toBe("stage-change");
  });

  it("вновь поднятая авария пишется немедленно, даже в FERMENT внутри интервала", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: FERMENT, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 1_000, stage: FERMENT, faultMask: 0b1 });
    expect(decision.persist).toBe(true);
    expect(decision.reason).toBe("fault-raised");
  });

  it("та же авария (бит уже стоял) НЕ считается новым фронтом — throttled в FERMENT", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: FERMENT, lastFaultMask: 0b1 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 1_000, stage: FERMENT, faultMask: 0b1 });
    expect(decision.persist).toBe(false);
    expect(decision.reason).toBe("throttled");
  });

  it("новый доп. бит поверх уже стоящей аварии — тоже fault-raised", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: FERMENT, lastFaultMask: 0b01 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 1_000, stage: FERMENT, faultMask: 0b11 });
    expect(decision.persist).toBe(true);
    expect(decision.reason).toBe("fault-raised");
  });

  it("снятая авария (маска обнулилась) сама по себе не форсирует персист вне интервала", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: FERMENT, lastFaultMask: 0b1 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 1_000, stage: FERMENT, faultMask: 0 });
    expect(decision.persist).toBe(false);
    expect(decision.reason).toBe("throttled");
  });

  it("nextState при throttled всё равно обновляет lastStage/lastFaultMask (для будущих сравнений границ)", () => {
    const prev: PersistGateState = { lastPersistedAtMs: 0, lastStage: MASH, lastFaultMask: 0 };
    const decision = shouldPersistTelemetry(prev, { nowMs: 1, stage: MASH, faultMask: 0 });
    expect(decision.persist).toBe(false);
    expect(decision.nextState).toEqual({ lastPersistedAtMs: 0, lastStage: MASH, lastFaultMask: 0 });
  });
});
