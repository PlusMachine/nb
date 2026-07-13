import { QR_SIZE_MM_L, QR_SIZE_MM_M } from "../contracts";
import { doubleFrame, hRule, ruleWithDiamond, textEl, vRule } from "../svg";

import {
  bottomMeta,
  bottomMetaDesiredHeight,
  colorScale,
  descriptionBlock,
  distributeSlack,
  dottedRule,
  EMPTY_BLOCK,
  fitSpacedLine,
  ibuScale,
  ingredientRows,
  ingredientRowsDesiredWidth,
  statBand,
  statBandHeight,
  statLine,
  statLineHeight,
  titleBlock,
  type BlockResult,
  type DescriptionBlockResult
} from "./blocks";
import type { LabelRenderContext, LabelTemplate } from "./types";

// «Классика» — только шрифтовая композиция: жирные линейки, двойная рамка,
// ни одного изображения. Иконки и эмблема — в шаблоне «Крафт».

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

/**
 * Строка плотности «OG 15.2 · FG 3.1 °P» (в SG — «OG 1.048 · FG 1.011»); нет
 * данных — блок не печатается. Единица шкалы стоит одна на всю строку: «°P»
 * после каждого числа — это дубль, который читается как шум.
 */
const gravityLine = (ctx: LabelRenderContext, params: { cx: number; y: number }): { svg: string; height: number } => {
  const { slots, mm } = ctx;
  if (!slots.ogText && !slots.fgText) {
    return { svg: "", height: 0 };
  }
  const sizePx = mm(2.8);
  const values = [slots.ogText ? `OG ${slots.ogText}` : null, slots.fgText ? `FG ${slots.fgText}` : null]
    .filter(Boolean)
    .join("   ·   ");
  const text = slots.gravityUnitText ? `${values} ${slots.gravityUnitText}` : values;
  return {
    svg: textEl({ x: params.cx, y: params.y + sizePx, fontId: "mono", sizePx, text, anchor: "middle" }),
    height: Math.round(sizePx * 1.7)
  };
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
  const bottom = heightPx - pad;
  const top = pad + mm(0.5);

  // Вертикальный бюджет: заголовку достаётся то, что не займут блоки ниже.
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

  // Контент собираем отдельно от рамки и дважды: сначала с естественными
  // зазорами — чтобы узнать остаток высоты, потом с раздутыми. Заголовок
  // считается ОДИН раз, по естественным зазорам: иначе раздача остатка ужимала
  // бы название, ради которого этот остаток и появился.
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

      parts.push(ruleWithDiamond(pad, widthPx - pad, y + mm(1), thin, Math.max(2, mm(0.6))));
      y += gap(mm(2.6));
    }

    const band = withQr
      ? statLine(ctx, { cx, width: contentWidth, y })
      : statBand(ctx, { x: pad, width: contentWidth, y, compact: true });
    parts.push(band.svg);
    y += band.height + (band.height > 0 ? gap(mm(1.6)) : 0);

    // Заголовок не умеет быть ниже своего минимального кегля и может перерасти
    // отведённый бюджет на пару пикселей. Мета-блоку это стоило бы QR (его
    // выбрасывают по нехватке высоты), поэтому его высоту гарантируем: пусть
    // лучше низ подожмёт поле, чем с наклейки исчезнет код рецепта.
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
  return [
    svgOpen(ctx),
    doubleFrame({ widthPx, heightPx, insetPx: inset, thickPx: thick, thinPx: thin, gapPx: mm(0.8) }),
    `<g transform="translate(0 ${shift})">${body.svg}</g>`,
    "</svg>"
  ].join("");
};

