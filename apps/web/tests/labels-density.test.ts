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

  it("паттерн: минимальный элемент ≥ 2 px при 203 dpi на всех уровнях", () => {
    for (let level = 0; level < DITHER_LEVEL_COUNT; level += 1) {
      const svg = ditherPatternDef(`p${level}`, level, 203);
      const rects = [...svg.matchAll(/<rect[^>]*width="(\d+)" height="(\d+)"/g)];
      expect(rects.length).toBe(2);
      // Вторая rect — «точка» (чёрная или белая).
      const dot = rects[1];
      expect(Number(dot[1])).toBeGreaterThanOrEqual(2);
      expect(Number(dot[2])).toBeGreaterThanOrEqual(2);
    }
  });
});
