import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { LABEL_PRESETS, mmToPx, type LabelDpi, type LabelSlots } from "../features/labels/contracts";
import { renderA4SheetPdf, renderLabelPdf, renderLabelPng } from "../features/labels/render";

const slots: LabelSlots = {
  title: "Жигулёвское юбилейное нефильтрованное",
  styleName: "Чешский премиум пейл-лагер",
  abvText: "~5.2%",
  ibu: 38,
  ebc: 12,
  ogText: "1.048",
  fgText: "1.011",
  hops: ["Saaz", "Sladek", "Kazbek"],
  malts: ["Pilsner", "Munich"],
  yeast: "Fermentis W-34/70",
  authorName: "Артём",
  bottlingDateText: "11.07.2026",
  qrUrl: "https://example.com/recipes/zhigulyovskoe",
  brandText: "BREWED WITH NB"
};

describe("рендер-smoke PNG", () => {
  const cases: Array<{ preset: "S" | "M" | "L"; dpi: LabelDpi; template: "typographic" | "craft" }> = [
    { preset: "S", dpi: 203, template: "typographic" },
    { preset: "M", dpi: 203, template: "craft" },
    { preset: "L", dpi: 203, template: "typographic" },
    { preset: "S", dpi: 300, template: "craft" },
    { preset: "M", dpi: 300, template: "typographic" },
    { preset: "L", dpi: 300, template: "craft" }
  ];

  for (const { preset, dpi, template } of cases) {
    it(`${template} ${preset} @${dpi}dpi: точный размер и 1-бит`, async () => {
      const png = await renderLabelPng({ template, preset, dpi, slots });
      const def = LABEL_PRESETS[preset];

      // Заголовок PNG: байт 24 — bit depth, байт 25 — color type (3 = palette).
      expect(png[24]).toBe(1);
      expect(png[25]).toBe(3);

      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(mmToPx(def.widthMm, dpi));
      expect(meta.height).toBe(mmToPx(def.heightMm, dpi));

      // Растр строго ч/б: только 0 и 255, и не «пустой лист».
      const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
      let black = 0;
      for (const value of data) {
        expect(value === 0 || value === 255).toBe(true);
        if (value === 0) {
          black += 1;
        }
      }
      expect(black).toBeGreaterThan(data.length * 0.005);
    }, 30000);
  }
});

describe("рендер-smoke PDF", () => {
  it("одиночный PDF отдаёт валидный документ", async () => {
    const pdf = await renderLabelPdf({ template: "craft", preset: "M", dpi: 203, slots });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 30000);

  it("A4-лист отдаёт валидный документ", async () => {
    const pdf = await renderA4SheetPdf({ template: "typographic", preset: "S", dpi: 203, slots });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 30000);
});
