import { ditherPatternDef, ebcToDitherLevel } from "../density";
import { measureTextPx } from "../fonts";
import { diamond, dottedRule, grainIconPath, hopIconPath, hRule, iconAt, ruleWithDiamond, textEl, ticketFrame, yeastIconPath } from "../svg";

import {
  bottomMeta,
  bottomMetaDesiredHeight,
  fitSpacedLine,
  ibuScale,
  ingredientRows,
  statBand,
  statBandHeight,
  titleBlock
} from "./blocks";
import type { LabelRenderContext, LabelTemplate } from "./types";

// «Линейный крафт» — референсная эстетика: билетная рамка с вогнутыми
// уголками, кольцевой значок с хмелем, ромбы, пунктирные линейки, бокал
// с растровой плотностью по EBC, моноширинные цифры.

const svgOpen = (ctx: LabelRenderContext): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.widthPx}" height="${ctx.heightPx}" viewBox="0 0 ${ctx.widthPx} ${ctx.heightPx}">` +
  `<rect width="${ctx.widthPx}" height="${ctx.heightPx}" fill="white"/>`;

const frame = (ctx: LabelRenderContext, thickMm: number): string =>
  ticketFrame({
    widthPx: ctx.widthPx,
    heightPx: ctx.heightPx,
    insetPx: ctx.mm(2),
    thickPx: Math.max(3, ctx.mm(thickMm)),
    thinPx: Math.max(2, ctx.mm(0.25)),
    gapPx: ctx.mm(0.8),
    cornerPx: ctx.mm(2.4)
  });

const styleLine = (
  ctx: LabelRenderContext,
  params: { cx: number; width: number; y: number; sizeMm: number; decorate?: boolean }
): { svg: string; height: number } => {
  const { slots, mm } = ctx;
  if (!slots.styleName) {
    return { svg: "", height: 0 };
  }
  const raw = params.decorate ? `• ${slots.styleName} •` : slots.styleName;
  const fit = fitSpacedLine(raw, {
    fontId: "bodyMedium",
    maxWidthPx: params.width,
    sizePx: mm(params.sizeMm),
    minSizePx: mm(2),
    spacingRatio: 0.3
  });
  const svg = textEl({ x: params.cx, y: params.y + fit.sizePx, fontId: "bodyMedium", sizePx: fit.sizePx, text: fit.text, anchor: "middle", letterSpacingPx: fit.spacingPx });
  return { svg, height: Math.round(fit.sizePx * 1.6) };
};

/** Кольцевой значок: двойное кольцо, хмель в центре, текст по верхней дуге. */
const badge = (ctx: LabelRenderContext, params: { cx: number; cy: number; rPx: number; ringText: string | null }): string => {
  const { mm } = ctx;
  const stroke = Math.max(2, mm(0.3));
  const parts: string[] = [];
  parts.push(`<circle cx="${params.cx}" cy="${params.cy}" r="${params.rPx}" fill="none" stroke="black" stroke-width="${stroke}"/>`);
  const innerR = params.rPx - mm(3.4);
  parts.push(`<circle cx="${params.cx}" cy="${params.cy}" r="${innerR}" fill="none" stroke="black" stroke-width="${stroke}"/>`);

  const iconSize = Math.round(innerR * 1.5);
  parts.push(iconAt(hopIconPath(2), params.cx - Math.round(iconSize / 2), params.cy - Math.round(iconSize / 2), iconSize));

  if (params.ringText) {
    const textR = params.rPx - mm(1.85);
    const ringSize = mm(2.2);
    // Путь начинается СНИЗУ и идёт по часовой: верхняя точка = 50% длины,
    // текст с startOffset 50% + anchor middle центрируется по верхней дуге
    // и не упирается в начало пути (текст до старта пути SVG не рендерит).
    const pathD =
      `M ${params.cx} ${params.cy + textR} ` +
      `A ${textR} ${textR} 0 1 1 ${params.cx} ${params.cy - textR} ` +
      `A ${textR} ${textR} 0 1 1 ${params.cx} ${params.cy + textR}`;
    parts.push(`<defs><path id="badge-ring" d="${pathD}"/></defs>`);
    parts.push(
      `<text font-family="Rubik" font-weight="500" font-size="${ringSize}" letter-spacing="${Math.round(ringSize * 0.22)}" fill="black">` +
        `<textPath href="#badge-ring" startOffset="50%" text-anchor="middle">${params.ringText}</textPath>` +
        `</text>`
    );
    parts.push(diamond(params.cx, params.cy + params.rPx - mm(1.85), Math.max(2, mm(0.7))));
  }
  return parts.join("");
};

