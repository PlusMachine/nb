import { ImageResponse } from "next/og";
import sharp from "sharp";

import { assertIpRateLimit } from "@/lib/anti-abuse";

import { renderFallbackOgCard, renderOgCard } from "./card";
import { getOgFonts } from "./fonts";
import type { OgCardView } from "./models";
import { OG_CACHE_CONTROL, OG_CONTENT_TYPE, OG_JPEG_CONTENT_TYPE, OG_SIZE, OG_WEIGHT_BUDGET_BYTES } from "./theme";

// Общие кирпичи route-хендлеров OG-карточек (docs/specs/og-images.md §7a).
// Инварианты: публичный Satori-рендер троттлится per-IP; при любой беде — не 500,
// а дешёвый 302 на статичный сайтовый PNG (сломанное превью в чате хуже простого).

/**
 * Весовой гейт (Ф5, §8): приёмка — вес ЛЮБОЙ карточки ≤ 300 КБ. Фото-врезка
 * может раздуть PNG за бюджет — дожимаем sharp→JPEG. Две попытки качества, не
 * зацикливаемся: если и вторая не уложилась, отдаём её как лучший результат
 * (лучше карточка чуть тяжелее бюджета, чем бесконечный цикл дожима).
 */
const enforceWeightBudget = async (png: Buffer): Promise<{ buffer: Buffer; contentType: string }> => {
  if (png.byteLength <= OG_WEIGHT_BUDGET_BYTES) {
    return { buffer: png, contentType: OG_CONTENT_TYPE };
  }
  const jpeg82 = await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (jpeg82.byteLength <= OG_WEIGHT_BUDGET_BYTES) {
    return { buffer: jpeg82, contentType: OG_JPEG_CONTENT_TYPE };
  }
  const jpeg68 = await sharp(png).jpeg({ quality: 68, mozjpeg: true }).toBuffer();
  return { buffer: jpeg68, contentType: OG_JPEG_CONTENT_TYPE };
};

/**
 * Дешёвый фолбэк БЕЗ Satori-рендера — 302 на статичную сайтовую OG-картинку
 * (apps/web/app/opengraph-image.png). Относительный Location краулер резолвит
 * против запроса (host-агностично). Для несуществующих сущностей и как последний
 * рубеж, чтобы эндпоинт никогда не отдавал 500.
 */
export const ogStaticFallback = (): Response =>
  new Response(null, {
    status: 302,
    headers: { Location: "/opengraph-image.png", "Cache-Control": "public, max-age=0, s-maxage=300" }
  });

/**
 * Троттлинг per-IP: Satori-рендер CPU-тяжёлый на едином рантайме монолита, а
 * эндпоинт публичный — перебор slug/cache-busting = CPU-DoS. Тот же ключ и лимит,
 * что у рецептовой карточки (общий бюджет на все og-роуты).
 */
export const assertOgRateLimit = (request: Request): Promise<void> =>
  assertIpRateLimit(request, "og_render", 300, 5 * 60);

/**
 * Ответ-картинка карточки: Satori-рендер OgCardView в PNG 1200×630 со
 * шрифтами, дожатый под весовой бюджет (Ф5). Буферизация (`arrayBuffer()`)
 * ВНУТРИ этой функции — намеренно: раньше `ImageResponse` отдавался как
 * стрим и ошибка Satori (битые данные и т.п.) всплывала уже при чтении тела
 * ответа, вне try/catch роута (§7a P3). Теперь она всплывает здесь, роуты
 * ловят её как обычный throw — если сами `await` результат внутри try/catch.
 */
export const renderOgCardResponse = async (
  view: OgCardView,
  cacheControl: string = OG_CACHE_CONTROL
): Promise<Response> => {
  const res = new ImageResponse(renderOgCard(view), { ...OG_SIZE, fonts: getOgFonts() });
  const png = Buffer.from(await res.arrayBuffer());
  const { buffer, contentType } = await enforceWeightBudget(png);
  // new Uint8Array(...) — тот же паттерн, что api/recipe-images/[imageId]/[variant]:
  // Response/BodyInit не резолвит Node Buffer напрямую (generic ArrayBufferLike
  // не совпадает буквально), голый Uint8Array устраивает оба рантайма.
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": contentType, "Cache-Control": cacheControl }
  });
};

/** Брендовый фолбэк-рендер (битые данные/сбой). Короткий кэш — вдруг данные починятся. */
export const renderOgFallbackResponse = async (wordmark: string): Promise<Response> => {
  const res = new ImageResponse(renderFallbackOgCard({ wordmark }), { ...OG_SIZE, fonts: getOgFonts() });
  const png = Buffer.from(await res.arrayBuffer());
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": OG_CONTENT_TYPE, "Cache-Control": "public, max-age=0, s-maxage=60" }
  });
};
