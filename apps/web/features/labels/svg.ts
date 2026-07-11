import { LABEL_FONTS, type LabelFontId } from "./fonts";

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

/**
 * Двойная рамка «крафтового билета»: толстый внешний контур с вогнутыми
 * (срезанными внутрь) уголками + тонкий внутренний прямоугольник.
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
  const c = cornerPx;
  const outer =
    `M ${x + c} ${y} H ${x + w - c} A ${c} ${c} 0 0 0 ${x + w} ${y + c} ` +
    `V ${y + h - c} A ${c} ${c} 0 0 0 ${x + w - c} ${y + h} ` +
    `H ${x + c} A ${c} ${c} 0 0 0 ${x} ${y + h - c} ` +
    `V ${y + c} A ${c} ${c} 0 0 0 ${x + c} ${y} Z`;
  const innerOffset = thickPx + gapPx;
  return [
    `<path d="${outer}" fill="none" stroke="black" stroke-width="${thickPx}"/>`,
    `<rect x="${x + innerOffset}" y="${y + innerOffset}" width="${w - innerOffset * 2}" height="${h - innerOffset * 2}" fill="none" stroke="black" stroke-width="${thinPx}"/>`
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

export const hopIconPath = (strokeWidth: number): string =>
  // Шишка хмеля: контур-«капля» + три шеврона-чешуйки. Нарочно без мелких
  // прожилок — при 203 dpi и бинаризации плотные детали сливаются в кляксу.
  `<g fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M 12 1 V 4"/>` +
  `<path d="M 12 4 C 5.5 4 2.5 8 3 12 C 3.5 16.5 7 21 12 23 C 17 21 20.5 16.5 21 12 C 21.5 8 18.5 4 12 4 Z"/>` +
  `<path d="M 6 9 C 8 11.5 10 12.5 12 13 C 14 12.5 16 11.5 18 9"/>` +
  `<path d="M 7 13.5 C 8.7 15.7 10.3 16.7 12 17.2 C 13.7 16.7 15.3 15.7 17 13.5"/>` +
  `<path d="M 9 18 C 10 19.3 11 20 12 20.4 C 13 20 14 19.3 15 18"/>` +
  `</g>`;

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
