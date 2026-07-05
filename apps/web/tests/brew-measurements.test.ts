import { describe, expect, it } from "vitest";

import { summarizeBrewMeasurements } from "../features/brew-batches/measurements";
import type { BrewMeasurementDto } from "../features/brew-batches/contracts";

const reading = (
  gravitySg: number,
  takenAtIso: string,
  { isFinal = false, id = takenAtIso }: { isFinal?: boolean; id?: string } = {}
): BrewMeasurementDto => ({
  id,
  brewBatchId: "b-1",
  gravitySg,
  takenAt: new Date(takenAtIso),
  isFinal,
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

  it("with a single non-final reading sets OG but leaves FG/ABV null", () => {
    const summary = summarizeBrewMeasurements([reading(1.05, "2026-06-01T10:00:00Z")], targets);
    expect(summary.og).toBe(1.05);
    expect(summary.fg).toBeNull();
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
  });

  it("intermediate readings never become FG until one is flagged isFinal", () => {
    const during = summarizeBrewMeasurements([
      reading(1.05, "2026-06-01T10:00:00Z"),
      reading(1.02, "2026-06-05T10:00:00Z"),
      reading(1.014, "2026-06-08T10:00:00Z")
    ], targets);
    // Ни один замер не помечен финальным → FG/ABV не выводятся, хотя замеров ≥2.
    expect(during.og).toBe(1.05);
    expect(during.fg).toBeNull();
    expect(during.abv).toBeNull();
    expect(during.apparentAttenuation).toBeNull();
  });

  it("FG comes from the isFinal flag, not from order/time", () => {
    // Финальным помечен ранний по времени замер, а не самый поздний.
    const summary = summarizeBrewMeasurements([
      reading(1.012, "2026-06-06T10:00:00Z", { isFinal: true }),
      reading(1.055, "2026-06-01T10:00:00Z"),
      reading(1.02, "2026-06-12T10:00:00Z")
    ], null);
    expect(summary.og).toBe(1.055); // самый ранний по takenAt
    expect(summary.fg).toBe(1.012); // помеченный isFinal, хотя он не последний
    expect(summary.target).toBeNull();
  });

  it("derives OG=earliest, FG=flagged reading and computes ABV + apparent attenuation", () => {
    const summary = summarizeBrewMeasurements([
      reading(1.05, "2026-06-01T10:00:00Z"),
      reading(1.01, "2026-06-10T10:00:00Z", { isFinal: true })
    ], targets);
    expect(summary.og).toBe(1.05);
    expect(summary.fg).toBe(1.01);
    expect(summary.abv).toBeCloseTo(5.25, 2); // (1.05-1.01)*131.25
    expect(summary.apparentAttenuation).toBeCloseTo(80, 1); // (0.04/0.05)*100
  });

  it("guards nonsensical data (fg >= og) → no ABV/attenuation", () => {
    const summary = summarizeBrewMeasurements([
      reading(1.01, "2026-06-01T10:00:00Z"),
      reading(1.05, "2026-06-10T10:00:00Z", { isFinal: true })
    ], targets);
    expect(summary.og).toBe(1.01);
    expect(summary.fg).toBe(1.05);
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
  });
});
