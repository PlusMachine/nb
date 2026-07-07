// =============================================================================
//  scripts/generate-pwa-icons.mjs
//  Генерирует растровые PWA-иконки из двух inline-SVG-макетов:
//    1. «скруглённый» — 1-в-1 содержимое app/icon.svg (rx=112) → 192/512 (any);
//    2. «полнокадровый» — тот же макет без скругления, текст в safe zone
//       маскируемой иконки (~80% от центра) → maskable-512 и apple-touch-icon.
//  Идемпотентен: перезаписывает файлы при каждом запуске.
//
//  Запуск:  node apps/web/scripts/generate-pwa-icons.mjs
// =============================================================================
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(moduleDir, "..");
const iconSvgPath = resolve(webRoot, "app/icon.svg");
const pwaImagesDir = resolve(webRoot, "public/images/pwa");
const appleIconPath = resolve(webRoot, "app/apple-icon.png");

// Полнокадровый макет: без rx, текст уменьшен, чтобы уложиться в safe zone
// (~80% от центра холста) — иначе Android обрежет буквы в белом круге.
const fullBleedSvg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#09090b" />
  <text
    x="256"
    y="256"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    font-weight="700"
    font-size="180"
    fill="#ffffff"
  >NB</text>
</svg>`;

// flatten() убирает альфа-канал — годится ТОЛЬКО для полнокадровых целей
// (icon-maskable-512.png, apple-icon.png): у них rect на весь холст без
// скругления, и maskable/apple-touch-icon по спецификации требуют непрозрачный
// фон. Для скруглённых целей (icon-192/512) flatten нельзя: он заливает фоном
// прозрачные углы вокруг rx=112 и превращает скруглённый квадрат в жёсткий —
// они рендерятся с сохранением альфа-канала (opaque: false).
const renderPng = async (svg, size, outPath, { opaque }) => {
  let pipeline = sharp(Buffer.from(svg)).resize(size, size);
  if (opaque) {
    pipeline = pipeline.flatten({ background: "#09090b" });
  } else {
    pipeline = pipeline.ensureAlpha();
  }
  await pipeline.png().toFile(outPath);
};

// Проверка «текст реально отрисовался», а не сгенерирован сплошной заливкой:
// разброс каналов у пустого прямоугольника был бы близок к нулю.
const assertNotFlat = async (outPath) => {
  const stats = await sharp(outPath).stats();
  const maxStdev = Math.max(...stats.channels.map((channel) => channel.stdev));
  if (maxStdev < 5) {
    throw new Error(
      `${outPath}: похоже, текст не отрендерился (stddev=${maxStdev.toFixed(2)}) — проверьте системные шрифты`
    );
  }
  return maxStdev;
};

// Пост-проверка: пиксель (0,0) должен иметь ожидаемую альфу — иначе скруглённая
// иконка внезапно стала непрозрачным квадратом (или наоборот, у полнокадровой
// пропал фон). raw()+ensureAlpha() гарантируют 4-й (alpha) канал в буфере.
const assertCornerAlpha = async (outPath, expectedAlpha, label) => {
  const { data, info } = await sharp(outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = data[info.channels - 1];
  if (alpha !== expectedAlpha) {
    throw new Error(
      `${outPath}: ${label} — угол (0,0) имеет alpha=${alpha}, ожидалось ${expectedAlpha}. ` +
        `Проверьте flatten()/opaque в renderPng.`
    );
  }
};

const main = async () => {
  await mkdir(pwaImagesDir, { recursive: true });

  const roundedSvg = await readFile(iconSvgPath, "utf8");

  const targets = [
    { svg: roundedSvg, size: 192, outPath: resolve(pwaImagesDir, "icon-192.png"), opaque: false },
    { svg: roundedSvg, size: 512, outPath: resolve(pwaImagesDir, "icon-512.png"), opaque: false },
    {
      svg: fullBleedSvg(512),
      size: 512,
      outPath: resolve(pwaImagesDir, "icon-maskable-512.png"),
      opaque: true
    },
    { svg: fullBleedSvg(180), size: 180, outPath: appleIconPath, opaque: true }
  ];

  for (const target of targets) {
    await renderPng(target.svg, target.size, target.outPath, { opaque: target.opaque });
    const stdev = await assertNotFlat(target.outPath);
    console.log(`✓ ${target.outPath} (${target.size}×${target.size}, stddev=${stdev.toFixed(1)})`);
  }

  await assertCornerAlpha(resolve(pwaImagesDir, "icon-512.png"), 0, "скруглённая иконка icon-512.png");
  await assertCornerAlpha(
    resolve(pwaImagesDir, "icon-maskable-512.png"),
    255,
    "полнокадровая иконка icon-maskable-512.png"
  );
  console.log("✓ проверка углов: icon-512.png прозрачен, icon-maskable-512.png непрозрачен");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
