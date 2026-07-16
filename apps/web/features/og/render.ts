import { ImageResponse } from "next/og";

import { assertIpRateLimit } from "@/lib/anti-abuse";

import { renderFallbackOgCard, renderOgCard } from "./card";
import { getOgFonts } from "./fonts";
import type { OgCardView } from "./models";
import { OG_CACHE_CONTROL, OG_SIZE } from "./theme";

// Общие кирпичи route-хендлеров OG-карточек (docs/specs/og-images.md §7a).
// Инварианты: публичный Satori-рендер троттлится per-IP; при любой беде — не 500,
// а дешёвый 302 на статичный сайтовый PNG (сломанное превью в чате хуже простого).

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

/** Ответ-картинка карточки: Satori-рендер OgCardView в PNG 1200×630 со шрифтами. */
export const renderOgCardResponse = (view: OgCardView, cacheControl: string = OG_CACHE_CONTROL): ImageResponse =>
  new ImageResponse(renderOgCard(view), {
    ...OG_SIZE,
    fonts: getOgFonts(),
    headers: { "Cache-Control": cacheControl }
  });

/** Брендовый фолбэк-рендер (битые данные/сбой). Короткий кэш — вдруг данные починятся. */
export const renderOgFallbackResponse = (wordmark: string): ImageResponse =>
  new ImageResponse(renderFallbackOgCard({ wordmark }), {
    ...OG_SIZE,
    fonts: getOgFonts(),
    headers: { "Cache-Control": "public, max-age=0, s-maxage=60" }
  });
