import type { Metadata } from "next";

import type { CatalogLandingSlug, IngredientCategory, IngredientSubtype, IngredientTechnicalData, UserCatalogIngredientDto } from "./contracts";
import { resolveConsumableInventoryBroadGroup } from "./consumables";
import { resolveIngredientBrandLabel, resolveYeastFlocculationLabelRu } from "./presentation";
import { formatHopFormLabel, resolveIngredientTechnicalDataColorRangeEbc } from "./technical-fields";
import { getSectionOgImage } from "../og/section";

import { getServerEnv } from "@/lib/env";

// SEO-фундамент каталога ингредиентов: категорийные лендинги (path-урлы),
// metadata для списка/деталки и JSON-LD (BreadcrumbList/Product/ItemList).
// См. notes/catalog-refactor-plan.md, этап 1.

// Тип объявлен в contracts.ts (нужен и хабу /catalog); здесь — реэкспорт для
// обратной совместимости импортов.
export type { CatalogLandingSlug };

export type CatalogLandingDefinition = {
  slug: CatalogLandingSlug;
  category: IngredientCategory;
  subtype?: "malt" | "fermentable";
  consumableGroup?: "inventory_supplies" | "inventory_additives";
  h1: string;
  metaTitle: string;
  metaDescription: string;
  intro: string[];
};

// Порядок — как в тулбаре каталога (ingredient-catalog-toolbar.tsx): солод,
// сбраживаемое сырьё, хмель, дрожжи, водоподготовка, расходники.
export const catalogCategoryLandings: CatalogLandingDefinition[] = [
  {
    slug: "malts",
    category: "fermentable",
    subtype: "malt",
    h1: "Солод для пивоварения",
    metaTitle: "Солод для пивоварения — каталог",
    metaDescription:
      "Солод для затирания: базовый и специальный, цвет в EBC, экстрактивность, производитель и страна происхождения.",
    intro: [
      "В разделе — солод для затирания: базовый (Pilsner, Pale Ale, Munich) и специальный (карамельный, шоколадный, жжёный).",
      "Ключевые параметры для подбора — цвет в EBC и экстрактивность."
    ]
  },
  {
    slug: "fermentables",
    category: "fermentable",
    subtype: "fermentable",
    h1: "Сбраживаемое сырьё",
    metaTitle: "Сбраживаемое сырьё — сахара, мёд, экстракты",
    metaDescription:
      "Сахара, мёд, сиропы, солодовые экстракты и несоложёное сырьё вне зерновой засыпи: экстрактивность, цвет, форма выпуска.",
    intro: [
      "Раздел объединяет сбраживаемое сырьё вне зерновой засыпи: сахара, мёд, сиропы, солодовые экстракты и несоложёнку.",
      "Для расчёта плотности сусла важны экстрактивность и цвет в EBC — оба параметра указаны в карточке ингредиента."
    ]
  },
  {
    slug: "hops",
    category: "hop",
    h1: "Хмель для пивоварения",
    metaTitle: "Хмель для пивоварения — каталог сортов",
    metaDescription:
      "Сорта хмеля: альфа- и бета-кислоты, форма выпуска (гранулы, крио), производитель и страна происхождения.",
    intro: [
      "В каталоге — сорта хмеля с альфа- и бета-кислотностью, формой выпуска и производителем.",
      "Для горечи ориентируйтесь на альфа-кислоту; ароматные сорта используют для позднего внесения и сухого охмеления."
    ]
  },
  {
    slug: "yeast",
    category: "yeast",
    h1: "Пивные дрожжи",
    metaTitle: "Пивные дрожжи — каталог штаммов",
    metaDescription:
      "Штаммы пивных дрожжей: аттенюация, температура брожения, флокуляция, форма выпуска (сухие, жидкие), производитель.",
    intro: [
      "Раздел содержит штаммы пивных дрожжей для эля, лагера и специальных стилей.",
      "Ключевые параметры для подбора — аттенюация, диапазон температуры брожения и флокуляция."
    ]
  },
  {
    slug: "water",
    category: "water_treatment",
    h1: "Водоподготовка",
    metaTitle: "Водоподготовка для пивоварения — соли и кислоты",
    metaDescription:
      "Соли и кислоты для корректировки профиля воды: гипс, хлорид кальция, молочная кислота и другие препараты для затора и варки.",
    intro: [
      "Раздел объединяет соли, кислоты и другие препараты для корректировки профиля воды перед варкой.",
      "С их помощью подгоняют жёсткость, сульфаты, хлориды и pH затора под водный профиль стиля."
    ]
  },
  {
    slug: "additives",
    category: "consumable",
    consumableGroup: "inventory_additives",
    h1: "Специи и добавки для пивоварения",
    metaTitle: "Специи и добавки для пивоварения — каталог",
    metaDescription: "Специи, цедра, травы и цветы, кофе и какао, древесина для выдержки, ароматизаторы и технологические добавки для домашнего пивоварения.",
    intro: [
      "В разделе — всё, что добавляют в пиво помимо солода, хмеля и дрожжей: специи и пряности, цедра, травы и цветы, кофе и какао, древесина для выдержки, ароматизаторы.",
      "Сюда же входят технологические добавки — осветлители, ферменты, подкормка дрожжей — и лузга для фильтрации затора."
    ]
  },
  {
    slug: "consumables",
    category: "consumable",
    consumableGroup: "inventory_supplies",
    h1: "Расходные материалы для пивоварения",
    metaTitle: "Расходные материалы для пивоварения — каталог",
    metaDescription: "Средства для мойки и дезинфекции, тара и укупорка, CO2 и другая расходка для домашней пивоварни.",
    intro: [
      "В разделе — то, что нужно пивовару помимо ингредиентов: санитайзеры и моющие средства, бутылки, крышки, пробки и кроненпробки, CO2.",
      "Пригодится на этапах санитарной подготовки, розлива и карбонизации."
    ]
  }
];

