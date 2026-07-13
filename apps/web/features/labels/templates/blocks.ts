import { ditherPatternDef, ebcToDitherLevel } from "../density";
import { fitTextLines, inkExtentsPx, measureTextPx, type FittedText, type LabelFontId } from "../fonts";
import { buildQrSvg } from "../qr";
import { diamond, dottedRule, hRule, iconAt, textEl } from "../svg";

import type { LabelRenderContext } from "./types";

// Переиспользуемые блоки шаблонов. Каждый блок рендерится «в поток»:
// принимает y-курсор, возвращает SVG и высоту. Отсутствующие данные
// схлопываются: блок возвращает пустую строку и нулевую высоту.

export type BlockResult = { svg: string; height: number };

export const EMPTY_BLOCK: BlockResult = { svg: "", height: 0 };

/**
 * Сколько добавить каждому зазору колонки, чтобы неиспользованная высота стала
 * воздухом МЕЖДУ блоками, а не одной дырой посреди наклейки. Потолок на зазор
 * обязателен: без него бедные данные растаскивают блоки по углам, и наклейка
 * перестаёт читаться как единая композиция — остаток сверх потолка вызывающий
 * отдаёт центрированию колонки.
 */
export const distributeSlack = (slackPx: number, gapCount: number, maxExtraPerGapPx: number): number =>
  gapCount <= 0 || slackPx <= 0 ? 0 : Math.min(maxExtraPerGapPx, Math.floor(slackPx / gapCount));

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

/**
 * То же, но в несколько строк: берём столько имён, сколько влезает в maxLines
 * строк заданного кегля, остальное уводим в «+N». На 75×120 мм строка состава
 * может занять две строки — так на наклейку попадает весь солод, а не первые
 * два сорта и «+4».
 */
