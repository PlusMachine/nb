import { describe, expect, it } from "vitest";
import {
  convertGravity,
  convertTemperature,
  convertTime,
  convertVolume,
  convertWeight,
  platoToSg,
  sgToPlato
} from "./conversions";

describe("unit conversions", () => {
  it("converts weight between metric and imperial", () => {
    expect(convertWeight({ value: 1, unit: "kg" }, "g").value).toBe(1000);
    expect(convertWeight({ value: 16, unit: "oz" }, "lb").value).toBe(1);
  });

  it("converts volume and time", () => {
    expect(convertVolume({ value: 1, unit: "gal" }, "l").value).toBe(3.785);
    expect(convertTime({ value: 90, unit: "min" }, "sec").value).toBe(5400);
  });

  it("converts temperature", () => {
    expect(convertTemperature({ value: 20, unit: "c" }, "f").value).toBe(68);
    expect(convertTemperature({ value: 212, unit: "f" }, "c").value).toBe(100);
  });

  it("converts gravity between sg and plato", () => {
    expect(sgToPlato(1.05)).toBeCloseTo(12.39, 2);
    expect(platoToSg(12.39)).toBeCloseTo(1.05, 3);
    expect(convertGravity({ value: 1.05, unit: "sg" }, "plato").unit).toBe("plato");
  });
});
