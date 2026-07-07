import type { Metadata } from "next";

import type { IngredientCategory, IngredientSubtype, IngredientTechnicalData, UserCatalogIngredientDto } from "./contracts";
import { resolveIngredientBrandLabel, resolveYeastFlocculationLabelRu } from "./presentation";
import { formatHopFormLabel, resolveIngredientTechnicalDataColorRangeEbc } from "./technical-fields";

// SEO-фундамент каталога ингредиентов: категорийные лендинги (path-урлы),
// metadata для списка/деталки и JSON-LD (BreadcrumbList/Product/ItemList).
// См. notes/catalog-refactor-plan.md, этап 1.

export type CatalogLandingSlug = "hops" | "malts" | "fermentables" | "yeast" | "water" | "consumables";

export type CatalogLandingDefinition = {
  slug: CatalogLandingSlug;
  category: IngredientCategory;
  subtype?: "malt" | "fermentable";
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
    slug: "consumables",
    category: "consumable",
    h1: "Расходные материалы для пивоварения",
    metaTitle: "Расходные материалы для пивоварения — каталог",
    metaDescription:
      "Технические добавки, специи, средства для очистки и дезинфекции, тара и упаковка для домашнего пивоварения.",
    intro: [
      "В разделе — технические добавки (осветлители, питание для дрожжей), специи и пряности, средства для очистки и дезинфекции, тара и упаковка.",
      "Пригодятся на всех стадиях: от затирания и кипячения до брожения и розлива."
    ]
  }
];

export const resolveCatalogLanding = (slug: string): CatalogLandingDefinition | null => (
  catalogCategoryLandings.find((landing) => landing.slug === slug) ?? null
);

export const resolveCatalogLandingForFilter = (
  category?: IngredientCategory,
  subtype?: "malt" | "fermentable" | null
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
    // лендинги); категории без подтипа (hop/yeast/water_treatment/consumable)
    // резолвятся независимо от переданного subtype.
    return landing.subtype ? landing.subtype === subtype : true;
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

  if (landing) {
    const title = page ? `${landing.metaTitle} — страница ${page}` : landing.metaTitle;
    const canonicalPath = page ? `/catalog/${landing.slug}?page=${page}` : `/catalog/${landing.slug}`;

    return {
      title,
      description: landing.metaDescription,
      alternates: {
        canonical: canonicalPath
      },
      openGraph: {
        title,
        description: landing.metaDescription,
        type: "website"
      }
    };
  }

  // Фильтр без своего лендинга (например ?category=fermentable без subtype —
  // malt/fermentable неоднозначны) — не самостоятельная SEO-страница, поэтому
  // canonical схлопывается на чистый /catalog (playbook §4: «фильтры →
  // canonical на чистый URL»). ?page=N без фильтров — сюда же попадает и
  // остаётся self-canonical с сохранённым page, как и раньше.
  const canonicalPath = page ? `/catalog?page=${page}` : "/catalog";

  return {
    title: CATALOG_BASE_TITLE,
    description: CATALOG_BASE_DESCRIPTION,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      title: CATALOG_BASE_TITLE,
      description: CATALOG_BASE_DESCRIPTION,
      type: "website"
    }
  };
};

const formatValue = (value: number) => value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const resolveIngredientTypeLabel = (category: IngredientCategory, subtype: IngredientSubtype | null): string => {
  if (category === "hop") {
    return "хмель";
  }

  if (category === "fermentable") {
    return subtype === "malt" ? "солод" : "сбраживаемое сырьё";
  }

  if (category === "yeast") {
    return "дрожжи";
  }

  if (category === "water_treatment") {
    return "водоподготовка";
  }

  return "расходный материал";
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
  const typeLabel = resolveIngredientTypeLabel(item.category, item.subtype);
  const brand = resolveIngredientBrandLabel(item);
  const secondary = item.secondaryLabelRu && item.secondaryLabelRu !== item.primaryLabelRu
    ? item.secondaryLabelRu
    : null;
  const namePart = secondary ? `${item.primaryLabelRu} (${secondary})` : item.primaryLabelRu;
  const title = `${namePart} — ${typeLabel}${brand ? ` ${brand}` : ""}`;
  const description = buildIngredientDetailDescription(item);

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
        type: "website"
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
      type: "website"
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
  const landing = resolveCatalogLandingForFilter(item.category, resolveIngredientLandingSubtype(item));

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
