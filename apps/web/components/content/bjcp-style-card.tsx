import Image from "next/image";
import Link from "next/link";
import type { BjcpCatalogStyle } from "@nb/content";

import { getBjcpCardColorInfo, getBjcpCardStatDisplay } from "@/features/content/bjcp-card-stats";
import { getStyleFermentationLabel } from "@/features/content/bjcp-catalog";

type Props = {
  style: BjcpCatalogStyle;
};

export function BjcpStyleCard({ style }: Props) {
  const clampStyle = {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden"
  };
  const abvStat = getBjcpCardStatDisplay(style, "abv");
  const ibuStat = getBjcpCardStatDisplay(style, "ibu");
  const colorInfo = getBjcpCardColorInfo(style);
  const fermentationLabel = getStyleFermentationLabel(style);
  const stats = [
    { label: "ABV", value: abvStat.value, isFallback: abvStat.isFallback },
    { label: "IBU", value: ibuStat.value, isFallback: ibuStat.isFallback },
    { label: "SRM", value: colorInfo.value, accent: colorInfo, isFallback: colorInfo.isFallback },
    { label: "Тип брожения", value: fermentationLabel, isFallback: fermentationLabel === "Не указано" || fermentationLabel === "Зависит от рецепта" }
  ];

  return (
    <Link
      href={`/bjcp/${style.slug}`}
      className="group block overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-[0_22px_70px_-62px_rgba(15,23,42,0.4)] transition duration-300 hover:-translate-y-0.5 hover:border-border"
      aria-label={`Открыть стиль ${style.bjcpId} ${style.title}`}
    >
      <article className="flex h-full flex-col">
        <div className="relative aspect-[16/9] overflow-hidden border-b border-border">
          {/* next/image вместо inline background: даёт lazy-загрузку и srcset вместо разом
              20-40 полноразмерных карточек на выдаче каталога (LCP/мобильный трафик).
              Без картинки стиль показывается на одном градиенте — как и раньше. */}
          {style.heroImageUrl ? (
            <Image
              src={style.heroImageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.14),rgba(15,23,42,0.62))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_36%)]" />
          <div className="relative flex h-full flex-col justify-between p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-foreground/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                BJCP {style.bjcpId}
              </span>
            </div>

            <div className="space-y-1.5">
              <h3 className="max-w-[18rem] text-balance text-2xl font-semibold leading-[1.02] text-white" style={{ fontFamily: "var(--font-display)" }}>
                {style.title}
              </h3>
              <p className="text-sm font-medium text-white/78">{style.titleEn}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">кат. {style.categoryNameRu}</p>
            <p className="text-sm leading-6 text-muted-foreground" style={clampStyle}>{style.description}</p>
          </div>

          <dl className="mt-4 divide-y divide-border text-sm">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-between gap-3 py-2.5 text-foreground"
              >
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">{stat.label}</dt>
                <dd className={`m-0 flex min-w-0 items-center justify-end gap-2 text-right text-foreground ${stat.isFallback ? "text-[13px] font-medium leading-4" : "text-sm font-medium"}`}>
                  {stat.accent && !stat.isFallback ? (
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15"
                      style={{ backgroundImage: `linear-gradient(135deg, ${stat.accent.startHex}, ${stat.accent.averageHex}, ${stat.accent.endHex})` }}
                    />
                  ) : null}
                  <span className="break-words">{stat.value}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {style.badgesRu.slice(0, 3).map((badge: string) => (
              <span
                key={badge}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </article>
    </Link>
  );
}
