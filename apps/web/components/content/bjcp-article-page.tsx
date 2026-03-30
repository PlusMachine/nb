import Link from "next/link";
import { sgToPlato, srmToEbc } from "@nb/brewing-core";
import type { ContentArticle } from "@nb/content";

import { beerColorFromSrm } from "@/features/recipes/beer-color";

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

const formatPlatoRange = (value: string) => {
  const numbers = parseStatNumbers(value);
  return formatRange(numbers, (item) => `${sgToPlato(item, 1).toFixed(1)} °P`);
};

const formatEbcRange = (value: string) => {
  const numbers = parseStatNumbers(value);
  return formatRange(numbers, (item) => `${formatNumber(srmToEbc(item), 0)} EBC`);
};

type PassportStatDefinition = {
  label: string;
  supporting: (value: string) => string | null;
};

const passportStatDefinitions: PassportStatDefinition[] = [
  {
    label: "НП",
    supporting: formatPlatoRange
  },
  {
    label: "КП",
    supporting: formatPlatoRange
  },
  {
    label: "ABV",
    supporting: () => null
  },
  {
    label: "IBU",
    supporting: () => null
  }
];

const resolveColorRange = (value: string) => {
  const numbers = parseStatNumbers(value);
  if (!numbers.length) {
    return null;
  }

  const startSrm = numbers[0]!;
  const endSrm = numbers[numbers.length - 1]!;
  const averageSrm = numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
  const start = beerColorFromSrm(startSrm);
  const end = beerColorFromSrm(endSrm);
  const average = beerColorFromSrm(averageSrm);

  return {
    startSrm,
    endSrm,
    startHex: start.hex,
    endHex: end.hex,
    averageHex: average.hex
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
  relatedArticles
}: {
  article: ContentArticle;
  relatedArticles: ContentArticle[];
}) {
  const categoryLabel = `кат. ${article.category.nameRu}`;
  const mediaTheme = resolveMediaTheme(article);
  const mediaStyle = article.heroImageUrl
    ? {
      backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.16), rgba(15, 23, 42, 0.72)), url(${article.heroImageUrl})`,
      backgroundPosition: "center",
      backgroundSize: "cover"
    }
    : undefined;
  const statByLabel = new Map(article.stats.map((stat) => [stat.label, stat]));
  const colorStat = statByLabel.get("SRM") ?? null;
  const colorRange = colorStat ? resolveColorRange(colorStat.value) : null;
  const colorEbc = colorStat ? formatEbcRange(colorStat.value) : null;
  const passportStats = passportStatDefinitions
    .map((definition) => {
      const stat = statByLabel.get(definition.label);
      if (!stat) {
        return null;
      }

      return {
        ...definition,
        value: stat.value,
        supportingText: definition.supporting(stat.value)
      };
    })
    .filter((item): item is PassportStatDefinition & { value: string; supportingText: string | null } => item !== null);

  return (
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
          <li className="text-zinc-700">{categoryLabel}</li>
        </ol>
      </nav>

      <section className="overflow-hidden rounded-[2.5rem] border border-white/80 bg-white/90 shadow-[0_50px_120px_-78px_rgba(15,23,42,0.42)] backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
          <div className="space-y-7 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
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
              <p className="max-w-3xl text-pretty text-lg leading-8 text-zinc-600">
                {article.description}
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {passportStats.map((stat) => (
                <div
                  key={stat.label}
                  className="min-h-[6rem] rounded-[1.5rem] border border-zinc-200 bg-slate-50 px-4 py-3 text-zinc-900"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{stat.label}</p>
                  <p className="mt-2 text-lg font-semibold leading-none text-zinc-950 tabular-nums">
                    {stat.value}
                  </p>
                  {stat.supportingText ? (
                    <p className="mt-1.5 text-xs font-medium tabular-nums text-zinc-500">{stat.supportingText}</p>
                  ) : (
                    <p className="mt-1.5 text-xs font-medium text-transparent">.</p>
                  )}
                </div>
              ))}

              {colorStat && colorRange ? (
                <div className="rounded-[1.5rem] border border-zinc-200 bg-slate-50 px-4 py-3 text-zinc-900 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Цвет</p>
                  <div className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-1">
                    <p className="text-lg font-semibold leading-none text-zinc-950 tabular-nums">
                      {colorStat.value} SRM
                    </p>
                    {colorEbc ? (
                      <p className="text-xs font-medium tabular-nums text-zinc-500">
                        {colorEbc}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.16)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        backgroundImage: `linear-gradient(90deg, ${colorRange.startHex} 0%, ${colorRange.averageHex} 52%, ${colorRange.endHex} 100%)`
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`relative min-h-[22rem] overflow-hidden lg:min-h-full ${article.heroImageUrl ? "" : mediaTheme}`}
            style={mediaStyle}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_32%)]" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/45 to-transparent" />
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
        <div className="flex flex-wrap gap-3">
          <span className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700">
            {article.readingMinutes} мин чтения
          </span>
        </div>

        <div className="mt-10 space-y-10">
          {article.sections.map((section) => (
            <section
              id={section.id}
              key={section.id}
              className="space-y-4 border-b border-zinc-200/80 pb-10 last:border-b-0 last:pb-0"
            >
              <h2 className="text-3xl font-semibold tracking-[-0.02em] text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
                {section.label}
              </h2>
              <p className="whitespace-pre-line text-pretty text-[1.05rem] leading-8 text-zinc-700">{section.content}</p>
            </section>
          ))}
        </div>
        <section className="mt-12 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-[0_26px_80px_-62px_rgba(15,23,42,0.4)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Источник</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-zinc-950">Документ</p>
              <p className="mt-1 text-sm leading-7 text-zinc-600">{article.source.document ?? "BJCP 2021"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-950">Файл</p>
              <p className="mt-1 text-sm leading-7 text-zinc-600">{article.source.fileName ?? "n/a"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-950">Язык</p>
              <p className="mt-1 text-sm leading-7 text-zinc-600">{article.source.language ?? "ru"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-950">Категория</p>
              <p className="mt-1 text-sm leading-7 text-zinc-600">{categoryLabel}</p>
            </div>
          </div>
        </section>
      </article>

      {relatedArticles.length ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Ещё по теме</p>
              <h2 className="mt-2 text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
                Другие стили из кат. {article.category.id}
              </h2>
            </div>
            <Link href="/bjcp" className="text-sm font-semibold text-zinc-950">
              Весь BJCP
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {relatedArticles.map((related) => (
              <Link
                key={related.slug}
                href={`/bjcp/${related.slug}`}
                className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-[0_26px_80px_-62px_rgba(15,23,42,0.4)] transition hover:-translate-y-1"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{related.eyebrow}</p>
                <h3 className="mt-4 text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
                  {related.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-zinc-600">{related.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
