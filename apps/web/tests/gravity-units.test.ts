import { describe, expect, it } from "vitest";

import {
  defaultPreferredGravityUnit,
  formatGravity,
  resolvePreferredGravityUnit,
  toAbvGravityUnit,
  toCalculatorGravityUnit
} from "../features/system/gravity-units";

describe("gravity unit helpers", () => {
  it("defaults preferred gravity unit to plato", () => {
    expect(defaultPreferredGravityUnit).toBe("plato");
    expect(resolvePreferredGravityUnit(undefined)).toBe("plato");
    expect(resolvePreferredGravityUnit("SG")).toBe("sg");
    expect(resolvePreferredGravityUnit("brix")).toBe("brix");
    expect(resolvePreferredGravityUnit("not-a-unit")).toBe("plato");
  });

  it("maps preferred units onto calculator gravity units", () => {
    expect(toCalculatorGravityUnit("sg")).toBe("SG");
    expect(toCalculatorGravityUnit("plato")).toBe("Plato");
    expect(toCalculatorGravityUnit("brix")).toBe("Brix");
    // ABV-калькулятор не поддерживает Brix — откат на Plato (числа те же).
    expect(toAbvGravityUnit("brix")).toBe("Plato");
    expect(toAbvGravityUnit("sg")).toBe("SG");
  });

  it("formats a single value in the preferred unit, no duplication", () => {
    expect(formatGravity(1.05, "sg")).toBe("1.050");
    expect(formatGravity(1.05, "plato")).toBe("12.4 °P");
    expect(formatGravity(1.05, "brix")).toBe("12.4 °Bx");
  });

  it("clamps sub-1.000 SG display values to zero for plato/brix", () => {
    expect(formatGravity(0.998, "plato")).toBe("0.0 °P");
    expect(formatGravity(0.998, "brix")).toBe("0.0 °Bx");
  });

  it("returns an em dash for null values in any unit", () => {
    expect(formatGravity(null, "sg")).toBe("—");
    expect(formatGravity(null, "plato")).toBe("—");
    expect(formatGravity(null, "brix")).toBe("—");
  });
});
