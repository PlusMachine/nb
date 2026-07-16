import type { Metadata } from "next";

import { buildMasterImageVariantUrl, getMasterSpecializationLabel, type MasterPublishedSnapshot } from "./contracts";

// SEO-фундамент маркета и деталки мастеров (/market, /masters/<slug>),
// §8 ТЗ. Билдеры по образцу features/recipes/seo.ts: jsonLdScriptProps
// переиспользуем из features/ingredients/seo.ts, truncateAtWordBoundary там не
// экспортирован — держим локальный аналог (как в других feature/seo.ts).

const DESCRIPTION_MAX_LENGTH = 200;

const truncateAtWordBoundary = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const safeCut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${safeCut.trimEnd()}…`;
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveAbsoluteUrl = (baseUrl: string, path: string): string => (isAbsoluteUrl(path) ? path : `${baseUrl}${path}`);

/** Первое фото галереи → первое фото первого изделия → нет (см. pickSnapshotCoverImage в service.ts, тот же приоритет). */
const resolveMasterCoverImagePath = (snapshot: MasterPublishedSnapshot): string | null => {
  const cover = snapshot.gallery[0] ?? snapshot.items.find((item) => item.images.length > 0)?.images[0] ?? null;
  return cover ? buildMasterImageVariantUrl(cover.imageId, "large") : null;
};

// --- Маркет /market ------------------------------------------------------------

const MARKET_LIST_TITLE = "Маркет пивоварного оборудования от мастеров";
const MARKET_LIST_DESCRIPTION =
  "Пивоварное оборудование ручной работы: ЦКТ и ёмкости, автоматика для варки, чиллеры, мельницы — от мастеров из комьюнити. Контакты и фото — напрямую, без посредников.";

export const buildMarketListMetadata = (): Metadata => ({
  title: MARKET_LIST_TITLE,
  description: MARKET_LIST_DESCRIPTION,
  alternates: {
    canonical: "/market"
  },
  openGraph: {
    type: "website",
    url: "/market",
    title: MARKET_LIST_TITLE,
    description: MARKET_LIST_DESCRIPTION
  },
  twitter: {
    // Картинки у списка нет (сайтовый дефолт не наследуется при своём openGraph) →
    // summary, иначе пустая большая карточка. Генерённый OG — Ф2.
    card: "summary",
    title: MARKET_LIST_TITLE,
    description: MARKET_LIST_DESCRIPTION
  }
});

// --- Деталка /masters/[slug] --------------------------------------------------

export const buildMasterPageMetadata = (slug: string, snapshot: MasterPublishedSnapshot): Metadata => {
  const specializationLabels = snapshot.specializations.map(getMasterSpecializationLabel).join(", ");
  const titleSuffix = [specializationLabels, snapshot.city].filter(Boolean).join(", ");
  const title = titleSuffix ? `${snapshot.displayName} — ${titleSuffix}` : snapshot.displayName;
  const description = truncateAtWordBoundary(snapshot.summary, DESCRIPTION_MAX_LENGTH);
  const canonicalPath = `/masters/${slug}`;
  const coverImagePath = resolveMasterCoverImagePath(snapshot);

  // Фото галереи приоритетно; без него — генерённая OG-карточка мастера 1200×630
  // (docs/specs/og-images.md §5.6). Картинка теперь есть всегда → summary_large_image.
  const ogImage = coverImagePath
    ? { url: coverImagePath, alt: title }
    : { url: `/api/og/masters/${slug}`, width: 1200, height: 630, alt: title };

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      type: "profile",
      url: canonicalPath,
      title,
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
};

export const buildMasterJsonLd = (
  slug: string,
  snapshot: MasterPublishedSnapshot,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");
  const url = `${base}/masters/${slug}`;
  const coverImagePath = resolveMasterCoverImagePath(snapshot);

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: snapshot.displayName,
    url,
    address: {
      "@type": "PostalAddress",
      addressLocality: snapshot.city
    }
  };

  // telephone — только когда реально задан контактный телефон (никогда не
  // выдумываем поле ради полноты разметки).
  if (snapshot.contacts.phone) {
    payload.telephone = snapshot.contacts.phone;
  }

  if (coverImagePath) {
    payload.image = resolveAbsoluteUrl(base, coverImagePath);
  }

  return payload;
};

export const buildMasterBreadcrumbJsonLd = (
  slug: string,
  snapshot: MasterPublishedSnapshot,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: base || "/" },
      { "@type": "ListItem", position: 2, name: "Маркет", item: `${base}/market` },
      { "@type": "ListItem", position: 3, name: snapshot.displayName, item: `${base}/masters/${slug}` }
    ]
  };
};
