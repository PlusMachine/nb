import { LABEL_FONTS, type LabelFontId } from "./fonts";
import { HOP_MARK_D, HOP_MARK_HEIGHT, HOP_MARK_WIDTH } from "./hop-mark";

// Общие SVG-примитивы шаблонов наклеек. Всё — чистые функции над строками;
// координаты целочисленные (пиксельная сетка растра), цвета только
// black/white/url(#pattern).

export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export type TextElParams = {
  x: number;
  y: number;
  fontId: LabelFontId;
  sizePx: number;
  text: string;
  anchor?: "start" | "middle" | "end";
  letterSpacingPx?: number;
  fill?: "black" | "white";
};

export const textEl = (params: TextElParams): string => {
  const font = LABEL_FONTS[params.fontId];
  const anchor = params.anchor ?? "start";
  const letterSpacing = params.letterSpacingPx ? ` letter-spacing="${params.letterSpacingPx}"` : "";
  const fill = params.fill ?? "black";
  return (
    `<text x="${params.x}" y="${params.y}" text-anchor="${anchor}" ` +
    `font-family="${font.family}" font-weight="${font.weight}" font-size="${params.sizePx}"` +
    `${letterSpacing} fill="${fill}">${escapeXml(params.text)}</text>`
  );
};

/** Ромб-акцент «◆» из референсной эстетики. */
export const diamond = (cx: number, cy: number, r: number, fill: "black" | "white" = "black"): string =>
  `<path d="M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z" fill="${fill}"/>`;

export const hRule = (x1: number, x2: number, y: number, strokeWidth: number): string =>
  `<rect x="${x1}" y="${Math.round(y - strokeWidth / 2)}" width="${x2 - x1}" height="${strokeWidth}" fill="black"/>`;

/** Вертикальная линейка — разделитель колонок горизонтальной наклейки. */
export const vRule = (x: number, y1: number, y2: number, strokeWidth: number): string =>
  `<rect x="${Math.round(x - strokeWidth / 2)}" y="${y1}" width="${strokeWidth}" height="${y2 - y1}" fill="black"/>`;

/** Пунктирная линейка «мелким стежком» (как dotted-разделители референса). */
export const dottedRule = (x1: number, x2: number, y: number, dotPx: number): string => {
  const step = dotPx * 3;
  const count = Math.floor((x2 - x1 + dotPx) / step);
  const used = count * step - (step - dotPx);
  const start = x1 + Math.round((x2 - x1 - used) / 2);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(`<rect x="${start + i * step}" y="${Math.round(y - dotPx / 2)}" width="${dotPx}" height="${dotPx}"/>`);
  }
  return `<g fill="black">${parts.join("")}</g>`;
};

/** Линейка с ромбом по центру: ───◆─── */
export const ruleWithDiamond = (x1: number, x2: number, y: number, strokeWidth: number, diamondR: number): string => {
  const cx = Math.round((x1 + x2) / 2);
  const gap = diamondR + strokeWidth * 2;
  return [hRule(x1, cx - gap, y, strokeWidth), diamond(cx, y, diamondR), hRule(cx + gap, x2, y, strokeWidth)].join("");
};

/** Скруглённый прямоугольник тем же путём, что и внешний контур билетной рамки. */
const roundedRectPath = (x: number, y: number, w: number, h: number, c: number): string =>
  `M ${x + c} ${y} H ${x + w - c} A ${c} ${c} 0 0 0 ${x + w} ${y + c} ` +
  `V ${y + h - c} A ${c} ${c} 0 0 0 ${x + w - c} ${y + h} ` +
  `H ${x + c} A ${c} ${c} 0 0 0 ${x} ${y + h - c} ` +
  `V ${y + c} A ${c} ${c} 0 0 0 ${x + c} ${y} Z`;

/**
 * Двойная рамка «крафтового билета»: толстый внешний контур со скруглёнными
 * уголками + тонкий внутренний — тот же контур, смещённый внутрь на
 * innerOffset, с тем же радиусом угла (не эквидистанта: радиус нарочно не
 * уменьшаем, иначе вырез внутренней рамки выглядит мельче внешнего).
 */
export const ticketFrame = (params: {
  widthPx: number;
  heightPx: number;
  insetPx: number;
  thickPx: number;
  thinPx: number;
  gapPx: number;
  cornerPx: number;
}): string => {
  const { widthPx, heightPx, insetPx, thickPx, thinPx, gapPx, cornerPx } = params;
  const x = insetPx;
  const y = insetPx;
  const w = widthPx - insetPx * 2;
  const h = heightPx - insetPx * 2;
  const outer = roundedRectPath(x, y, w, h, cornerPx);
  const innerOffset = thickPx + gapPx;
  const inner = roundedRectPath(
    x + innerOffset,
    y + innerOffset,
    w - innerOffset * 2,
    h - innerOffset * 2,
    cornerPx
  );
  return [
    `<path d="${outer}" fill="none" stroke="black" stroke-width="${thickPx}"/>`,
    `<path d="${inner}" fill="none" stroke="black" stroke-width="${thinPx}"/>`
  ].join("");
};

