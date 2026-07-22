import { calculatorHasStickyResultBar, calculatorQueryHasKnownFields, getCalculatorDefinition, initialCalculatorStateFromQuery, parseCalculatorQuery } from "@/features/calculators/definitions";
import { buildCalculatorOgView, buildCalculatorResultOgView } from "@/features/og/calculator";
import { assertOgRateLimit, ogStaticFallback, renderOgCardResponse, renderOgFallbackResponse } from "@/features/og/render";
import { getServerEnv } from "@/lib/env";

// Динамическая OG-карточка калькулятора (docs/specs/og-images.md §5.2, Ф4):
// без query — та же брендовая карточка v1, что раньше рисовал file-convention
// opengraph-image.tsx; с query — v2 с результатом расчёта. Раньше не route,
// а file-convention: перевели на route, потому что file-convention в сегменте
// [slug] каскадится на вложенный саброут share/ и перебивает его собственный
// config-based og:image (тот же класс ловушки, что и с обложками разделов Ф3,
// см. §6 таблицу «Два механизма доставки»).
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
    const definition = getCalculatorDefinition(slug);
    if (!definition) {
      // Неизвестный слаг — дешёвый 302 без Satori-рендера (§7a, анти-DoS).
      return ogStaticFallback();
    }

    const query = parseCalculatorQuery(Object.fromEntries(new URL(request.url).searchParams));

    if (
      Object.keys(query).length === 0 ||
      !calculatorQueryHasKnownFields(definition, query) ||
      !calculatorHasStickyResultBar(definition.catalog.slug)
    ) {
      // Пустой query, ИЛИ в query нет ни одного известного поля (посторонние ключи вроде
      // utm_source не должны рисовать «результат», посчитанный из дефолтов), ИЛИ калькулятор
      // без generic-результата (keg-carbonation, unit-converter) — им нечего показать в v2,
      // остаются на карточке v1. Контент меняется только с деплоем — кэшируем надолго на CDN.
      return await renderOgCardResponse(
        buildCalculatorOgView(definition.catalog, { domain, wordmark: SITE_NAME }),
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
      );
    }

    const state = initialCalculatorStateFromQuery(definition, query);
    const result = definition.calculate(state);
    // URL query-зависимый (свой результат на каждую комбинацию входов) — короче TTL.
    return await renderOgCardResponse(
      buildCalculatorResultOgView(definition.catalog, result, { domain, wordmark: SITE_NAME }),
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
    );
  } catch (error) {
    console.error("og calculator card render failed", { slug, error });
    try {
      return await renderOgFallbackResponse(SITE_NAME);
    } catch {
      return ogStaticFallback();
    }
  }
}
