import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BeerPresentation } from "@/components/beer/beer-presentation";
import { parseBottleParams } from "@/features/beer-page/bottle-params";
import { getBeerPresentationBySlug } from "@/features/beer-page/service";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

// Гостевая страница пива: сюда ведёт QR с наклейки на бутылке. Группа (present)
// без PublicShell — обложка рисуется от края до края, без сайтового хрома.
// published-рецепт открыт всем; draft/private — владельцу или по ключу ?k=
// (см. features/beer-page/share-key.ts). Кроме ключа, наклейка может нести
// факты конкретной бутылки — дату розлива (b), номер партии (n) и фактическую
// крепость (abv), см. features/beer-page/bottle-params.ts.

type RouteParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ k?: string; b?: string; n?: string; abv?: string }>;
};

// Дедуп между generateMetadata и телом страницы (одинаковые аргументы → один SELECT).
const loadBeer = cache((slug: string, shareKey: string | null, viewerId: string | null) =>
  getBeerPresentationBySlug({ slug, shareKey, viewerId })
);

const loadBeerFromRoute = async ({ params, searchParams }: RouteParams) => {
  const [{ slug }, { k }, user] = await Promise.all([params, searchParams, getSessionUser()]);
  return await loadBeer(slug, k ?? null, user?.id ?? null);
};

export async function generateMetadata(route: RouteParams): Promise<Metadata> {
  const [beer, { k, b, n, abv }] = await Promise.all([loadBeerFromRoute(route), route.searchParams]);
  if (!beer) {
    // Статус решаем в metadata, до стриминга тела — как на странице рецепта.
    notFound();
  }

  const { APP_URL } = getServerEnv();
  const baseUrl = APP_URL.replace(/\/$/, "");
  const description =
    beer.descriptionParagraphs[0]?.slice(0, 200) ??
    (beer.style ? `${beer.style.name} от домашнего пивовара.` : "Домашнее пиво.");
  const title = beer.style ? `${beer.title} — ${beer.style.name}` : beer.title;

  // Реальное фото пивовара приоритетно. Иначе — генерённая карточка с фактами
  // бутылки (розлив/партия/ABV из query переносим в URL карточки), а не общий
  // стакан стиля: для ссылки с QR она информативнее (docs/specs/og-images.md §5.7).
  const ogCardQuery = new URLSearchParams();
  if (b) ogCardQuery.set("b", b);
  if (n) ogCardQuery.set("n", n);
  if (abv) ogCardQuery.set("abv", abv);
  if (k) ogCardQuery.set("k", k);
  const ogCardQs = ogCardQuery.toString();
  const ogImage = beer.heroPhotoUrl
    ? { url: `${baseUrl}${beer.heroPhotoUrl}`, alt: title }
    : { url: `${baseUrl}/api/og/beer/${beer.slug}${ogCardQs ? `?${ogCardQs}` : ""}`, width: 1200, height: 630, alt: title };

  return {
    title,
    description,
    // Страница живёт для отсканировавших QR, в поиске ей делать нечего:
    // published-контент уже индексируется на /recipes/<slug>, а непубличный
    // рецепт тем более не должен попасть в выдачу.
    robots: { index: false, follow: false },
    openGraph: {
      title: beer.title,
      description,
      images: [ogImage]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url]
    }
  };
}

export default async function BeerPresentationRoute(route: RouteParams) {
  const [beer, { b, n, abv }] = await Promise.all([loadBeerFromRoute(route), route.searchParams]);
  if (!beer) {
    notFound();
  }

  // Детали конкретной бутылки/визита — не часть DTO рецепта (service.ts),
  // поэтому идут отдельным пропом, а не примешиваются к beer.
  const bottle = parseBottleParams({ b, n, abv });

  return <BeerPresentation beer={beer} bottle={bottle} />;
}