/** Плашка OG/FG сбоку от значка: линейка, метка, значение, линейка с ромбом. */
const sidePlaque = (ctx: LabelRenderContext, params: { cx: number; cy: number; label: string; value: string }): string => {
  const { mm } = ctx;
  const labelSize = mm(2.6);
  const valueSize = mm(3.4);
  const halfWidth = Math.round(Math.max(measureTextPx(params.value, "monoBold", valueSize), mm(10)) / 2) + mm(1);
  const stroke = Math.max(2, mm(0.25));
  const topY = params.cy - Math.round(valueSize * 1.4);
  const bottomY = params.cy + Math.round(valueSize * 0.9);
  return [
    hRule(params.cx - halfWidth, params.cx + halfWidth, topY, stroke),
    textEl({ x: params.cx, y: topY + Math.round(labelSize * 1.5), fontId: "bodyMedium", sizePx: labelSize, text: params.label, anchor: "middle", letterSpacingPx: Math.round(labelSize * 0.3) }),
    textEl({ x: params.cx, y: params.cy + Math.round(valueSize * 0.55), fontId: "monoBold", sizePx: valueSize, text: params.value, anchor: "middle" }),
    hRule(params.cx - halfWidth, params.cx + halfWidth, bottomY, stroke),
    diamond(params.cx, bottomY + mm(1.6), Math.max(2, mm(0.7)))
  ].join("");
};

/** Бокал (пинта) с заливкой дизеринг-паттерном по EBC. */
const beerGlass = (ctx: LabelRenderContext, params: { x: number; y: number; heightPx: number; patternId: string }): string => {
  const { slots, mm, dpi } = ctx;
  if (slots.ebc === null) {
    return "";
  }
  const h = params.heightPx;
  const w = Math.round(h * 0.62);
  const stroke = Math.max(2, mm(0.35));
  const inset = stroke + Math.max(2, mm(0.3));
  const topInset = Math.round(w * 0.08);
  const bottomInset = Math.round(w * 0.2);
  const liquidTop = Math.round(h * 0.16);
  // Боковые стенки — прямые: x на глубине y интерполируется между верхом и низом.
  const sideAt = (edgeTop: number, edgeBottom: number, yPos: number): number =>
    Math.round(edgeTop + ((edgeBottom - edgeTop) * yPos) / h);
  const outline =
    `M ${topInset} 0 L ${w - topInset} 0 ` +
    `L ${w - bottomInset} ${h - Math.round(h * 0.06)} ` +
    `Q ${w - bottomInset - 2} ${h} ${w - bottomInset - Math.round(w * 0.08)} ${h} ` +
    `L ${bottomInset + Math.round(w * 0.08)} ${h} ` +
    `Q ${bottomInset + 2} ${h} ${bottomInset} ${h - Math.round(h * 0.06)} Z`;
  const liquid =
    `M ${sideAt(topInset, bottomInset, liquidTop) + inset} ${liquidTop} ` +
    `L ${w - sideAt(topInset, bottomInset, liquidTop) - inset} ${liquidTop} ` +
    `L ${w - bottomInset - inset} ${h - inset} ` +
    `L ${bottomInset + inset} ${h - inset} Z`;
  return [
    `<g transform="translate(${params.x} ${params.y})">`,
    `<defs>${ditherPatternDef(params.patternId, ebcToDitherLevel(slots.ebc), dpi)}</defs>`,
    `<path d="${liquid}" fill="url(#${params.patternId})"/>`,
    `<path d="${outline}" fill="none" stroke="black" stroke-width="${stroke}"/>`,
    `<path d="M ${sideAt(topInset, bottomInset, liquidTop)} ${liquidTop} L ${w - sideAt(topInset, bottomInset, liquidTop)} ${liquidTop}" stroke="black" stroke-width="${Math.max(2, mm(0.25))}"/>`,
    `</g>`
  ].join("");
};

