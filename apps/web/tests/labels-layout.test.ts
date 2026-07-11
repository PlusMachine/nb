import { describe, expect, it } from "vitest";

import { A4_SHEET, computeA4Grid, LABEL_PRESETS, mmToPx, type LabelSlots } from "../features/labels/contracts";
import { fitTextLines } from "../features/labels/fonts";
import { renderLabelSvg } from "../features/labels/render";

const fullSlots: LabelSlots = {
  title: "Жигулёвское юбилейное нефильтрованное",
  styleName: "Чешский премиум пейл-лагер",
  abvText: "~5.2%",
  ibu: 38,
  ebc: 12,
  ogText: "1.048",
  fgText: "1.011",
  hops: ["Saaz", "Sladek"],
  malts: ["Pilsner"],
  yeast: "Fermentis W-34/70",
  authorName: "Артём",
  bottlingDateText: "11.07.2026",
  readyAfterDateText: "25.07.2026",
  qrUrl: "https://example.com/recipes/test",
  brandText: "BREWED WITH NB"
};

const emptySlots: LabelSlots = {
  title: "IPA",
  styleName: null,
  abvText: null,
  ibu: null,
  ebc: null,
  ogText: null,
  fgText: null,
  hops: [],
  malts: [],
  yeast: null,
  authorName: null,
  bottlingDateText: null,
  readyAfterDateText: null,
  qrUrl: null,
  brandText: "BREWED WITH NB"
};

describe("раскладка A4", () => {
  it("количество наклеек на листе для каждого пресета", () => {
    // 43×25 → 4×10, 58×40 → 3×6, 75×120 → 2×2 при полях 8 мм и резе 3 мм.
    expect(computeA4Grid(LABEL_PRESETS.S)).toMatchObject({ cols: 4, rows: 10, count: 40 });
    expect(computeA4Grid(LABEL_PRESETS.M)).toMatchObject({ cols: 3, rows: 6, count: 18 });
    expect(computeA4Grid(LABEL_PRESETS.L)).toMatchObject({ cols: 2, rows: 2, count: 4 });
  });

  it("сетка не выходит за поля листа, между наклейками есть поле реза", () => {
    for (const preset of Object.values(LABEL_PRESETS)) {
      const grid = computeA4Grid(preset);
      for (const pos of grid.positions) {
        expect(pos.xMm).toBeGreaterThanOrEqual(A4_SHEET.marginMm - 1e-6);
        expect(pos.yMm).toBeGreaterThanOrEqual(A4_SHEET.marginMm - 1e-6);
        expect(pos.xMm + preset.widthMm).toBeLessThanOrEqual(A4_SHEET.widthMm - A4_SHEET.marginMm + 1e-6);
        expect(pos.yMm + preset.heightMm).toBeLessThanOrEqual(A4_SHEET.heightMm - A4_SHEET.marginMm + 1e-6);
      }
      const sorted = [...grid.positions].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
      const second = sorted[1];
      if (second && second.yMm === sorted[0].yMm) {
        expect(second.xMm - (sorted[0].xMm + preset.widthMm)).toBeCloseTo(A4_SHEET.gapMm, 6);
      }
    }
  });
});

describe("tier-логика и переполнение текста", () => {
  it("длинное название уменьшается, но не превышает 2 строк", () => {
    const fitted = fitTextLines("ЖИГУЛЁВСКОЕ ЮБИЛЕЙНОЕ НЕФИЛЬТРОВАННОЕ ОСОБОЕ", {
      fontId: "displayBold",
      maxWidthPx: 300,
      maxLines: 2,
      maxSizePx: 52,
      minSizePx: 24
    });
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
    expect(fitted.fontSizePx).toBeLessThan(52);
  });

  it("непомещающееся даже минимальным кеглем название обрезается с «…»", () => {
    const fitted = fitTextLines("Экстраординарное сверхдлинное название которое никуда не влезает вообще никак", {
      fontId: "displayBold",
      maxWidthPx: 120,
      maxLines: 2,
      maxSizePx: 40,
      minSizePx: 24
    });
    expect(fitted.ellipsized).toBe(true);
    expect(fitted.lines[fitted.lines.length - 1]).toContain("…");
  });

  it("пустые поля схлопываются: в SVG нет меток отсутствующих блоков", () => {
    for (const template of ["typographic", "craft"] as const) {
      for (const preset of ["S", "M", "L"] as const) {
        const { svg } = renderLabelSvg({ template, preset, dpi: 203, slots: emptySlots });
        expect(svg).not.toContain("IBU");
        expect(svg).not.toContain("ЦВЕТ");
        expect(svg).not.toContain("СОЛОД");
        expect(svg).not.toContain("РОЗЛИВ");
        expect(svg).not.toContain("ГОТОВО");
        expect(svg).not.toContain("—"); // никаких прочерков-заглушек
      }
    }
  });

  it("полные данные рендерят все блоки на L", () => {
    for (const template of ["typographic", "craft"] as const) {
      const { svg } = renderLabelSvg({ template, preset: "L", dpi: 203, slots: fullSlots });
      for (const marker of ["ABV", "IBU", "ЦВЕТ", "СОЛОД", "ХМЕЛЬ", "ДРОЖЖИ", "РОЗЛИВ", "ГОТОВО ПОСЛЕ", "BREWED WITH NB"]) {
        expect(svg, `${template}: ${marker}`).toContain(marker);
      }
    }
  });

  it("QR-гейтинг: без qrUrl в SVG нет QR-блока и подписи «рецепт»", () => {
    const withQr = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: fullSlots }).svg;
    const withoutQr = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: { ...fullSlots, qrUrl: null } }).svg;
    expect(withQr).toContain("рецепт");
    expect(withQr).toContain("crispEdges");
    expect(withoutQr).not.toContain("рецепт");
    expect(withoutQr).not.toContain("crispEdges");
  });

  it("пиксельные размеры пресетов точны под dpi", () => {
    expect(mmToPx(58, 203)).toBe(464);
    expect(mmToPx(40, 203)).toBe(320);
    const { widthPx, heightPx } = renderLabelSvg({ template: "typographic", preset: "M", dpi: 203, slots: fullSlots });
    expect(widthPx).toBe(464);
    expect(heightPx).toBe(320);
  });
});