/** Простая двойная рамка (типографский шаблон): толстая + тонкая внутри. */
export const doubleFrame = (params: {
  widthPx: number;
  heightPx: number;
  insetPx: number;
  thickPx: number;
  thinPx: number;
  gapPx: number;
}): string => {
  const { widthPx, heightPx, insetPx, thickPx, thinPx, gapPx } = params;
  const inner = insetPx + thickPx + gapPx;
  return [
    `<rect x="${insetPx}" y="${insetPx}" width="${widthPx - insetPx * 2}" height="${heightPx - insetPx * 2}" fill="none" stroke="black" stroke-width="${thickPx}"/>`,
    `<rect x="${inner}" y="${inner}" width="${widthPx - inner * 2}" height="${heightPx - inner * 2}" fill="none" stroke="black" stroke-width="${thinPx}"/>`
  ].join("");
};

// Линейные иконки ингредиентов в боксе 24×24 (масштабируются через <g transform>).
// strokeWidth подбирается вызывающей стороной под dpi.

export const grainIconPath = (strokeWidth: number): string =>
  `<g fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round">` +
  `<path d="M 12 22 V 6"/>` +
  `<path d="M 12 20 C 8 19 6.5 16.5 6.5 14 C 9.5 14.5 11.5 16 12 18.5"/>` +
  `<path d="M 12 20 C 16 19 17.5 16.5 17.5 14 C 14.5 14.5 12.5 16 12 18.5"/>` +
  `<path d="M 12 15 C 8 14 6.5 11.5 6.5 9 C 9.5 9.5 11.5 11 12 13.5"/>` +
  `<path d="M 12 15 C 16 14 17.5 11.5 17.5 9 C 14.5 9.5 12.5 11 12 13.5"/>` +
  `<path d="M 12 6 C 10.5 4.5 10.5 3 12 1.5 C 13.5 3 13.5 4.5 12 6"/>` +
  `</g>`;

// Силуэт шишки хмеля: округлый верх, широкая середина, острый низ.
const HOP_CONE_PATH =
  "M 12 3.2 C 6.2 3.6 3 7.6 3.2 12.2 C 3.4 17.2 6.8 21.4 12 23.8 C 17.2 21.4 20.6 17.2 20.8 12.2 C 21 7.6 17.8 3.6 12 3.2 Z";

export const hopIconPath = (strokeWidth: number): string =>
  // Мелкая иконка для строк ингредиентов: силуэт эмблемы (hopMarkPath), но
  // контуром и всего с тремя рядами чешуек. Нарочно без мелких прожилок — при
  // 203 dpi и бинаризации плотные детали сливаются в кляксу.
  `<g fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M 12 1 V 3.4"/>` +
  `<path d="${HOP_CONE_PATH}"/>` +
  `<path d="M 3.8 9.8 Q 7.9 13.6 12 9.8 Q 16.1 13.6 20.2 9.8"/>` +
  `<path d="M 5.4 14.6 Q 8.7 18.2 12 14.6 Q 15.3 18.2 18.6 14.6"/>` +
  `<path d="M 8.4 19 Q 10.2 21.4 12 19 Q 13.8 21.4 15.6 19"/>` +
  `</g>`;

// Эмблема: шишка хмеля с листьями (векторизованный знак, см. hop-mark.ts) в
// двойном ободе. Знак вписан по большей стороне во внутренний круг с воздухом:
// гравюрные штрихи у самого обода на печати слипаются с ним.
const HOP_MARK_INNER_R = 10.4;
const HOP_MARK_FIT = 0.92;

/**
 * Эмблема в боксе 24×24 — печатается на «Линейном крафте» (большая наклейка).
 * Знак штриховой и мелкодетальный: ниже ~14 мм листья и прожилки сливаются,
 * поэтому в строках ингредиентов используется упрощённый hopIconPath.
 */
export const hopMarkPath = (): string => {
  const scale = (HOP_MARK_INNER_R * 2 * HOP_MARK_FIT) / Math.max(HOP_MARK_WIDTH, HOP_MARK_HEIGHT);
  const x = 12 - (HOP_MARK_WIDTH * scale) / 2;
  const y = 12 - (HOP_MARK_HEIGHT * scale) / 2;
  return (
    `<circle cx="12" cy="12" r="11.5" fill="none" stroke="black" stroke-width="0.45"/>` +
    `<circle cx="12" cy="12" r="${HOP_MARK_INNER_R}" fill="none" stroke="black" stroke-width="0.25"/>` +
    `<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)})">` +
    `<path d="${HOP_MARK_D}" fill="black" fill-rule="evenodd"/>` +
    `</g>`
  );
};

export const yeastIconPath = (strokeWidth: number): string =>
  `<g fill="none" stroke="black" stroke-width="${strokeWidth}">` +
  `<circle cx="8" cy="8" r="2.6"/>` +
  `<circle cx="16" cy="7.5" r="2.2"/>` +
  `<circle cx="6.5" cy="15.5" r="2.2"/>` +
  `<circle cx="13" cy="14" r="3"/>` +
  `<circle cx="18" cy="16.5" r="2"/>` +
  `<circle cx="10.5" cy="20" r="1.8"/>` +
  `</g>`;

export const iconAt = (iconSvg: string, x: number, y: number, sizePx: number): string => {
  const scale = sizePx / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${iconSvg}</g>`;
};
