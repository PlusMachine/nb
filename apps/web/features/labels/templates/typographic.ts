import { doubleFrame, hRule, ruleWithDiamond, textEl } from "../svg";

import {
  bottomMeta,
  bottomMetaDesiredHeight,
  colorScale,
  dottedRule,
  fitSpacedLine,
  ibuScale,
  ingredientRows,
  statBand,
  statBandHeight,
  titleBlock
} from "./blocks";
import type { LabelRenderContext, LabelTemplate } from "./types";

// «Типографский» — только шрифтовая композиция: жирные линейки, двойная
// рамка, ни одного изображения. Иконки и значок — в шаблоне «Линейный крафт».

const svgOpen = (ctx: LabelRenderContext): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.widthPx}" height="${ctx.heightPx}" viewBox="0 0 ${ctx.widthPx} ${ctx.heightPx}">` +
  `<rect width="${ctx.widthPx}" height="${ctx.heightPx}" fill="white"/>`;

/** Строка стиля с разрядкой, ужатая под ширину. */
const styleLine = (
  ctx: LabelRenderContext,
  params: { cx: number; width: number; y: number; sizeMm: number }
): { svg: string; height: number } => {
  const { slots, mm } = ctx;
  if (!slots.styleName) {
    return { svg: "", height: 0 };
  }
  const fit = fitSpacedLine(slots.styleName, {
    fontId: "bodyMedium",
    maxWidthPx: params.width,
    sizePx: mm(params.sizeMm),
    minSizePx: mm(2),
    spacingRatio: 0.3
  });
  const svg = textEl({
    x: params.cx,
    y: params.y + fit.sizePx,
    fontId: "bodyMedium",
    sizePx: fit.sizePx,
    text: fit.text,
    anchor: "middle",
    letterSpacingPx: fit.spacingPx
  });
  return { svg, height: Math.round(fit.sizePx * 1.6) };
};

const renderS = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const inset = mm(2);
  const stroke = Math.max(2, mm(0.25));
  const pad = inset + stroke + mm(1.6);
  const cx = Math.round(widthPx / 2);
  const parts: string[] = [svgOpen(ctx)];
  parts.push(`<rect x="${inset}" y="${inset}" width="${widthPx - inset * 2}" height="${heightPx - inset * 2}" fill="none" stroke="black" stroke-width="${stroke}"/>`);

  const bottomLine = [slots.abvText, slots.bottlingDateText].filter(Boolean).join("  •  ");
  const bottomSize = mm(2.8);
  const bottomY = heightPx - pad - Math.round(bottomSize * 0.2);
  const titleArea = bottomLine ? bottomY - Math.round(bottomSize * 1.5) : heightPx - pad;

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
    parts.push(textEl({ x: cx, y: bottomY, fontId: "monoBold", sizePx: bottomSize, text: bottomLine, anchor: "middle" }));
  }
  parts.push("</svg>");
  return parts.join("");
};

const renderM = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const inset = mm(2);
  const thick = Math.max(3, mm(0.6));
  const thin = Math.max(2, mm(0.25));
  const pad = inset + thick + mm(0.8) + thin + mm(2);
  const cx = Math.round(widthPx / 2);
  const contentWidth = widthPx - pad * 2;
  const parts: string[] = [svgOpen(ctx)];
  parts.push(doubleFrame({ widthPx, heightPx, insetPx: inset, thickPx: thick, thinPx: thin, gapPx: mm(0.8) }));

  let y = pad + mm(0.5);

  // Вертикальный бюджет: заголовку достаётся то, что не займут блоки ниже.
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

  parts.push(ruleWithDiamond(pad, widthPx - pad, y + mm(1), thin, Math.max(2, mm(0.6))));
  y += mm(2.6);

  const band = statBand(ctx, { x: pad, width: contentWidth, y, compact: true });
  parts.push(band.svg);
  y += band.height + (band.height > 0 ? mm(1.6) : 0);

  const meta = bottomMeta(ctx, {
    x: pad,
    width: contentWidth,
    y,
    maxHeight: heightPx - pad - y,
    qrSizeMm: 10,
    showAuthor: false
  });
  parts.push(meta.svg);

  parts.push("</svg>");
  return parts.join("");
};