export const fitNamesToLines = (
  names: string[],
  params: { maxNames: number; fontId: LabelFontId; sizePx: number; maxWidthPx: number; maxLines: number }
): string[] => {
  if (names.length === 0) {
    return [];
  }
  const wrap = (text: string): string[] | null => {
    const lines: string[] = [];
    let current = "";
    for (const word of text.split(" ")) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (measureTextPx(candidate, params.fontId, params.sizePx) <= params.maxWidthPx) {
        current = candidate;
        continue;
      }
      if (current.length === 0) {
        // Одно слово шире строки — этот набор имён не разложить.
        return null;
      }
      lines.push(current);
      current = word;
      if (lines.length === params.maxLines) {
        return null;
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
    return lines.length <= params.maxLines ? lines : null;
  };

  for (let count = Math.min(params.maxNames, names.length); count >= 1; count -= 1) {
    const joined = joinWithOverflow(names, count);
    const lines = joined ? wrap(joined.toUpperCase()) : null;
    if (lines) {
      return lines;
    }
  }
  const single = joinWithOverflow(names, 1);
  return single ? [truncateToWidth(single.toUpperCase(), params.fontId, params.sizePx, params.maxWidthPx)] : [];
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

// Межстрочник заголовка. Базовый 1.08 em — то, что нужно обычному капсу
// («ЖАБА» над «ВОДА»). Но кириллица так не считается: акцент «Ё»/«Й» лезет на
// 1.042 em вверх, выносная «Щ»/«Д»/«Ц»/«У» — на 0.166 em вниз, и на 1.08 em
// строки «РОЩА» / «ЁЖИК» физически НАЛЕЗАЮТ друг на друга. Поэтому интерлиньяж
// считается по чернилам конкретных строк: соседние строки раздвигаются ровно
// настолько, чтобы между их чернилами остался воздух TITLE_MIN_INK_GAP.
const TITLE_BASE_LINE_HEIGHT = 1.08;
const TITLE_MIN_INK_GAP = 0.12;

type TitleLayout = { firstBaseline: number; gaps: number[]; height: number };

const layoutTitleLines = (fitted: FittedText): TitleLayout => {
  const size = fitted.fontSizePx;
  const extents = fitted.lines.map((line) => inkExtentsPx(line, "displayBold", size));
  const baseLineHeight = Math.round(size * TITLE_BASE_LINE_HEIGHT);
  const minInkGap = size * TITLE_MIN_INK_GAP;
  const gaps = extents
    .slice(0, -1)
    .map((prev, index) => Math.max(baseLineHeight, Math.ceil(prev.below + extents[index + 1].above + minInkGap)));
  // Первая базовая линия ниже акцента: иначе точки «Ё» вылезают за верх блока
  // (а он вплотную примыкает к линейке или рамке).
  const firstBaseline = Math.max(size, Math.ceil(extents[0]?.above ?? 0));
  // Хвост под выносные последней строки; для строки без них — прежний зазор.
  const tail = Math.max(
    Math.round(size * (TITLE_BASE_LINE_HEIGHT - 1)),
    Math.ceil(extents[extents.length - 1]?.below ?? 0)
  );
  return {
    firstBaseline,
    gaps,
    height: firstBaseline + gaps.reduce((sum, gap) => sum + gap, 0) + tail
  };
};

/**
 * Название пива капсом с автоподбором кегля. Рендерится от y=0 — вызывающий
 * транслирует. maxHeightPx (если задан) ужимает кегль так, чтобы блок влез в
 * отведённую высоту: место под данные важнее крупного заголовка.
 */
export const titleBlock = (
  ctx: LabelRenderContext,
  params: { cx: number; width: number; maxSizePx: number; minSizePx: number; maxHeightPx?: number }
): BlockResult => {
  const fitTo = (maxSizePx: number): FittedText =>
    fitTextLines(ctx.slots.title.toUpperCase(), {
      fontId: "displayBold",
      maxWidthPx: params.width,
      maxLines: 2,
      maxSizePx,
      minSizePx: params.minSizePx
    });

  let fitted = fitTo(params.maxSizePx);
  let layout = layoutTitleLines(fitted);

  if (params.maxHeightPx !== undefined) {
    while (layout.height > params.maxHeightPx && fitted.fontSizePx > params.minSizePx) {
      fitted = fitTo(fitted.fontSizePx - 1);
      layout = layoutTitleLines(fitted);
    }
  }

  const parts: string[] = [];
  let y = layout.firstBaseline;
  fitted.lines.forEach((line, index) => {
    parts.push(textEl({ x: params.cx, y, fontId: "displayBold", sizePx: fitted.fontSizePx, text: line, anchor: "middle" }));
    y += layout.gaps[index] ?? 0;
  });
  return { svg: parts.join(""), height: layout.height };
};

/**
 * Заголовок колонки «◆ ABV ◆». Кегль (а в крайнем случае и ромбы) уступают
 * ширине колонки: заголовок, налезающий на разделитель, читается как брак
 * печати — «ЦВЕТ» на 43×25 мм подходит к границе вплотную.
 */
const columnHeader = (
  cx: number,
  y: number,
  label: string,
  params: { sizePx: number; minSizePx: number; diamondR: number; maxWidthPx: number }
): string => {
  const totalWidth = (sizePx: number, spacing: number, withDiamonds: boolean): number => {
    const textWidth = measureTextPx(label, "bodyMedium", sizePx, spacing);
    // Ромб добавляет по (зазор + свой диаметр) с каждой стороны.
    return withDiamonds ? textWidth + 2 * (Math.round(sizePx * 0.6) + 2 * params.diamondR) : textWidth;
  };
  for (const withDiamonds of [true, false]) {
    for (let sizePx = params.sizePx; sizePx >= params.minSizePx; sizePx -= 1) {
      for (const ratio of [0.25, 0.15, 0.08]) {
        const spacing = Math.round(sizePx * ratio);
        if (totalWidth(sizePx, spacing, withDiamonds) > params.maxWidthPx) {
          continue;
        }
        const text = textEl({ x: cx, y, fontId: "bodyMedium", sizePx, text: label, anchor: "middle", letterSpacingPx: spacing });
        if (!withDiamonds) {
          return text;
        }
        const gap = Math.round(measureTextPx(label, "bodyMedium", sizePx, spacing) / 2) + Math.round(sizePx * 0.6) + params.diamondR;
        const dy = Math.round(sizePx * 0.34);
        return [diamond(cx - gap, y - dy, params.diamondR), text, diamond(cx + gap, y - dy, params.diamondR)].join("");
      }
    }
  }
  return textEl({ x: cx, y, fontId: "bodyMedium", sizePx: params.minSizePx, text: label, anchor: "middle" });
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

  // Внутренняя ширина колонки: у разделителей должен оставаться воздух.
  const innerWidth = colWidth - mm(3);

  columns.forEach((column, index) => {
    const cx = Math.round(params.x + colWidth * index + colWidth / 2);
    parts.push(
      columnHeader(cx, headerY, column.label, {
        sizePx: headerSize,
        minSizePx: mm(1.9),
        diamondR: Math.max(2, mm(0.5)),
        maxWidthPx: innerWidth
      })
    );
    // Длинное значение («8 EBC», «12,5%») ужимаем кеглем, а не режем с «…»:
    // обрезанное число хуже, чем то же число помельче.
    let columnValueSize = valueSize;
    while (columnValueSize > mm(2.6) && measureTextPx(column.value, "monoBold", columnValueSize) > innerWidth) {
      columnValueSize -= 1;
    }
    parts.push(textEl({ x: cx, y: valueY, fontId: "monoBold", sizePx: columnValueSize, text: column.value, anchor: "middle" }));
    if (index > 0) {
      const sx = Math.round(params.x + colWidth * index);
      parts.push(`<rect x="${sx}" y="${params.y + Math.round(headerSize * 0.2)}" width="${Math.max(2, mm(0.25))}" height="${height - Math.round(headerSize * 0.4)}" fill="black"/>`);
    }
  });

  return { svg: parts.join(""), height };
};

/**
 * Стат-строка «~5.6% · 32 IBU · 24 EBC» — та же троица, что в statBand, но в
 * одну строку. Нужна на 58×40 мм с QR: трёхколоночная панель и код рядом по
 * высоте не помещаются, а жертвовать данными ради панели неправильно.
 */
export const statLine = (ctx: LabelRenderContext, params: { cx: number; width: number; y: number }): BlockResult => {
  const { slots, mm } = ctx;
  const values = [
    slots.abvText,
    slots.ibu === null ? null : `${slots.ibu} IBU`,
    slots.ebc === null ? null : `${slots.ebc} EBC`
  ].filter((value): value is string => Boolean(value));
  if (values.length === 0) {
    return EMPTY_BLOCK;
  }
  // Кегль ужимаем под ширину: цифры на наклейке режутся многоточием — «8… EBC»
  // хуже, чем те же данные шрифтом помельче.
  const text = values.join("  ·  ");
  const maxSize = mm(3.4);
  let sizePx = maxSize;
  while (sizePx > mm(2.4) && measureTextPx(text, "monoBold", sizePx) > params.width) {
    sizePx -= 1;
  }
  return {
    svg: textEl({
      x: params.cx,
      y: params.y + sizePx,
      fontId: "monoBold",
      sizePx,
      text: truncateToWidth(text, "monoBold", sizePx, params.width),
      anchor: "middle"
    }),
    height: Math.round(maxSize * 1.3)
  };
};

/** Высота стат-строки (для вертикального бюджета). */
export const statLineHeight = (ctx: LabelRenderContext): number => Math.round(ctx.mm(3.4) * 1.3);

/**
 * Строки «СОЛОД / ХМЕЛЬ / ДРОЖЖИ» с линейными иконками (референс) —
 * только заполненные; между строками тонкие линейки.
 */
export const ingredientRows = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number; icons: { grain: string; hop: string; yeast: string } | null }
): BlockResult => {
  const { slots, mm } = ctx;
  // На 75×120 мм состав — главный текстовый блок: кегль и иконка мельче, метка
  // короче, значение переносится на вторую строку. Так на наклейку попадают
  // все сорта солода и хмеля, а не первые два и «+4».
  const wide = ctx.tier === "L";
  const labelSize = wide ? mm(2.4) : mm(2.8);
  const iconSize = wide ? mm(3.2) : mm(3.6);
  const lineHeight = Math.round(labelSize * 1.24);
  const maxLines = wide ? 2 : 1;
  const labelSpacing = Math.round(labelSize * 0.1);
  const gap = wide ? mm(1.4) : mm(2);

  // Ширина под значение (за вычетом иконки и самой длинной метки) — чтобы
  // «+N» подбирался по реальному месту, а не резался с «…» на середине имени.
  const iconOffset = params.icons ? iconSize + gap : 0;
  const maxLabelWidth = Math.max(
    ...["СОЛОД:", "ХМЕЛЬ:", "ДРОЖЖИ:"].map((label) => measureTextPx(label, "bodyBold", labelSize, labelSpacing))
  );
  const valueMax = params.width - iconOffset - maxLabelWidth - gap;

  const fitNames = (names: string[], maxNames: number): string[] =>
    fitNamesToLines(names, { maxNames, fontId: "body", sizePx: labelSize, maxWidthPx: valueMax, maxLines });

  const rows: Array<{ icon: "grain" | "hop" | "yeast"; label: string; lines: string[] }> = [];
  const malts = fitNames(slots.malts, wide ? 8 : 3);
  const hops = fitNames(slots.hops, wide ? 8 : 4);
  if (malts.length > 0) {
    rows.push({ icon: "grain", label: "СОЛОД:", lines: malts });
  }
  if (hops.length > 0) {
    rows.push({ icon: "hop", label: "ХМЕЛЬ:", lines: hops });
  }
  if (slots.yeast) {
    // Дрожжи — одно имя: перенос ему не нужен, длинное режем с «…».
    rows.push({ icon: "yeast", label: "ДРОЖЖИ:", lines: [truncateToWidth(slots.yeast.toUpperCase(), "body", labelSize, valueMax)] });
  }
  if (rows.length === 0) {
    return EMPTY_BLOCK;
  }

  const parts: string[] = [];
  const rowPad = wide ? mm(1.2) : mm(1.6);
  let y = params.y;

  rows.forEach((row, index) => {
    const textHeight = row.lines.length * lineHeight;
    const rowHeight = Math.max(iconSize, textHeight) + rowPad;
    const textTop = y + Math.round((rowHeight - textHeight) / 2);
    const baseline = textTop + Math.round(labelSize * 1.02);
    let textX = params.x;
    if (params.icons) {
      parts.push(iconAt(params.icons[row.icon], params.x, y + Math.round((rowHeight - iconSize) / 2), iconSize));
      textX += iconOffset;
    }
    parts.push(
      textEl({ x: textX, y: baseline, fontId: "bodyBold", sizePx: labelSize, text: row.label, letterSpacingPx: labelSpacing })
    );
    const valueX = textX + maxLabelWidth + gap;
    row.lines.forEach((line, lineIndex) => {
      parts.push(textEl({ x: valueX, y: baseline + lineIndex * lineHeight, fontId: "body", sizePx: labelSize, text: line }));
    });
    if (index < rows.length - 1) {
      parts.push(hRule(params.x, params.x + params.width, y + rowHeight, Math.max(2, mm(0.25))));
    }
    y += rowHeight + (index < rows.length - 1 ? mm(0.8) : 0);
  });

  return { svg: parts.join(""), height: y - params.y };
};

