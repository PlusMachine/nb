import Link from "next/link";
import type { BjcpCatalogStyle } from "@nb/content";

import { getStyleFermentationLabel } from "@/features/content/bjcp-catalog";

type Props = {
  style: BjcpCatalogStyle;
};

export function BjcpStyleCard({ style }: Props) {
  const mediaStyle = {
    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.14), rgba(15, 23, 42, 0.62)), url(${style.heroImageUrl})`,
    backgroundPosition: "center",
    backgroundSize: "cover"
  };
  const clampStyle = {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden"
  };
  const statValue = (label: string) => style.stats.find((item: BjcpCatalogStyle["stats"][number]) => item.label === label)?.value ?? "n/a";

  return (
    <Link
      href={`/bjcp/${style.slug}`}
      className="group block overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-[0_22px_70px_-62px_rgba(15,23,42,0.4)] transition duration-300 hover:-translate-y-0.5 hover:border-zinc-300"
      aria-label={`Открыть стиль ${style.bjcpId} ${style.title}`}
    >
      <article className="flex h-full flex-col">
        <div className="relative aspect-[16/9] overflow-hidden border-b border-zinc-200" style={mediaStyle}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_36%)]" />
          <div className="relative flex h-full flex-col justify-between p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-zinc-950/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                BJCP {style.bjcpId}
              </span>
              <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88">
                {style.categoryId}
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
            <p className="text-sm text-zinc-500">{style.categoryNameRu}</p>
            <p className="text-sm leading-6 text-zinc-600" style={clampStyle}>{style.description}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {[
              ["ABV", statValue("ABV")],
              ["IBU", statValue("IBU")],
              ["SRM", statValue("SRM")],
              ["Брожение", getStyleFermentationLabel(style)]
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-zinc-200 bg-slate-50 px-3 py-2.5 text-zinc-700"
              >
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</span>
                <span className="mt-1 block text-sm font-medium text-zinc-950">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {style.badgesRu.slice(0, 3).map((badge: string) => (
              <span
                key={badge}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600"
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