const renderS = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const pad = mm(2) + Math.max(3, mm(0.5)) + mm(0.8) + Math.max(2, mm(0.25)) + mm(1.4);
  const cx = Math.round(widthPx / 2);
  const parts: string[] = [svgOpen(ctx), frame(ctx, 0.5)];

  const bottomSize = mm(2.8);
  const bottomLine = [slots.abvText, slots.bottlingDateText].filter(Boolean).join("  ");
  const bottomY = heightPx - pad - Math.round(bottomSize * 0.2);
  const titleArea = bottomLine ? bottomY - Math.round(bottomSize * 1.6) : heightPx - pad;

  const title = titleBlock(ctx, {
    cx,
    width: widthPx - pad * 2,
    maxSizePx: mm(5.5),
    minSizePx: mm(3),
    maxHeightPx: titleArea - pad
  });
  const titleY = pad + Math.max(0, Math.round((titleArea - pad - title.height) / 2));
  parts.push(`<g transform="translate(0 ${titleY})">${title.svg}</g>`);

  if (bottomLine) {
    const lineWidth = measureTextPx(bottomLine, "monoBold", bottomSize);
    const r = Math.max(2, mm(0.6));
    parts.push(textEl({ x: cx, y: bottomY, fontId: "monoBold", sizePx: bottomSize, text: bottomLine, anchor: "middle" }));
    parts.push(diamond(cx - Math.round(lineWidth / 2) - mm(2.4), bottomY - Math.round(bottomSize * 0.34), r));
    parts.push(diamond(cx + Math.round(lineWidth / 2) + mm(2.4), bottomY - Math.round(bottomSize * 0.34), r));
  }
  parts.push("</svg>");
  return parts.join("");
};

const renderM = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const pad = mm(2) + Math.max(3, mm(0.6)) + mm(0.8) + Math.max(2, mm(0.25)) + mm(2);
  const cx = Math.round(widthPx / 2);
  const contentWidth = widthPx - pad * 2;
  const parts: string[] = [svgOpen(ctx), frame(ctx, 0.6)];

  let y = pad + mm(0.5);

  const hasStats = slots.abvText !== null || slots.ibu !== null || slots.ebc !== null;
  const metaHeight = bottomMetaDesiredHeight(ctx, { width: contentWidth, qrSizeMm: 10, showAuthor: false });
  const reserved =
    (slots.styleName ? Math.round(mm(2.6) * 1.6) : 0) +
    mm(3.6) +
    (hasStats ? statBandHeight(ctx, true) + mm(1.6) : 0) +
    metaHeight +
    mm(1);
  const title = titleBlock(ctx, {
    cx,
    width: contentWidth,
    maxSizePx: mm(6.5),
    minSizePx: mm(2.8),
    maxHeightPx: heightPx - pad - y - reserved
  });
  parts.push(`<g transform="translate(0 ${y})">${title.svg}</g>`);
  y += title.height + mm(1.4);

  const style = styleLine(ctx, { cx, width: contentWidth, y, sizeMm: 2.6 });
  parts.push(style.svg);
  y += style.height;

  parts.push(dottedRule(pad, widthPx - pad, y + mm(1), Math.max(2, mm(0.25))));
  y += mm(2.6);

  const band = statBand(ctx, { x: pad, width: contentWidth, y, compact: true });
  parts.push(band.svg);
  y += band.height + (band.height > 0 ? mm(1.6) : 0);

  const meta = bottomMeta(ctx, { x: pad, width: contentWidth, y, maxHeight: heightPx - pad - y, qrSizeMm: 10, showAuthor: false });
  parts.push(meta.svg);
  parts.push("</svg>");
  return parts.join("");
};

