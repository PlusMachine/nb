import { describe, expect, it } from "vitest";

import {
  ACTIVE_RATE_SG_PER_DAY,
  AWAITING_START_HOURS,
  computeFermentVerdict,
  DONE_NEAR_TARGET_SG,
  SLOWING_RATE_SG_PER_DAY,
  STABILITY_MAX_CHANGE_SG,
  START_DROP_THRESHOLD_SG,
  STUCK_ABOVE_TARGET_SG,
  type FermentVerdictPoint
} from "./verdict-core";

// =============================================================================
//  Юнит-тесты verdict-core — вердикт состояния брожения (§5 F5). Таблица кейсов
//  из спеки: лаг, не началось, актив, дображивает, затык (с targetFg), добродило
//  (с/без targetFg, поверх стабильного хвоста), работа по ручным замерам,
//  недостаток данных. Без БД, чистое ядро.
// =============================================================================

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Точка серии: startTs + offsetHours часов, заданная gravitySg. */
const pt = (startTs: number, offsetHours: number, gravitySg: number): FermentVerdictPoint => ({
  ts: startTs + offsetHours * HOUR_MS,
  gravitySg
});

describe("computeFermentVerdict — лаг у начала сеанса", () => {
  it("<36ч от старта, падение <0.003 → awaiting_start", () => {
    const sessionStartTs = 0;
    const nowMs = 10 * HOUR_MS; // 10ч от старта
    const points = [pt(sessionStartTs, 0, 1.05), pt(sessionStartTs, 5, 1.049), pt(sessionStartTs, 10, 1.0485)];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs })).toEqual({ kind: "awaiting_start" });
  });

  it("ровно на границе AWAITING_START_HOURS ещё awaiting_start (< строго)", () => {
    const sessionStartTs = 0;
    const nowMs = (AWAITING_START_HOURS - 1) * HOUR_MS;
    const points = [pt(sessionStartTs, 0, 1.05), pt(sessionStartTs, 20, 1.0495)];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs }).kind).toBe("awaiting_start");
  });

  it("≥36ч от старта, падение <0.003 → not_started", () => {
    const sessionStartTs = 0;
    const nowMs = 40 * HOUR_MS;
    const points = [pt(sessionStartTs, 0, 1.05), pt(sessionStartTs, 20, 1.0495), pt(sessionStartTs, 40, 1.049)];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs })).toEqual({ kind: "not_started" });
  });

  it("падение чуть выше START_DROP_THRESHOLD_SG уже НЕ лаг (граница «строго меньше», без float-шатания на самом пороге)", () => {
    const sessionStartTs = 0;
    const nowMs = 40 * HOUR_MS;
    const points = [pt(sessionStartTs, 0, 1.05), pt(sessionStartTs, 40, 1.05 - START_DROP_THRESHOLD_SG - 0.0005)];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs }).kind).not.toBe("not_started");
  });
});

describe("computeFermentVerdict — скорость (active/slowing)", () => {
  it("рейт ≥0.002 SG/сутки за последние 24ч → active", () => {
    const sessionStartTs = 0;
    const nowMs = 20 * HOUR_MS;
    // Дроп с начала 0.030 за 20ч → рейт (1.050-1.020)/20*24 = 0.036/сутки.
    const points = [pt(sessionStartTs, 0, 1.05), pt(sessionStartTs, 10, 1.035), pt(sessionStartTs, 20, 1.02)];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs })).toEqual({ kind: "active" });
  });

  it("рейт между 0.0005 и 0.002 SG/сутки → slowing (стабильность за 48ч уже проверена и не подтвердилась)", () => {
    const sessionStartTs = 0;
    const nowMs = 120 * HOUR_MS; // 5 суток от старта
    // Быстрое падение в первые 3 суток (за кадром окон), затем медленное дображивание.
    const points = [
      pt(sessionStartTs, 0, 1.052),
      pt(sessionStartTs, 24, 1.03),
      pt(sessionStartTs, 48, 1.018),
      pt(sessionStartTs, 72, 1.0145), // 48ч до конца — начало окна стабильности
      pt(sessionStartTs, 96, 1.013), // 24ч до конца — опорная точка окна скорости
      pt(sessionStartTs, 120, 1.012) // текущая точка
    ];
    // Окно стабильности (72→120ч): 1.0145/1.013/1.012 → размах 0.0025 > STABILITY_MAX_CHANGE_SG — не стабильно.
    // Окно скорости (96→120ч): (1.013-1.012)/24*24 = 0.0010/сутки — в диапазоне slowing.
    const verdict = computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs });
    expect(verdict).toEqual({ kind: "slowing" });
  });

  it("рейт ниже SLOWING_RATE_SG_PER_DAY без набранной стабильности всё равно slowing (безопасный дефолт)", () => {
    const sessionStartTs = 0;
    const nowMs = 30 * HOUR_MS;
    // Дроп с начала за пределом лага (0.0093), но история короче 48ч (стабильность не проверяется),
    // а в последние 24ч (окно скорости, опорная точка — 6ч) почти плоско: rate = (1.0410-1.0407)/24*24 = 0.0003/сутки.
    const points = [pt(sessionStartTs, 0, 1.05), pt(sessionStartTs, 6, 1.041), pt(sessionStartTs, 30, 1.0407)];
    const verdict = computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs });
    expect(verdict.kind).toBe("slowing");
  });
});

