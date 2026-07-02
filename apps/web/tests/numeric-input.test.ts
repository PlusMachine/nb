import { describe, expect, it } from "vitest";

import { filterNumericInputText } from "../components/shared/numeric-input";

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
