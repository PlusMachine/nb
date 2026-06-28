"use client";

import React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import { resolveBrewabilityBadge } from "@/features/recipes/brewability-badge";

import { useRecipeMatches } from "./recipe-match-provider";

/**
 * Бейдж «можно сварить» на карточке рецепта. Берёт матч из RecipeMatchProvider
 * (после гидрации); для анонима / пустого склада / слабого совпадения ничего не
 * рендерит. Семантика — в resolveBrewabilityBadge (по типам ингредиентов).
 */
export function RecipeMatchBadge({ recipeId, className }: { recipeId: string; className?: string }) {
  const ctx = useRecipeMatches();
  if (!ctx || !ctx.ready) {
    return null;
  }

  const match = ctx.getMatch(recipeId);
  if (!match) {
    return null;
  }

  const badge = resolveBrewabilityBadge(match);
  if (badge.tier === "hidden") {
    return null;
  }

  const base =
    "pointer-events-none inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1";

  if (badge.tier === "ready") {
    const tone = badge.qtyShort
      ? "bg-lime-50 text-lime-700 ring-lime-200"
      : "bg-emerald-50 text-emerald-700 ring-emerald-200";
    return (
      <span
        className={`${base} ${tone} ${className ?? ""}`}
        title={badge.qtyShort ? "Ингредиенты есть, количества может не хватить" : undefined}
      >
        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
        Можно сварить
      </span>
    );
  }

  return (
    <span className={`${base} bg-amber-50 text-amber-700 ring-amber-200 ${className ?? ""}`}>
      <CircleAlert className="h-3.5 w-3.5" aria-hidden />
      Почти · не хватает {badge.missing}
    </span>
  );
}