describe("computeFermentVerdict — стабильность 48ч (приоритет над скоростью)", () => {
  const sessionStartTs = 0;
  const nowMs = 120 * HOUR_MS;

  it("стабильно 48ч, уровень >0.010 выше targetFg → possibly_stuck", () => {
    const points = [
      pt(sessionStartTs, 0, 1.052),
      pt(sessionStartTs, 24, 1.035),
      pt(sessionStartTs, 48, 1.026),
      pt(sessionStartTs, 72, 1.0252),
      pt(sessionStartTs, 96, 1.025),
      pt(sessionStartTs, 120, 1.0248)
    ];
    // targetFg=1.010 → diff=0.0148 > STUCK_ABOVE_TARGET_SG.
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: 1.01, nowMs })).toEqual({ kind: "possibly_stuck" });
  });

  it("стабильно 48ч, уровень в пределах 0.005 от targetFg → likely_done + stableDays", () => {
    const points = [
      pt(sessionStartTs, 0, 1.052),
      pt(sessionStartTs, 24, 1.03),
      pt(sessionStartTs, 48, 1.014),
      pt(sessionStartTs, 72, 1.0122),
      pt(sessionStartTs, 96, 1.012),
      pt(sessionStartTs, 120, 1.0118)
    ];
    // targetFg=1.010 → diff=0.0018 ≤ DONE_NEAR_TARGET_SG. Стабильный хвост держится с 72ч (48ч назад от конца).
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: 1.01, nowMs })).toEqual({ kind: "likely_done", stableDays: 2 });
  });

  it("стабильно 48ч, targetFg неизвестен → likely_done независимо от уровня", () => {
    const points = [
      pt(sessionStartTs, 0, 1.052),
      pt(sessionStartTs, 24, 1.04),
      pt(sessionStartTs, 48, 1.031),
      pt(sessionStartTs, 72, 1.0302),
      pt(sessionStartTs, 96, 1.03),
      pt(sessionStartTs, 120, 1.0298)
    ];
    const verdict = computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs });
    expect(verdict.kind).toBe("likely_done");
    expect((verdict as { stableDays: number }).stableDays).toBeGreaterThanOrEqual(2);
  });

  it("промежуточная зона (0.005; 0.010] выше targetFg трактуется как possibly_stuck (осторожная сторона, П5)", () => {
    const points = [
      pt(sessionStartTs, 0, 1.052),
      pt(sessionStartTs, 24, 1.03),
      pt(sessionStartTs, 48, 1.017),
      pt(sessionStartTs, 72, 1.0172),
      pt(sessionStartTs, 96, 1.017),
      pt(sessionStartTs, 120, 1.0168)
    ];
    // targetFg=1.010 → diff=0.0068, между DONE_NEAR_TARGET_SG и STUCK_ABOVE_TARGET_SG.
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: 1.01, nowMs })).toEqual({ kind: "possibly_stuck" });
  });

  it("change чуть меньше STABILITY_MAX_CHANGE_SG всё ещё стабильно (≤, без float-шатания на самом пороге)", () => {
    const points = [
      pt(sessionStartTs, 0, 1.052),
      pt(sessionStartTs, 48, 1.02),
      pt(sessionStartTs, 72, 1.01 + STABILITY_MAX_CHANGE_SG - 0.0002),
      pt(sessionStartTs, 120, 1.01)
    ];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs }).kind).toBe("likely_done");
  });
});

