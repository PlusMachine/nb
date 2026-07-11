import { describe, expect, it } from "vitest";

import { computeHydrometerView } from "../features/calculators/definitions";
import { convertGravityOffsetValue } from "../features/system/gravity-units";

describe("computeHydrometerView: фолбэки и шкалы", () => {
  it("пустое показание — фолбэк в текущей шкале, а не 1.05 как °P", () => {
    const view = computeHydrometerView({ reading: "", readingUnit: "Plato", sampleTemperatureC: 20, calibrationTemperatureC: 20 });

    expect(view.rawInUnit).toBe(12.4);
    expect(view.correctedSg).toBeCloseTo(1.05, 2);
  });

  it("пустое показание в SG — прежний фолбэк 1.05", () => {
    const view = computeHydrometerView({ reading: "", readingUnit: "SG", sampleTemperatureC: 20, calibrationTemperatureC: 20 });

    expect(view.rawInUnit).toBe(1.05);
  });

  it("поправка прибора трактуется в шкале показания: 0.5 °P ≈ +0.002 SG, а не +0.5 SG", () => {
    const base = { reading: 12.4, readingUnit: "Plato", sampleTemperatureC: 20, calibrationTemperatureC: 20 };

    const withOffset = computeHydrometerView({ ...base, offset: 0.5 });
    const without = computeHydrometerView(base);

    expect(withOffset.correctedSg - without.correctedSg).toBeCloseTo(0.002, 3);
    expect(withOffset.offsetInUnit).toBe(0.5);
  });

  it("поправка прибора в SG применяется как есть", () => {
    const view = computeHydrometerView({ reading: 1.05, readingUnit: "SG", sampleTemperatureC: 20, calibrationTemperatureC: 20, offset: -0.002 });

    expect(view.correctedSg).toBeCloseTo(1.048, 4);
  });
});

describe("computeHydrometerView: диапазон температуры пробы", () => {
  const base = { reading: 1.05, readingUnit: "SG", calibrationTemperatureC: 20 };

  it("обычные температуры — ok", () => {
    expect(computeHydrometerView({ ...base, sampleTemperatureC: 30 }).sampleTempBand).toBe("ok");
    expect(computeHydrometerView({ ...base, sampleTemperatureC: 60 }).sampleTempBand).toBe("ok");
  });

  it("выше 60 °C — hot (замер ненадёжен, поправка не спасает)", () => {
    expect(computeHydrometerView({ ...base, sampleTemperatureC: 75 }).sampleTempBand).toBe("hot");
  });

  it("вне жидкой воды (0–100 °C) — out_of_range", () => {
    expect(computeHydrometerView({ ...base, sampleTemperatureC: 120 }).sampleTempBand).toBe("out_of_range");
    expect(computeHydrometerView({ ...base, sampleTemperatureC: -5 }).sampleTempBand).toBe("out_of_range");
  });
});

// Дельта конвертируется с якорем на воде (1.000 SG ↔ 0 °P), а не как абсолютная плотность.
describe("convertGravityOffsetValue", () => {
  it("SG → Plato и обратно, ноль остаётся нулём", () => {
    expect(Number(convertGravityOffsetValue(0.002, "SG", "Plato"))).toBeCloseTo(0.51, 1);
    expect(Number(convertGravityOffsetValue(0.51, "Plato", "SG"))).toBeCloseTo(0.002, 3);
    expect(Number(convertGravityOffsetValue(0, "SG", "Plato"))).toBe(0);
    expect(Number(convertGravityOffsetValue(0, "Plato", "SG"))).toBe(0);
  });

  it("отрицательная дельта сохраняет знак", () => {
    expect(Number(convertGravityOffsetValue(-0.002, "SG", "Plato"))).toBeCloseTo(-0.51, 1);
  });

  it("Plato ↔ Brix — одна шкала, значение не меняется", () => {
    expect(convertGravityOffsetValue(0.5, "Plato", "Brix")).toBe("0.5");
  });

  it("пустое/мусорное значение возвращается как есть", () => {
    expect(convertGravityOffsetValue("", "SG", "Plato")).toBe("");
    expect(convertGravityOffsetValue("abc", "SG", "Plato")).toBe("abc");
  });
});
