import { describe, expect, it } from "vitest";

import {
  barToPsi,
  carbonationStyleById,
  celsiusToFahrenheit,
  co2Zone,
  fahrenheitToCelsius,
  kegCo2Volumes,
  kegPressurePsi,
  matchCarbonationStyles,
  psiToBar,
  PSI_PER_BAR
} from "./carbonation";

describe("kegPressurePsi / kegCo2Volumes", () => {
  it("прямая формула на опорной точке: ~2.75 об. при 4 °C и 1.0 бар", () => {
    // 1.0 бар gauge при 4 °C по keg-полиному даёт ≈2.75 об. (пример из ТЗ «≈2.5» был
    // ориентировочным — здесь зафиксировано фактическое значение модели-источника истины).
    expect(kegCo2Volumes(4, barToPsi(1.0))).toBeCloseTo(2.7474, 3);
  });

  it("прямая формула: 0 °C, 0.4 бар — зона стандартная у нижней границы", () => {
    const volumes = kegCo2Volumes(0, barToPsi(0.4));
    expect(volumes).toBeCloseTo(2.2448, 3);
    expect(co2Zone(volumes)).toBe("standard");
  });

  it("шпунтование при температуре брожения: 20 °C и 2.4 об. → ≈1.8 бар", () => {
    expect(psiToBar(kegPressurePsi(20, 2.4))).toBeCloseTo(1.798, 2);
  });

  it("обратная — точная инверсия прямой (round-trip P→V→P)", () => {
    for (const tempC of [0, 4, 7, 10, 14, 17, 20]) {
      for (const pressurePsi of [5, 10, 14.5, 20]) {
        const volumes = kegCo2Volumes(tempC, pressurePsi);
        expect(kegPressurePsi(tempC, volumes)).toBeCloseTo(pressurePsi, 6);
      }
    }
  });

  it("обратная — точная инверсия прямой (round-trip V→P→V)", () => {
    for (const tempC of [0, 4, 7, 10, 14, 17, 20]) {
      for (const volumes of [1.5, 2.0, 2.5, 3.0, 3.5]) {
        const pressurePsi = kegPressurePsi(tempC, volumes);
        expect(kegCo2Volumes(tempC, pressurePsi)).toBeCloseTo(volumes, 6);
      }
    }
  });

  it("недостижимая цель (тёплое пиво + низкие объёмы) → давление ≤ 0", () => {
    expect(kegPressurePsi(20, 0.5)).toBeLessThanOrEqual(0);
  });
});

describe("конвертации единиц", () => {
  it("bar ↔ psi по точному коэффициенту", () => {
    expect(barToPsi(1)).toBeCloseTo(14.5037738, 6);
    expect(psiToBar(PSI_PER_BAR)).toBeCloseTo(1, 9);
    expect(psiToBar(barToPsi(2.3))).toBeCloseTo(2.3, 9);
  });

  it("°C ↔ °F стандартно", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(fahrenheitToCelsius(32)).toBe(0);
    expect(fahrenheitToCelsius(celsiusToFahrenheit(4))).toBeCloseTo(4, 9);
  });
});

describe("зоны карбонизации", () => {
  it("границы зон", () => {
    expect(co2Zone(1.9)).toBe("low");
    expect(co2Zone(2.0)).toBe("standard");
    expect(co2Zone(2.59)).toBe("standard");
    expect(co2Zone(2.6)).toBe("lively");
    expect(co2Zone(3.4)).toBe("lively");
    expect(co2Zone(3.41)).toBe("high");
  });
});

describe("matchCarbonationStyles", () => {
  it("границы диапазонов включительно", () => {
    // Лагер/пилснер 2.4–2.6 — обе границы попадают.
    expect(matchCarbonationStyles(2.4).map((s) => s.id)).toContain("lager-pilsner");
    expect(matchCarbonationStyles(2.6).map((s) => s.id)).toContain("lager-pilsner");
    // 2.5 попадает и в лагер (2.4–2.6), и в IPA (2.3–2.7).
    const ids = matchCarbonationStyles(2.5).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["lager-pilsner", "ipa-pale-ale"]));
    // Между диапазонами пусто (2.85 не входит ни в один).
    expect(matchCarbonationStyles(2.85)).toEqual([]);
  });

  it("carbonationStyleById", () => {
    expect(carbonationStyleById("saison")?.maxVolumes).toBe(4.0);
    expect(carbonationStyleById("nope")).toBeNull();
  });
});