export const resolveCatalogLanding = (slug: string): CatalogLandingDefinition | null => (
  catalogCategoryLandings.find((landing) => landing.slug === slug) ?? null
);

export const resolveCatalogLandingForFilter = (
  category?: IngredientCategory,
  subtype?: "malt" | "fermentable" | null,
  consumableGroup?: "inventory_supplies" | "inventory_additives" | null
): CatalogLandingDefinition | null => {
  if (!category) {
    // subtype без категории всё равно однозначно резолвится: malt/fermentable
    // существуют только у category=fermentable, поэтому сам subtype уже
    // указывает на конкретный лендинг (?subtype=malt ↔ /catalog/malts).
    if (subtype) {
      return catalogCategoryLandings.find((landing) => landing.subtype === subtype) ?? null;
    }

    return null;
  }

  return catalogCategoryLandings.find((landing) => {
    if (landing.category !== category) {
      return false;
    }

    // fermentable требует точного совпадения подтипа (malt/fermentable — разные
    // лендинги); consumable требует точного совпадения broad group (additives/
    // consumables — разные лендинги, без группы неоднозначно, как fermentable
    // без subtype); остальные категории без подтипа (hop/yeast/water_treatment)
    // резолвятся независимо от переданных subtype/consumableGroup.
    if (landing.subtype) {
      return landing.subtype === subtype;
    }

    if (landing.consumableGroup) {
      return landing.consumableGroup === consumableGroup;
    }

    return true;
  }) ?? null;
};

const CATALOG_BASE_TITLE = "Каталог ингредиентов для пивоварения";
const CATALOG_BASE_DESCRIPTION =
  "Хмель, солод, сбраживаемое сырьё, дрожжи, вода и расходные материалы для пивоварения: параметры каждого ингредиента, аналоги и рецепты, где он используется.";

