import { parseBottleParams } from "@/features/beer-page/bottle-params";
import { getBeerPresentationBySlug } from "@/features/beer-page/service";
import { buildBeerOgView } from "@/features/og/beer";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка гостевой страницы пива (docs/specs/og-images.md §5.7).
// Ссылку сканируют с QR на бутылке → превью в TG особенно уместно. Доступ к
// непубличному пиву — по ключу ?k (getBeerPresentationBySlug валидирует его сам,
// как и страница). Факты бутылки (?b дата, ?n партия, ?abv) — из query.
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { APP_URL, SITE_NAME } = getServerEnv();

  try {
    await assertOgRateLimit(request);
  } catch {
    return ogStaticFallback();
  }

  const params = new URL(request.url).searchParams;
  const domain = new URL(APP_URL).host;

  try {
    const beer = await getBeerPresentationBySlug({
      slug,
      shareKey: params.get("k"),
      viewerId: null
    });
    if (!beer) {
      // Нет пива ИЛИ непубличное без верного ключа — статичный бренд-PNG, не карточка.
      return ogStaticFallback();
    }
    const bottle = parseBottleParams({
      b: params.get("b") ?? undefined,
      n: params.get("n") ?? undefined,
      abv: params.get("abv") ?? undefined
    });
    return renderOgCardResponse(buildBeerOgView(beer, bottle, { domain, wordmark: SITE_NAME }));
  } catch (error) {
    console.error("og beer card render failed", { slug, error });
    try {
      return renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
