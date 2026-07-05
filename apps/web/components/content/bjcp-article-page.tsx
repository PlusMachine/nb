import React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { srmToEbc } from "@nb/brewing-core";
import type { BjcpCatalogStyle, ContentArticle } from "@nb/content";

import { getBjcpCardColorInfo } from "@/features/content/bjcp-card-stats";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { defaultPreferredGravityUnit, formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";

import { BjcpGravityPassportStats } from "./bjcp-gravity-passport-stats";
import { PassportStatCard } from "./bjcp-passport-stat-card";
import { StyleCommunityRecipes } from "./style-community-recipes";
import { StyleRecipesHeroChip, StyleRecipesTocEntry } from "./style-recipes-chip";
import { StyleRecipesProvider } from "./style-recipes-provider";

const mediaThemes = [
  "bg-[linear-gradient(150deg,#0f172a_0%,#1e293b_50%,#475569_100%)]",
  "bg-[linear-gradient(150deg,#111827_0%,#1f2937_55%,#334155_100%)]",
  "bg-[linear-gradient(150deg,#082f49_0%,#0f172a_55%,#1d4ed8_100%)]",
  "bg-[linear-gradient(150deg,#0f172a_0%,#1f2937_50%,#0f766e_100%)]"
] as const;

const resolveMediaTheme = (article: ContentArticle) => {
  const seed = article.bjcpId.charCodeAt(0) + article.category.id.charCodeAt(0);
  return mediaThemes[seed % mediaThemes.length];
};

const formatNumber = (value: number, precision = 1) => value.toFixed(precision).replace(/\.0$/, "");

const parseStatNumbers = (value: string) => (
  value.match(/\d+(?:\.\d+)?/g)?.map((item) => Number.parseFloat(item)).filter((item) => Number.isFinite(item)) ?? []
);

const formatRange = (values: number[], formatter: (value: number) => string) => {
  if (!values.length) {
    return null;
  }

  if (values.length === 1) {
    return formatter(values[0]!);
  }

  return `${formatter(values[0]!)} - ${formatter(values[values.length - 1]!)}`;
};

const formatGravityRange = (value: string, unit: PreferredGravityUnit) => {
  const numbers = parseStatNumbers(value);
  return formatRange(numbers, (item) => formatGravity(item, unit));
};

const formatEbcRange = (value: string) => {
  const numbers = parseStatNumbers(value);
  return formatRange(numbers, (item) => `${formatNumber(srmToEbc(item), 0)} EBC`);
};

const fallbackColorBandAccent: Record<ContentArticle["colorBand"], ColorAccent> = {
  straw: { startHex: "#FEF3C7", averageHex: "#FDE68A", endHex: "#FBBF24" },
  gold: { startHex: "#FDE68A", averageHex: "#FBBF24", endHex: "#D97706" },
  amber: { startHex: "#F59E0B", averageHex: "#D97706", endHex: "#92400E" },
  copper: { startHex: "#C2410C", averageHex: "#9A3412", endHex: "#7C2D12" },
  brown: { startHex: "#92400E", averageHex: "#6B3410", endHex: "#451A03" },
  dark: { startHex: "#7C4A24", averageHex: "#4B2E17", endHex: "#1C1917" }
};

const emptyPassportStatLabel = "Не указывается в BJCP";
const emptyPassportStatSupportingText = "Для этого стиля BJCP не задаёт отдельный диапазон.";

export type PassportStatKey = "og" | "fg" | "abv" | "ibu" | "srm";

type PassportStatDefinition = {
  key: PassportStatKey;
  label: string;
  wide?: boolean;
  supporting: (value: string) => string | null;
};

export const passportStatDefinitions: PassportStatDefinition[] = [
  {
    key: "og",
    label: "НП",
    // Плотность форматируется через resolvePassportStat (unit-aware), без вторичной единицы.
    supporting: () => null
  },
  {
    key: "fg",
    label: "КП",
    supporting: () => null
  },
  {
    key: "abv",
    label: "ABV",
    supporting: () => null
  },
  {
    key: "ibu",
    label: "IBU",
    supporting: () => null
  },
  {
    key: "srm",
    label: "Цвет",
    wide: true,
    supporting: formatEbcRange
  }
];

type ColorAccent = {
  startHex: string;
  averageHex: string;
  endHex: string;
};

export type PassportStatItem = PassportStatDefinition & {
  value: string;
  supportingText: string | null;
  isTextual: boolean;
  accent?: ColorAccent;
};

const normalizeDescriptor = (value: string) => value
  .toLowerCase()
  .replace(/[–—]/gu, "-")
  .replace(/\s+/gu, " ")
  .replace(/[.\s]+$/u, "")
  .trim();

const isCompactNumericValue = (value: string) => (
  parseStatNumbers(value).length > 0 && !/[A-Za-zА-Яа-я]/u.test(value)
);

const resolveLocalizedDescriptor = (key: PassportStatKey, value: string) => {
  const normalized = normalizeDescriptor(value);

  if (normalized === "same as base style") {
    return {
      value: "Как у базового стиля",
      supportingText: "Отдельный диапазон для этого стиля BJCP не указывает."
    };
  }

  if (
    normalized === "variable by base style"
    || normalized === "varies with the base beer style"
    || normalized === "varies with base style"
  ) {
    return {
      value: "Зависит от базового стиля",
      supportingText: "Отдельный диапазон для этого стиля BJCP не указывает."
    };
  }

  if (normalized === "varies with base style, typically above-average") {
    return {
      value: "Зависит от базового стиля",
      supportingText: "Обычно выше среднего для базовой версии."
    };
  }

  if (normalized === "varies with base style, often darker than the unadulterated base style") {
    return {
      value: "Зависит от базового стиля",
      supportingText: "Обычно темнее базовой версии."
    };
  }

  if (normalized.startsWith("og, fg, ibus, srm, and abv will vary depending on the underlying base beer")) {
    if (key === "abv" && normalized.includes("above 5%")) {
      return {
        value: "Зависит от базового стиля",
        supportingText: "Обычно выше 5%."
      };
    }

    if (key === "abv" && normalized.includes("above 6%")) {
      return {
        value: "Зависит от базового стиля",
        supportingText: "Обычно выше 6%."
      };
    }

    if (key === "srm" && normalized.includes("fruit will often be reflected in the color")) {
      return {
        value: "Зависит от базового стиля",
        supportingText: "Оттенок часто определяется фруктами."
      };
    }

    if (key === "srm" && normalized.includes("amber-copper")) {
      return {
        value: "Зависит от базового стиля",
        supportingText: "Чаще встречается янтарно-медный оттенок."
      };
    }

    if (key === "srm" && normalized.includes("somewhat dark")) {
      return {
        value: "Зависит от базового стиля",
        supportingText: "Чаще встречается тёмный оттенок."
      };
    }

    return {
      value: "Зависит от базового стиля",
      supportingText: "Отдельный диапазон для этого стиля BJCP не указывает."
    };
  }

  if (normalized.startsWith("og, fg, ibus, srm, and abv will vary depending on the declared beer")) {
    return {
      value: "Зависит от заявленного пива",
      supportingText: "Отдельный диапазон для этого стиля BJCP не указывает."
    };
  }

  if (normalized.startsWith("variable by type, see individual styles")) {
    return {
      value: "Зависит от подстиля IPA",
      supportingText: "Параметры отличаются у Session, Standard и Double версий."
    };
  }

  return {
    value: "Смотрите описание стиля",
    supportingText: value
  };
};

const buildSubtypeAbvValue = (article: ContentArticle) => {
  const variants = [
    article.vitalStatistics.sessionAbv ? `Session: ${article.vitalStatistics.sessionAbv}` : null,
    article.vitalStatistics.standardAbv ? `Standard: ${article.vitalStatistics.standardAbv}` : null,
    article.vitalStatistics.doubleAbv ? `Double: ${article.vitalStatistics.doubleAbv}` : null
  ].filter((item): item is string => item !== null);

  return variants.length ? variants.join("\n") : null;
};

const resolveColorAccent = (
  article: ContentArticle,
  catalogStyle: BjcpCatalogStyle | null,
  value: string,
  supportingText: string | null
): ColorAccent => {
  if (catalogStyle) {
    const colorInfo = getBjcpCardColorInfo(catalogStyle);

    return {
      startHex: colorInfo.startHex,
      averageHex: colorInfo.averageHex,
      endHex: colorInfo.endHex
    };
  }

  const numbers = parseStatNumbers(value);
  if (!numbers.length) {
    const descriptor = normalizeDescriptor([value, supportingText].filter(Boolean).join(" "));

    if (descriptor.includes("янтарно-медн") || descriptor.includes("amber-copper")) {
      return {
        startHex: "#f59e0b",
        averageHex: "#d97706",
        endHex: "#92400e"
      };
    }

    if (
      descriptor.includes("темн")
      || descriptor.includes("тёмн")
      || descriptor.includes("dark")
      || descriptor.includes("темнее")
      || descriptor.includes("darker")
    ) {
      return {
        startHex: "#7c4a24",
        averageHex: "#4b2e17",
        endHex: "#1c1917"
      };
    }

    return fallbackColorBandAccent[article.colorBand];
  }

  const startSrm = numbers[0]!;
  const endSrm = numbers[numbers.length - 1]!;
  const averageSrm = numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
  const start = beerColorFromSrm(startSrm);
  const end = beerColorFromSrm(endSrm);
  const average = beerColorFromSrm(averageSrm);

  return {
    startHex: start.hex,
    endHex: end.hex,
    averageHex: average.hex
  };
};

export const resolvePassportStat = (
  article: ContentArticle,
  definition: PassportStatDefinition,
  catalogStyle: BjcpCatalogStyle | null,
  preferredGravityUnit: PreferredGravityUnit = defaultPreferredGravityUnit
): PassportStatItem => {
  const rawValue = article.vitalStatistics[definition.key];
  const isGravityStat = definition.key === "og" || definition.key === "fg";

  if (rawValue) {
    const localized = resolveLocalizedDescriptor(definition.key, rawValue);
    const isNumeric = isCompactNumericValue(rawValue);
    const value = isNumeric
      ? (isGravityStat ? (formatGravityRange(rawValue, preferredGravityUnit) ?? rawValue) : rawValue)
      : localized.value;
    const supportingText = isNumeric
      ? (isGravityStat ? null : definition.supporting(rawValue))
      : localized.supportingText;

    return {
      ...definition,
      value,
      supportingText,
      isTextual: !isNumeric,
      accent: definition.key === "srm" ? resolveColorAccent(article, catalogStyle, value, supportingText) : undefined
    };
  }

  if (definition.key === "abv") {
    const subtypeAbv = buildSubtypeAbvValue(article);
    if (subtypeAbv) {
      return {
        ...definition,
        value: subtypeAbv,
        supportingText: "Диапазон зависит от подстиля Specialty IPA.",
        isTextual: true
      };
    }
  }

  const note = article.vitalStatistics.note ?? article.vitalStatisticsText;
  if (note) {
    const localized = resolveLocalizedDescriptor(definition.key, note);

    return {
      ...definition,
      value: localized.value,
      supportingText: localized.supportingText,
      isTextual: true,
      accent: definition.key === "srm" ? resolveColorAccent(article, catalogStyle, localized.value, localized.supportingText) : undefined
    };
  }

  return {
    ...definition,
    value: emptyPassportStatLabel,
    supportingText: emptyPassportStatSupportingText,
    isTextual: true,
    accent: definition.key === "srm" ? resolveColorAccent(article, catalogStyle, emptyPassportStatLabel, emptyPassportStatSupportingText) : undefined
  };
};

function ArticleStructuredData({ article }: { article: ContentArticle }) {
  const payload = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    alternativeHeadline: article.titleEn,
    description: article.seoDescription,
    inLanguage: "ru",
    keywords: article.keywords.join(", "),
    articleSection: article.category.nameRu,
    author: {
      "@type": "Organization",
      name: "NB Editorial"
    },
    publisher: {
      "@type": "Organization",
      name: "NB"
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}

export function BjcpArticlePage({
  article,
  catalogStyle = null,
  siblingStyles = []
}: {
  article: ContentArticle;
  catalogStyle?: BjcpCatalogStyle | null;
  /** Другие стили той же категории (для боковой навигации «не тот стиль?»). */
  siblingStyles?: { bjcpId: string; slug: string; title: string }[];
}) {
  const categoryLabel = `кат. ${article.category.nameRu}`;
  const mediaTheme = resolveMediaTheme(article);
  const mediaStyle = article.heroImageUrl
    ? {
      backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.52)), url(${article.heroImageUrl})`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    }
    : undefined;
  const passportStats = passportStatDefinitions.map((definition) => resolvePassportStat(article, definition, catalogStyle));

  return (
    <StyleRecipesProvider styleCode={article.bjcpId}>
    <main className="space-y-14 pb-24 pt-8">
      <ArticleStructuredData article={article} />

      <nav aria-label="Breadcrumb" className="px-1 text-sm text-zinc-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/bjcp" className="transition hover:text-zinc-950">
              BJCP 2021
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            {/* Ссылка на каталог, раскрытый на этой категории. Обязательно
                `view=bjcp&category=` — дефолтный вид каталога `families`, а фильтр по
                категории и аккордеон работают только в bjcp-виде (см. parseBjcpCatalogState
                / applyCatalogScope в features/content/bjcp-catalog.ts). */}
            <Link
              href={`/bjcp?view=bjcp&category=${encodeURIComponent(article.category.id)}`}
              className="text-zinc-700 transition hover:text-zinc-950"
            >
              {categoryLabel}
            </Link>
          </li>
        </ol>
      </nav>

      <section className="overflow-hidden rounded-[2.5rem] border border-white/80 bg-white/90 shadow-[0_50px_120px_-78px_rgba(15,23,42,0.42)] backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
          <div className="min-w-0 space-y-7 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">
                {article.bjcpHeading}
              </p>
              <h1
                className="max-w-4xl text-balance text-[2.2rem] font-semibold leading-[0.96] text-zinc-950 sm:text-[2.7rem] lg:text-[3.3rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {article.title}
              </h1>
              <p className="max-w-3xl text-pretty text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8">
                {article.description}
              </p>
            </div>

            {/* Сигнал о наличии рецептов на первом экране (вариант A — над паспортом).
                Резерв высоты и схлопывание при ошибке/пустом состоянии — внутри самого чипа. */}
            <StyleRecipesHeroChip styleCode={article.bjcpId} />

            <div className="grid auto-rows-fr gap-2.5 sm:grid-cols-2">
              {/* НП/КП — единица плотности догружается на клиенте (страница SSG). */}
              <BjcpGravityPassportStats article={article} catalogStyle={catalogStyle} />
              {passportStats
                .filter((stat) => stat.key !== "og" && stat.key !== "fg")
                .map((stat) => <PassportStatCard key={stat.key} stat={stat} />)}
            </div>
          </div>

          <div
            className={`relative min-h-[22rem] overflow-hidden lg:min-h-full ${article.heroImageUrl ? "" : mediaTheme}`}
            style={mediaStyle}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_32%)]" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/24 to-transparent" />
            <div className="relative flex h-full min-h-[22rem] items-end p-6 text-white sm:p-8 lg:p-10">
              <div className="space-y-4">
                <p className="text-5xl font-semibold leading-none text-white/96 sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
                  {article.bjcpId}
                </p>
                <p className="max-w-md text-2xl font-medium leading-tight text-white/86">
                  {article.titleEn}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-3xl">
        <p className="text-sm text-zinc-500">{article.readingMinutes} мин чтения</p>

        {/* Лёгкая лента якорей по секциям лонгрида + пункт «Рецепты (N)»: читатель
            прыгает к нужному разделу или к рецептам, не докручивая всю статью. Без
            scroll-spy — простые якорные ссылки. */}
        <nav aria-label="Разделы статьи" className="mt-3 flex flex-wrap gap-2">
          {article.sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-950"
            >
              {section.label}
            </a>
          ))}
          <StyleRecipesTocEntry />
        </nav>

        <div className="mt-10 space-y-10">
          {article.sections.map((section) => (
            <section
              id={section.id}
              key={section.id}
              className="scroll-mt-24 space-y-4 border-b border-zinc-200/80 pb-10 last:border-b-0 last:pb-0"
            >
              <h2 className="text-3xl font-semibold tracking-[-0.02em] text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
                {section.label}
              </h2>
              <p className="whitespace-pre-line text-pretty text-[1.05rem] leading-8 text-zinc-700">{section.content}</p>
            </section>
          ))}
        </div>
        {/* Атрибуция первоисточника обязательна по условиям использования гайдлайнов
            BJCP. Компактная строка вместо прежней карточки на 4 поля (файл часто «n/a»,
            язык очевиден, категория дублирует breadcrumb). rel=nofollow для внешней ссылки. */}
        <p className="mt-12 text-sm text-zinc-500">
          Источник:{" "}
          <a
            href="https://www.bjcp.org/style/2021/"
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-950"
          >
            {article.source.document ?? "BJCP 2021 Beer Style Guidelines"}
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          </a>
        </p>
      </article>

      <StyleCommunityRecipes styleTitle={article.title} styleCode={article.bjcpId} />

      {siblingStyles.length ? (
        <section className="space-y-4">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Ещё в категории</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
                Другие стили категории «{article.category.nameRu}»
              </h2>
            </div>
            <Link href="/bjcp" className="sm:shrink-0 text-sm font-semibold text-zinc-950 hover:text-zinc-700">
              Весь BJCP <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Боковой переход по соседним стилям: если человек открыл не тот стиль
              (напр. овсяный стаут вместо нужного), он быстро уходит к правильному,
              а не покидает сайт. */}
          <div className="flex flex-wrap gap-2">
            {siblingStyles.map((sibling) => (
              <Link
                key={sibling.slug}
                href={`/bjcp/${sibling.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300"
              >
                <span className="font-semibold text-zinc-950">{sibling.bjcpId}</span>
                <span className="text-zinc-600">{sibling.title}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
    </StyleRecipesProvider>
  );
}