const renderL = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const inset = mm(2);
  const thick = Math.max(4, mm(0.7));
  const thin = Math.max(2, mm(0.25));
  const pad = inset + thick + mm(0.8) + thin + mm(2.4);
  const cx = Math.round(widthPx / 2);
  const contentWidth = widthPx - pad * 2;
  const qrSizeMm = QR_SIZE_MM_L;
  const bottom = heightPx - pad;

  const titleTop = pad + mm(2.4);

  // Блоки под заголовком не зависят от его кегля — считаем их высоты заранее
  // и отдаём заголовку ровно остаток. Так название ужимается само, а не
  // выдавливает данные (и QR) из нижнего блока.
  const styleProbe = styleLine(ctx, { cx, width: contentWidth, y: 0, sizeMm: 3.2 });
  const gravityHeight = gravityLine(ctx, { cx, y: 0 }).height;
  const rowsProbe = ingredientRows(ctx, { x: pad, width: contentWidth, y: 0, icons: null });
  const bandProbe = statBand(ctx, { x: pad, width: contentWidth, y: 0 });
  const bitternessProbe = ibuScale(ctx, { x: pad, width: contentWidth, y: 0 });
  const colorProbe = colorScale(ctx, { x: pad, width: contentWidth, y: 0, idPrefix: "probe" });
  const descriptionProbe = descriptionBlock(ctx, { cx, width: contentWidth, y: 0 });
  const metaHeight = bottomMetaDesiredHeight(ctx, { width: contentWidth, qrSizeMm, showAuthor: true });

  const belowTitle = (reserveDescription: boolean, withColorScale: boolean): number =>
    mm(1.8) +
    styleProbe.height +
    gravityHeight +
    mm(3.6) +
    (rowsProbe.height > 0 ? rowsProbe.height + mm(4.6) : 0) +
    (bandProbe.height > 0 ? bandProbe.height + mm(2) : 0) +
    (bitternessProbe.height > 0 ? bitternessProbe.height + mm(2.6) : 0) +
    (withColorScale && colorProbe.height > 0 ? colorProbe.height + mm(2.4) : 0) +
    (reserveDescription && descriptionProbe.height > 0 ? descriptionProbe.height + mm(2.6) : 0) +
    mm(2.6) +
    metaHeight;

  const titleFor = (reserveDescription: boolean, withColorScale: boolean): BlockResult =>
    titleBlock(ctx, {
      cx,
      width: contentWidth,
      maxSizePx: mm(10),
      minSizePx: mm(4.6),
      maxHeightPx: bottom - titleTop - belowTitle(reserveDescription, withColorScale)
    });

  type Body = { svg: string; end: number; gapCount: number; descriptionPrinted: boolean; descriptionBudget: number };

  // Колонка собирается дважды: сперва с естественными зазорами (чтобы узнать,
  // сколько высоты осталось неиспользованной), потом — с зазорами, в которые
  // этот остаток роздан. Заголовок и высота, отведённая описанию, фиксируются
  // по ПЕРВОМУ проходу и во втором не пересчитываются: иначе раздача остатка
  // отъедала бы у них ту самую высоту, которую раздаёт.
  const buildBody = (params: { title: BlockResult; extra: number; descriptionBudget?: number; withColorScale: boolean }): Body => {
    const parts: string[] = [];
    let gapCount = 0;
    const gap = (base: number): number => {
      gapCount += 1;
      return base + params.extra;
    };

    parts.push(hRule(pad, widthPx - pad, pad + mm(0.5), mm(1)));
    let y = titleTop;

    parts.push(`<g transform="translate(0 ${y})">${params.title.svg}</g>`);
    y += params.title.height + gap(mm(1.8));

    const style = styleLine(ctx, { cx, width: contentWidth, y, sizeMm: 3.2 });
    parts.push(style.svg);
    y += style.height;

    const gravity = gravityLine(ctx, { cx, y });
    parts.push(gravity.svg);
    y += gravity.height;

    parts.push(hRule(pad, widthPx - pad, y + mm(0.6), mm(1)));
    y += gap(mm(3));

    const rows = ingredientRows(ctx, { x: pad, width: contentWidth, y, icons: null });
    if (rows.height > 0) {
      parts.push(rows.svg);
      y += rows.height + gap(mm(2));
      parts.push(dottedRule(pad, widthPx - pad, y, thin));
      y += gap(mm(2.6));
    }

    const band = statBand(ctx, { x: pad, width: contentWidth, y });
    if (band.height > 0) {
      parts.push(band.svg);
      y += band.height + gap(mm(2));
    }

    const bitterness = ibuScale(ctx, { x: pad, width: contentWidth, y });
    if (bitterness.height > 0) {
      parts.push(bitterness.svg);
      y += bitterness.height + gap(mm(2.6));
    }

    if (params.withColorScale) {
      const color = colorScale(ctx, { x: pad, width: contentWidth, y, idPrefix: "ebc" });
      if (color.height > 0) {
        parts.push(color.svg);
        y += color.height + gap(mm(2.4));
      }
    }

    // Описание довольствуется остатком: мета-блок с QR ему не уступает ничего.
    const descriptionBudget = params.descriptionBudget ?? Math.max(0, bottom - y - mm(2.6) - mm(2.6) - metaHeight);
    const description = descriptionBlock(ctx, { cx, width: contentWidth, y, maxHeightPx: descriptionBudget });
    if (description.height > 0) {
      parts.push(description.svg);
      y += description.height + gap(mm(2.6));
    }

    parts.push(dottedRule(pad, widthPx - pad, y, thin));
    y += gap(mm(2.6));

    const meta = bottomMeta(ctx, {
      x: pad,
      width: contentWidth,
      y,
      maxHeight: Math.max(metaHeight, bottom - y),
      qrSizeMm,
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

  let withColorScale = true;
  let title = titleFor(true, withColorScale);
  let natural = buildBody({ title, extra: 0, withColorScale });

  // Описание важнее шкалы цвета: EBC уже стоит числом в панели «ЦВЕТ», а
  // градиентная полоса — самый расходный блок (на «Крафте» её и вовсе
  // нет). Если описание задано, но со шкалой цвета в высоту не влезло — убираем
  // шкалу и отдаём место описанию. Без описания шкала печатается как прежде.
  if (slots.description !== null && !natural.descriptionPrinted && colorProbe.height > 0) {
    withColorScale = false;
    title = titleFor(true, withColorScale);
    natural = buildBody({ title, extra: 0, withColorScale });
  }

  // Описание зарезервировало высоту (заголовок под неё ужали), а само так и не
  // поместилось даже без шкалы цвета — пересобираем без резерва: высвобожденное
  // место должно вернуться названию, а не остаться пустым полем.
  if (slots.description !== null && !natural.descriptionPrinted) {
    title = titleFor(false, withColorScale);
    natural = buildBody({ title, extra: 0, withColorScale });
  }

  const extra = distributeSlack(bottom - natural.end, natural.gapCount, mm(2));
  const body =
    extra > 0 ? buildBody({ title, extra, descriptionBudget: natural.descriptionBudget, withColorScale }) : natural;

  // Остаток сверх потолка зазоров: центрируем колонку по вертикали.
  const shift = Math.max(0, Math.round((bottom - body.end) / 2));
  return [
    svgOpen(ctx),
    doubleFrame({ widthPx, heightPx, insetPx: inset, thickPx: thick, thinPx: thin, gapPx: mm(0.8) }),
    `<g transform="translate(0 ${shift})">${body.svg}</g>`,
    "</svg>"
  ].join("");
};

/**
 * Горизонтальная большая наклейка (120×75 мм). Площадь та же, что у
 * вертикальной, но высоты на одну колонку не хватает: блоки вертикального
 * макета в 75 мм не укладываются. Поэтому контент разложен в две колонки —
 * слева «лицо» (название, стиль, плотность, описание), справа данные (цифры,
 * состав, шкалы) и подвал с QR.
 *
 * Подвал (розлив, автор, марка, QR) стоит в ПРАВОЙ колонке, а не под лицом:
 * иначе описание урезается, пока в колонке данных зияет пустота. Не влезает
 * (много состава, обе шкалы) — возвращается под лицо, как раньше.
 *
 * Ширина колонок подстраивается под описание: базовая доля 0.52, но ради
 * текста левой отдаётся до 0.63 — правая это переживает, если имена сортов
 * всё ещё печатаются целиком.
 */
const LW_LEFT_RATIOS = [0.52, 0.58, 0.63];

const renderLWide = (ctx: LabelRenderContext): string => {
  const { slots, widthPx, heightPx, mm } = ctx;
  const inset = mm(2);
  const thick = Math.max(4, mm(0.7));
  const thin = Math.max(2, mm(0.25));
  const pad = inset + thick + mm(0.8) + thin + mm(2.4);
  const contentWidth = widthPx - pad * 2;
  const contentHeight = heightPx - pad * 2;
  const columnGap = mm(5);
  // Правая колонка — данные: состав и шкалы. Одного ABV на неё мало (полколонки
  // под единственную цифру читаются как брак вёрстки), поэтому при бедных данных
  // колонки нет вовсе: контент идёт одной колонкой во всю ширину, а цифры —
  // панелью под строкой плотности.
  const hasIngredients = slots.malts.length > 0 || slots.hops.length > 0 || slots.yeast !== null;
  const singleColumn = !hasIngredients && slots.ibu === null && slots.ebc === null;
  const leftX = pad;
  const top = pad;
  const bottom = pad + contentHeight;
  const qrSizeMm = QR_SIZE_MM_L;
  // Потолок на зазор: у колонок мало блоков, и без потолка пара пустых полей
  // растащила бы их по краям.
  const maxExtraPerGap = mm(3);

  type Column = { svg: string; height: number; gapCount: number };
  type Layout = { svg: string; descriptionChars: number; descriptionTrimmed: boolean; rightFits: boolean };

  const buildLayout = (params: { ratio: number; withColorScale: boolean }): Layout => {
    const leftWidth = singleColumn ? contentWidth : Math.round((contentWidth - columnGap) * params.ratio);
    const rightWidth = contentWidth - columnGap - leftWidth;
    const rightX = leftX + leftWidth + columnGap;
    const leftCx = leftX + Math.round(leftWidth / 2);

    // ПРАВАЯ КОЛОНКА: цифры → состав → шкала горечи → шкала цвета.
    const buildRightData = (extra: number): Column => {
      const parts: string[] = [];
      let gapCount = 0;
      const gap = (base: number): number => {
        gapCount += 1;
        return base + extra;
      };
      let ry = 0;
      // Высота — по низу последнего НАПЕЧАТАННОГО блока, иначе зазор перед
      // несостоявшейся шкалой уезжает в высоту колонки.
      let end = 0;

      const band = statBand(ctx, { x: rightX, width: rightWidth, y: ry });
      if (band.height > 0) {
        parts.push(band.svg);
        ry += band.height;
        end = ry;
        ry += gap(mm(2.2));
        // Разделитель — только если под ним что-то есть: линейка в пустоту.
        if (hasIngredients) {
          parts.push(dottedRule(rightX, rightX + rightWidth, ry, thin));
          ry += gap(mm(2.4));
        }
      }

      const rows = ingredientRows(ctx, { x: rightX, width: rightWidth, y: ry, icons: null });
      if (rows.height > 0) {
        parts.push(rows.svg);
        ry += rows.height;
        end = ry;
        ry += gap(mm(3));
      }

      const bitterness = ibuScale(ctx, { x: rightX, width: rightWidth, y: ry });
      if (bitterness.height > 0) {
        parts.push(bitterness.svg);
        ry += bitterness.height;
        end = ry;
        ry += gap(mm(2.6));
      }

      if (params.withColorScale) {
        const color = colorScale(ctx, { x: rightX, width: rightWidth, y: ry, idPrefix: "ebc" });
        if (color.height > 0) {
          parts.push(color.svg);
          end = ry + color.height;
        }
      }

      return { svg: parts.join(""), height: end, gapCount };
    };

    // Куда встанет подвал: в правую колонку, если данные оставили ей высоту.
    const rightData = singleColumn ? { svg: "", height: 0, gapCount: 0 } : buildRightData(0);
    const metaGap = mm(3.2);
    const rightMetaHeight = singleColumn ? 0 : bottomMetaDesiredHeight(ctx, { width: rightWidth, qrSizeMm, showAuthor: true });
    const metaInRight = !singleColumn && rightData.height + metaGap + rightMetaHeight <= contentHeight;

    const metaWidth = metaInRight ? rightWidth : leftWidth;
    const metaHeight = metaInRight
      ? rightMetaHeight
      : bottomMetaDesiredHeight(ctx, { width: leftWidth, qrSizeMm, showAuthor: true });
    const metaY = bottom - metaHeight;
    const meta = bottomMeta(ctx, {
      x: metaInRight ? rightX : leftX,
      width: metaWidth,
      y: metaY,
      maxHeight: metaHeight,
      qrSizeMm,
      showAuthor: true
    });

    // Лицевая колонка занимает всю высоту, когда подвал уехал направо.
    const leftBottom = metaInRight ? bottom : metaY - mm(2.8);
    const leftHeight = leftBottom - top;

    const styleProbe = styleLine(ctx, { cx: leftCx, width: leftWidth, y: 0, sizeMm: 3 });
    const gravityProbe = gravityLine(ctx, { cx: leftCx, y: 0 });
    const bandProbe = singleColumn ? statBand(ctx, { x: leftX, width: leftWidth, y: 0 }) : EMPTY_BLOCK;
    const descriptionProbe = descriptionBlock(ctx, { cx: leftCx, width: leftWidth, y: 0, maxLines: 5 });

    const belowTitle = (reserveDescription: boolean): number =>
      mm(1.6) +
      styleProbe.height +
      mm(3.2) +
      gravityProbe.height +
      (bandProbe.height > 0 ? bandProbe.height + mm(2.4) : 0) +
      (reserveDescription && descriptionProbe.height > 0 ? descriptionProbe.height + mm(2) : 0);

    const titleFor = (reserveDescription: boolean): BlockResult =>
      titleBlock(ctx, {
        cx: leftCx,
        width: leftWidth,
        maxSizePx: mm(9),
        minSizePx: mm(4.2),
        maxHeightPx: leftHeight - belowTitle(reserveDescription)
      });

    type LeftColumn = Column & { description: DescriptionBlockResult; descriptionBudget: number };

    const buildLeft = (leftParams: { title: BlockResult; extra: number; descriptionBudget?: number }): LeftColumn => {
      const parts: string[] = [];
      let gapCount = 0;
      const gap = (base: number): number => {
        gapCount += 1;
        return base + leftParams.extra;
      };

      let ly = 0;
      let end = 0;

      parts.push(`<g transform="translate(0 ${ly})">${leftParams.title.svg}</g>`);
      ly += leftParams.title.height;
      end = ly;
      ly += gap(mm(1.6));

      const style = styleLine(ctx, { cx: leftCx, width: leftWidth, y: ly, sizeMm: 3 });
      parts.push(style.svg);
      ly += style.height;
      end = ly;

      // Линейку под стилем ставим, только если под ней что-то есть.
      const rule = hRule(leftX, leftX + leftWidth, ly + mm(0.8), mm(1));
      let ruleEarned = !metaInRight;
      ly += gap(mm(3.2));

      const gravity = gravityLine(ctx, { cx: leftCx, y: ly });
      parts.push(gravity.svg);
      ly += gravity.height;
      if (gravity.height > 0) {
        end = ly;
        ruleEarned = true;
      }

      if (singleColumn) {
        const leftBand = statBand(ctx, { x: leftX, width: leftWidth, y: ly });
        if (leftBand.height > 0) {
          parts.push(leftBand.svg);
          ly += leftBand.height;
          end = ly;
          ly += gap(mm(2.4));
          ruleEarned = true;
        }
      }

      const descriptionBudget = leftParams.descriptionBudget ?? Math.max(0, leftHeight - ly);
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
        ruleEarned = true;
      }
      if (ruleEarned) {
        parts.push(rule);
      }

      return { svg: parts.join(""), height: end, gapCount, description, descriptionBudget };
    };

    let title = titleFor(true);
    let leftNatural = buildLeft({ title, extra: 0 });
    // Описание зарезервировало высоту, но не поместилось — вернём её названию.
    if (slots.description !== null && leftNatural.description.height === 0) {
      title = titleFor(false);
      leftNatural = buildLeft({ title, extra: 0 });
    }
    const leftExtra = distributeSlack(leftHeight - leftNatural.height, leftNatural.gapCount, maxExtraPerGap);
    const left =
      leftExtra > 0
        ? buildLeft({ title, extra: leftExtra, descriptionBudget: leftNatural.descriptionBudget })
        : leftNatural;
    const leftShift = top + Math.max(0, Math.round((leftHeight - left.height) / 2));

    const rightArea = metaInRight ? contentHeight - metaHeight - metaGap : contentHeight;
    const rightExtra = distributeSlack(rightArea - rightData.height, rightData.gapCount, maxExtraPerGap);
    const right = rightExtra > 0 ? buildRightData(rightExtra) : rightData;
    const rightShift = top + Math.max(0, Math.round((rightArea - right.height) / 2));

    const svg = [
      svgOpen(ctx),
      doubleFrame({ widthPx, heightPx, insetPx: inset, thickPx: thick, thinPx: thin, gapPx: mm(0.8) }),
      `<g transform="translate(0 ${leftShift})">${left.svg}</g>`,
      singleColumn
        ? ""
        : [
            vRule(rightX - Math.round(columnGap / 2), top, bottom, thin),
            `<g transform="translate(0 ${rightShift})">${right.svg}</g>`,
            metaInRight && right.height > 0 ? dottedRule(rightX, rightX + rightWidth, metaY - Math.round(metaGap / 2), thin) : ""
          ].join(""),
      meta.svg,
      "</svg>"
    ].join("");

    return {
      svg,
      descriptionChars: left.description.printedChars,
      descriptionTrimmed: left.description.trimmed,
      rightFits: singleColumn || rightData.height + (metaInRight ? metaGap + metaHeight : 0) <= contentHeight
    };
  };

  // Порядок вариантов = порядок приоритетов: сперва базовая ширина со шкалой
  // цвета, затем ширина в пользу описания, и лишь в последнюю очередь — без
  // шкалы цвета (EBC остаётся цифрой в панели, а описание читать нечем).
  const minRightWidth = ingredientRowsDesiredWidth(ctx, { icons: false });
  const variants = [true, false].flatMap((withColorScale) =>
    LW_LEFT_RATIOS.map((ratio) => ({ ratio, withColorScale }))
  );
  const layouts: Layout[] = [];
  for (const variant of variants) {
    const rightWidth = contentWidth - columnGap - Math.round((contentWidth - columnGap) * variant.ratio);
    // Ширину у состава не отнимаем: описание не стоит потерянных сортов.
    if (layouts.length > 0 && rightWidth < minRightWidth) {
      continue;
    }
    const layout = buildLayout(variant);
    layouts.push(layout);
    if (layout.rightFits && (!layout.descriptionTrimmed || singleColumn)) {
      break;
    }
  }
  const fitting = layouts.filter((layout) => layout.rightFits);
  const candidates = fitting.length > 0 ? fitting : layouts;
  const full = candidates.find((layout) => !layout.descriptionTrimmed);
  return (
    full ??
    candidates.reduce((best, layout) => (layout.descriptionChars > best.descriptionChars ? layout : best))
  ).svg;
};

export const typographicTemplate: LabelTemplate = {
  id: "typographic",
  nameRu: "Классика",
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
