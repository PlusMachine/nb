import Link from "next/link";
import type { ContentArticle } from "@nb/content";

const mediaThemes = [
  "bg-[linear-gradient(140deg,#0f172a_0%,#1e293b_55%,#475569_100%)]",
  "bg-[linear-gradient(140deg,#111827_0%,#1f2937_55%,#334155_100%)]",
  "bg-[linear-gradient(140deg,#082f49_0%,#0f172a_55%,#1d4ed8_100%)]",
  "bg-[linear-gradient(140deg,#0f172a_0%,#1f2937_50%,#0f766e_100%)]"
] as const;

const resolveMediaTheme = (article: ContentArticle) => {
  const seed = article.bjcpId.charCodeAt(0) + article.category.id.charCodeAt(0);
  return mediaThemes[seed % mediaThemes.length];
};

export function ArticleCard({
  article,
  featured = false
}: {
  article: ContentArticle;
  featured?: boolean;
}) {
  const mediaTheme = resolveMediaTheme(article);
  const mediaStyle = article.heroImageUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.16), rgba(15, 23, 42, 0.7)), url(${article.heroImageUrl})`,
        backgroundPosition: "center",
        backgroundSize: "cover"
      }
    : undefined;

  return (
    <Link
      href={`/bjcp/${article.slug}`}
      className="group block overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_32px_90px_-62px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-1 hover:border-border"
      aria-label={`Открыть стиль ${article.bjcpId} ${article.title}`}
    >
      <article>
        <div className={`relative aspect-[16/10] overflow-hidden border-b border-border ${article.heroImageUrl ? "" : mediaTheme}`} style={mediaStyle}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_38%)]" />
          <div className="relative flex h-full flex-col justify-between p-6 text-white">
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
              <span>BJCP {article.bjcpId}</span>
              <span>{article.category.id}</span>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/65">{article.category.nameRu}</p>
              <h2
                className={`max-w-[18rem] text-balance font-semibold leading-[1.02] text-white ${featured ? "text-3xl sm:text-4xl" : "text-2xl"}`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {article.title}
              </h2>
              <p className="max-w-md text-sm leading-6 text-white/72">{article.titleEn}</p>
            </div>
          </div>
        </div>

        <div className="flex h-full flex-col p-6">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span>Справочник BJCP</span>
            <span>{article.readingMinutes} мин чтения</span>
          </div>

          <p className="mt-4 text-pretty text-[0.98rem] leading-7 text-muted-foreground">{article.description}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {article.stats.slice(0, 4).map((stat) => (
              <span
                key={stat.label}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground"
              >
                <span className="text-muted-foreground">{stat.label}</span>
                <span>{stat.value}</span>
              </span>
            ))}
          </div>

          <div className="mt-auto pt-8">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              Открыть стиль
              <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
