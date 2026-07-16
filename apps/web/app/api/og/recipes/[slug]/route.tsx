import { getBeerStyleById } from "@nb/brewing-core";
import { ImageResponse } from "next/og";

import { renderFallbackOgCard, renderRecipeOgCard } from "@/features/og/card";
import { getOgFonts } from "@/features/og/fonts";
import { buildRecipeOgView } from "@/features/og/models";
import { OG_CACHE_CONTROL, OG_SIZE } from "@/features/og/theme";
import { getPublicRecipeOgData } from "@/features/recipes/service";
import { assertIpRateLimit } from "@/lib/anti-abuse";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка рецепта (docs/specs/og-images.md §5.1). Отдаётся,
// когда у рецепта НЕТ своего фото (для рецептов с фото og:image остаётся самим
// фото — см. features/recipes/seo.ts). Публичный кэшируемый эндпоинт; Telegram
// и прочие краулеры дёргают URL картинки отдельным запросом от страницы.
export const runtime = "nodejs";

// Дешёвый фолбэк БЕЗ Satori-рендера — редирект на статичную сайтовую OG-картинку
// (apps/web/app/opengraph-image.png). Относительный Location краулер резолвит
// против запроса (host-агностично). Используется для несуществующих slug и как
// последний рубеж, чтобы эндпоинт никогда не отдавал 500.
const staticOgFallback = (): Response =>
  new Response(null, {
    status: 302,
    headers: { Location: "/opengraph-image.png", "Cache-Control": "public, max-age=0, s-maxage=300" }
  });

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { APP_URL, SITE_NAME } = getServerEnv();

  // Satori-рендер — CPU-тяжёлая операция на едином рантайме монолита. Публичный
  // эндпоинт троттлим per-IP (как другие рендер-эндпоинты проекта, напр.
  // api/labels/custom), иначе перебор slug/cache-busting = CPU-DoS. При
  // превышении — не 429 (сломанное превью в чате), а дешёвый статичный бренд-PNG.
  try {
    await assertIpRateLimit(request, "og_render", 300, 5 * 60);
  } catch {
    return staticOgFallback();
  }

  const domain = new URL(APP_URL).host;

  try {
    const recipe = await getPublicRecipeOgData(slug);
    const style = getBeerStyleById(recipe.styleId);
    const view = buildRecipeOgView(recipe, style, { domain, wordmark: SITE_NAME });

    return new ImageResponse(renderRecipeOgCard(view), {
      ...OG_SIZE,
      fonts: getOgFonts(),
      headers: { "Cache-Control": OG_CACHE_CONTROL }
    });
  } catch (error) {
    // Несуществующий/непубличный slug (рецепт удалён между рендером страницы и
    // запросом картинки) — дешёвый редирект, БЕЗ Satori-рендера: иначе поток
    // случайных slug форсит бесконечные дорогие фолбэк-рендеры.
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      return staticOgFallback();
    }
    // Реальный сбой рендера/данных — брендовый фолбэк. Но никогда не 500: если и
    // фолбэк упадёт (напр. недоступны TTF), отдаём статичную картинку.
    console.error("og recipe card render failed", { slug, error });
    try {
      return new ImageResponse(renderFallbackOgCard({ wordmark: SITE_NAME }), {
        ...OG_SIZE,
        fonts: getOgFonts(),
        headers: { "Cache-Control": "public, max-age=0, s-maxage=60" }
      });
    } catch (fallbackError) {
      console.error("og recipe fallback render failed", { slug, fallbackError });
      return staticOgFallback();
    }
  }
}