/** Описание влезло целиком, влезло не полностью или не влезло вовсе. */
export type DescriptionBlockResult = BlockResult & { trimmed: boolean };

/** Признак блока описания в готовом SVG (см. resolveDescriptionPrintState). */
export const DESCRIPTION_SVG_ATTR = "data-label-description";

/**
 * Урезанное описание печатаем только от двух строк. Одна строка, оборванная
 * «…» посреди фразы, не читается как описание — она читается как брак печати;
 * честнее не печатать её вовсе и сказать об этом в студии (X-Label-Description).
 * Целиком поместившаяся короткая строка — другое дело, её печатаем.
 */
const DESCRIPTION_MIN_TRIMMED_LINES = 2;

/**
 * Пара предложений о пиве — мелким текстом по центру, внизу наклейки.
 * Описание — самый младший блок наклейки: место ему достаётся по остатку
 * (maxHeightPx), и оно урезается по строкам, лишь бы не выдавить QR и данные.
 * Урезание не молчаливое: блок помечается в SVG, роут отдаёт это заголовком,
 * а студия объясняет пользователю (тот же приём, что с QR).
 */
export const descriptionBlock = (
  ctx: LabelRenderContext,
  params: { cx: number; width: number; y: number; maxLines?: number; maxHeightPx?: number }
): DescriptionBlockResult => {
  const { slots, mm } = ctx;
  if (!slots.description) {
    return { ...EMPTY_BLOCK, trimmed: false };
  }
  const source = slots.description.trim().replace(/\s+/g, " ");
  const maxLines = params.maxLines ?? 3;

  for (let lines = maxLines; lines >= 1; lines -= 1) {
    const fitted = fitTextLines(source, {
      fontId: "body",
      maxWidthPx: params.width,
      maxLines: lines,
      maxSizePx: mm(2.5),
      minSizePx: mm(2)
    });
    if (fitted.lines.length === 0) {
      continue;
    }
    const lineHeight = Math.round(fitted.fontSizePx * 1.32);
    const height = fitted.lines.length * lineHeight;
    if (params.maxHeightPx !== undefined && height > params.maxHeightPx) {
      continue;
    }
    const trimmed = fitted.lines.join(" ") !== source;
    if (trimmed && fitted.lines.length < DESCRIPTION_MIN_TRIMMED_LINES) {
      break;
    }
    const parts = fitted.lines.map((line, index) =>
      textEl({
        x: params.cx,
        y: params.y + fitted.fontSizePx + index * lineHeight,
        fontId: "body",
        sizePx: fitted.fontSizePx,
        text: line,
        anchor: "middle"
      })
    );
    return {
      svg: `<g ${DESCRIPTION_SVG_ATTR}="${trimmed ? "trimmed" : "full"}">${parts.join("")}</g>`,
      height,
      trimmed
    };
  }

  // Не влезло ни одной полноценной строки — описание не печатаем (но и не молчим).
  return { ...EMPTY_BLOCK, trimmed: true };
};

