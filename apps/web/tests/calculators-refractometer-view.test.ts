import { describe, expect, it } from "vitest";

import {
  computeRefractometerView,
  convertRefractometerOgFieldValue,
  readRefractometerInput
} from "../features/calculators/definitions";

// Семантика шкал OG (фикс 2026-07-10): Brix — сырое показание рефрактометра (÷ WCF),
// SG и °P — истинная плотность (ареометр/сахаромер или рецепт, без WCF). Раньше °P
// трактовался как сырое показание, а смена шкалы конвертировала значение плоско —
// физический смысл OG молча сдвигался на WCF (~0.3% ABV при дефолтах).
describe("readRefractometerInput: маршрутизация WCF по шкале OG", () => {
  it("Brix — сырое показание: делится на WCF", () => {
    const { input, ogSg } = readRefractometerInput({
      mode: "post_fermentation", currentBrix: 6.5,
      originalValue: 12.4, originalUnit: "Brix", wortCorrectionFactor: 1.04
    });

    expect(input.originalBrix).toBe(12.4);
    expect(input.originalGravity).toBeUndefined();
    // brixToSg(12.4 / 1.04) ≈ 1.0481 — НЕ 1.0501 (что было бы без WCF)
    expect(ogSg).toBeCloseTo(1.0481, 3);
  });

  it("°P — истинная плотность: WCF не применяется (сахаромер АС-3, рецепт)", () => {
    const { input, ogSg } = readRefractometerInput({
      mode: "post_fermentation", currentBrix: 6.5,
      originalValue: 12.4, originalUnit: "Plato", wortCorrectionFactor: 1.04
    });

    expect(input.originalGravity).toBeCloseTo(1.0501, 3);
    expect(input.originalBrix).toBeUndefined();
    expect(ogSg).toBeCloseTo(1.0501, 3);
  });

  it("°P и эквивалентный SG дают одинаковый результат", () => {
    const base = { mode: "post_fermentation", currentBrix: 6.5, wortCorrectionFactor: 1.04 };
    const viaPlato = computeRefractometerView({ ...base, originalValue: 12.4, originalUnit: "Plato" });
    const viaSg = computeRefractometerView({ ...base, originalValue: 1.0501, originalUnit: "SG" });

    expect(viaPlato.ogSg).toBeCloseTo(viaSg.ogSg, 3);
    expect(viaPlato.corrected.sg).toBeCloseTo(viaSg.corrected.sg, 3);
    expect(viaPlato.estimatedABV).toBeCloseTo(viaSg.estimatedABV, 1);
  });
});

describe("convertRefractometerOgFieldValue: смена шкалы OG сохраняет физический смысл", () => {
  const state = { wortCorrectionFactor: 1.04 };

  it("Brix → SG: сырое показание делится на WCF (12.4 → 1.048, не 1.050)", () => {
    expect(convertRefractometerOgFieldValue(state, "12.4", "Brix", "SG")).toBe("1.048");
  });

  it("SG → Brix: истинная плотность умножается на WCF (сырое показание прибора)", () => {
    const raw = Number(convertRefractometerOgFieldValue(state, "1.048", "SG", "Brix"));
    expect(raw).toBeCloseTo(12.4, 0.5);
    expect(raw).toBeGreaterThan(12.2);
  });

  it("°P → Brix: истинный Plato ≈ истинный Brix, наружу — сырое показание ×WCF", () => {
    const raw = Number(convertRefractometerOgFieldValue(state, "12.4", "Plato", "Brix"));
    expect(raw).toBeCloseTo(12.4 * 1.04, 1);
  });

  it("SG ↔ °P: обе шкалы истинные — обычная конверсия без WCF", () => {
    expect(convertRefractometerOgFieldValue(state, "1.050", "SG", "Plato")).toBe("12.4");
    expect(convertRefractometerOgFieldValue(state, "12.4", "Plato", "SG")).toBe("1.050");
  });

  it("переключение шкалы не меняет ogSg (регрессия: раньше ABV сдвигался на ~0.3%)", () => {
    const before = readRefractometerInput({
      mode: "post_fermentation", currentBrix: 6.5,
      originalValue: 12.4, originalUnit: "Brix", wortCorrectionFactor: 1.04
    });
    const converted = convertRefractometerOgFieldValue(
      { wortCorrectionFactor: 1.04 }, "12.4", "Brix", "SG"
    );
    const after = readRefractometerInput({
      mode: "post_fermentation", currentBrix: 6.5,
      originalValue: converted, originalUnit: "SG", wortCorrectionFactor: 1.04
    });

    // Точность ограничена округлением поля до 0.001 SG
    expect(after.ogSg).toBeCloseTo(before.ogSg, 3);
  });

  it("пустое/мусорное значение возвращается как есть, не мешая набору", () => {
    expect(convertRefractometerOgFieldValue(state, "", "Brix", "SG")).toBe("");
    expect(convertRefractometerOgFieldValue(state, "abc", "Brix", "SG")).toBe("abc");
  });

  it("«12,4» с запятой посреди набора тоже конвертируется", () => {
    expect(convertRefractometerOgFieldValue(state, "12,4", "Brix", "SG")).toBe("1.048");
  });

  it("WCF ≤ 0 или пустой — фолбэк на 1.04 вместо деления на ноль", () => {
    expect(convertRefractometerOgFieldValue({ wortCorrectionFactor: "0" }, "12.4", "Brix", "SG")).toBe("1.048");
    expect(convertRefractometerOgFieldValue({}, "12.4", "Brix", "SG")).toBe("1.048");
  });
});
