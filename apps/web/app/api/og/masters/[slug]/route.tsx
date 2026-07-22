import { buildMasterOgView } from "@/features/og/master";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getPublishedMasterBySlug } from "@/features/masters/service";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка мастера без фото (docs/specs/og-images.md §5.6). С фото
// галереи мастер остаётся на нём; карточку подставляет seo.ts только когда фото
// нет. Снапшот целиком в jsonb — отдельная тонкая выборка не нужна.
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
    const master = await getPublishedMasterBySlug(slug);
    if (!master) {
      return ogStaticFallback();
    }
    return await renderOgCardResponse(buildMasterOgView(master.snapshot, { domain, wordmark: SITE_NAME }));
  } catch (error) {
    console.error("og master card render failed", { slug, error });
    try {
      return await renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
