import fs from "node:fs";
import path from "node:path";

import { LABEL_FONTS, labelFontsDir } from "@/features/labels/fonts";

// Шрифты для Satori (next/og). Переиспользуем кириллические Rubik TTF, уже
// закоммиченные для генератора наклеек (features/labels/fonts/*.ttf, OFL) —
// одна точка истины для файлов и резолвинга каталога. Satori НЕ ест woff2
// (только TTF/OTF/WOFF), а next/font кладёт хешированные woff2 в билд-артефакты,
// поэтому берём именно TTF из репо. Забандленный в next дефолт — латиница-only,
// кириллицу обязаны подать сами, иначе тофу-квадраты вместо русских букв.
//
// Rubik = основной шрифт сайта (--font-sans). Три веса: 400 (домен/вторичный),
// 500 (eyebrow/подписи), 700 (заголовок/значения/wordmark).

export type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700;
  style: "normal";
};

const readRubik = (fontId: "body" | "bodyMedium" | "bodyBold"): Buffer =>
  fs.readFileSync(path.join(labelFontsDir(), LABEL_FONTS[fontId].file));

// Читаем на module scope (один раз на инстанс сервера), не на каждый запрос —
// рекомендация next/og по перфу.
let cachedFonts: OgFont[] | null = null;

export const getOgFonts = (): OgFont[] => {
  if (cachedFonts) {
    return cachedFonts;
  }
  cachedFonts = [
    { name: "Rubik", data: readRubik("body"), weight: 400, style: "normal" },
    { name: "Rubik", data: readRubik("bodyMedium"), weight: 500, style: "normal" },
    { name: "Rubik", data: readRubik("bodyBold"), weight: 700, style: "normal" }
  ];
  return cachedFonts;
};
