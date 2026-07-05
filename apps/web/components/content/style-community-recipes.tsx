"use client";

import React from "react";
import Link from "next/link";

import { RecipesGrid } from "@/components/recipes/recipes-grid";
import { RecipesGridSkeleton } from "@/components/recipes/recipes-grid-skeleton";

import { STYLE_RECIPES_LIMIT, useStyleRecipes } from "./style-recipes-provider";

/**
 * Блок «Рецепты в стиле» на странице BJCP-стиля (`/bjcp/[slug]`) — живой UGC:
 * публичные рецепты сообщества в этом стиле, отсортированные по популярности.
 *
 * Данные берёт из общего {@link StyleRecipesProvider} (один запрос к
 * `/api/recipes/by-style` на всю страницу — его же читают hero-чип и лента якорей).
 * Пока грузится — скелетон; пусто → приглашение создать первый рецепт; есть → сетка
 * карточек + ссылка на витрину `/recipes` с уже применённым фильтром стиля.
 *
 * `id="style-recipes"` — цель якоря из hero-чипа и ленты якорей лонгрида.
 */
export function StyleCommunityRecipes({
  styleTitle,
  styleCode
}: {
  styleTitle: string;
  styleCode: string;
}) {
  const data = useStyleRecipes();

  // Провайдер всегда есть на странице стиля. Ошибку не выдаём за «пусто» (это ввело бы
  // в заблуждение) — просто прячем блок.
  if (!data || data.status === "error") {
    return null;
  }

  const { status, items } = data;
  const allHref = `/recipes?style=${encodeURIComponent(styleCode)}&sort=popular`;
  const createHref = `/app/recipes/new?style=${encodeURIComponent(styleCode)}`;

  return (
    <section id="style-recipes" className="scroll-mt-24 space-y-5">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Сообщество
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
            Рецепты в стиле «{styleTitle}»
          </h2>
        </div>
        {status === "ready" ? (
          <Link href={allHref} className="sm:shrink-0 text-sm font-semibold text-zinc-950 hover:text-zinc-700">
            Все рецепты стиля <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>

      {status === "loading" ? <RecipesGridSkeleton count={STYLE_RECIPES_LIMIT} view="grid" /> : null}

      {status === "ready" ? <RecipesGrid recipes={items} view="grid" /> : null}

      {status === "empty" ? (
        <div className="flex flex-col items-start gap-4 rounded-[2rem] border border-dashed border-zinc-300 bg-white p-8 shadow-[0_26px_80px_-62px_rgba(15,23,42,0.4)]">
          <h3 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
            В этом стиле пока нет рецептов сообщества
          </h3>
          <Link
            href={createHref}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Создать рецепт <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </section>
  );
}
