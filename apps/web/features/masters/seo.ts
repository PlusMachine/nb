import type { Metadata } from "next";

import { buildMasterImageVariantUrl, getMasterSpecializationLabel, type MasterPublishedSnapshot } from "./contracts";

// SEO-фундамент публичной витрины/деталки мастеров (/masters, /masters/<slug>),
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

// --- Витрина /masters --------------------------------------------------------

const MASTERS_LIST_TITLE = "Мастера пивоварного оборудования";
const MASTERS_LIST_DESCRIPTION =
  "Витрина мастеров, которые своими руками делают пивоварное оборудование: ЦКТ и ёмкости, автоматику для варки, чиллеры, мельницы. Контакты и фото работ — напрямую, без посредников.";

export const buildMastersListMetadata = (): Metadata => ({
  title: MASTERS_LIST_TITLE,
  description: MASTERS_LIST_DESCRIPTION,
  alternates: {
    canonical: "/masters"
  },
  openGraph: {
    type: "website",
    url: "/masters",
    title: MASTERS_LIST_TITLE,
    description: MASTERS_LIST_DESCRIPTION
  },
  twitter: {
    card: "summary",
    title: MASTERS_LIST_TITLE,
    description: MASTERS_LIST_DESCRIPTION
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
      images: coverImagePath ? [coverImagePath] : undefined
    },
    twitter: {
      card: coverImagePath ? "summary_large_image" : "summary",
      title,
      description
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
      { "@type": "ListItem", position: 2, name: "Мастера", item: `${base}/masters` },
      { "@type": "ListItem", position: 3, name: snapshot.displayName, item: `${base}/masters/${slug}` }
    ]
  };
};
