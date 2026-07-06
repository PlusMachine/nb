import { describe, expect, it } from "vitest";

import {
  convertGravityFieldValue,
  defaultPreferredGravityUnit,
  formatGravity,
  formatGravityRangeSecondary,
  formatGravitySecondary,
  fromCalculatorGravityUnit,
  resolvePreferredGravityUnit,
  secondaryGravityUnit,
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

  it("keeps legit negative plato/brix for sub-1.000 SG, normalizing only the -0.0 artifact", () => {
    // FG ниже 1.000 SG — реальный замер очень сухого пива, обнулять его нельзя.
    expect(formatGravity(0.998, "plato")).toBe("-0.5 °P");
    expect(formatGravity(0.998, "brix")).toBe("-0.5 °Bx");
    // sgToPlato(1.000) ≈ −0.003 — артефакт полинома, «−0.0» приводится к «0.0».
    expect(formatGravity(1.0, "plato")).toBe("0.0 °P");
  });

  it("returns an em dash for null values in any unit", () => {
    expect(formatGravity(null, "sg")).toBe("—");
    expect(formatGravity(null, "plato")).toBe("—");
    expect(formatGravity(null, "brix")).toBe("—");
  });
});

describe("secondary gravity layer", () => {
  it("pairs SG with Plato and Plato/Brix with SG", () => {
    expect(secondaryGravityUnit("sg")).toBe("plato");
    expect(secondaryGravityUnit("plato")).toBe("sg");
    // Brix численно равен Plato, поэтому его вторая единица — SG, не Plato.
    expect(secondaryGravityUnit("brix")).toBe("sg");
  });

  it("formats the secondary value with an explicit SG suffix", () => {
    expect(formatGravitySecondary(1.05, "plato")).toBe("1.050 SG");
    expect(formatGravitySecondary(1.05, "brix")).toBe("1.050 SG");
    expect(formatGravitySecondary(1.05, "sg")).toBe("12.4 °P");
    expect(formatGravitySecondary(null, "plato")).toBeNull();
  });

  it("formats secondary ranges symmetrically to formatGravityRange", () => {
    expect(formatGravityRangeSecondary(1.009, 1.014, "plato")).toBe("1.009–1.014 SG");
    expect(formatGravityRangeSecondary(1.044, 1.052, "sg")).toBe("11.0–12.9 °P");
    expect(formatGravityRangeSecondary(null, 1.014, "plato")).toBeNull();
  });

  it("maps calculator units back onto preferred units", () => {
    expect(fromCalculatorGravityUnit("SG")).toBe("sg");
    expect(fromCalculatorGravityUnit("Plato")).toBe("plato");
    expect(fromCalculatorGravityUnit("Brix")).toBe("brix");
  });
});

describe("convertGravityFieldValue", () => {
  it("converts field values between units", () => {
    expect(convertGravityFieldValue("1.050", "SG", "Plato")).toBe("12.4");
    expect(convertGravityFieldValue("12.4", "Plato", "SG")).toBe("1.050");
    expect(convertGravityFieldValue("12.4", "Brix", "SG")).toBe("1.050");
    expect(convertGravityFieldValue("12.4", "Plato", "Brix")).toBe("12.4");
  });

  it("keeps empty and non-numeric input untouched", () => {
    expect(convertGravityFieldValue("", "SG", "Plato")).toBe("");
    expect(convertGravityFieldValue("abc", "SG", "Plato")).toBe("abc");
    expect(convertGravityFieldValue(undefined, "SG", "Plato")).toBe("");
    expect(convertGravityFieldValue("1.050", "SG", "SG")).toBe("1.050");
  });

  it("parses comma decimals the same way NumericInput does on blur", () => {
    expect(convertGravityFieldValue("12,4", "Plato", "SG")).toBe("1.050");
    expect(convertGravityFieldValue("1,050", "SG", "Plato")).toBe("12.4");
  });

  it("converts zero and negative plato/brix, skipping only junk SG input", () => {
    expect(convertGravityFieldValue("0", "Plato", "SG")).toBe("1.000");
    expect(convertGravityFieldValue("-1.3", "Plato", "SG")).toBe("0.995");
    expect(convertGravityFieldValue("0.995", "SG", "Plato")).toBe("-1.3");
    // SG ≤ 0 — заведомо неполный ввод, не трогаем.
    expect(convertGravityFieldValue("0", "SG", "Plato")).toBe("0");
    expect(convertGravityFieldValue("-1", "SG", "Plato")).toBe("-1");
  });
});
