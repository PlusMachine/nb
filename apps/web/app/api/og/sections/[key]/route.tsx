import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { resolveSectionOgView } from "@/features/og/section";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка обложки раздела (docs/specs/og-images.md §Ф3):
// главная/списки/лендинги каталога без собственной иллюстрации. Без обращений
// к БД — реестр обложек чисто в памяти (features/og/section.ts).
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const { APP_URL, SITE_NAME } = getServerEnv();

  try {
    await assertOgRateLimit(request);
  } catch {
    return ogStaticFallback();
  }

  const domain = new URL(APP_URL).host;

  try {
    const view = resolveSectionOgView(key, { domain, wordmark: SITE_NAME });
    if (!view) {
      return ogStaticFallback();
    }
    return await renderOgCardResponse(view);
  } catch (error) {
    console.error("og section card render failed", { key, error });
    try {
      return await renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
