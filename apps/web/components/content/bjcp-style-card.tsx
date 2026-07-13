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
  const stats = [
    { label: "ABV", value: abvStat.value, isFallback: abvStat.isFallback },
    { label: "IBU", value: ibuStat.value, isFallback: ibuStat.isFallback },
    { label: "SRM", value: colorInfo.value, accent: colorInfo, isFallback: colorInfo.isFallback },
    { label: "Брожение", value: getStyleFermentationLabel(style), isFallback: false }
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

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-xl border border-border px-3 py-2.5 text-foreground ${stat.accent
                  ? "relative overflow-hidden bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(244,244,245,0.92))]"
                  : "bg-muted"
                }`}
              >
                {stat.accent ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[4px]"
                    style={{
                      backgroundImage: `linear-gradient(180deg, ${stat.accent.startHex} 0%, ${stat.accent.averageHex} 52%, ${stat.accent.endHex} 100%)`
                    }}
                  />
                ) : null}
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</span>
                <span className={`mt-1 block break-words text-foreground ${stat.isFallback ? "text-[13px] font-medium leading-4" : "text-sm font-medium"}`}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

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
