"use client";

import React from "react";
import Link from "next/link";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { RecipesGrid } from "@/components/recipes/recipes-grid";
import { RecipesGridSkeleton } from "@/components/recipes/recipes-grid-skeleton";

/**
 * Блок «Что варят в стиле» на странице BJCP-стиля (`/bjcp/[slug]`) — заменяет
 * прежний блок «Другие стили из категории» живым UGC: публичными рецептами
 * сообщества в этом стиле, отсортированными по популярности.
 *
 * Дата-остров: страница стиля остаётся статической (SSG, без БД на билде), а
 * рецепты подгружаются в рантайме через `/api/recipes/by-style`. Пока грузится —
 * скелетон; пусто → приглашение собрать первый рецепт; есть → сетка карточек +
 * ссылка на витрину `/recipes` с уже применённым фильтром стиля.
 */

const RECIPE_LIMIT = 6;

type Status = "loading" | "ready" | "empty" | "error";

export function StyleCommunityRecipes({
  styleTitle,
  styleCode
}: {
  styleTitle: string;
  styleCode: string;
}) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [recipes, setRecipes] = React.useState<PublicRecipeListItem[]>([]);
  const [total, setTotal] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    const url = `/api/recipes/by-style?style=${encodeURIComponent(styleCode)}&limit=${RECIPE_LIMIT}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`by-style ${response.status}`);
        }
        return response.json() as Promise<{ items: PublicRecipeListItem[]; total: number }>;
      })
      .then((data) => {
        if (cancelled) return;
        setRecipes(data.items);
        setTotal(data.total);
        setStatus(data.items.length ? "ready" : "empty");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [styleCode]);

  // Ошибку не выдаём за «пусто» (это ввело бы в заблуждение) — просто прячем блок.
  if (status === "error") {
    return null;
  }

  const allHref = `/recipes?style=${encodeURIComponent(styleCode)}&sort=popular`;
  const hasMore = total > recipes.length;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Рецепты сообщества
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
            Что варят в стиле «{styleTitle}»
          </h2>
        </div>
        {status === "ready" ? (
          <Link href={allHref} className="shrink-0 text-sm font-semibold text-zinc-950 hover:text-zinc-700">
            {hasMore ? `Все рецепты (${total})` : "Открыть в поиске"} →
          </Link>
        ) : null}
      </div>

      {status === "loading" ? <RecipesGridSkeleton count={RECIPE_LIMIT} view="grid" /> : null}

      {status === "ready" ? <RecipesGrid recipes={recipes} view="grid" /> : null}

      {status === "empty" ? (
        <div className="flex flex-col items-start gap-4 rounded-[2rem] border border-dashed border-zinc-300 bg-white p-8 shadow-[0_26px_80px_-62px_rgba(15,23,42,0.4)]">
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
              В этом стиле пока нет рецептов сообщества
            </h3>
            <p className="max-w-xl text-pretty text-sm leading-7 text-zinc-600">
              Соберите первый рецепт «{styleTitle}» — он появится здесь и поможет другим пивоварам сварить этот стиль.
            </p>
          </div>
          <Link
            href="/app/recipes/new"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Создать рецепт →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
