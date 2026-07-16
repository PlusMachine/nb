import { getArticleBySlug } from "@nb/content";

import { buildBjcpStyleOgView } from "@/features/og/bjcp";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка стиля BJCP (docs/specs/og-images.md §5.4). Отдаётся,
// когда у стиля нет собственной иллюстрации (плейсхолдер) — URL проставляет
// generateMetadata в app/(public)/bjcp/[slug]/page.tsx. Данные — из @nb/content
// (файловый индекс, кэш на уровне модуля), отдельная тонкая выборка не нужна.
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
    return renderOgCardResponse(buildBjcpStyleOgView(article, { domain, wordmark: SITE_NAME }));
  } catch (error) {
    console.error("og bjcp card render failed", { slug, error });
    try {
      return renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