describe("computeFermentVerdict — по ручным замерам (sessionStartTs=null, F7 паритет)", () => {
  it("2 замера с явным падением, без стабильного хвоста → active (рейт от первого ко второму)", () => {
    const t0 = 1_000 * DAY_MS; // произвольная эпоха
    const points = [
      { ts: t0, gravitySg: 1.05 },
      { ts: t0 + 3 * DAY_MS, gravitySg: 1.02 }
    ];
    const nowMs = t0 + 3 * DAY_MS;
    // rate = (1.050-1.020)/72ч*24 = 0.010/сутки ≥ ACTIVE_RATE_SG_PER_DAY.
    expect(computeFermentVerdict({ points, sessionStartTs: null, targetFg: null, nowMs })).toEqual({ kind: "active" });
  });

  it("3 замера, последние два близки и дают ≥48ч стабильности → likely_done по ручным данным", () => {
    const t0 = 1_000 * DAY_MS;
    const points = [
      { ts: t0, gravitySg: 1.05 },
      { ts: t0 + 5 * DAY_MS, gravitySg: 1.011 },
      { ts: t0 + 7 * DAY_MS, gravitySg: 1.0105 }
    ];
    const nowMs = t0 + 7 * DAY_MS;
    expect(computeFermentVerdict({ points, sessionStartTs: null, targetFg: null, nowMs })).toEqual({ kind: "likely_done", stableDays: 2 });
  });

  it("ровно 1 замер → insufficient_data (без сеанса нет grace-периода)", () => {
    const points = [{ ts: 0, gravitySg: 1.05 }];
    expect(computeFermentVerdict({ points, sessionStartTs: null, targetFg: null, nowMs: 10 * HOUR_MS })).toEqual({
      kind: "insufficient_data"
    });
  });
});

describe("computeFermentVerdict — недостаток данных", () => {
  it("пустой массив, сеанса нет → insufficient_data", () => {
    expect(computeFermentVerdict({ points: [], sessionStartTs: null, targetFg: null, nowMs: 0 })).toEqual({
      kind: "insufficient_data"
    });
  });

  it("1 точка при живом сеансе <36ч → awaiting_start (исключение из правила «мало точек»)", () => {
    const sessionStartTs = 0;
    const points = [{ ts: 0, gravitySg: 1.05 }];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs: 5 * HOUR_MS })).toEqual({
      kind: "awaiting_start"
    });
  });

  it("пустой массив при живом сеансе <36ч → тоже awaiting_start", () => {
    const sessionStartTs = 0;
    expect(computeFermentVerdict({ points: [], sessionStartTs, targetFg: null, nowMs: 5 * HOUR_MS })).toEqual({
      kind: "awaiting_start"
    });
  });

  it("1 точка при сеансе ≥36ч → insufficient_data (не not_started — данных даже на «не началось» не хватает)", () => {
    const sessionStartTs = 0;
    const points = [{ ts: 0, gravitySg: 1.05 }];
    expect(computeFermentVerdict({ points, sessionStartTs, targetFg: null, nowMs: 40 * HOUR_MS })).toEqual({
      kind: "insufficient_data"
    });
  });
});

// Именованные пороги должны быть реально используемым контрактом (а не «магическими числами»
// в тестах) — сверяем значения констант с таблицей F5 спеки на случай будущей правки одного
// без другого.
describe("константы соответствуют таблице F5", () => {
  it("значения порогов", () => {
    expect(AWAITING_START_HOURS).toBe(36);
    expect(START_DROP_THRESHOLD_SG).toBeCloseTo(0.003, 5);
    expect(ACTIVE_RATE_SG_PER_DAY).toBeCloseTo(0.002, 5);
    expect(SLOWING_RATE_SG_PER_DAY).toBeCloseTo(0.0005, 5);
    expect(STABILITY_MAX_CHANGE_SG).toBeCloseTo(0.0015, 5);
    expect(STUCK_ABOVE_TARGET_SG).toBeCloseTo(0.01, 5);
    expect(DONE_NEAR_TARGET_SG).toBeCloseTo(0.005, 5);
  });
});
