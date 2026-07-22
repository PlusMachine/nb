import { getUserCatalogIngredientByRef } from "@/features/ingredients/catalog-service";
import { buildIngredientOgView } from "@/features/og/ingredient";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка ингредиента каталога (docs/specs/og-images.md §5.3).
// Фото у ингредиентов нет → карточка генерится всегда. Публичный кэшируемый
// эндпоинт; URL из seo.ts (features/ingredients/seo.ts). Кастомные ингредиенты
// анонимно не грузятся (владельческий гейт) → для них 302 на статичный бренд-PNG.
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ source: string; id: string }> }) {
  const { source, id } = await context.params;
  const { APP_URL, SITE_NAME } = getServerEnv();

  try {
    await assertOgRateLimit(request);
  } catch {
    return ogStaticFallback();
  }

  // URL-сегмент → источник сервиса: system → catalog, custom → custom.
  const resolvedSource = source === "system" ? "catalog" : source === "custom" ? "custom" : null;
  if (!resolvedSource) {
    return ogStaticFallback();
  }

  const domain = new URL(APP_URL).host;

  try {
    // userId=null: пропускает избранное/закупки/usage-счётчики (тяжёлые под-запросы),
    // остаётся один SELECT ингредиента. Кастомный при этом вернёт null → фолбэк.
    const item = await getUserCatalogIngredientByRef(null, resolvedSource, id);
    if (!item) {
      return ogStaticFallback();
    }
    return await renderOgCardResponse(buildIngredientOgView(item, { domain, wordmark: SITE_NAME }));
  } catch (error) {
    console.error("og ingredient card render failed", { source, id, error });
    try {
      return await renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
