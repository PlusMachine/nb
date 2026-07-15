/**
 * Печать наклейки прямо из студии. Клиентский модуль (DOM), без импорта
 * серверного рендера — только контракты форматов.
 *
 * Печатаем ровно тот 1-бит растр, который иначе ушёл бы в скачанный PNG (см.
 * `renderLabelPng`), в документе с точным физическим размером страницы: `@page
 * size` в мм и картинка в мм. Масштабирование браузером тут враг — 1-бит растр
 * рассчитан в сетку печатающей головы (см. комментарий к `LABEL_DPI_VALUES`),
 * поэтому интерполяцию глушим `image-rendering: pixelated`.
 *
 * Почему HTML со скрытым iframe, а не печать готового PDF: `print()` для PDF в
 * iframe работает только в Chrome/Edge — Firefox и Safari отдают пустую
 * страницу. HTML с `<img>` печатают все, а точность та же: картинка — тот же
 * растр, страница — тот же физразмер. Скачанный PDF при этом остаётся: он нужен
 * тем, кто печатает не из браузера.
 */

import { A4_SHEET, computeA4Grid, LABEL_PRESETS, type LabelPresetId } from "./contracts";

export type LabelPrintJob = {
  /** 1-бит PNG ОДНОЙ наклейки — на листе A4 он тиражируется по сетке. */
  image: Blob;
  preset: LabelPresetId;
  /** Лист A4 с сеткой наклеек и метками реза вместо одиночной наклейки. */
  sheet: boolean;
};

/** Толщина метки реза, мм — как в PDF-листе (`renderA4SheetPdf`). */
const CROP_MARK_WIDTH_MM = 0.2;
/** Зазор между углом наклейки и началом метки, мм — там же. */
const CROP_MARK_GAP_MM = 0.5;

/** Печать не переживёт округления «на глаз»: физразмеры пишем с точностью до микрона. */
const mm = (value: number): string => `${Math.round(value * 1000) / 1000}mm`;

/**
 * Уголки-метки реза вокруг наклейки: по паре штрихов (горизонтальный +
 * вертикальный) на угол, наружу от поля наклейки. Повторяет разметку
 * `renderA4SheetPdf` — включая то, что толщина штриха отложена симметрично
 * относительно линии реза (pdf-lib рисует линию по центру толщины).
 */
const cropMarks = (xMm: number, yMm: number, widthMm: number, heightMm: number): string => {
  const half = CROP_MARK_WIDTH_MM / 2;
  const len = A4_SHEET.cropMarkMm;
  const corners = [
    { cx: xMm, cy: yMm, dx: -1, dy: -1 },
    { cx: xMm + widthMm, cy: yMm, dx: 1, dy: -1 },
    { cx: xMm, cy: yMm + heightMm, dx: -1, dy: 1 },
    { cx: xMm + widthMm, cy: yMm + heightMm, dx: 1, dy: 1 }
  ];
  const marks: string[] = [];
  for (const corner of corners) {
    const left = corner.dx < 0 ? corner.cx - CROP_MARK_GAP_MM - len : corner.cx + CROP_MARK_GAP_MM;
    const top = corner.dy < 0 ? corner.cy - CROP_MARK_GAP_MM - len : corner.cy + CROP_MARK_GAP_MM;
    marks.push(
      `<span class="m" style="left:${mm(left)};top:${mm(corner.cy - half)};width:${mm(len)};height:${mm(CROP_MARK_WIDTH_MM)}"></span>`,
      `<span class="m" style="left:${mm(corner.cx - half)};top:${mm(top)};width:${mm(CROP_MARK_WIDTH_MM)};height:${mm(len)}"></span>`
    );
  }
  return marks.join("");
};

const buildPrintDocument = (job: LabelPrintJob, imageUrl: string): string => {
  const preset = LABEL_PRESETS[job.preset];
  const grid = job.sheet ? computeA4Grid(preset) : null;

  const page = grid
    ? `@page{size:${mm(A4_SHEET.widthMm)} ${mm(A4_SHEET.heightMm)};margin:0}`
    : `@page{size:${mm(preset.widthMm)} ${mm(preset.heightMm)};margin:0}`;

  const style = [
    page,
    "html,body{margin:0;padding:0;background:#fff}",
    // Растр уже посчитан под печатную сетку — сглаживание при масштабировании
    // размыло бы дизеринг и тонкие штрихи. print-color-adjust не даёт браузеру
    // «экономить чернила» на сплошном чёрном.
    "img{display:block;image-rendering:pixelated;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    ".sheet{position:relative;overflow:hidden}",
    ".sheet img{position:absolute}",
    ".m{position:absolute;background:#000}"
  ].join("");

  const size = `width:${mm(preset.widthMm)};height:${mm(preset.heightMm)}`;
  const body = grid
    ? [
        `<div class="sheet" style="width:${mm(A4_SHEET.widthMm)};height:${mm(A4_SHEET.heightMm)}">`,
        ...grid.positions.map(
          (pos) =>
            `<img src="${imageUrl}" alt="" style="left:${mm(pos.xMm)};top:${mm(pos.yMm)};${size}">` +
            cropMarks(pos.xMm, pos.yMm, preset.widthMm, preset.heightMm)
        ),
        "</div>"
      ].join("")
    : `<img src="${imageUrl}" alt="" style="${size}">`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
};

/**
 * Скрытый iframe с печатным документом + `print()`. Промис резолвится, когда
 * печать отдана браузеру (диалог человек закрывает сам), а iframe и blob-URL
 * живут до `afterprint` — снести их раньше значит отобрать у диалога картинку.
 */
export const printLabel = (job: LabelPrintJob): Promise<void> =>
  new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(job.image);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    // Не `display:none`: у скрытого таким образом фрейма часть браузеров не
    // отдаёт печать. Нулевой размер безвреден — печатную раскладку задаёт @page.
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.srcdoc = buildPrintDocument(job, imageUrl);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      URL.revokeObjectURL(imageUrl);
      frame.remove();
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error("print frame unavailable"));
        return;
      }
      win.addEventListener("afterprint", cleanup, { once: true });
      // Страховка от браузера, который afterprint не шлёт: иначе iframe и
      // blob-URL висят до перезагрузки страницы. К этому моменту диалог печати
      // уже закрыт — во время него JS страницы не исполняется.
      window.setTimeout(cleanup, 60_000);
      try {
        win.focus();
        win.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error("print failed"));
      }
    };

    document.body.appendChild(frame);
  });
