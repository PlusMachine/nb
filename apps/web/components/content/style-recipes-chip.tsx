"use client";

import React from "react";
import Link from "next/link";

import { useStyleRecipes } from "./style-recipes-provider";

/**
 * Чип в hero-колонке, перед паспортной сеткой — сигнал о наличии рецептов на первом экране.
 * ready → якорь к блоку «Рецепты в стиле»; empty → создать первый рецепт в этом стиле;
 * loading → плейсхолдер-слот (резервирует высоту, чтобы hero не прыгал после fetch);
 * error → скрыт (узел не рендерится вовсе, hero схлопывается к обычному space-y).
 */
export function StyleRecipesHeroChip({ styleCode }: { styleCode: string }) {
  const data = useStyleRecipes();
  if (!data || data.status === "error") {
    return null;
  }

  if (data.status === "loading") {
    // Резерв высоты чипа: без него hero подпрыгивает, когда чип появляется после fetch.
    return <div className="min-h-[2.625rem]" />;
  }

  if (data.status === "ready") {
    return (
      <Link
        href="#style-recipes"
        className="inline-flex min-h-[2.625rem] max-w-full flex-wrap items-center gap-2 rounded-3xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-border"
      >
        Посмотреть рецепты в этом стиле
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground ring-1 ring-border">
          {data.total}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">↓</span>
      </Link>
    );
  }

  return (
    <Link
      href={`/app/recipes/new?style=${encodeURIComponent(styleCode)}`}
      className="inline-flex min-h-[2.625rem] max-w-full flex-wrap items-center gap-2 rounded-3xl border border-dashed border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:border-border"
    >
      Создать первый рецепт
      <span aria-hidden="true" className="text-muted-foreground">→</span>
    </Link>
  );
}

/**
 * Пункт «Рецепты (N)» в ленте якорей лонгрида. Скрыт при ошибке (блок рецептов тогда
 * не рендерится, якорю некуда вести); при загрузке — без числа.
 */
export function StyleRecipesTocEntry() {
  const data = useStyleRecipes();
  if (!data || data.status === "error") {
    return null;
  }

  const label = data.status === "ready" ? `Рецепты (${data.total})` : "Рецепты";

  return (
    <a
      href="#style-recipes"
      className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-border hover:text-foreground"
    >
      {label}
    </a>
  );
}