// Шкалы-инфографика (L-tier). Общий язык обеих: ось от 0 до максимума,
// деления с цифрами и МАРКЕР-указатель на значении рецепта — значение это
// точка на шкале, а не диапазон, поэтому заливки «до значения» нет.

/**
 * Маркер значения: моноширинное число, под ним треугольник-указатель вниз.
 * Рендерится сверху вниз от topY; остриё приходится ровно на bottom.
 */
const scaleMarker = (
  ctx: LabelRenderContext,
  params: { cx: number; topY: number; valueText: string; leftBound: number; rightBound: number }
): { svg: string; height: number } => {
  const { mm } = ctx;
  const valueSize = mm(2.8);
  const tipHeight = mm(1.6);
  const halfWidth = mm(1.1);
  const gap = mm(0.6);
  // Подпись прижимаем внутрь шкалы, если маркер у самого края.
  const textHalf = Math.round(measureTextPx(params.valueText, "monoBold", valueSize) / 2);
  const textCx = Math.min(Math.max(params.cx, params.leftBound + textHalf), params.rightBound - textHalf);
  const valueBaseline = params.topY + valueSize;
  const triTop = valueBaseline + gap;
  const tipY = triTop + tipHeight;
  const svg = [
    textEl({ x: textCx, y: valueBaseline, fontId: "monoBold", sizePx: valueSize, text: params.valueText, anchor: "middle" }),
    `<path d="M ${params.cx} ${tipY} L ${params.cx - halfWidth} ${triTop} L ${params.cx + halfWidth} ${triTop} Z" fill="black"/>`
  ].join("");
  return { svg, height: tipY - params.topY };
};

