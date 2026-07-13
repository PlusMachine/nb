import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";

import {
  A4_SHEET,
  computeA4Grid,
  LABEL_PRESETS,
  mmToPx,
  presetOrientation,
  QR_SIZE_MM_BY_TIER,
  type LabelDpi,
  type LabelPresetId,
  type LabelSlots,
  type LabelTemplateId
} from "./contracts";
import { labelFontsDir } from "./fonts";
import { buildQrSvg } from "./qr";
import { getLabelTemplate } from "./templates";
import { DESCRIPTION_SVG_ATTR } from "./templates/blocks";
import type { LabelRenderContext } from "./templates";

// Рендер-пайплайн: SVG-шаблон → растр точного пиксельного размера (resvg,
// только встроенные шрифты) → пороговая бинаризация (sharp) → 1-бит PNG.
// PDF (pdf-lib) оборачивает готовый растр в страницу точного физразмера;
// A4 — сетка наклеек с метками реза.

const MM_TO_PT = 72 / 25.4;

/**
 * Порог бинаризации: 160 (не 128) сохраняет тонкие сглаженные штрихи
 * мелкого текста — подобран по визуальной проверке при 203 dpi.
 */
export const BINARIZE_THRESHOLD = 160;

export type LabelRenderParams = {
  template: LabelTemplateId;
  preset: LabelPresetId;
  dpi: LabelDpi;
  slots: LabelSlots;
};

/**
 * Печатается ли QR на этой наклейке. Молча исчезнувший QR выглядит как поломка,
 * поэтому «запрошен, но не влез» — отдельное состояние: роут отдаёт его
 * заголовком, студия объясняет пользователю.
 *   none    — QR не запрашивали;
 *   dropped — запрошен, но не помещается (43×25 мм вовсе без мета-блока; либо
 *             модуль кода мельче печатного минимума, либо не хватило высоты);
 *   ok      — напечатается.
 *
 * Ответ берём из готовой вёрстки, а не из отдельного расчёта: выбросить QR
 * может и шаблон (не хватило высоты мета-блока), и предсказание «влезет»
 * разошлось бы с печатью.
 */
export const resolveQrPrintState = (params: LabelRenderParams): "none" | "dropped" | "ok" => {
  if (!params.slots.qrUrl) {
    return "none";
  }
  return renderLabelSvg(params).svg.includes(QR_SVG_MARKER) ? "ok" : "dropped";
};

// Признак QR в готовом SVG: этим атрибутом помечен только он (см. qr.ts).
const QR_SVG_MARKER = 'shape-rendering="crispEdges"';

/**
 * Что стало с описанием: оно младше всех блоков и урезается по остатку высоты.
 * Молчать об этом нельзя — пользователь набрал текст и должен видеть, что на
 * печать он попал не целиком (или не попал вовсе).
 *   none    — описания нет;
 *   dropped — задано, но не поместилось ни одной строкой (S/M — вовсе без блока);
 *   trimmed — напечатается частично;
 *   ok      — напечатается целиком.
 */
export const resolveDescriptionPrintState = (params: LabelRenderParams): "none" | "dropped" | "trimmed" | "ok" => {
  if (!params.slots.description) {
    return "none";
  }
  const { svg } = renderLabelSvg(params);
  if (svg.includes(`${DESCRIPTION_SVG_ATTR}="full"`)) {
    return "ok";
  }
  return svg.includes(`${DESCRIPTION_SVG_ATTR}="trimmed"`) ? "trimmed" : "dropped";
};

export const renderLabelSvg = (params: LabelRenderParams): { svg: string; widthPx: number; heightPx: number } => {
  const preset = LABEL_PRESETS[params.preset];
  const widthPx = mmToPx(preset.widthMm, params.dpi);
  const heightPx = mmToPx(preset.heightMm, params.dpi);
  const ctx: LabelRenderContext = {
    slots: params.slots,
    tier: preset.tier,
    orientation: presetOrientation(preset),
    widthPx,
    heightPx,
    dpi: params.dpi,
    mm: (valueMm: number) => mmToPx(valueMm, params.dpi)
  };
  return { svg: getLabelTemplate(params.template).render(ctx), widthPx, heightPx };
};