const renderL = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const inset = mm(2);
  const thick = Math.max(4, mm(0.7));
  const thin = Math.max(2, mm(0.25));
  const pad = inset + thick + mm(0.8) + thin + mm(2.4);
  const cx = Math.round(widthPx / 2);
  const contentWidth = widthPx - pad * 2;
  const qrSizeMm = 13;

  const titleTop = pad + mm(2.4);

  // Блоки под заголовком не зависят от его кегля — считаем их высоты заранее
  // и отдаём заголовку ровно остаток. Так название ужимается само, а не
  // выдавливает данные (и QR) из нижнего блока.
  const styleProbe = styleLine(ctx, { cx, width: contentWidth, y: 0, sizeMm: 3.2 });
  const gravityHeight = slots.ogText || slots.fgText ? Math.round(mm(2.8) * 1.7) : 0;
  const rowsProbe = ingredientRows(ctx, { x: pad, width: contentWidth, y: 0, icons: null });
  const bandProbe = statBand(ctx, { x: pad, width: contentWidth, y: 0 });
  const bitternessProbe = ibuScale(ctx, { x: pad, width: contentWidth, y: 0 });
  const colorProbe = colorScale(ctx, { x: pad, width: contentWidth, y: 0, idPrefix: "probe" });
  const metaHeight = bottomMetaDesiredHeight(ctx, { width: contentWidth, qrSizeMm, showAuthor: true });

  const belowTitle =
    mm(1.8) +
    styleProbe.height +
    gravityHeight +
    mm(3.6) +
    (rowsProbe.height > 0 ? rowsProbe.height + mm(4.6) : 0) +
    (bandProbe.height > 0 ? bandProbe.height + mm(2) : 0) +
    (bitternessProbe.height > 0 ? bitternessProbe.height + mm(2.6) : 0) +
    (colorProbe.height > 0 ? colorProbe.height + mm(2.4) : 0) +
    mm(2.6) +
    metaHeight;

  const body: string[] = [];
  let y = pad;
  body.push(hRule(pad, widthPx - pad, y + mm(0.5), mm(1)));
  y = titleTop;

  const title = titleBlock(ctx, {
    cx,
    width: contentWidth,
    maxSizePx: mm(10),
    minSizePx: mm(4.6),
    maxHeightPx: heightPx - pad - titleTop - belowTitle
  });
  body.push(`<g transform="translate(0 ${y})">${title.svg}</g>`);
  y += title.height + mm(1.8);

  const style = styleLine(ctx, { cx, width: contentWidth, y, sizeMm: 3.2 });
  body.push(style.svg);
  y += style.height;

  if (slots.ogText || slots.fgText) {
    const gravSize = mm(2.8);
    const gravLine = [slots.ogText ? `OG ${slots.ogText}` : null, slots.fgText ? `FG ${slots.fgText}` : null]
      .filter(Boolean)
      .join("   ·   ");
    body.push(textEl({ x: cx, y: y + gravSize, fontId: "mono", sizePx: gravSize, text: gravLine, anchor: "middle" }));
    y += Math.round(gravSize * 1.7);
  }

  body.push(hRule(pad, widthPx - pad, y + mm(0.6), mm(1)));
  y += mm(3);

  const rows = ingredientRows(ctx, { x: pad, width: contentWidth, y, icons: null });
  if (rows.height > 0) {
    body.push(rows.svg);
    y += rows.height + mm(2);
    body.push(dottedRule(pad, widthPx - pad, y, Math.max(2, mm(0.25))));
    y += mm(2.6);
  }

  const band = statBand(ctx, { x: pad, width: contentWidth, y });
  if (band.height > 0) {
    body.push(band.svg);
    y += band.height + mm(2);
  }

  const bitterness = ibuScale(ctx, { x: pad, width: contentWidth, y });
  if (bitterness.height > 0) {
    body.push(bitterness.svg);
    y += bitterness.height + mm(2.6);
  }

  const color = colorScale(ctx, { x: pad, width: contentWidth, y, idPrefix: "ebc" });
  if (color.height > 0) {
    body.push(color.svg);
    y += color.height + mm(2.4);
  }

  body.push(dottedRule(pad, widthPx - pad, y, Math.max(2, mm(0.25))));
  y += mm(2.6);

  const meta = bottomMeta(ctx, {
    x: pad,
    width: contentWidth,
    y,
    maxHeight: heightPx - pad - y,
    qrSizeMm,
    showAuthor: true
  });
  body.push(meta.svg);
  y += meta.height;

  // Разреженные данные: центрируем колонку контента по вертикали.
  const shift = Math.max(0, Math.round((heightPx - pad - y) / 2));
  return [
    svgOpen(ctx),
    doubleFrame({ widthPx, heightPx, insetPx: inset, thickPx: thick, thinPx: thin, gapPx: mm(0.8) }),
    `<g transform="translate(0 ${shift})">${body.join("")}</g>`,
    "</svg>"
  ].join("");
};

export const typographicTemplate: LabelTemplate = {
  id: "typographic",
  nameRu: "Типографский",
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
