import { ditherPatternDef, ebcToDitherLevel } from "../density";
import { measureTextPx, type LabelFontId } from "../fonts";
import { buildQrSvg } from "../qr";
import { diamond, dottedRule, hRule, iconAt, textEl } from "../svg";

import type { LabelRenderContext } from "./types";

// Переиспользуемые блоки шаблонов. Каждый блок рендерится «в поток»:
// принимает y-курсор, возвращает SVG и высоту. Отсутствующие данные
// схлопываются: блок возвращает пустую строку и нулевую высоту.

export type BlockResult = { svg: string; height: number };

export const EMPTY_BLOCK: BlockResult = { svg: "", height: 0 };

/** Обрезка строки с «…» под ширину (кегль фиксированный — для строк-значений). */
export const truncateToWidth = (text: string, fontId: LabelFontId, sizePx: number, maxWidthPx: number): string => {
  if (measureTextPx(text, fontId, sizePx) <= maxWidthPx) {
    return text;
  }
  let cut = text.length - 1;
  while (cut > 1 && measureTextPx(`${text.slice(0, cut).trimEnd()}…`, fontId, sizePx) > maxWidthPx) {
    cut -= 1;
  }
  return `${text.slice(0, cut).trimEnd()}…`;
};

/** «HOP1, HOP2 +N» — не больше maxNames имён, остальное числом. */
export const joinWithOverflow = (names: string[], maxNames: number): string | null => {
  if (names.length === 0) {
    return null;
  }
  const visible = names.slice(0, maxNames);
  const rest = names.length - visible.length;
  return rest > 0 ? `${visible.join(", ")} +${rest}` : visible.join(", ");
};

/**
 * Подбирает, сколько имён реально влезает в ширину: убирает имена в «+N»,
 * пока строка не поместится; в крайнем случае обрезает с «…».
 */
export const fitNamesToWidth = (
  names: string[],
  params: { maxNames: number; fontId: LabelFontId; sizePx: number; maxWidthPx: number }
): string | null => {
  for (let count = Math.min(params.maxNames, names.length); count >= 1; count -= 1) {
    const joined = joinWithOverflow(names, count);
    if (joined && measureTextPx(joined.toUpperCase(), params.fontId, params.sizePx) <= params.maxWidthPx) {
      return joined;
    }
  }
  const single = joinWithOverflow(names, 1);
  return single ? truncateToWidth(single, params.fontId, params.sizePx, params.maxWidthPx) : null;
};

export type SpacedLineFit = { text: string; sizePx: number; spacingPx: number };

/**
 * Строка капсом с разрядкой (стиль, подписи): ужимаем разрядку → кегль →
 * в крайнем случае обрезаем с «…», чтобы не вылезать за рамку.
 */
export const fitSpacedLine = (
  text: string,
  params: { fontId: LabelFontId; maxWidthPx: number; sizePx: number; minSizePx: number; spacingRatio: number }
): SpacedLineFit => {
  const upper = text.toUpperCase();
  for (let size = params.sizePx; size >= params.minSizePx; size -= 1) {
    for (const ratio of [params.spacingRatio, params.spacingRatio * 0.6, params.spacingRatio * 0.3, 0]) {
      const spacing = Math.round(size * ratio);
      if (measureTextPx(upper, params.fontId, size, spacing) <= params.maxWidthPx) {
        return { text: upper, sizePx: size, spacingPx: spacing };
      }
    }
  }
  return {
    text: truncateToWidth(upper, params.fontId, params.minSizePx, params.maxWidthPx),
    sizePx: params.minSizePx,
    spacingPx: 0
  };
};

/** Заголовок колонки «◆ ABV ◆» с ромбами по бокам. */
const columnHeader = (cx: number, y: number, label: string, sizePx: number, diamondR: number): string => {
  const spacing = Math.round(sizePx * 0.25);
  const textWidth = measureTextPx(label, "bodyMedium", sizePx, spacing);
  const gap = Math.round(sizePx * 0.6) + diamondR;
  const dy = Math.round(sizePx * 0.34);
  return [
    diamond(cx - Math.round(textWidth / 2) - gap, y - dy, diamondR),
    textEl({ x: cx, y, fontId: "bodyMedium", sizePx, text: label, anchor: "middle", letterSpacingPx: spacing }),
    diamond(cx + Math.round(textWidth / 2) + gap, y - dy, diamondR)
  ].join("");
};

