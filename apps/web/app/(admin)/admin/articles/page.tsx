import Link from "next/link";
import { listArticleCategories, listFeaturedArticles } from "@nb/content";

import { requireContentRole } from "@/features/content/permissions";

export default async function AdminArticlesPage() {
  const [user, articles, categories] = await Promise.all([
    requireContentRole("editor"),
    listFeaturedArticles(),
    listArticleCategories()
  ]);

  return (
    <section className="space-y-5">
      <header className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Content studio</p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-950">BJCP и будущие статьи</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          Доступ к content studio теперь связан с текущими ролями. `editor` работает с черновиками, `moderator`
          публикует и выбирает материалы для главной, `admin` управляет всем контентным слоем.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Текущая роль</p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">{user.role}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">BJCP категории</p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">{categories.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">На главной</p>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              {user.capabilities.canFeatureOnHome ? "Можно выбирать featured-материалы." : "Выбор featured доступен moderator/admin."}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/articles/new"
            className="inline-flex items-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            Открыть Tiptap editor
          </Link>
          <Link
            href="/bjcp"
            className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700"
          >
            Посмотреть BJCP
          </Link>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {articles.map((article) => (
          <article key={article.slug} className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{article.eyebrow}</p>
            <h2 className="mt-4 text-2xl font-semibold text-zinc-950">{article.title}</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-600">{article.description}</p>
            <div className="mt-5 flex items-center gap-4">
              <Link href={`/bjcp/${article.slug}`} className="text-sm font-semibold text-zinc-950">
                Preview
              </Link>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
