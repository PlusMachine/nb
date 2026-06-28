import { describe, expect, it } from "vitest";

import {
  resolveBrewNudge,
  russianDays,
  STALE_MEASUREMENT_DAYS,
  type BrewNudgeInput
} from "../features/brew-batches/dashboard";
import type { BrewBatchStatus } from "../features/brew-batches/contracts";

const NOW = new Date("2026-06-28T12:00:00Z");

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const make = (status: BrewBatchStatus, overrides: Partial<BrewNudgeInput> = {}): BrewNudgeInput => ({
  status,
  plannedFor: null,
  startedAt: null,
  createdAt: daysAgo(1),
  lastMeasurementAt: null,
  measurementCount: 0,
  ...overrides
});

describe("russianDays", () => {
  it.each([
    [1, "день"],
    [2, "дня"],
    [3, "дня"],
    [4, "дня"],
    [5, "дней"],
    [11, "дней"],
    [12, "дней"],
    [14, "дней"],
    [21, "день"],
    [22, "дня"],
    [25, "дней"]
  ])("%i → %s", (n, expected) => {
    expect(russianDays(n)).toBe(expected);
  });
});

describe("resolveBrewNudge — planned", () => {
  it("flags a past-due planned brew as action", () => {
    const nudge = resolveBrewNudge(make("planned", { plannedFor: daysAgo(1) }), NOW);
    expect(nudge).toEqual({ tone: "action", text: "Пора начинать варку" });
  });

  it("keeps a future planned brew as info", () => {
    const future = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    const nudge = resolveBrewNudge(make("planned", { plannedFor: future }), NOW);
    expect(nudge).toEqual({ tone: "info", text: "Запланирована" });
  });

  it("treats a planned brew without a date as ready to start", () => {
    const nudge = resolveBrewNudge(make("planned"), NOW);
    expect(nudge).toEqual({ tone: "info", text: "Готова к старту" });
  });
});

describe("resolveBrewNudge — brewing", () => {
  it("asks for OG when there are no measurements", () => {
    const nudge = resolveBrewNudge(make("brewing"), NOW);
    expect(nudge.tone).toBe("action");
    expect(nudge.text).toContain("OG");
  });

  it("is quiet info once a measurement exists", () => {
    const nudge = resolveBrewNudge(make("brewing", { measurementCount: 1, lastMeasurementAt: daysAgo(0) }), NOW);
    expect(nudge).toEqual({ tone: "info", text: "Идёт варка" });
  });
});

describe("resolveBrewNudge — fermenting", () => {
  it("asks for OG when fermenting without any measurement", () => {
    const nudge = resolveBrewNudge(make("fermenting", { startedAt: daysAgo(10) }), NOW);
    expect(nudge.tone).toBe("action");
    expect(nudge.text).toContain("OG");
  });

  it("warns when the last measurement is stale", () => {
    const nudge = resolveBrewNudge(
      make("fermenting", { measurementCount: 1, lastMeasurementAt: daysAgo(STALE_MEASUREMENT_DAYS) }),
      NOW
    );
    expect(nudge.tone).toBe("warn");
    expect(nudge.text).toBe(`${STALE_MEASUREMENT_DAYS} ${russianDays(STALE_MEASUREMENT_DAYS)} без замера — проверьте FG`);
  });

  it("stays info while measurements are fresh", () => {
    const nudge = resolveBrewNudge(
      make("fermenting", { measurementCount: 2, lastMeasurementAt: daysAgo(1) }),
      NOW
    );
    expect(nudge).toEqual({ tone: "info", text: "Брожение идёт" });
  });

  it("falls back to startedAt for staleness when lastMeasurementAt is missing but count > 0", () => {
    // measurementCount can be >0 with a null aggregate only in edge cases; guard the fallback chain.
    const nudge = resolveBrewNudge(
      make("fermenting", { measurementCount: 1, lastMeasurementAt: null, startedAt: daysAgo(9) }),
      NOW
    );
    expect(nudge.tone).toBe("warn");
  });
});