const rasterizeSvg = (svg: string, zoom = 1): Buffer => {
  const resvg = new Resvg(svg, {
    fitTo: zoom === 1 ? { mode: "original" } : { mode: "zoom", value: zoom },
    background: "white",
    font: {
      loadSystemFonts: false,
      fontDirs: [labelFontsDir()],
      defaultFontFamily: "Rubik"
    }
  });
  return Buffer.from(resvg.render().asPng());
};

/** 1-бит PNG точного пиксельного размера — для прямой термопечати. */
export const renderLabelPng = async (params: LabelRenderParams): Promise<Buffer> => {
  const { svg } = renderLabelSvg(params);
  return sharp(rasterizeSvg(svg))
    .flatten({ background: "white" })
    .greyscale()
    .threshold(BINARIZE_THRESHOLD)
    .png({ palette: true, colours: 2, compressionLevel: 9 })
    .toBuffer();
};

/**
 * Превью для экрана: тот же SVG, но со сглаживанием и в 2× — без бинаризации.
 * Ужимать 1-бит растр средствами браузера нельзя: тонкие штрихи и дизеринг
 * рассыпаются, и превью врёт сильнее, чем сглаженный рендер той же вёрстки.
 * Что реально уйдёт в печать, показывает renderLabelPng (режим «как на печати»).
 */
export const renderLabelPreviewPng = async (params: LabelRenderParams): Promise<Buffer> => {
  const { svg } = renderLabelSvg(params);
  return sharp(rasterizeSvg(svg, 2)).flatten({ background: "white" }).png({ compressionLevel: 9 }).toBuffer();
};

/** PDF одной наклейки: страница = точный физический размер наклейки. */
export const renderLabelPdf = async (params: LabelRenderParams): Promise<Buffer> => {
  const preset = LABEL_PRESETS[params.preset];
  const png = await renderLabelPng(params);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([preset.widthMm * MM_TO_PT, preset.heightMm * MM_TO_PT]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return Buffer.from(await pdf.save());
};

/** A4-лист PDF: сетка наклеек выбранного пресета + уголки-метки реза. */
export const renderA4SheetPdf = async (params: LabelRenderParams): Promise<Buffer> => {
  const preset = LABEL_PRESETS[params.preset];
  const grid = computeA4Grid(preset);
  const png = await renderLabelPng(params);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_SHEET.widthMm * MM_TO_PT, A4_SHEET.heightMm * MM_TO_PT]);
  const image = await pdf.embedPng(png);
  const pageH = page.getHeight();
  const markLen = A4_SHEET.cropMarkMm * MM_TO_PT;
  const markGap = 0.5 * MM_TO_PT;
  const markWidth = 0.2 * MM_TO_PT;
  const black = rgb(0, 0, 0);

  for (const pos of grid.positions) {
    const x = pos.xMm * MM_TO_PT;
    const yTop = pageH - pos.yMm * MM_TO_PT;
    const w = preset.widthMm * MM_TO_PT;
    const h = preset.heightMm * MM_TO_PT;
    page.drawImage(image, { x, y: yTop - h, width: w, height: h });

    // Уголки-метки реза: по паре штрихов на каждый угол, вне поля наклейки.
    const corners = [
      { cx: x, cy: yTop, dx: -1, dy: 1 },
      { cx: x + w, cy: yTop, dx: 1, dy: 1 },
      { cx: x, cy: yTop - h, dx: -1, dy: -1 },
      { cx: x + w, cy: yTop - h, dx: 1, dy: -1 }
    ];
    for (const corner of corners) {
      page.drawLine({
        start: { x: corner.cx + corner.dx * markGap, y: corner.cy },
        end: { x: corner.cx + corner.dx * (markGap + markLen), y: corner.cy },
        thickness: markWidth,
        color: black
      });
      page.drawLine({
        start: { x: corner.cx, y: corner.cy + corner.dy * markGap },
        end: { x: corner.cx, y: corner.cy + corner.dy * (markGap + markLen) },
        thickness: markWidth,
        color: black
      });
    }
  }

  return Buffer.from(await pdf.save());
};
