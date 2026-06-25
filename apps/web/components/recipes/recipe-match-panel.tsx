"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { loadRecipeMatch, type RecipeMatchViewerState } from "@/app/(public)/recipes/[slug]/match-actions";
import type { RecipeMatchDto, RecipeMatchLineStatus, RecipeMatchLabel } from "@/features/recipes/contracts";

const statusMeta: Record<RecipeMatchLineStatus, { label: string; pill: string }> = {
  covered: { label: "Есть", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  substitute: { label: "Аналог", pill: "bg-sky-50 text-sky-700 ring-sky-200" },
  partial: { label: "Частично", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  missing: { label: "Нет", pill: "bg-rose-50 text-rose-700 ring-rose-200" }
};

const labelMeta: Record<RecipeMatchLabel, { text: string; accent: string }> = {
  ready: { text: "Можно сварить из вашего склада", accent: "text-emerald-700" },
  almost: { text: "Почти всё есть на складе", accent: "text-emerald-700" },
  partial: { text: "Часть ингредиентов уже есть", accent: "text-amber-700" },
  none: { text: "Подходящих ингредиентов на складе нет", accent: "text-zinc-500" }
};

const percentRingColor = (matchPercent: number) => {
  if (matchPercent >= 100) return "text-emerald-600";
  if (matchPercent >= 70) return "text-lime-600";
  if (matchPercent >= 1) return "text-amber-600";
  return "text-zinc-400";
};

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function RecipeMatchPanelView({ match }: { match: RecipeMatchDto }) {
  if (match.totalLines === 0) {
    return null;
  }

  const label = labelMeta[match.label];

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-50 text-lg font-semibold tabular-nums ring-2 ring-current ${percentRingColor(match.matchPercent)}`}>
          {match.matchPercent}%
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900">Совпадение со складом</h2>
          <p className={`text-sm font-medium ${label.accent}`}>{label.text}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Есть {match.coveredLines} из {match.totalLines}
            {match.missingCount > 0 ? ` · не хватает ${match.missingCount}` : ""}
            {match.scaledToInventory ? ` · расчёт под ${numberFormatter.format(match.targetBatchVolumeL)} л` : ""}
          </p>
        </div>
      </div>

      <ul className="space-y-1">
        {match.lines.map((line) => {
          const meta = statusMeta[line.status];
          return (
            <li key={line.recipeIngredientId} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-zinc-700">{line.ingredientDisplayName ?? "—"}</span>
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${meta.pill}`}>
                {meta.label}
                {line.status === "partial" ? ` ${line.coveragePercent}%` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Панель «Совпадение со складом» на публичной странице рецепта. Персональный
 * матчинг тянется ПОСЛЕ гидрации через server action, чтобы документ оставался
 * кэшируемым для анонимов (тот же приём, что и форма оценки).
 */
export function RecipeMatchPanel({ recipeId }: { recipeId: string }) {
  const [state, setState] = useState<RecipeMatchViewerState | null>(null);

  useEffect(() => {
    let active = true;
    loadRecipeMatch(recipeId)
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch(() => {
        if (active) {
          setState({ authenticated: false, match: null });
        }
      });
    return () => {
      active = false;
    };
  }, [recipeId]);

  if (!state) {
    return null;
  }

  if (!state.authenticated) {
    return (
      <section className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-600 shadow-sm">
        <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-2">
          Войдите
        </Link>
        , чтобы увидеть, сколько ингредиентов для этого рецепта есть на вашем складе.
      </section>
    );
  }

  if (!state.match) {
    return null;
  }

  return <RecipeMatchPanelView match={state.match} />;
}