/** Ось с делениями и цифрами; возвращает SVG и высоту от оси вниз. */
const scaleAxis = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number; ticks: number[]; scaleMax: number; overflow: boolean }
): { svg: string; height: number } => {
  const { mm } = ctx;
  const stroke = Math.max(2, mm(0.25));
  const tickSize = mm(2);
  const tickLen = mm(1.2);
  const parts: string[] = [hRule(params.x, params.x + params.width, params.y, stroke)];
  const labelsY = params.y + tickLen + tickSize + mm(0.6);
  for (const tick of params.ticks) {
    const tx = Math.round(params.x + (tick / params.scaleMax) * params.width);
    parts.push(`<rect x="${tx - Math.floor(stroke / 2)}" y="${params.y}" width="${stroke}" height="${tickLen}" fill="black"/>`);
    const isLast = tick === params.ticks[params.ticks.length - 1];
    parts.push(
      textEl({
        x: tx,
        y: labelsY,
        fontId: "mono",
        sizePx: tickSize,
        text: isLast && params.overflow ? `${tick}+` : String(tick),
        anchor: "middle"
      })
    );
  }
  return { svg: parts.join(""), height: labelsY - params.y + Math.round(tickSize * 0.25) };
};

/**
 * Шкала горечи: ось 0–100+ с делениями и маркером на значении рецепта.
 * Слева — метка «IBU» (имя оси, без него шкала нечитаема).
 */