export const buildCatalogListMetadata = (params: {
  landing?: CatalogLandingDefinition | null;
  q?: string;
  view?: string;
  page?: number;
  category?: IngredientCategory;
  subtype?: "malt" | "fermentable" | null;
}): Metadata => {
  const q = params.q?.trim();
  if (q || params.view === "mine") {
    return {
      title: CATALOG_BASE_TITLE,
      description: CATALOG_BASE_DESCRIPTION,
      robots: {
        index: false,
        follow: true
      }
    };
  }

  const landing = params.landing ?? resolveCatalogLandingForFilter(params.category, params.subtype);
  const page = params.page && params.page > 1 ? params.page : null;

  // Страница ЗАМЕЩАЕТ openGraph родительского layout целиком (не мёржится) —
  // locale/siteName повторяем сами (см. app/(public)/page.tsx).
  const { SITE_NAME } = getServerEnv();

  if (landing) {
    const title = page ? `${landing.metaTitle} — страница ${page}` : landing.metaTitle;
    const canonicalPath = page ? `/catalog/${landing.slug}?page=${page}` : `/catalog/${landing.slug}`;
    // Ключ реестра обложек разделов — "catalog-<slug>" (features/og/section.ts,
    // getLandingRegistry строит его для каждой записи catalogCategoryLandings);
    // landing.slug типизирован CatalogLandingSlug — getSectionOgImage резолвит
    // ключ без null.
    const ogImage = getSectionOgImage(`catalog-${landing.slug}`);

    return {
      title,
      description: landing.metaDescription,
      alternates: {
        canonical: canonicalPath
      },
      openGraph: {
        title,
        description: landing.metaDescription,
        type: "website",
        locale: "ru_RU",
        siteName: SITE_NAME,
        images: [ogImage]
      },
      twitter: {
        // Брендовая обложка лендинга подключена (Ф3, docs/specs/og-images.md
        // §5.8) → summary_large_image, как у деталки ингредиента.
        card: "summary_large_image",
        title,
        description: landing.metaDescription,
        images: [ogImage.url]
      }
    };
  }

  // Фильтр без своего лендинга (например ?category=fermentable без subtype —
  // malt/fermentable неоднозначны) — не самостоятельная SEO-страница, поэтому
  // canonical схлопывается на чистый /catalog (playbook §4: «фильтры →
  // canonical на чистый URL»). У хаба нет пагинации (легаси ?page=N уходит
  // permanentRedirect'ом раньше, см. app/(public)/catalog/page.tsx) — canonical
  // всегда чистый /catalog, без ?page=N.
  const canonicalPath = "/catalog";
  const ogImage = getSectionOgImage("catalog");

  return {
    title: CATALOG_BASE_TITLE,
    description: CATALOG_BASE_DESCRIPTION,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      title: CATALOG_BASE_TITLE,
      description: CATALOG_BASE_DESCRIPTION,
      type: "website",
      locale: "ru_RU",
      siteName: SITE_NAME,
      images: [ogImage]
    },
    twitter: {
      // Брендовая обложка /catalog подключена (Ф3, docs/specs/og-images.md
      // §5.8) → summary_large_image.
      card: "summary_large_image",
      title: CATALOG_BASE_TITLE,
      description: CATALOG_BASE_DESCRIPTION,
      images: [ogImage.url]
    }
  };
};

const formatValue = (value: number) => value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const resolveIngredientTypeLabel = (item: UserCatalogIngredientDto): string => {
  if (item.category === "hop") {
    return "хмель";
  }

  if (item.category === "fermentable") {
    return item.subtype === "malt" ? "солод" : "сбраживаемое сырьё";
  }

  if (item.category === "yeast") {
    return "дрожжи";
  }

  if (item.category === "water_treatment") {
    return "водоподготовка";
  }

  // Кориандр — не «расходный материал»: у consumable тип берём по broad group,
  // так же как лендинг в хлебных крошках (см. catalogCategoryLandings).
  return resolveConsumableInventoryBroadGroup(item) === "inventory_additives"
    ? "добавка для пивоварения"
    : "расходный материал";
};

type IngredientFactEntry = { label: string; value: string };

