// =============================================================================
//  scripts/generate-og-image.mjs
//  Генерирует дефолтную OG-картинку (app/opengraph-image.png) из inline-SVG-
//  макета в фирменном стиле app/icon.svg (тёмный фон #09090b, знак «NB»):
//  скруглённый квадрат-иконка + крупный wordmark + строка-описание.
//  Точный размер 1200×630 (стандарт Open Graph / Twitter summary_large_image).
//  Идемпотентен: перезаписывает файл при каждом запуске.
//
//  Запуск:  node apps/web/scripts/generate-og-image.mjs
// =============================================================================
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(moduleDir, "..");
const outPath = resolve(webRoot, "app/opengraph-image.png");

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Иконка-знак — тот же скруглённый квадрат, что и app/icon.svg, но в
// инвертированных цветах (светлый квадрат на тёмном фоне карточки) —
// иначе на одинаковом с фоном #09090b он был бы не виден.
const ogSvg = `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#09090b" />
  <rect x="100" y="195" width="240" height="240" rx="52" fill="#f4f4f6" />
  <text
    x="220"
    y="315"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    font-weight="700"
    font-size="108"
    fill="#09090b"
  >NB</text>
  <text
    x="400"
    y="290"
    text-anchor="start"
    dominant-baseline="central"
    font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    font-weight="800"
    font-size="150"
    fill="#f4f4f6"
  >NB</text>
  <text
    x="400"
    y="382"
    text-anchor="start"
    dominant-baseline="central"
    font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    font-weight="500"
    font-size="34"
    fill="#a1a1aa"
  >Платформа для домашних пивоваров</text>
</svg>`;

// Проверка «текст реально отрисовался», а не сгенерирован сплошной заливкой.
const assertNotFlat = async (path) => {
  const stats = await sharp(path).stats();
  const maxStdev = Math.max(...stats.channels.map((channel) => channel.stdev));
  if (maxStdev < 5) {
    throw new Error(`${path}: похоже, текст не отрендерился (stddev=${maxStdev.toFixed(2)}) — проверьте системные шрифты`);
  }
  return maxStdev;
};

const assertExactSize = async (path) => {
  const metadata = await sharp(path).metadata();
  if (metadata.width !== OG_WIDTH || metadata.height !== OG_HEIGHT) {
    throw new Error(`${path}: размер ${metadata.width}×${metadata.height}, ожидалось ${OG_WIDTH}×${OG_HEIGHT}`);
  }
};

const main = async () => {
  await sharp(Buffer.from(ogSvg))
    .resize(OG_WIDTH, OG_HEIGHT)
    .flatten({ background: "#09090b" })
    .png()
    .toFile(outPath);

  const stdev = await assertNotFlat(outPath);
  await assertExactSize(outPath);
  console.log(`✓ ${outPath} (${OG_WIDTH}×${OG_HEIGHT}, stddev=${stdev.toFixed(1)})`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
