import Link from "next/link";
import { Plus } from "lucide-react";

import { requireContentRole } from "@/features/content/permissions";
import { listAdminContentArticles } from "@/features/content-articles/service";
import {
  contentArticleStatusBadgeClass,
  contentArticleStatusLabels,
  contentArticleTypeLabels
} from "@/features/content-articles/contracts";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminArticlesPage() {
  const [, articles] = await Promise.all([
    requireContentRole("editor"),
    listAdminContentArticles()
  ]);

  return (
    <section className="space-y-5">
      <header className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Студия контента</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Статьи и обзоры</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Редакторские гайды и обзоры оборудования. `editor` ведёт черновики, `moderator` публикует и выводит на
          главную, `admin` управляет всем. BJCP-стили остаются в отдельном file-backed разделе.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/articles/new" className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background">
            <Plus className="h-4 w-4" aria-hidden /> Новая статья
          </Link>
          <Link href="/bjcp" className="inline-flex items-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground">
            BJCP-стили
          </Link>
        </div>
      </header>

      {articles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Пока нет статей. Создайте первый гайд или обзор.
        </p>
      ) : (
        <ul className="space-y-2">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/admin/articles/${article.id}/edit`}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-border/70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-foreground">{article.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {contentArticleTypeLabels[article.type]} · {article.authorName ?? "—"} · обновлено {dateFmt.format(new Date(article.updatedAt))}
                  </span>
                </span>
                {article.isFeatured ? (
                  <span className="shrink-0 rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-subtle-foreground">На главной</span>
                ) : null}
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${contentArticleStatusBadgeClass[article.status]}`}>
                  {contentArticleStatusLabels[article.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