export const ibuScale = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number }
): BlockResult => {
  const { slots, mm } = ctx;
  if (slots.ibu === null || !slots.showIbuScale) {
    return EMPTY_BLOCK;
  }
  const scaleMax = 100;
  const axisLabelSize = mm(2.4);
  const axisLabelWidth = measureTextPx("IBU", "bodyBold", axisLabelSize, Math.round(axisLabelSize * 0.2)) + mm(2.5);
  const axisX = params.x + axisLabelWidth;
  const axisWidth = params.width - axisLabelWidth;

  const clamped = Math.min(slots.ibu, scaleMax);
  const markerCx = Math.round(axisX + (clamped / scaleMax) * axisWidth);
  const parts: string[] = [];

  // Поток сверху вниз: маркер → ось → цифры делений.
  const marker = scaleMarker(ctx, {
    cx: markerCx,
    topY: params.y,
    valueText: String(slots.ibu),
    leftBound: axisX,
    rightBound: axisX + axisWidth
  });
  const axisY = params.y + marker.height;
  const axis = scaleAxis(ctx, { x: axisX, width: axisWidth, y: axisY, ticks: [0, 20, 40, 60, 80, 100], scaleMax, overflow: slots.ibu > scaleMax });

  parts.push(marker.svg);
  parts.push(axis.svg);
  parts.push(
    textEl({
      x: params.x,
      y: axisY + Math.round(axisLabelSize * 0.38),
      fontId: "bodyBold",
      sizePx: axisLabelSize,
      text: "IBU",
      letterSpacingPx: Math.round(axisLabelSize * 0.2)
    })
  );

  return { svg: parts.join(""), height: marker.height + axis.height };
};

