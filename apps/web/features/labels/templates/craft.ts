import { QR_SIZE_MM_L, QR_SIZE_MM_M } from "../contracts";
import { measureTextPx } from "../fonts";
import { diamond, dottedRule, grainIconPath, hopIconPath, hopMarkPath, hRule, iconAt, ruleWithDiamond, textEl, ticketFrame, vRule, yeastIconPath } from "../svg";

import {
  bottomMeta,
  bottomMetaDesiredHeight,
  descriptionBlock,
  distributeSlack,
  EMPTY_BLOCK,
  fitSpacedLine,
  ibuScale,
  ingredientRows,
  statBand,
  statBandHeight,
  statLine,
  statLineHeight,
  titleBlock,
  type BlockResult
} from "./blocks";
import type { LabelRenderContext, LabelTemplate } from "./types";

// «Линейный крафт» — референсная эстетика: билетная рамка с вогнутыми
// уголками, эмблема-шишка хмеля, ромбы, пунктирные линейки,
// моноширинные цифры.

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
    gapPx: ctx.mm(0.5),
    cornerPx: ctx.mm(3.4)
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

/** Эмблема: шишка хмеля с листьями в двойном ободе, без надписей. */
const emblem = (params: { cx: number; cy: number; sizePx: number }): string => {
  const half = Math.round(params.sizePx / 2);
  return iconAt(hopMarkPath(), params.cx - half, params.cy - half, params.sizePx);
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
  const bottom = heightPx - pad;
  const top = pad + mm(0.5);

  // 58×40 мм с QR — это выбор, а не «всё сразу»: читаемый код занимает ~16 мм
  // высоты, поэтому цифры идут одной строкой вместо трёхколоночной панели, а
  // строка стиля и разделитель уступают ему место (ABV на бутылке важнее).
  const hasStats = slots.abvText !== null || slots.ibu !== null || slots.ebc !== null;
  const withQr = slots.qrUrl !== null;
  const statsHeight = withQr ? statLineHeight(ctx) : statBandHeight(ctx, true);
  const metaHeight = bottomMetaDesiredHeight(ctx, { width: contentWidth, qrSizeMm: QR_SIZE_MM_M, showAuthor: false });
  const reserved =
    (!withQr && slots.styleName ? Math.round(mm(2.6) * 1.6) : 0) +
    (withQr ? 0 : mm(3.6)) +
    (hasStats ? statsHeight + mm(1.6) : 0) +
    metaHeight +
    mm(1);
  const title = titleBlock(ctx, {
    cx,
    width: contentWidth,
    maxSizePx: mm(6.5),
    minSizePx: mm(2.8),
    maxHeightPx: bottom - top - reserved
  });

  // Тот же приём, что в renderL: сначала колонка с естественными зазорами —
  // чтобы узнать неиспользованный остаток высоты, потом с раздутыми на этот
  // остаток. Заголовок считается один раз, по естественным зазорам.
  const buildBody = (extra: number): { svg: string; end: number; gapCount: number } => {
    const parts: string[] = [];
    let gapCount = 0;
    const gap = (base: number): number => {
      gapCount += 1;
      return base + extra;
    };

    let y = top;
    parts.push(`<g transform="translate(0 ${y})">${title.svg}</g>`);
    y += title.height + gap(mm(1.4));

    if (!withQr) {
      const style = styleLine(ctx, { cx, width: contentWidth, y, sizeMm: 2.6 });
      parts.push(style.svg);
      y += style.height;

      parts.push(dottedRule(pad, widthPx - pad, y + mm(1), Math.max(2, mm(0.25))));
      y += gap(mm(2.6));
    }

    const band = withQr
      ? statLine(ctx, { cx, width: contentWidth, y })
      : statBand(ctx, { x: pad, width: contentWidth, y, compact: true });
    parts.push(band.svg);
    y += band.height + (band.height > 0 ? gap(mm(1.6)) : 0);

    // Заголовок не умеет быть ниже минимального кегля и может перерасти бюджет;
    // мета-блоку это стоило бы QR — гарантируем ему его высоту.
    const meta = bottomMeta(ctx, {
      x: pad,
      width: contentWidth,
      y,
      maxHeight: Math.max(metaHeight, bottom - y),
      qrSizeMm: QR_SIZE_MM_M,
      showAuthor: false
    });
    parts.push(meta.svg);
    y += meta.height;

    return { svg: parts.join(""), end: y, gapCount };
  };

  const natural = buildBody(0);
  const extra = distributeSlack(bottom - natural.end, natural.gapCount, mm(2));
  const body = extra > 0 ? buildBody(extra) : natural;

  const shift = Math.max(0, Math.round((bottom - body.end) / 2));
  return [svgOpen(ctx), frame(ctx, 0.6), `<g transform="translate(0 ${shift})">${body.svg}</g>`, "</svg>"].join("");
};