const renderL = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const pad = mm(2) + Math.max(4, mm(0.7)) + mm(0.8) + Math.max(2, mm(0.25)) + mm(2.4);
  const cx = Math.round(widthPx / 2);
  const contentWidth = widthPx - pad * 2;
  const body: string[] = [];

  let y = pad + mm(0.5);

  // Значок с плашками OG/FG по бокам.
  const badgeR = mm(10);
  const badgeCy = y + badgeR + mm(0.5);
  const ringTextFull = slots.authorName ? `ДОМАШНЯЯ ПИВОВАРНЯ • ${slots.authorName.toUpperCase()}` : "ДОМАШНЯЯ ПИВОВАРНЯ";
  // Текст должен лечь на верхнюю дугу (≤ 45% окружности), иначе — без автора.
  const ringR = badgeR - mm(1.85);
  const ringSize = mm(2.2);
  const ringCapacity = 2 * Math.PI * ringR * 0.45;
  const ringText = measureTextPx(ringTextFull, "bodyMedium", ringSize, Math.round(ringSize * 0.22)) <= ringCapacity ? ringTextFull : "ДОМАШНЯЯ ПИВОВАРНЯ";
  body.push(badge(ctx, { cx, cy: badgeCy, rPx: badgeR, ringText }));
  if (slots.ogText) {
    body.push(sidePlaque(ctx, { cx: Math.round(pad + contentWidth * 0.14), cy: badgeCy, label: "OG", value: slots.ogText }));
  }
  if (slots.fgText) {
    body.push(sidePlaque(ctx, { cx: Math.round(pad + contentWidth * 0.86), cy: badgeCy, label: "FG", value: slots.fgText }));
  }
  y = badgeCy + badgeR + mm(2);

  // Блоки под заголовком не зависят от его кегля — меряем их заранее и отдаём
  // заголовку остаток высоты: данные и QR важнее крупного названия.
  const glassHeightProbe = mm(17);
  const rowsWidthProbe = slots.ebc !== null ? contentWidth - Math.round(glassHeightProbe * 0.62) - mm(4) : contentWidth;
  const styleProbe = styleLine(ctx, { cx, width: contentWidth, y: 0, sizeMm: 3, decorate: true });
  const rowsProbe = ingredientRows(ctx, {
    x: pad,
    width: rowsWidthProbe,
    y: 0,
    icons: { grain: grainIconPath(2), hop: hopIconPath(2), yeast: yeastIconPath(2) }
  });
  const rowsBlockProbe = Math.max(rowsProbe.height, slots.ebc !== null ? glassHeightProbe : 0);
  const bandProbe = statBand(ctx, { x: pad, width: contentWidth, y: 0 });
  const bitternessProbe = ibuScale(ctx, { x: pad, width: contentWidth, y: 0 });
  const metaHeight = bottomMetaDesiredHeight(ctx, { width: contentWidth, qrSizeMm: 13, showAuthor: true });
  const belowTitle =
    mm(1.2) +
    styleProbe.height +
    mm(3) +
    (rowsBlockProbe > 0 ? rowsBlockProbe + mm(4.2) : 0) +
    (bandProbe.height > 0 ? bandProbe.height + mm(1.8) : 0) +
    (bitternessProbe.height > 0 ? bitternessProbe.height + mm(2) : 0) +
    mm(2.2) +
    metaHeight;

  const title = titleBlock(ctx, {
    cx,
    width: contentWidth,
    maxSizePx: mm(9),
    minSizePx: mm(4.2),
    maxHeightPx: heightPx - pad - y - belowTitle
  });
  body.push(`<g transform="translate(0 ${y})">${title.svg}</g>`);
  y += title.height + mm(1.2);

  const style = styleLine(ctx, { cx, width: contentWidth, y, sizeMm: 3, decorate: true });
  body.push(style.svg);
  y += style.height;

  body.push(dottedRule(pad, widthPx - pad, y + mm(0.6), Math.max(2, mm(0.25))));
  y += mm(2.4);

  // Ингредиенты слева, бокал с EBC-плотностью справа.
  const glassHeight = mm(17);
  const glassWidth = Math.round(glassHeight * 0.62);
  const rowsWidth = slots.ebc !== null ? contentWidth - glassWidth - mm(4) : contentWidth;
  const rows = ingredientRows(ctx, {
    x: pad,
    width: rowsWidth,
    y,
    icons: { grain: grainIconPath(2), hop: hopIconPath(2), yeast: yeastIconPath(2) }
  });
  const glass = beerGlass(ctx, { x: pad + rowsWidth + mm(4), y, heightPx: glassHeight, patternId: "ebc-glass" });
  const rowsBlockHeight = Math.max(rows.height, slots.ebc !== null ? glassHeight : 0);
  if (rows.height > 0 || glass.length > 0) {
    body.push(rows.svg);
    body.push(glass);
    y += rowsBlockHeight + mm(1.8);
    body.push(ruleWithDiamond(pad, widthPx - pad, y, Math.max(2, mm(0.25)), Math.max(2, mm(0.7))));
    y += mm(2.4);
  }

  const band = statBand(ctx, { x: pad, width: contentWidth, y });
  if (band.height > 0) {
    body.push(band.svg);
    y += band.height + mm(1.8);
  }

  // Цвет в крафте показывает бокал с дизерингом — здесь только шкала горечи.
  const bitterness = ibuScale(ctx, { x: pad, width: contentWidth, y });
  if (bitterness.height > 0) {
    body.push(bitterness.svg);
    y += bitterness.height + mm(2);
  }

  body.push(dottedRule(pad, widthPx - pad, y, Math.max(2, mm(0.25))));
  y += mm(2.2);

  const meta = bottomMeta(ctx, { x: pad, width: contentWidth, y, maxHeight: heightPx - pad - y, qrSizeMm: 13, showAuthor: true });
  body.push(meta.svg);
  y += meta.height;

  const shift = Math.max(0, Math.round((heightPx - pad - y) / 2));
  return [svgOpen(ctx), frame(ctx, 0.7), `<g transform="translate(0 ${shift})">${body.join("")}</g>`, "</svg>"].join("");
};

export const craftTemplate: LabelTemplate = {
  id: "craft",
  nameRu: "Линейный крафт",
  render: (ctx) => {
    if (ctx.tier === "S") {
      return renderS(ctx);
    }
    if (ctx.tier === "M") {
      return renderM(ctx);
    }
    return renderL(ctx);
  }
};
