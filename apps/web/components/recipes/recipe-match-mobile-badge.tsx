"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

import type { RecipeMatchDto } from "@/features/recipes/contracts";

import { countStockGaps, labelMeta, percentRingColor } from "./recipe-match-panel";
import { useRecipeMatch } from "./recipe-match-context";

/**
 * Содержимое плашки — то же число и текст, что в шапке полной панели матча
 * (recipe-match-panel.tsx: `RecipeMatchPanelView`), никаких новых формулировок.
 * Экспортирована отдельно от контейнера, чтобы тестироваться без провайдера
 * (по образцу `RecipeMatchPanelView`).
 */
export function RecipeMatchMobileBadgeView({ match }: { match: RecipeMatchDto }) {
  if (match.totalLines === 0) {
    return null;
  }

  const accent = labelMeta[match.label].accent;
  const gapCount = countStockGaps(match.lines);

  return (
    <button
      type="button"
      onClick={() => {
        document.getElementById("match-panel")?.scrollIntoView({ behavior: "smooth" });
      }}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition hover:border-border lg:hidden"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums ring-2 ring-current ${percentRingColor(match.matchPercent)}`}>
        {match.matchPercent}%
      </span>
      <span className={`min-w-0 flex-1 text-sm font-medium ${accent}`}>
        Есть {match.coveredLines} из {match.totalLines}
        {gapCount > 0 ? ` · не хватает ${gapCount}` : ""}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * Мобильная плашка-вердикт: на &lt;lg экранах панель «Совпадение со складом»
 * уходит в самый низ страницы (aside падает под весь рецепт) — плашка после
 * «Ключевых показателей» даёт вердикт без прокрутки и по тапу скроллит к
 * полной панели (`#match-panel`). На десктопе не рендерится (панель и так
 * в первом экране, в sticky aside).
 */
export function RecipeMatchMobileBadge() {
  const ctx = useRecipeMatch();
  const state = ctx?.state;

  if (!state?.authenticated || !state.match) {
    return null;
  }

  return <RecipeMatchMobileBadgeView match={state.match} />;
}