/**
 * Шкала цвета: полоса из ступеней растровой плотности (светлое → тёмное)
 * и маркер на EBC рецепта. Именно шкала объясняет точки: это градиент
 * цвета пива, а не абстрактный узор.
 */
export const colorScale = (
  ctx: LabelRenderContext,
  params: { x: number; width: number; y: number; idPrefix: string }
): BlockResult => {
  const { slots, mm, dpi } = ctx;
  if (slots.ebc === null) {
    return EMPTY_BLOCK;
  }
  const scaleMax = 80;
  const axisLabelSize = mm(2.4);
  const axisLabelWidth = measureTextPx("EBC", "bodyBold", axisLabelSize, Math.round(axisLabelSize * 0.2)) + mm(2.5);
  const stripX = params.x + axisLabelWidth;
  const stripWidth = params.width - axisLabelWidth;
  const stripHeight = mm(4);
  const stroke = Math.max(2, mm(0.25));

  const clamped = Math.min(slots.ebc, scaleMax);
  const markerCx = Math.round(stripX + (clamped / scaleMax) * stripWidth);
  const parts: string[] = [];

  const marker = scaleMarker(ctx, {
    cx: markerCx,
    topY: params.y,
    valueText: String(slots.ebc),
    leftBound: stripX,
    rightBound: stripX + stripWidth
  });
  parts.push(marker.svg);

  // Полоса-градиент: сегменты по EBC-диапазонам, плотность растёт слева направо.
  const stripY = params.y + marker.height;
  const segments = [2, 8, 16, 25, 35, 45, 55, 65, 75];
  const defs: string[] = [];
  const rects: string[] = [];
  segments.forEach((ebc, index) => {
    const patternId = `${params.idPrefix}-seg-${index}`;
    defs.push(ditherPatternDef(patternId, ebcToDitherLevel(ebc), dpi));
    const segX = Math.round(stripX + (index / segments.length) * stripWidth);
    const segEnd = Math.round(stripX + ((index + 1) / segments.length) * stripWidth);
    rects.push(`<rect x="${segX}" y="${stripY}" width="${segEnd - segX}" height="${stripHeight}" fill="url(#${patternId})"/>`);
  });
  parts.push(`<defs>${defs.join("")}</defs>`);
  parts.push(rects.join(""));
  parts.push(
    `<rect x="${stripX}" y="${stripY}" width="${stripWidth}" height="${stripHeight}" fill="none" stroke="black" stroke-width="${stroke}"/>`
  );

  const axisY = stripY + stripHeight;
  const axis = scaleAxis(ctx, { x: stripX, width: stripWidth, y: axisY, ticks: [0, 20, 40, 60, 80], scaleMax, overflow: slots.ebc > scaleMax });
  parts.push(axis.svg);
  parts.push(
    textEl({
      x: params.x,
      y: stripY + Math.round(stripHeight / 2 + axisLabelSize * 0.38),
      fontId: "bodyBold",
      sizePx: axisLabelSize,
      text: "EBC",
      letterSpacingPx: Math.round(axisLabelSize * 0.2)
    })
  );

  return { svg: parts.join(""), height: marker.height + stripHeight + axis.height };
};

type MetaLine = { kind: "bottling" | "volumeBatch" | "author" | "brand"; text: string; fontId: LabelFontId; spacing: number };

/**
 * «0,5 Л · ПАРТИЯ №3» — объём тары и номер партии в одной строке: порознь они
 * съедали бы две строки мета-блока, а он и так тесный. Номер печатаем с «№»,
 * даже если пользователь ввёл голое число.
 */
