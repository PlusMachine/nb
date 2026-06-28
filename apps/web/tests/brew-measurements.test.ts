import { describe, expect, it } from "vitest";

import { summarizeBrewMeasurements } from "../features/brew-batches/measurements";
import type { BrewMeasurementDto } from "../features/brew-batches/contracts";

const reading = (gravitySg: number, takenAtIso: string, id = takenAtIso): BrewMeasurementDto => ({
  id,
  brewBatchId: "b-1",
  gravitySg,
  takenAt: new Date(takenAtIso),
  note: null,
  createdAt: new Date(takenAtIso)
});

const targets = { og: 1.052, fg: 1.012, abv: 5.2 };

describe("summarizeBrewMeasurements", () => {
  it("returns nulls and passes through targets when there are no readings", () => {
    const summary = summarizeBrewMeasurements([], targets);
    expect(summary.og).toBeNull();
    expect(summary.fg).toBeNull();
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
    expect(summary.target).toEqual(targets);
  });

  it("with a single reading sets OG but leaves FG/ABV null", () => {
    const summary = summarizeBrewMeasurements([reading(1.05, "2026-06-01T10:00:00Z")], targets);
    expect(summary.og).toBe(1.05);
    expect(summary.fg).toBeNull();
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
  });

  it("derives OG=earliest, FG=latest and computes ABV + apparent attenuation", () => {
    const summary = summarizeBrewMeasurements([
      reading(1.05, "2026-06-01T10:00:00Z"),
      reading(1.01, "2026-06-10T10:00:00Z")
    ], targets);
    expect(summary.og).toBe(1.05);
    expect(summary.fg).toBe(1.01);
    expect(summary.abv).toBeCloseTo(5.25, 2); // (1.05-1.01)*131.25
    expect(summary.apparentAttenuation).toBeCloseTo(80, 1); // (0.04/0.05)*100
  });

  it("sorts by takenAt regardless of input order (latest reading is FG)", () => {
    const summary = summarizeBrewMeasurements([
      reading(1.012, "2026-06-12T10:00:00Z"),
      reading(1.055, "2026-06-01T10:00:00Z"),
      reading(1.02, "2026-06-06T10:00:00Z")
    ], null);
    expect(summary.og).toBe(1.055);
    expect(summary.fg).toBe(1.012);
    expect(summary.target).toBeNull();
  });

  it("guards nonsensical data (fg >= og) → no ABV/attenuation", () => {
    const summary = summarizeBrewMeasurements([
      reading(1.01, "2026-06-01T10:00:00Z"),
      reading(1.05, "2026-06-10T10:00:00Z")
    ], targets);
    expect(summary.og).toBe(1.01);
    expect(summary.fg).toBe(1.05);
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
  });
});
