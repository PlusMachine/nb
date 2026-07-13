import QRCode from "qrcode";

import { QR_MIN_MODULE_PX } from "./contracts";

// QR ведёт на публичную страницу рецепта и рендерится только для
// опубликованных (gating — в service.ts). Здесь — чистая геометрия:
// матрица → SVG-фрагмент на целочисленной пиксельной сетке.

/** Тихая зона по спецификации QR — 4 модуля с каждой стороны. */
export const QR_QUIET_MODULES = 4;

export type QrSvgFragment = {
  /** SVG-фрагмент <g>…</g> с левым верхним углом в (0,0). */
  svg: string;
  /** Итоговая сторона квадрата в px (включая тихую зону). */
  sizePx: number;
  modulePx: number;
};

/**
 * Строит QR под доступный квадрат availablePx. Возвращает null, если по
 * правилам печати (модуль ≥ QR_MIN_MODULE_PX) код не влезает — тогда блок
 * QR просто не рендерится.
 *
 * Уровень коррекции подбирается: сначала «M», при нехватке места — «L». Длинный
 * слаг рецепта поднимает версию QR (больше модулей → мельче модуль), и на 58×40
 * мм код уже на грани; «L» кодирует те же данные меньшим числом модулей, то
 * есть крупной точкой. Понижаем только когда иначе QR не напечатался бы вовсе.
 */
export const buildQrSvg = (url: string, availablePx: number): QrSvgFragment | null => {
  for (const level of ["M", "L"] as const) {
    const fragment = buildAtLevel(url, availablePx, level);
    if (fragment) {
      return fragment;
    }
  }
  return null;
};

const buildAtLevel = (url: string, availablePx: number, level: "M" | "L"): QrSvgFragment | null => {
  const qr = QRCode.create(url, { errorCorrectionLevel: level });
  const size = qr.modules.size;
  const totalModules = size + QR_QUIET_MODULES * 2;
  const modulePx = Math.floor(availablePx / totalModules);
  if (modulePx < QR_MIN_MODULE_PX) {
    return null;
  }

  const parts: string[] = [];
  for (let row = 0; row < size; row += 1) {
    // Сливаем подряд идущие тёмные модули строки в один rect — компактнее.
    let runStart = -1;
    for (let col = 0; col <= size; col += 1) {
      const dark = col < size && qr.modules.data[row * size + col] === 1;
      if (dark && runStart < 0) {
        runStart = col;
      } else if (!dark && runStart >= 0) {
        const x = (QR_QUIET_MODULES + runStart) * modulePx;
        const y = (QR_QUIET_MODULES + row) * modulePx;
        parts.push(`<rect x="${x}" y="${y}" width="${(col - runStart) * modulePx}" height="${modulePx}"/>`);
        runStart = -1;
      }
    }
  }

  const sizePx = totalModules * modulePx;
  const svg = [
    `<g shape-rendering="crispEdges">`,
    `<rect width="${sizePx}" height="${sizePx}" fill="white"/>`,
    `<g fill="black">${parts.join("")}</g>`,
    `</g>`
  ].join("");
  return { svg, sizePx, modulePx };
};
