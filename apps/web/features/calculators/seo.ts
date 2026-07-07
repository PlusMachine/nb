import type { Metadata } from "next";

import type { CalculatorCatalogItem } from "./catalog";

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
      description
    }
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
