import { describe, expect, it } from "vitest";

import { FAULT_BITS } from "@nb/brewforge-protocol";

import { summarizeFaults, sortActiveFaults } from "./faults";

describe("summarizeFaults", () => {
  it("нет аварий — count 0, top null", () => {
    expect(summarizeFaults(0)).toEqual({ count: 0, top: null });
  });

  it("одна авария среднего приоритета", () => {
    expect(summarizeFaults(FAULT_BITS.STAGE_TO)).toEqual({ count: 1, top: "medium" });
  });

  it("наивысший приоритет побеждает при нескольких активных", () => {
    const mask = FAULT_BITS.STAGE_TO | FAULT_BITS.SENSOR | FAULT_BITS.OVERHEAT_ABS;
    expect(summarizeFaults(mask)).toEqual({ count: 3, top: "critical" });
  });

  it("high без critical даёт top=high", () => {
    const mask = FAULT_BITS.STAGE_TO | FAULT_BITS.SENSOR;
    expect(summarizeFaults(mask)).toEqual({ count: 2, top: "high" });
  });
});

describe("sortActiveFaults", () => {
  it("сортирует critical → high → medium", () => {
    const mask = FAULT_BITS.STAGE_TO | FAULT_BITS.SENSOR | FAULT_BITS.ESTOP;
    const sorted = sortActiveFaults(mask);
    expect(sorted[0]).toBe("ESTOP"); // critical
    expect(sorted[sorted.length - 1]).toBe("STAGE_TO"); // medium
  });
});
