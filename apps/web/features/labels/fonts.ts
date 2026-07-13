import fs from "node:fs";
import path from "node:path";

import * as opentypeModule from "opentype.js";
import type { Font } from "opentype.js";

// opentype.js — CJS-пакет: под node-ESM (tsx/vitest) parse живёт в default,
// под webpack (next dev) — прямо в namespace. Резолвим оба варианта.
type OpentypeModule = { parse: (buffer: ArrayBuffer) => Font };
const opentype: OpentypeModule =
  ((opentypeModule as unknown as { default?: OpentypeModule }).default ?? opentypeModule) as OpentypeModule;

// Встроенные шрифты наклеек (полная кириллица, OFL):
// Oswald — узкий плакатный заголовок, Rubik — текст (айдентика сайта),
// IBM Plex Mono — цифровые акценты. Системные шрифты сервера не используются:
// resvg получает fontDir, метрики для раскладки считает opentype.js.

export type LabelFontId = "display" | "displayBold" | "body" | "bodyMedium" | "bodyBold" | "mono" | "monoBold";

type LabelFontDef = {
  file: string;
  /** font-family для SVG (typographic/preferred family внутри TTF). */
  family: string;
  weight: number;
};

export const LABEL_FONTS: Record<LabelFontId, LabelFontDef> = {
  display: { file: "oswald-v57-cyrillic_latin-500.ttf", family: "Oswald", weight: 500 },
  displayBold: { file: "oswald-v57-cyrillic_latin-700.ttf", family: "Oswald", weight: 700 },
  body: { file: "rubik-v31-cyrillic_latin-regular.ttf", family: "Rubik", weight: 400 },
  bodyMedium: { file: "rubik-v31-cyrillic_latin-500.ttf", family: "Rubik", weight: 500 },
  bodyBold: { file: "rubik-v31-cyrillic_latin-700.ttf", family: "Rubik", weight: 700 },
  mono: { file: "ibm-plex-mono-v20-cyrillic_latin-500.ttf", family: "IBM Plex Mono", weight: 500 },
  monoBold: { file: "ibm-plex-mono-v20-cyrillic_latin-700.ttf", family: "IBM Plex Mono", weight: 700 }
};

/**
 * Каталог TTF. process.cwd() в next dev/build и vitest — apps/web; на случай
 * запуска из корня монорепо пробуем и путь с префиксом apps/web.
 */
export const labelFontsDir = (): string => {
  const direct = path.join(process.cwd(), "features/labels/fonts");
  if (fs.existsSync(direct)) {
    return direct;
  }
  return path.join(process.cwd(), "apps/web/features/labels/fonts");
};

const fontCache = new Map<LabelFontId, Font>();

const loadFont = (id: LabelFontId): Font => {
  const cached = fontCache.get(id);
  if (cached) {
    return cached;
  }
  const buffer = fs.readFileSync(path.join(labelFontsDir(), LABEL_FONTS[id].file));
  const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  fontCache.set(id, font);
  return font;
};

/**
 * Ширина строки в px для кегля sizePx (+ ручной letter-spacing).
 * Считаем по advance-метрикам глифов вручную: font.getAdvanceWidth гоняет
 * GSUB-подстановки, на которых opentype.js падает (Rubik, lookupType 6.2).
 * Кернинг не учитываем — для подгонки кегля запас в его пользу.
 */
export const measureTextPx = (text: string, fontId: LabelFontId, sizePx: number, letterSpacingPx = 0): number => {
  if (text.length === 0) {
    return 0;
  }
  const font = loadFont(fontId);
  const scale = sizePx / font.unitsPerEm;
  let advance = 0;
  for (const char of text) {
    advance += (font.charToGlyph(char).advanceWidth ?? font.unitsPerEm * 0.5) * scale;
  }
  return advance + letterSpacingPx * Math.max(0, [...text].length - 1);
};

/** Габарит чернил строки относительно базовой линии, px (вниз — положительно). */
export type InkExtents = { above: number; below: number };

/**
 * Насколько высоко и низко уходят ЧЕРНИЛА конкретной строки от базовой линии.
 * Кириллица требует этого от вёрстки: в Oswald прописные с акцентом («Ё», «Й»)
 * поднимаются на 1.042 em, а выносные («Щ», «Д», «Ц», «У») спускаются на
 * 0.166 em — то есть две строки капса соприкасаются уже при межстрочнике
 * 1.21 em, хотя обычным прописным хватает и 1.08. Считать интерлиньяж по
 * кеглю поэтому нельзя — только по реальным глифам строки.
 */