const volumeBatchText = (slots: LabelRenderContext["slots"]): string | null => {
  const parts: string[] = [];
  if (slots.volumeText) {
    parts.push(slots.volumeText.toUpperCase());
  }
  if (slots.batchText) {
    const value = slots.batchText.trim();
    parts.push(`ПАРТИЯ ${value.startsWith("№") ? value : `№${value}`}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
};

type BottomMetaParams = { x: number; width: number; y: number; maxHeight: number; qrSizeMm: number; showAuthor: boolean };

/** Строки и QR мета-блока до подгонки под высоту. */
const planBottomMeta = (
  ctx: LabelRenderContext,
  params: Pick<BottomMetaParams, "width" | "qrSizeMm" | "showAuthor">
): { lines: MetaLine[]; qr: ReturnType<typeof buildQrSvg>; lineSize: number; lineGap: number } => {
  const { slots, mm } = ctx;
  const lineSize = mm(2.4);
  const lineGap = Math.round(lineSize * 0.8);
  const lines: MetaLine[] = [];
  // Ширина текстовой колонки: справа может стоять QR — под него текст не лезет.
  const textWidth = params.width - (slots.qrUrl ? mm(params.qrSizeMm + 3) : 0);
  if (slots.bottlingDateText) {
    lines.push({ kind: "bottling", text: `РОЗЛИВ: ${slots.bottlingDateText}`, fontId: "bodyMedium", spacing: Math.round(lineSize * 0.12) });
  }
  const volumeBatch = volumeBatchText(slots);
  if (volumeBatch) {
    lines.push({
      kind: "volumeBatch",
      text: truncateToWidth(volumeBatch, "mono", lineSize, textWidth),
      fontId: "mono",
      spacing: Math.round(lineSize * 0.12)
    });
  }
  if (params.showAuthor && slots.authorName) {
    lines.push({
      kind: "author",
      text: truncateToWidth(slots.authorName.toUpperCase(), "bodyMedium", lineSize, textWidth),
      fontId: "bodyMedium",
      spacing: Math.round(lineSize * 0.18)
    });
  }
  if (slots.brandText) {
    lines.push({ kind: "brand", text: slots.brandText, fontId: "mono", spacing: Math.round(lineSize * 0.2) });
  }
  const qr = slots.qrUrl ? buildQrSvg(slots.qrUrl, mm(params.qrSizeMm)) : null;
  return { lines, qr, lineSize, lineGap };
};

/**
 * Высота, нужная мета-блоку со ВСЕМИ строками и QR. Шаблон резервирует её
 * заранее и подгоняет заголовок: жертвовать данными (и тем более QR) ради
 * лишнего кегля названия — неправильный приоритет.
 */
export const bottomMetaDesiredHeight = (
  ctx: LabelRenderContext,
  params: Pick<BottomMetaParams, "width" | "qrSizeMm" | "showAuthor">
): number => {
  const { mm } = ctx;
  const { lines, qr, lineSize, lineGap } = planBottomMeta(ctx, params);
  const textHeight = lines.length * lineSize + Math.max(0, lines.length - 1) * lineGap;
  return Math.max(textHeight, qr ? qr.sizePx + lineSize + mm(1) : 0);
};

/**
 * Нижний мета-блок: розлив/«готово после», автор, марка + QR справа
 * (QR только при slots.qrUrl — т.е. только для опубликованных).
 */
export const bottomMeta = (ctx: LabelRenderContext, params: BottomMetaParams): BlockResult => {
  const { mm } = ctx;
  const plan = planBottomMeta(ctx, params);
  const { lineSize, lineGap } = plan;
  const lines = [...plan.lines];
  let qr = plan.qr;

  // QR не влезает по вертикали (вместе с подписью) — блок QR не рендерим.
  if (qr && qr.sizePx + lineSize + mm(1) > params.maxHeight) {
    qr = null;
  }

  // Не влезаем по высоте — убираем строки по приоритету: автор → марка →
  // объём/партия; дата розлива остаётся до последнего.
  const lineBlockHeight = (count: number): number => count * lineSize + Math.max(0, count - 1) * lineGap;
  for (const dropKind of ["author", "brand", "volumeBatch"] as const) {
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
