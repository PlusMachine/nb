"use client";

import React from "react";

import { resolveBrewabilityBadge } from "@/features/recipes/brewability-badge";

import { BrewabilityBadgePill } from "./brewability-badge-pill";
import { useRecipeMatches } from "./recipe-match-provider";

/**
 * Бейдж готовности рецепта по складу пользователя. Берёт матч из RecipeMatchProvider
 * (после гидрации); для анонима / пустого склада / слабого совпадения ничего не
 * рендерит. Семантика — в resolveBrewabilityBadge, вид — в BrewabilityBadgePill
 * (общий с карточкой «рецепт под ваш склад»).
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

  return <BrewabilityBadgePill badge={resolveBrewabilityBadge(match)} className={className} />;
}
