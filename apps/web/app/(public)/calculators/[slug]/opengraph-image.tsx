import { ImageResponse } from "next/og";

import { allCalculatorSlugs, getCalculatorBySlug } from "@/features/calculators/catalog";
import { renderFallbackOgCard, renderOgCard } from "@/features/og/card";
import { buildCalculatorOgView } from "@/features/og/calculator";
import { getOgFonts } from "@/features/og/fonts";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";
import { getServerEnv } from "@/lib/env";

// OG-карточка калькулятора v1 (docs/specs/og-images.md §5.2). File-convention, а
// не route handler: страница калькулятора СОЗНАТЕЛЬНО статическая (generateStatic-
// Params, metadata не читает searchParams). Next сам проставит og:image +
// width/height/alt из этого модуля и сгенерит картинку на билде — рантайм-цена
// ноль. Страница не задаёт своих openGraph.images → конфликта нет.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Калькулятор пивовара — NB";
// Слаги — фиксированный набор (generateStaticParams покрывает те же, что и страница
// калькулятора). Запрещаем on-demand рендер для произвольного слага: иначе перебор
// «мусорных» URL форсил бы Satori-рендер в рантайме мимо rate-limit (§7a). Неизвестный
// слаг → 404, без рендера. Прод-набор весь пререндерится на билде — рантайм-цена ноль.
export const dynamicParams = false;

export function generateStaticParams() {
  return allCalculatorSlugs.map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { APP_URL, SITE_NAME } = getServerEnv();

  // Как у route-хендлеров: любой сбой рендера → брендовый фолбэк, не 500.
  try {
    const domain = new URL(APP_URL).host;
    const item = getCalculatorBySlug(slug);
    const element = item
      ? renderOgCard(buildCalculatorOgView(item, { domain, wordmark: SITE_NAME }))
      : renderFallbackOgCard({ wordmark: SITE_NAME });
    return new ImageResponse(element, { ...OG_SIZE, fonts: getOgFonts() });
  } catch (error) {
    console.error("og calculator card render failed", { slug, error });
    return new ImageResponse(renderFallbackOgCard({ wordmark: SITE_NAME }), { ...OG_SIZE, fonts: getOgFonts() });
  }
}