export const inkExtentsPx = (text: string, fontId: LabelFontId, sizePx: number): InkExtents => {
  const font = loadFont(fontId);
  const scale = sizePx / font.unitsPerEm;
  let above = 0;
  let below = 0;
  for (const char of text) {
    if (char === " ") {
      continue;
    }
    const box = font.charToGlyph(char).getBoundingBox();
    // Пустой глиф (пробел, неизвестный символ) отдаёт вырожденный бокс.
    if (!Number.isFinite(box.y1) || !Number.isFinite(box.y2)) {
      continue;
    }
    above = Math.max(above, box.y2 * scale);
    below = Math.max(below, -box.y1 * scale);
  }
  return { above, below };
};

export type FittedText = {
  lines: string[];
  fontSizePx: number;
  /** Название не влезло даже минимальным кеглем — обрезано с «…». */
  ellipsized: boolean;
};

/**
 * Автоподбор кегля: пробуем от maxSizePx вниз, перенося по словам в maxLines
 * строк; если и на minSizePx не влезло — обрезаем последнюю строку с «…».
 */
export const fitTextLines = (
  text: string,
  params: {
    fontId: LabelFontId;
    maxWidthPx: number;
    maxLines: number;
    maxSizePx: number;
    minSizePx: number;
    letterSpacingPx?: number;
  }
): FittedText => {
  const { fontId, maxWidthPx, maxLines, maxSizePx, minSizePx } = params;
  const letterSpacingPx = params.letterSpacingPx ?? 0;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { lines: [], fontSizePx: maxSizePx, ellipsized: false };
  }

  const wrap = (sizePx: number): string[] | null => {
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (measureTextPx(candidate, fontId, sizePx, letterSpacingPx) <= maxWidthPx) {
        current = candidate;
        continue;
      }
      if (current.length === 0) {
        // Одно слово шире строки — на этом кегле не влезает.
        return null;
      }
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        return null;
      }
    }
    if (current.length > 0) {
      // Последнее слово измеряем отдельно: строку, которую собрали дописыванием,
      // проверил цикл, а вот слово, начавшее новую строку последним, — никто.
      // Без этой проверки «ЦВЕТОЧНО-ВАНИЛЬНЫЙ» уезжало за рамку на всю наклейку.
      if (measureTextPx(current, fontId, sizePx, letterSpacingPx) > maxWidthPx) {
        return null;
      }
      lines.push(current);
    }
    return lines.length <= maxLines ? lines : null;
  };

  const step = Math.max(1, Math.round(maxSizePx * 0.05));
  for (let size = maxSizePx; size >= minSizePx; size -= step) {
    const lines = wrap(size);
    if (lines) {
      return { lines, fontSizePx: size, ellipsized: false };
    }
  }

  // Минимальный кегль: жёсткий перенос + эллипсис.
  const sizePx = minSizePx;
  const lines: string[] = [];
  let rest = words.join(" ");
  for (let lineIndex = 0; lineIndex < maxLines && rest.length > 0; lineIndex += 1) {
    const isLast = lineIndex === maxLines - 1;
    let cut = rest.length;
    while (cut > 1 && measureTextPx(rest.slice(0, cut) + (isLast && cut < rest.length ? "…" : ""), fontId, sizePx, letterSpacingPx) > maxWidthPx) {
      cut -= 1;
    }
    if (isLast && cut < rest.length) {
      // Эллипсис ставим по границе слова, а не посреди: «горчинко…» читается как
      // брак печати, «с деликатной…» — как намеренное сокращение. Назад
      // отступаем не больше половины строки, чтобы одно длинное слово не съело
      // её целиком (тогда режем как есть).
      const slice = rest.slice(0, cut);
      const lastSpace = slice.lastIndexOf(" ");
      const end = lastSpace > cut / 2 ? lastSpace : cut;
      lines.push(rest.slice(0, end).trimEnd() + "…");
      rest = "";
    } else {
      // Стараемся резать по границе слова, если она есть в пределах строки.
      const slice = rest.slice(0, cut);
      const lastSpace = slice.lastIndexOf(" ");
      const take = !isLast && lastSpace > 0 && cut < rest.length ? lastSpace : cut;
      lines.push(rest.slice(0, take).trimEnd());
      rest = rest.slice(take).trimStart();
    }
  }
  return { lines, fontSizePx: sizePx, ellipsized: rest.length > 0 || lines[lines.length - 1]?.endsWith("…") === true };
};