const renderL = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const thin = Math.max(2, mm(0.25));
  const pad = mm(2) + Math.max(4, mm(0.7)) + mm(0.8) + thin + mm(2.4);
  const cx = Math.round(widthPx / 2);
  const contentWidth = widthPx - pad * 2;
  const bottom = heightPx - pad;
  const top = pad + mm(0.5);
  const icons = { grain: grainIconPath(2), hop: hopIconPath(2), yeast: yeastIconPath(2) };

  // Шапка: эмблема (её можно выключить) с плашками OG/FG по бокам. Без эмблемы
  // плашки сдвигаются к центру и занимают полосу пониже — иначе на её месте
  // зияла бы дыра.
  // 22 мм — крупнее уже отъедает высоту у описания (пробовали 24 — не влезало).
  const emblemSize = mm(22);
  const hasPlaques = Boolean(slots.ogText || slots.fgText);
  const headerHeight = slots.showLogo || hasPlaques ? (slots.showLogo ? emblemSize : mm(13)) : 0;
  const titleTop = headerHeight > 0 ? top + headerHeight + mm(0.5) + mm(2) : top;

  // Блоки под заголовком не зависят от его кегля — меряем их заранее и отдаём
  // заголовку остаток высоты: данные и QR важнее крупного названия.
  const styleProbe = styleLine(ctx, { cx, width: contentWidth, y: 0, sizeMm: 3, decorate: true });
  const rowsProbe = ingredientRows(ctx, { x: pad, width: contentWidth, y: 0, icons });
  const bandProbe = statBand(ctx, { x: pad, width: contentWidth, y: 0 });
  const bitternessProbe = ibuScale(ctx, { x: pad, width: contentWidth, y: 0 });
  const descriptionProbe = descriptionBlock(ctx, { cx, width: contentWidth, y: 0 });
  const metaHeight = bottomMetaDesiredHeight(ctx, { width: contentWidth, qrSizeMm: QR_SIZE_MM_L, showAuthor: true });

  const belowTitle = (reserveDescription: boolean): number =>
    mm(1.2) +
    styleProbe.height +
    mm(3) +
    (rowsProbe.height > 0 ? rowsProbe.height + mm(4.2) : 0) +
    (bandProbe.height > 0 ? bandProbe.height + mm(1.8) : 0) +
    (bitternessProbe.height > 0 ? bitternessProbe.height + mm(2) : 0) +
    (reserveDescription && descriptionProbe.height > 0 ? descriptionProbe.height + mm(2.2) : 0) +
    mm(2.2) +
    metaHeight;

  const titleFor = (reserveDescription: boolean): BlockResult =>
    titleBlock(ctx, {
      cx,
      width: contentWidth,
      maxSizePx: mm(9),
      minSizePx: mm(4.2),
      maxHeightPx: bottom - titleTop - belowTitle(reserveDescription)
    });

  type Body = { svg: string; end: number; gapCount: number; descriptionPrinted: boolean; descriptionBudget: number };

  // Колонка собирается дважды: с естественными зазорами (чтобы узнать остаток
  // высоты) и с раздутыми на этот остаток. Заголовок и бюджет описания берутся
  // из первого прохода — раздача остатка не должна отъедать у них высоту.
  const buildBody = (params: { title: BlockResult; extra: number; descriptionBudget?: number }): Body => {
    const parts: string[] = [];
    let gapCount = 0;
    const gap = (base: number): number => {
      gapCount += 1;
      return base + params.extra;
    };

    let y = top;
    if (headerHeight > 0) {
      const headerCy = y + Math.round(headerHeight / 2) + mm(0.5);
      if (slots.showLogo) {
        parts.push(emblem({ cx, cy: headerCy, sizePx: emblemSize }));
      }
      const plaqueOffset = slots.showLogo ? 0.14 : 0.28;
      if (slots.ogText) {
        parts.push(sidePlaque(ctx, { cx: Math.round(pad + contentWidth * plaqueOffset), cy: headerCy, label: "OG", value: slots.ogText }));
      }
      if (slots.fgText) {
        parts.push(sidePlaque(ctx, { cx: Math.round(pad + contentWidth * (1 - plaqueOffset)), cy: headerCy, label: "FG", value: slots.fgText }));
      }
      y = headerCy + Math.round(headerHeight / 2) + gap(mm(2));
    }

    parts.push(`<g transform="translate(0 ${y})">${params.title.svg}</g>`);
    y += params.title.height + gap(mm(1.2));

    const style = styleLine(ctx, { cx, width: contentWidth, y, sizeMm: 3, decorate: true });
    parts.push(style.svg);
    y += style.height;

    parts.push(dottedRule(pad, widthPx - pad, y + mm(0.6), thin));
    y += gap(mm(2.4));

    // Состав — во всю ширину: схематичный бокал с дизерингом занимал её четверть,
    // а цвет пива и так виден в бутылке (и есть цифрой в EBC-колонке).
    const rows = ingredientRows(ctx, { x: pad, width: contentWidth, y, icons });
    if (rows.height > 0) {
      parts.push(rows.svg);
      y += rows.height + gap(mm(1.8));
      parts.push(ruleWithDiamond(pad, widthPx - pad, y, thin, Math.max(2, mm(0.7))));
      y += gap(mm(2.4));
    }

    const band = statBand(ctx, { x: pad, width: contentWidth, y });
    if (band.height > 0) {
      parts.push(band.svg);
      y += band.height + gap(mm(1.8));
    }

    const bitterness = ibuScale(ctx, { x: pad, width: contentWidth, y });
    if (bitterness.height > 0) {
      parts.push(bitterness.svg);
      y += bitterness.height + gap(mm(2));
    }

    // Описание довольствуется остатком: мета-блок с QR ему не уступает ничего.
    const descriptionBudget = params.descriptionBudget ?? Math.max(0, bottom - y - mm(2.2) - mm(2.2) - metaHeight);
    const description = descriptionBlock(ctx, { cx, width: contentWidth, y, maxHeightPx: descriptionBudget });
    if (description.height > 0) {
      parts.push(description.svg);
      y += description.height + gap(mm(2.2));
    }

    parts.push(dottedRule(pad, widthPx - pad, y, thin));
    y += gap(mm(2.2));

    const meta = bottomMeta(ctx, {
      x: pad,
      width: contentWidth,
      y,
      maxHeight: Math.max(metaHeight, bottom - y),
      qrSizeMm: QR_SIZE_MM_L,
      showAuthor: true
    });
    parts.push(meta.svg);
    y += meta.height;

    return {
      svg: parts.join(""),
      end: y,
      gapCount,
      descriptionPrinted: description.height > 0,
      descriptionBudget
    };
  };

  let title = titleFor(true);
  let natural = buildBody({ title, extra: 0 });
  // Под описание ужали заголовок, а оно не поместилось — вернём высоту названию.
  if (slots.description !== null && !natural.descriptionPrinted) {
    title = titleFor(false);
    natural = buildBody({ title, extra: 0 });
  }

  const extra = distributeSlack(bottom - natural.end, natural.gapCount, mm(2));
  const body = extra > 0 ? buildBody({ title, extra, descriptionBudget: natural.descriptionBudget }) : natural;

  const shift = Math.max(0, Math.round((bottom - body.end) / 2));
  return [svgOpen(ctx), frame(ctx, 0.7), `<g transform="translate(0 ${shift})">${body.svg}</g>`, "</svg>"].join("");
};

