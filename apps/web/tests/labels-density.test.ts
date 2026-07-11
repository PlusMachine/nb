import { describe, expect, it } from "vitest";

import { DITHER_LEVEL_COUNT, ditherPatternDef, ebcToDitherLevel, ebcToInkDensity } from "../features/labels/density";

describe("EBC → плотность дизеринга", () => {
  it("границы: вода/светлый лагер почти белые, стаут почти чёрный", () => {
    expect(ebcToInkDensity(0)).toBeCloseTo(0.06, 2);
    expect(ebcToInkDensity(4)).toBeLessThan(0.2);
    expect(ebcToInkDensity(80)).toBeCloseTo(0.97, 2);
    expect(ebcToInkDensity(200)).toBeCloseTo(0.97, 2);
    expect(ebcToInkDensity(-5)).toBeCloseTo(0.06, 2);
  });

  it("монотонность плотности и уровней по всей шкале", () => {
    let prevDensity = -1;
    let prevLevel = -1;
    for (let ebc = 0; ebc <= 120; ebc += 1) {
      const density = ebcToInkDensity(ebc);
      const level = ebcToDitherLevel(ebc);
      expect(density).toBeGreaterThanOrEqual(prevDensity);
      expect(level).toBeGreaterThanOrEqual(prevLevel);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThan(DITHER_LEVEL_COUNT);
      prevDensity = density;
      prevLevel = level;
    }
  });

  it("края шкалы попадают в крайние уровни", () => {
    expect(ebcToDitherLevel(0)).toBe(0);
    expect(ebcToDitherLevel(80)).toBe(DITHER_LEVEL_COUNT - 1);
  });

  it("паттерн: точка ≥ 2 px при 203 dpi на всех уровнях", () => {
    for (let level = 0; level < DITHER_LEVEL_COUNT; level += 1) {
      const svg = ditherPatternDef(`p${level}`, level, 203);
      for (const match of svg.matchAll(/<rect[^>]*width="(\d+)" height="(\d+)"/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(2);
        expect(Number(match[2])).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // Тон кодируется числом точек в ячейке 4×4: иначе светлые уровни при 203 dpi
  // сливались в один узор (доступны только диаметры 2, 3, 4 px).
  const countDots = (svg: string): number => [...svg.matchAll(/<rect x="\d+" y="\d+"/g)].length;

  it("число точек в ячейке растёт с уровнем и различает соседние уровни", () => {
    const counts = Array.from({ length: DITHER_LEVEL_COUNT }, (_, level) => countDots(ditherPatternDef(`p${level}`, level, 203)));
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    }
    // Края не вырождаются в чистый белый / сплошной чёрный.
    expect(counts[0]).toBeGreaterThanOrEqual(1);
    expect(counts[counts.length - 1]).toBeLessThanOrEqual(15);
  });

  it("светлая половина шкалы различима: уровни 0–4 дают разные узоры", () => {
    const svgs = [0, 1, 2, 3, 4].map((level) => ditherPatternDef("p", level, 203));
    expect(new Set(svgs).size).toBe(svgs.length);
  });
});
