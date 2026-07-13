import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { LABEL_FONTS, labelFontsDir, measureTextPx, type LabelFontId } from "../features/labels/fonts";

// Ловушка, из-за которой весь текст наклеек печатался не тем шрифтом: в TTF от
// google-webfonts-helper семейство Rubik называлось «Rubik Light», resvg не
// находил `font-family="Rubik"` и молча подставлял другой встроенный шрифт.
// Раскладку при этом считает opentype.js по НАСТОЯЩЕМУ файлу — метрики
// расходились с печатью, и текст вылезал за поля наклейки.
//
// Проверяем ровно это: ширина отрисованного текста должна совпадать с той, по
// которой шаблоны верстают. Подстановка семейства ломает совпадение.

const TEXT = "Пиво Beer 123";
const SIZE_PX = 28;
const TEXT_X = 10;
const CANVAS_W = 800;
const CANVAS_H = 60;

const renderPng = (fontId: LabelFontId): Buffer => {
  const font = LABEL_FONTS[fontId];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">` +
    `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="white"/>` +
    `<text x="${TEXT_X}" y="42" font-family="${font.family}" font-weight="${font.weight}" font-size="${SIZE_PX}" fill="black">${TEXT}</text>` +
    `</svg>`;
  return new Resvg(svg, {
    background: "white",
    font: { loadSystemFonts: false, fontDirs: [labelFontsDir()], defaultFontFamily: "Rubik" }
  })
    .render()
    .asPng();
};

/** Ширина чернил: от x текста до самого правого не-белого пикселя. */
const inkWidth = async (png: Buffer): Promise<number> => {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  let rightmost = 0;
  for (let index = 0; index < data.length; index += 1) {
    if (data[index] < 128) {
      rightmost = Math.max(rightmost, index % info.width);
    }
  }
  return rightmost - TEXT_X;
};

describe("шрифты наклеек", () => {
  it("resvg рисует тем же шрифтом, по которому считается раскладка", async () => {
    for (const fontId of Object.keys(LABEL_FONTS) as LabelFontId[]) {
      const drawn = await inkWidth(renderPng(fontId));
      const measured = measureTextPx(TEXT, fontId, SIZE_PX);
      // Допуск 8%: правый сайд-беринг последнего глифа в чернила не попадает.
      const drift = Math.abs(drawn - measured) / measured;
      expect(drift, `${fontId}: нарисовано ${drawn}px, размечено ${Math.round(measured)}px`).toBeLessThan(0.08);
    }
  });
});