const buildIngredientDetailFactEntries = (item: UserCatalogIngredientDto): IngredientFactEntry[] => {
  const technicalData = item.technicalData;

  if (item.category === "hop") {
    const hop = technicalData?.type === "hop"
      ? technicalData as Extract<IngredientTechnicalData, { type: "hop" }>
      : null;
    const formLabel = formatHopFormLabel(item.hopForm ?? hop?.hopForm ?? null);

    return [
      item.hopAlphaAcidPct != null ? { label: "Альфа-кислота", value: `${formatValue(item.hopAlphaAcidPct)}%` } : null,
      item.hopBetaAcidPct != null ? { label: "Бета-кислота", value: `${formatValue(item.hopBetaAcidPct)}%` } : null,
      formLabel ? { label: "Форма", value: formLabel } : null
    ].filter((entry): entry is IngredientFactEntry => Boolean(entry));
  }

  if (item.category === "fermentable") {
    const colorRange = resolveIngredientTechnicalDataColorRangeEbc(technicalData);

    return [
      colorRange ? { label: "Цвет", value: `${formatValue(colorRange.average)} EBC` } : null,
      item.fermentableExtractYieldPct != null
        ? { label: "Экстрактивность", value: `${formatValue(item.fermentableExtractYieldPct)}%` }
        : null
    ].filter((entry): entry is IngredientFactEntry => Boolean(entry));
  }

  if (item.category === "yeast") {
    const yeast = technicalData?.type === "yeast"
      ? technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>
      : null;
    const flocculation = resolveYeastFlocculationLabelRu(yeast?.flocculation);

    return [
      item.yeastAttenuationPct != null ? { label: "Аттенюация", value: `${formatValue(item.yeastAttenuationPct)}%` } : null,
      item.yeastMinFermentationTempC != null && item.yeastMaxFermentationTempC != null
        ? {
          label: "Температура брожения",
          value: `${formatValue(item.yeastMinFermentationTempC)}–${formatValue(item.yeastMaxFermentationTempC)}°C`
        }
        : null,
      flocculation ? { label: "Флокуляция", value: flocculation } : null
    ].filter((entry): entry is IngredientFactEntry => Boolean(entry));
  }

  if (item.category === "water_treatment") {
    const waterTreatment = technicalData?.type === "water_treatment"
      ? technicalData as Extract<IngredientTechnicalData, { type: "water_treatment" }>
      : null;
    const unit = waterTreatment?.unitPreferred ?? item.unitPreferred;

    return unit ? [{ label: "Единица дозирования", value: unit }] : [];
  }

  return [];
};

const CATALOG_DETAIL_TAIL = "Характеристики, аналоги и рецепты — в каталоге ингредиентов для пивоварения.";
const DESCRIPTION_SNIPPET_MAX_LENGTH = 200;