/** Оценка высоты стат-панели (для вертикального бюджета tier M). */
export const statBandHeight = (ctx: LabelRenderContext, compact: boolean): number => {
  const headerSize = compact ? ctx.mm(2.4) : ctx.mm(2.8);
  const valueSize = compact ? ctx.mm(3.6) : ctx.mm(4.6);
  return headerSize + Math.round(valueSize * 1.7);
};

/**
 * Стат-панель «ABV | IBU | ЦВЕТ» (референс: три колонки с вертикальными
 * линейками). Колонки только для заполненных значений; пусто → EMPTY_BLOCK.
 */
export const statBand = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number; compact?: boolean }
): BlockResult => {
  const { slots, mm } = ctx;
  const columns: Array<{ label: string; value: string }> = [];
  if (slots.abvText) {
    columns.push({ label: "ABV", value: slots.abvText });
  }
  if (slots.ibu !== null) {
    columns.push({ label: "IBU", value: String(slots.ibu) });
  }
  if (slots.ebc !== null) {
    columns.push({ label: "ЦВЕТ", value: `${slots.ebc} EBC` });
  }
  if (columns.length === 0) {
    return EMPTY_BLOCK;
  }

  const compact = params.compact === true;
  const headerSize = compact ? mm(2.4) : mm(2.8);
  const valueSize = compact ? mm(3.6) : mm(4.6);
  const headerY = params.y + headerSize;
  const valueY = headerY + Math.round(valueSize * 1.35);
  const height = valueY - params.y + Math.round(valueSize * 0.35);
  const colWidth = params.width / columns.length;
  const parts: string[] = [];

  columns.forEach((column, index) => {
    const cx = Math.round(params.x + colWidth * index + colWidth / 2);
    parts.push(columnHeader(cx, headerY, column.label, headerSize, Math.max(2, mm(0.5))));
    parts.push(textEl({ x: cx, y: valueY, fontId: "monoBold", sizePx: valueSize, text: column.value, anchor: "middle" }));
    if (index > 0) {
      const sx = Math.round(params.x + colWidth * index);
      parts.push(`<rect x="${sx}" y="${params.y + Math.round(headerSize * 0.2)}" width="${Math.max(2, mm(0.25))}" height="${height - Math.round(headerSize * 0.4)}" fill="black"/>`);
    }
  });

  return { svg: parts.join(""), height };
};

/**
 * Строки «СОЛОД / ХМЕЛЬ / ДРОЖЖИ» с линейными иконками (референс) —
 * только заполненные; между строками тонкие линейки.
 */
