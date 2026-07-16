import { buildArticleOgView } from "@/features/og/article";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getPublishedContentArticleBySlug } from "@/features/content-articles/service";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка статьи без обложки (docs/specs/og-images.md §5.5).
// Со своей обложкой статья остаётся на ней (og:image = coverImageUrl), карточку
// подставляет seo.ts только для статей без обложки.
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { APP_URL, SITE_NAME } = getServerEnv();

  try {
    await assertOgRateLimit(request);
  } catch {
    return ogStaticFallback();
  }

  const domain = new URL(APP_URL).host;

  try {
    const article = await getPublishedContentArticleBySlug(slug);
    if (!article) {
      return ogStaticFallback();
    }
    return renderOgCardResponse(buildArticleOgView(article, { domain, wordmark: SITE_NAME }));
  } catch (error) {
    console.error("og article card render failed", { slug, error });
    try {
      return renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
