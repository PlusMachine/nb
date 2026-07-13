import { describe, expect, it } from "vitest";

import { filterNumericInputText, stepNumericValue } from "../components/shared/numeric-input";

describe("filterNumericInputText", () => {
  it("keeps plain digits as-is", () => {
    expect(filterNumericInputText("1234")).toBe("1234");
  });

  it("strips non-numeric characters", () => {
    expect(filterNumericInputText("12a3b")).toBe("123");
  });

  it("allows a single decimal separator and keeps it as typed", () => {
    expect(filterNumericInputText("12,5")).toBe("12,5");
    expect(filterNumericInputText("12.5")).toBe("12.5");
  });

  it("drops a second separator of either kind", () => {
    expect(filterNumericInputText("1,2,3")).toBe("1,23");
    expect(filterNumericInputText("1.2.3")).toBe("1.23");
    expect(filterNumericInputText("1,2.3")).toBe("1,23");
  });

  it("drops the decimal separator entirely for integer mode", () => {
    expect(filterNumericInputText("12,5", { integer: true })).toBe("125");
    expect(filterNumericInputText("12.5", { integer: true })).toBe("125");
  });

  it("strips a minus sign unless negative values are allowed", () => {
    expect(filterNumericInputText("-12")).toBe("12");
    expect(filterNumericInputText("-12", { allowNegative: true })).toBe("-12");
  });

  it("only keeps a leading minus, not one typed mid-string", () => {
    expect(filterNumericInputText("12-3", { allowNegative: true })).toBe("123");
  });

  it("keeps a leading minus with integer mode", () => {
    expect(filterNumericInputText("-12,5", { integer: true, allowNegative: true })).toBe("-125");
  });

  it("returns empty string for empty input", () => {
    expect(filterNumericInputText("")).toBe("");
  });
});

describe("stepNumericValue", () => {
  it("steps up and down by the given step", () => {
    expect(stepNumericValue("23", { direction: 1, step: 1 })).toBe("24");
    expect(stepNumericValue("60", { direction: -1, step: 5 })).toBe("55");
  });

  it("reads the value typed with a comma separator", () => {
    expect(stepNumericValue("72,5", { direction: 1, step: 1 })).toBe("73.5");
  });

  it("keeps the step's precision instead of a float tail", () => {
    expect(stepNumericValue("0.1", { direction: 1, step: 0.2 })).toBe("0.3");
  });

  it("clamps to min and max", () => {
    expect(stepNumericValue("100", { direction: 1, step: 1, min: 1, max: 100 })).toBe(null);
    expect(stepNumericValue("1.5", { direction: -1, step: 1, min: 1, max: 100 })).toBe("1");
  });

  it("starts from min when the field is empty", () => {
    expect(stepNumericValue("", { direction: 1, step: 1, min: 1 })).toBe("1");
    expect(stepNumericValue("", { direction: -1, step: 1, min: 1 })).toBe("1");
    expect(stepNumericValue("", { direction: 1, step: 5 })).toBe("5");
  });

  it("returns null when the value would not change", () => {
    expect(stepNumericValue("100", { direction: 1, step: 1, max: 100 })).toBe(null);
  });
});
