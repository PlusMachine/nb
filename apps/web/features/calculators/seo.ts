import type { Metadata } from "next";

import type { CalculatorCatalogItem } from "./catalog";
import type { CalculatorResult } from "./definitions";

// SEO-фундамент калькуляторов (/calculators/<slug>): metadata и BreadcrumbList.
// Билдеры по образцу features/content-articles/seo.ts / features/ingredients/seo.ts;
// jsonLdScriptProps переиспользуем из features/ingredients/seo.ts.
//
// Состояние инструмента (?og=…&fg=…) — это shared-ссылки на предзаполненный
// калькулятор, а не отдельные страницы: canonical всегда схлопывается на чистый
// слаг (см. docs/seo-playbook.md, §4).

export const buildCalculatorMetadata = (item: CalculatorCatalogItem): Metadata => {
  const canonicalPath = `/calculators/${item.slug}`;
  const description = item.seoDescription ?? item.description;

  return {
    title: item.seoTitle,
    description,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      title: item.seoTitle,
      description,
      // Картинка у калькулятора теперь есть всегда — route-хендлер
      // /api/og/calculators/<slug> (v1-карточка без query), поэтому
      // large-карточка безопасна (docs/specs/og-images.md §7.1). File
      // convention снят из-за каскада на саброут /share (см. §6).
      images: [{ url: `/api/og/calculators/${item.slug}`, width: 1200, height: 630, alt: item.seoTitle }]
    },
    twitter: { card: "summary_large_image" }
  };
};

// Метаданные саброута /calculators/<slug>/share?<query> (Ф4, docs/specs/og-images.md
// §5.2): динамическая страница-обёртка над результатом расчёта из share-ссылки.
// og:image — карточка v2 с самим результатом; canonical схлопывается на чистый
// слаг калькулятора (та же политика §4 seo-playbook, что и у основной страницы),
// noindex — саброут существует только ради превью в мессенджере, в выдаче не нужен.
export const buildCalculatorShareMetadata = (
  item: CalculatorCatalogItem,
  result: CalculatorResult,
  opts: { queryString: string }
): Metadata => {
  const canonicalPath = `/calculators/${item.slug}`;
  const description = item.seoDescription ?? item.description;
  const title = `${result.primary.label}: ${result.primary.value}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath
    },
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      url: canonicalPath,
      title,
      description,
      images: [
        {
          url: `/api/og/calculators/${item.slug}?${opts.queryString}`,
          width: 1200,
          height: 630,
          alt: title
        }
      ]
    },
    twitter: { card: "summary_large_image" }
  };
};

// WebApplication-разметка страницы калькулятора: бесплатный веб-инструмент.
// Дополняет BreadcrumbList; offers price 0 — обязательное поле для rich results
// у *Application-типов.
export const buildCalculatorWebAppJsonLd = (
  item: Pick<CalculatorCatalogItem, "slug" | "seoTitle" | "seoDescription" | "description">,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: item.seoTitle,
    url: `${base}/calculators/${item.slug}`,
    description: item.seoDescription ?? item.description,
    applicationCategory: "UtilityApplication",
    operatingSystem: "Web",
    inLanguage: "ru",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" }
  };
};

export const buildCalculatorBreadcrumbJsonLd = (
  item: Pick<CalculatorCatalogItem, "slug" | "shortTitle">,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: base || "/" },
      { "@type": "ListItem", position: 2, name: "Калькуляторы", item: `${base}/calculators` },
      { "@type": "ListItem", position: 3, name: item.shortTitle, item: `${base}/calculators/${item.slug}` }
    ]
  };
};
