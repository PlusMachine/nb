import { DEFAULT_BJCP_HERO_IMAGE_URL, getArticleBySlug } from "@nb/content";

import { buildBjcpStyleOgView } from "@/features/og/bjcp";
import { loadBjcpOgPhoto } from "@/features/og/photo";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка стиля BJCP (docs/specs/og-images.md §5.4). URL
// проставляет generateMetadata в app/(public)/bjcp/[slug]/page.tsx — теперь для
// ВСЕХ стилей (Ф5): без иллюстрации карточка как раньше, с иллюстрацией —
// та же карточка с фото-врезкой (loadBjcpOgPhoto), вместо сырого PNG в og:image.
// Данные — из @nb/content (файловый индекс, кэш на уровне модуля), отдельная
// тонкая выборка не нужна.
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
    const article = await getArticleBySlug(slug);
    if (!article) {
      return ogStaticFallback();
    }
    const photo = article.heroImageUrl && article.heroImageUrl !== DEFAULT_BJCP_HERO_IMAGE_URL
      ? await loadBjcpOgPhoto(article.heroImageUrl)
      : null;
    return await renderOgCardResponse(buildBjcpStyleOgView(article, { domain, wordmark: SITE_NAME, photo }));
  } catch (error) {
    console.error("og bjcp card render failed", { slug, error });
    try {
      return await renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