/**
 * Горизонтальная большая наклейка (120×75 мм). Та же площадь, что у
 * вертикальной, но 75 мм высоты не держат одну колонку блоков — контент
 * разложен в две: слева «лицо» (эмблема с плашками OG/FG, название, стиль,
 * описание, розлив и QR), справа данные (цифры, состав, шкала горечи).
 * Колонки центрируются по вертикали независимо друг от друга.
 */
const renderLWide = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const thin = Math.max(2, mm(0.25));
  const pad = mm(2) + Math.max(4, mm(0.7)) + mm(0.8) + thin + mm(2.4);
  const contentWidth = widthPx - pad * 2;
  const contentHeight = heightPx - pad * 2;
  const columnGap = mm(5);
  // Правая колонка — данные: состав и шкала горечи. Одного ABV на неё мало
  // (полколонки под единственную цифру читаются как брак вёрстки), поэтому при
  // бедных данных колонки нет вовсе: контент идёт одной колонкой во всю ширину,
  // а цифры — панелью под стилем.
  const hasIngredients = slots.malts.length > 0 || slots.hops.length > 0 || slots.yeast !== null;
  const singleColumn = !hasIngredients && slots.ibu === null && slots.ebc === null;
  const leftWidth = singleColumn ? contentWidth : Math.round((contentWidth - columnGap) * 0.52);
  const rightWidth = contentWidth - columnGap - leftWidth;
  const leftX = pad;
  const rightX = pad + leftWidth + columnGap;
  const leftCx = leftX + Math.round(leftWidth / 2);
  const bottom = pad + contentHeight;
  const icons = { grain: grainIconPath(2), hop: hopIconPath(2), yeast: yeastIconPath(2) };
  // Потолок на зазор: у колонок мало блоков, и без потолка пара пустых полей
  // растащила бы их по краям.
  const maxExtraPerGap = mm(3);

  // ЛЕВАЯ КОЛОНКА: мета-блок с QR прибит к низу, остальное — группа над ним.
  const metaHeight = bottomMetaDesiredHeight(ctx, { width: leftWidth, qrSizeMm: QR_SIZE_MM_L, showAuthor: true });
  const metaY = bottom - metaHeight;
  const upperBottom = metaY - mm(2.4);
  const upperHeight = upperBottom - pad;

  // Эмблема с плашками плотности по бокам — как на вертикальной, но мельче:
  // колонка уже, и знак крупнее 18 мм отнимает строки у описания.
  const emblemSize = mm(18);
  const hasPlaques = Boolean(slots.ogText || slots.fgText);
  const headerHeight = slots.showLogo || hasPlaques ? (slots.showLogo ? emblemSize : mm(12)) : 0;
  const titleTop = headerHeight > 0 ? headerHeight + mm(2.4) : 0;

  const styleProbe = styleLine(ctx, { cx: leftCx, width: leftWidth, y: 0, sizeMm: 3, decorate: true });
  const bandProbe = singleColumn ? statBand(ctx, { x: leftX, width: leftWidth, y: 0 }) : EMPTY_BLOCK;
  const descriptionProbe = descriptionBlock(ctx, { cx: leftCx, width: leftWidth, y: 0, maxLines: 5 });

  const belowTitle = (reserveDescription: boolean): number =>
    mm(1.2) +
    styleProbe.height +
    mm(2.8) +
    (bandProbe.height > 0 ? bandProbe.height + mm(2.4) : 0) +
    (reserveDescription && descriptionProbe.height > 0 ? descriptionProbe.height + mm(1.6) : 0);

  const titleFor = (reserveDescription: boolean): BlockResult =>
    titleBlock(ctx, {
      cx: leftCx,
      width: leftWidth,
      maxSizePx: mm(8),
      minSizePx: mm(4),
      maxHeightPx: upperHeight - titleTop - belowTitle(reserveDescription)
    });

  type Column = { svg: string; height: number; gapCount: number };
  type LeftColumn = Column & { descriptionPrinted: boolean; descriptionBudget: number };

  const buildLeft = (params: { title: BlockResult; extra: number; descriptionBudget?: number }): LeftColumn => {
    const parts: string[] = [];
    let gapCount = 0;
    const gap = (base: number): number => {
      gapCount += 1;
      return base + params.extra;
    };

    let ly = 0;
    // Высота колонки — низ последнего НАПЕЧАТАННОГО блока, а не курсор потока:
    // зазор перед пустым блоком (нет описания) иначе остаётся в курсоре
    // «призраком» и центрирование задирает контент колонки вверх.
    let end = 0;

    if (headerHeight > 0) {
      const headerCy = Math.round(headerHeight / 2);
      if (slots.showLogo) {
        parts.push(emblem({ cx: leftCx, cy: headerCy, sizePx: emblemSize }));
      }
      const plaqueOffset = slots.showLogo ? 0.12 : 0.28;
      if (slots.ogText) {
        parts.push(sidePlaque(ctx, { cx: Math.round(leftX + leftWidth * plaqueOffset), cy: headerCy, label: "OG", value: slots.ogText }));
      }
      if (slots.fgText) {
        parts.push(sidePlaque(ctx, { cx: Math.round(leftX + leftWidth * (1 - plaqueOffset)), cy: headerCy, label: "FG", value: slots.fgText }));
      }
      end = headerHeight;
      ly = headerHeight + gap(mm(2.4));
    }

    parts.push(`<g transform="translate(0 ${ly})">${params.title.svg}</g>`);
    ly += params.title.height;
    end = ly;
    ly += gap(mm(1.2));

    const style = styleLine(ctx, { cx: leftCx, width: leftWidth, y: ly, sizeMm: 3, decorate: true });
    parts.push(style.svg);
    ly += style.height;
    end = ly;

    parts.push(dottedRule(leftX, leftX + leftWidth, ly + mm(0.8), thin));
    ly += gap(mm(2.8));

    if (singleColumn) {
      const leftBand = statBand(ctx, { x: leftX, width: leftWidth, y: ly });
      if (leftBand.height > 0) {
        parts.push(leftBand.svg);
        ly += leftBand.height;
        end = ly;
        ly += gap(mm(2.4));
      }
    }

    const descriptionBudget = params.descriptionBudget ?? Math.max(0, upperHeight - ly);
    const description = descriptionBlock(ctx, {
      cx: leftCx,
      width: leftWidth,
      y: ly,
      maxLines: 5,
      maxHeightPx: descriptionBudget
    });
    if (description.height > 0) {
      parts.push(description.svg);
      end = ly + description.height;
    }

    return {
      svg: parts.join(""),
      height: end,
      gapCount,
      descriptionPrinted: description.height > 0,
      descriptionBudget
    };
  };

  let title = titleFor(true);
  let leftNatural = buildLeft({ title, extra: 0 });
  // Описание зарезервировало высоту, но не поместилось — вернём её названию.
  if (slots.description !== null && !leftNatural.descriptionPrinted) {
    title = titleFor(false);
    leftNatural = buildLeft({ title, extra: 0 });
  }
  const leftExtra = distributeSlack(upperHeight - leftNatural.height, leftNatural.gapCount, maxExtraPerGap);
  const left =
    leftExtra > 0
      ? buildLeft({ title, extra: leftExtra, descriptionBudget: leftNatural.descriptionBudget })
      : leftNatural;

  const leftShift = pad + Math.max(0, Math.round((upperHeight - left.height) / 2));
  const meta = bottomMeta(ctx, {
    x: leftX,
    width: leftWidth,
    y: metaY,
    maxHeight: metaHeight,
    qrSizeMm: QR_SIZE_MM_L,
    showAuthor: true
  });

  // ПРАВАЯ КОЛОНКА: цифры → состав → шкала горечи.
  // Без цифр и состава (singleColumn) все блоки колонки схлопываются сами:
  // шкала горечи без IBU не рендерится, так что отдельных гейтов тут не нужно.
  const buildRight = (extra: number): Column => {
    const parts: string[] = [];
    let gapCount = 0;
    const gap = (base: number): number => {
      gapCount += 1;
      return base + extra;
    };
    let ry = 0;
    // Как и слева: высота колонки — низ последнего напечатанного блока.
    let end = 0;

    const band = statBand(ctx, { x: rightX, width: rightWidth, y: ry });
    if (band.height > 0) {
      parts.push(band.svg);
      ry += band.height;
      end = ry;
      ry += gap(mm(2));
      // Разделитель — только если под ним что-то есть: линейка в пустоту.
      if (hasIngredients) {
        parts.push(ruleWithDiamond(rightX, rightX + rightWidth, ry, thin, Math.max(2, mm(0.7))));
        ry += gap(mm(2.4));
      }
    }

    const rows = ingredientRows(ctx, { x: rightX, width: rightWidth, y: ry, icons });
    if (rows.height > 0) {
      parts.push(rows.svg);
      ry += rows.height;
      end = ry;
      ry += gap(mm(3));
    }

    const bitterness = ibuScale(ctx, { x: rightX, width: rightWidth, y: ry });
    if (bitterness.height > 0) {
      parts.push(bitterness.svg);
      end = ry + bitterness.height;
    }

    return { svg: parts.join(""), height: end, gapCount };
  };

  const rightNatural = buildRight(0);
  const rightExtra = distributeSlack(contentHeight - rightNatural.height, rightNatural.gapCount, maxExtraPerGap);
  const right = rightExtra > 0 ? buildRight(rightExtra) : rightNatural;
  const rightShift = pad + Math.max(0, Math.round((contentHeight - right.height) / 2));

  return [
    svgOpen(ctx),
    frame(ctx, 0.7),
    `<g transform="translate(0 ${leftShift})">${left.svg}</g>`,
    meta.svg,
    singleColumn
      ? ""
      : [
          vRule(rightX - Math.round(columnGap / 2), pad, bottom, thin),
          `<g transform="translate(0 ${rightShift})">${right.svg}</g>`
        ].join(""),
    "</svg>"
  ].join("");
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
    return ctx.orientation === "landscape" ? renderLWide(ctx) : renderL(ctx);
  }
};
