"use client";

import { useEffect, useState } from "react";
import type { CategorySummary, ContentArticle } from "@nb/content";

import { ArticleCard } from "@/components/content/article-card";

type BjcpBrowserProps = {
  articles: ContentArticle[];
  categories: CategorySummary[];
};

export function BjcpBrowser({ articles, categories }: BjcpBrowserProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");

  useEffect(() => {
    const hash = window.location.hash.replace("#category-", "");
    if (hash && categories.some((category) => category.id === hash)) {
      setSelectedCategoryId(hash);
      return;
    }

    if (!selectedCategoryId && categories[0]) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? categories[0] ?? null;
  const selectedArticles = selectedCategory
    ? articles.filter((article) => article.category.id === selectedCategory.id)
    : [];

  const selectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    window.history.replaceState(null, "", `#category-${categoryId}`);
  };

  if (!selectedCategory) {
    return null;
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Категории</p>
        <h2 className="mt-2 text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
          Выберите категорию и сразу смотрите стили внутри
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {categories.map((category) => {
          const isActive = category.id === selectedCategory.id;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => selectCategory(category.id)}
              className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                isActive
                  ? "border-zinc-950 bg-zinc-950 text-white shadow-[0_20px_40px_-24px_rgba(15,23,42,0.6)]"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] opacity-70">
                {category.id}
              </span>
              <span className="mt-1 block text-sm font-semibold leading-6">
                {category.nameRu}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={`category-${selectedCategory.id}`}
        className="space-y-6 rounded-[2.25rem] border border-zinc-200 bg-white p-6 shadow-[0_30px_90px_-66px_rgba(15,23,42,0.4)] sm:p-8"
      >
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Категория {selectedCategory.id}
          </p>
          <h3 className="text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
            {selectedCategory.nameRu}
          </h3>
          {selectedCategory.overviewRu ? (
            <p className="max-w-4xl text-[0.98rem] leading-8 text-zinc-600">
              {selectedCategory.overviewRu}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Стили в категории
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedArticles.map((article) => (
              <a
                key={article.slug}
                href={`/bjcp/${article.slug}`}
                className="rounded-full border border-zinc-200 bg-slate-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-950"
              >
                {article.bjcpId} {article.title}
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {selectedArticles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </div>
    </section>
  );
}