export const ingredientRows = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number; icons: { grain: string; hop: string; yeast: string } | null }
): BlockResult => {
  const { slots, mm } = ctx;
  const labelSize = mm(2.8);
  const rowHeight = mm(5.2);
  const iconSize = mm(3.6);
  const labelSpacing = Math.round(labelSize * 0.12);

  // Ширина под значение (за вычетом иконки и самой длинной метки) — чтобы
  // «+N» подбирался по реальному месту, а не резался с «…» на середине имени.
  const iconOffset = params.icons ? iconSize + mm(2) : 0;
  const maxLabelWidth = Math.max(
    ...["СОЛОД:", "ХМЕЛЬ:", "ДРОЖЖИ:"].map((label) => measureTextPx(label, "bodyBold", labelSize, labelSpacing))
  );
  const valueMax = params.width - iconOffset - maxLabelWidth - mm(2);

  const rows: Array<{ icon: "grain" | "hop" | "yeast"; label: string; value: string }> = [];
  const malts = fitNamesToWidth(slots.malts, { maxNames: 3, fontId: "body", sizePx: labelSize, maxWidthPx: valueMax });
  const hops = fitNamesToWidth(slots.hops, { maxNames: 4, fontId: "body", sizePx: labelSize, maxWidthPx: valueMax });
  if (malts) {
    rows.push({ icon: "grain", label: "СОЛОД:", value: malts });
  }
  if (hops) {
    rows.push({ icon: "hop", label: "ХМЕЛЬ:", value: hops });
  }
  if (slots.yeast) {
    rows.push({ icon: "yeast", label: "ДРОЖЖИ:", value: truncateToWidth(slots.yeast, "body", labelSize, valueMax) });
  }
  if (rows.length === 0) {
    return EMPTY_BLOCK;
  }

  const parts: string[] = [];
  let y = params.y;

  rows.forEach((row, index) => {
    const baseline = y + Math.round(rowHeight / 2 + labelSize * 0.36);
    let textX = params.x;
    if (params.icons) {
      parts.push(iconAt(params.icons[row.icon], params.x, y + Math.round((rowHeight - iconSize) / 2), iconSize));
      textX += iconOffset;
    }
    parts.push(
      textEl({ x: textX, y: baseline, fontId: "bodyBold", sizePx: labelSize, text: row.label, letterSpacingPx: labelSpacing })
    );
    const valueX = textX + maxLabelWidth + mm(2);
    parts.push(textEl({ x: valueX, y: baseline, fontId: "body", sizePx: labelSize, text: row.value.toUpperCase() }));
    if (index < rows.length - 1) {
      parts.push(hRule(params.x, params.x + params.width, y + rowHeight, Math.max(2, mm(0.25))));
    }
    y += rowHeight + (index < rows.length - 1 ? mm(0.8) : 0);
  });

  return { svg: parts.join(""), height: y - params.y };
};

/** Шкала IBU 0–100+: рамка, чёрная заливка до значения, деления с цифрами. */
export const ibuScale = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number }
): BlockResult => {
  const { slots, mm } = ctx;
  if (slots.ibu === null) {
    return EMPTY_BLOCK;
  }
  const barHeight = mm(3.2);
  const stroke = Math.max(2, mm(0.25));
  const tickSize = mm(2.2);
  const scaleMax = 110;
  const filled = Math.round((Math.min(slots.ibu, scaleMax) / scaleMax) * params.width);
  const parts: string[] = [];
  parts.push(`<rect x="${params.x}" y="${params.y}" width="${filled}" height="${barHeight}" fill="black"/>`);
  parts.push(`<rect x="${params.x}" y="${params.y}" width="${params.width}" height="${barHeight}" fill="none" stroke="black" stroke-width="${stroke}"/>`);
  const labelsY = params.y + barHeight + tickSize + mm(1);
  for (const tick of [0, 20, 40, 60, 80, 100]) {
    const tx = Math.round(params.x + (tick / scaleMax) * params.width);
    parts.push(`<rect x="${tx}" y="${params.y + barHeight}" width="${stroke}" height="${mm(1)}" fill="black"/>`);
    parts.push(textEl({ x: tx, y: labelsY, fontId: "mono", sizePx: tickSize, text: String(tick), anchor: "middle" }));
  }
  return { svg: parts.join(""), height: labelsY - params.y + Math.round(tickSize * 0.3) };
};

/** Плашка «цвет пива»: полоса с дизеринг-паттерном по EBC (для L-tier). */
export const colorSwatchBar = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number; heightMm?: number; patternId: string }
): BlockResult => {
  const { slots, mm, dpi } = ctx;
  if (slots.ebc === null) {
    return EMPTY_BLOCK;
  }
  const height = mm(params.heightMm ?? 4);
  const stroke = Math.max(2, mm(0.25));
  const svg = [
    `<defs>${ditherPatternDef(params.patternId, ebcToDitherLevel(slots.ebc), dpi)}</defs>`,
    `<rect x="${params.x}" y="${params.y}" width="${params.width}" height="${height}" fill="url(#${params.patternId})"/>`,
    `<rect x="${params.x}" y="${params.y}" width="${params.width}" height="${height}" fill="none" stroke="black" stroke-width="${stroke}"/>`
  ].join("");
  return { svg, height };
};

