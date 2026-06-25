import { describe, expect, it } from "vitest";

import {
  abvBound,
  formatSliderRange,
  ibuBound,
  rangeSliderToParams,
  sliderValueFromParams
} from "../features/recipes/range-slider";

describe("sliderValueFromParams", () => {
  it("falls back to the full range when params are absent", () => {
    expect(sliderValueFromParams(null, null, abvBound)).toEqual([0, 20]);
    expect(sliderValueFromParams(null, null, ibuBound)).toEqual([0, 200]);
  });

  it("reads partial bounds from the URL", () => {
    expect(sliderValueFromParams("5.5", "7.2", abvBound)).toEqual([5.5, 7.2]);
    expect(sliderValueFromParams("20", null, ibuBound)).toEqual([20, 200]);
  });

  it("swaps reversed bounds", () => {
    expect(sliderValueFromParams("7", "5", abvBound)).toEqual([5, 7]);
  });

  it("clamps out-of-range values to the bound", () => {
    expect(sliderValueFromParams("-3", "999", abvBound)).toEqual([0, 20]);
  });
});

describe("rangeSliderToParams", () => {
  it("maps full range to no filter (both null)", () => {
    expect(rangeSliderToParams([0, 20], abvBound)).toEqual({ min: null, max: null });
    expect(rangeSliderToParams([0, 200], ibuBound)).toEqual({ min: null, max: null });
  });

  it("keeps partial ranges as strings", () => {
    expect(rangeSliderToParams([5.5, 7.2], abvBound)).toEqual({ min: "5.5", max: "7.2" });
    expect(rangeSliderToParams([0, 60], ibuBound)).toEqual({ min: null, max: "60" });
    expect(rangeSliderToParams([20, 200], ibuBound)).toEqual({ min: "20", max: null });
  });

  it("treats an edge thumb as unbounded on that side", () => {
    expect(rangeSliderToParams([0, 7], abvBound)).toEqual({ min: null, max: "7" });
  });

  it("clamps values that exceed the bound before mapping", () => {
    expect(rangeSliderToParams([-5, 999], abvBound)).toEqual({ min: null, max: null });
  });
});

describe("formatSliderRange", () => {
  it("shows «любой» at both edges", () => {
    expect(formatSliderRange([0, 20], abvBound, "%")).toBe("любой");
  });

  it("shows one-sided bounds", () => {
    expect(formatSliderRange([5.5, 20], abvBound, "%")).toBe("от 5.5 %");
    expect(formatSliderRange([0, 7], abvBound, "%")).toBe("до 7 %");
  });

  it("shows a full range", () => {
    expect(formatSliderRange([5, 7], abvBound, "%")).toBe("5 – 7 %");
    expect(formatSliderRange([20, 60], ibuBound)).toBe("20 – 60");
  });
});
