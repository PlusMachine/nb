import { getBeerStyleById } from "@nb/brewing-core";

import { buildRecipeOgView, recipeCardViewFromRecipeView } from "@/features/og/models";
import { loadRecipeOgPhoto } from "@/features/og/photo";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getPublicRecipeOgData } from "@/features/recipes/service";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка рецепта (docs/specs/og-images.md §5.1). С Ф5 —
// единственный og:image рецепта: своё фото (heroImageId) больше не отдаётся
// сырым в og:image, а встраивается фото-врезкой (loadRecipeOgPhoto) в ту же
// брендовую карточку — см. features/recipes/seo.ts. Публичный кэшируемый
// эндпоинт; Telegram и прочие краулеры дёргают URL картинки отдельным запросом
// от страницы.
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { APP_URL, SITE_NAME } = getServerEnv();

  // Satori-рендер — CPU-тяжёлая операция на едином рантайме монолита. Публичный
  // эндпоинт троттлим per-IP (как другие рендер-эндпоинты проекта, напр.
  // api/labels/custom), иначе перебор slug/cache-busting = CPU-DoS. При
  // превышении — не 429 (сломанное превью в чате), а дешёвый статичный бренд-PNG.
  try {
    await assertOgRateLimit(request);
  } catch {
    return ogStaticFallback();
  }

  const domain = new URL(APP_URL).host;

  try {
    const recipe = await getPublicRecipeOgData(slug);
    const style = getBeerStyleById(recipe.styleId);
    const photo = recipe.heroImageId ? await loadRecipeOgPhoto(recipe.heroImageId) : null;
    const view = buildRecipeOgView(recipe, style, { domain, wordmark: SITE_NAME, photo });

    return await renderOgCardResponse(recipeCardViewFromRecipeView(view));
  } catch (error) {
    // Несуществующий/непубличный slug (рецепт удалён между рендером страницы и
    // запросом картинки) — дешёвый редирект, БЕЗ Satori-рендера: иначе поток
    // случайных slug форсит бесконечные дорогие фолбэк-рендеры.
    if (error instanceof Error && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) {
      return ogStaticFallback();
    }
    // Реальный сбой рендера/данных — брендовый фолбэк. Но никогда не 500: если и
    // фолбэк упадёт (напр. недоступны TTF), отдаём статичную картинку.
    console.error("og recipe card render failed", { slug, error });
    try {
      return await renderOgFallbackResponse(SITE_NAME);
    } catch (fallbackError) {
      console.error("og recipe fallback render failed", { slug, fallbackError });
      return ogStaticFallback();
    }
  }
}