/**
 * Нижний мета-блок: розлив/«готово после», автор, марка + QR справа
 * (QR только при slots.qrUrl — т.е. только для опубликованных).
 */
export const bottomMeta = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number; maxHeight: number; qrSizeMm: number; showAuthor: boolean }
): BlockResult => {
  const { slots, mm } = ctx;
  const lineSize = mm(2.4);
  const lineGap = Math.round(lineSize * 0.8);
  type MetaLine = { kind: "bottling" | "ready" | "author" | "brand"; text: string; fontId: LabelFontId; spacing: number };
  const lines: MetaLine[] = [];
  if (slots.bottlingDateText) {
    lines.push({ kind: "bottling", text: `РОЗЛИВ: ${slots.bottlingDateText}`, fontId: "bodyMedium", spacing: Math.round(lineSize * 0.12) });
  }
  if (slots.readyAfterDateText) {
    lines.push({ kind: "ready", text: `ГОТОВО ПОСЛЕ: ${slots.readyAfterDateText}`, fontId: "bodyMedium", spacing: Math.round(lineSize * 0.12) });
  }
  if (params.showAuthor && slots.authorName) {
    lines.push({
      kind: "author",
      text: truncateToWidth(slots.authorName.toUpperCase(), "bodyMedium", lineSize, params.width - (slots.qrUrl ? mm(params.qrSizeMm + 3) : 0)),
      fontId: "bodyMedium",
      spacing: Math.round(lineSize * 0.18)
    });
  }
  lines.push({ kind: "brand", text: slots.brandText, fontId: "mono", spacing: Math.round(lineSize * 0.2) });

  let qr = slots.qrUrl ? buildQrSvg(slots.qrUrl, mm(params.qrSizeMm)) : null;
  // QR не влезает по вертикали (вместе с подписью) — блок QR не рендерим.
  if (qr && qr.sizePx + lineSize + mm(1) > params.maxHeight) {
    qr = null;
  }

  // Не влезаем по высоте — убираем строки по приоритету: автор → «готово
  // после» → марка; дата розлива остаётся до последнего.
  const lineBlockHeight = (count: number): number => count * lineSize + Math.max(0, count - 1) * lineGap;
  for (const dropKind of ["author", "ready", "brand"] as const) {
    if (lines.length <= 1 || lineBlockHeight(lines.length) <= params.maxHeight) {
      break;
    }
    const index = lines.findIndex((line) => line.kind === dropKind);
    if (index >= 0) {
      lines.splice(index, 1);
    }
  }
  const textHeight = lineBlockHeight(lines.length);
  const height = Math.min(params.maxHeight, Math.max(textHeight, qr ? qr.sizePx + lineSize + mm(1) : 0));
  const parts: string[] = [];

  const textAreaWidth = qr ? params.width - qr.sizePx - mm(3) : params.width;
  const textCx = Math.round(params.x + textAreaWidth / 2);
  let ty = params.y + Math.round((height - textHeight) / 2) + lineSize;
  for (const line of lines) {
    parts.push(textEl({ x: textCx, y: ty, fontId: line.fontId, sizePx: lineSize, text: line.text, anchor: "middle", letterSpacingPx: line.spacing }));
    ty += lineSize + lineGap;
  }

  if (qr) {
    const qx = params.x + params.width - qr.sizePx;
    const qy = params.y + Math.round((height - qr.sizePx - lineSize) / 2);
    parts.push(`<g transform="translate(${qx} ${Math.max(params.y, qy)})">${qr.svg}</g>`);
    parts.push(
      textEl({
        x: qx + Math.round(qr.sizePx / 2),
        y: Math.max(params.y, qy) + qr.sizePx + lineSize,
        fontId: "body",
        sizePx: mm(2),
        text: "рецепт",
        anchor: "middle"
      })
    );
  }

  return { svg: parts.join(""), height };
};

export { dottedRule };