// Обрезает по границе слова, а не посередине — вместо ровно maxLength
// символов отдаёт чуть меньше, зато без разорванного слова перед «…».
const truncateAtWordBoundary = (text: string, maxLength: number) => {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const safeCut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${safeCut.trimEnd()}…`;
};

const buildIngredientDetailDescription = (item: UserCatalogIngredientDto) => {
  const descriptionRu = item.descriptionRu?.trim();
  if (descriptionRu) {
    const firstParagraph = descriptionRu.split(/\n{2,}/)[0]?.trim() ?? descriptionRu;
    return truncateAtWordBoundary(firstParagraph, DESCRIPTION_SNIPPET_MAX_LENGTH);
  }

  const entries = buildIngredientDetailFactEntries(item);
  if (entries.length === 0) {
    return CATALOG_DETAIL_TAIL;
  }

  const factSentence = entries.map((entry) => `${entry.label}: ${entry.value}`).join(", ");
  return `${factSentence}. ${CATALOG_DETAIL_TAIL}`;
};

export const buildIngredientDetailMetadata = (
  item: UserCatalogIngredientDto,
  params: { source: "system" | "custom"; id: string }
): Metadata => {
  const typeLabel = resolveIngredientTypeLabel(item);
  const brand = resolveIngredientBrandLabel(item);
  const secondary = item.secondaryLabelRu && item.secondaryLabelRu !== item.primaryLabelRu
    ? item.secondaryLabelRu
    : null;
  const namePart = secondary ? `${item.primaryLabelRu} (${secondary})` : item.primaryLabelRu;
  const title = `${namePart} — ${typeLabel}${brand ? ` ${brand}` : ""}`;
  const description = buildIngredientDetailDescription(item);

  // Фото у ингредиентов нет → og:image всегда генерённая карточка каталога
  // (docs/specs/og-images.md §5.3). width/height ставим — карточка ровно 1200×630.
  const ogImage = { url: `/api/og/catalog/${params.source}/${params.id}`, width: 1200, height: 630, alt: title };

  if (params.source === "custom") {
    return {
      title,
      description,
      robots: {
        index: false,
        follow: false
      },
      openGraph: {
        title,
        description,
        type: "website",
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

  // Архивный (isActive=false) системный ингредиент не 404-им: на него могут
  // вести ссылки со складов пользователей (app-зона). Но индексировать сироту,
  // которой нет ни в списках, ни в sitemap, не нужно — noindex, follow (страница
  // сама по себе валидна и ссылки с неё вести можно).
  const isArchived = item.status === "archived";

  return {
    title,
    description,
    alternates: {
      canonical: `/catalog/system/${params.id}`
    },
    ...(isArchived ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
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

const buildIngredientAdditionalProperties = (item: UserCatalogIngredientDto) => (
  buildIngredientDetailFactEntries(item).map((entry) => ({
    "@type": "PropertyValue",
    name: entry.label,
    value: entry.value
  }))
);

const resolveIngredientLandingSubtype = (item: UserCatalogIngredientDto): "malt" | "fermentable" | null => (
  item.subtype === "malt" || item.subtype === "fermentable" ? item.subtype : null
);

export const buildIngredientDetailJsonLd = (
  item: UserCatalogIngredientDto,
  params: { baseUrl: string; source: "system" | "custom"; id: string }
): object[] => {
  const base = params.baseUrl.replace(/\/$/, "");
  const detailUrl = `${base}/catalog/${params.source}/${params.id}`;
  const landing = resolveCatalogLandingForFilter(
    item.category,
    resolveIngredientLandingSubtype(item),
    item.category === "consumable" ? resolveConsumableInventoryBroadGroup(item) : null
  );

  // "Главная" — по образцу buildArticleBreadcrumbJsonLd (content-articles/seo.ts):
  // BreadcrumbList отдаёт полный путь от корня сайта, даже если в видимых
  // крошках страницы "Главная" не показана отдельным пунктом (её роль в UI
  // играет логотип/шапка).
  const breadcrumbItems: Array<{ "@type": "ListItem"; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Главная", item: base || "/" },
    { "@type": "ListItem", position: 2, name: "Каталог", item: `${base}/catalog` }
  ];

  if (landing) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 3,
      name: landing.h1,
      item: `${base}/catalog/${landing.slug}`
    });
  }

  breadcrumbItems.push({
    "@type": "ListItem",
    position: breadcrumbItems.length + 1,
    name: item.primaryLabelRu,
    item: detailUrl
  });

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems
  };

  const brand = resolveIngredientBrandLabel(item);
  const additionalProperty = buildIngredientAdditionalProperties(item);

  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.primaryLabelRu,
    url: detailUrl,
    description: buildIngredientDetailDescription(item)
  };

  if (brand) {
    product.brand = { "@type": "Brand", name: brand };
  }

  if (additionalProperty.length > 0) {
    product.additionalProperty = additionalProperty;
  }

  return [breadcrumbList, product];
};

export const buildCatalogItemListJsonLd = (
  items: UserCatalogIngredientDto[],
  params: { baseUrl: string; path: string; offset: number }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");

  const itemListElement = items
    .map((item, index) => ({ item, position: params.offset + index + 1 }))
    .filter(({ item }) => item.source !== "custom")
    .map(({ item, position }) => ({
      "@type": "ListItem",
      position,
      url: `${base}/catalog/system/${item.id}`,
      name: item.primaryLabelRu
    }));

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement
  };
};

export const jsonLdScriptProps = (data: unknown): { type: string; dangerouslySetInnerHTML: { __html: string } } => ({
  type: "application/ld+json",
  dangerouslySetInnerHTML: {
    __html: JSON.stringify(data).replace(/</g, "\\u003c")
  }
});
