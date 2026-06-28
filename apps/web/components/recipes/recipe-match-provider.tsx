"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { loadRecipeMatchStates } from "@/app/(public)/recipes/match-list-actions";
import type { RecipeMatchDto } from "@/features/recipes/contracts";

type RecipeMatchContextValue = {
  /** Загрузился ли матч (до этого бейджи нейтральны/скрыты). */
  ready: boolean;
  getMatch: (recipeId: string) => RecipeMatchDto | null;
};

const RecipeMatchContext = createContext<RecipeMatchContextValue | null>(null);

/** Опциональный контекст матча. Если провайдера нет (например детальная
 *  страница), бейдж просто ничего не рендерит. */
export const useRecipeMatches = (): RecipeMatchContextValue | null => useContext(RecipeMatchContext);

/**
 * Грузит матч склад↔рецепт для видимых карточек ОДНИМ батч-вызовом после
 * гидрации (не де-кэшируя серверный документ витрины) и раздаёт через контекст.
 */
export function RecipeMatchProvider({
  recipeIds,
  children
}: {
  recipeIds: string[];
  children: React.ReactNode;
}) {
  const idsKey = recipeIds.join(",");
  const [matches, setMatches] = useState<Record<string, RecipeMatchDto>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) {
      setMatches({});
      setReady(true);
      return undefined;
    }

    loadRecipeMatchStates(ids)
      .then((result) => {
        if (active) {
          setMatches(result);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [idsKey]);

  const value = useMemo<RecipeMatchContextValue>(
    () => ({
      ready,
      getMatch: (recipeId) => matches[recipeId] ?? null
    }),
    [ready, matches]
  );

  return <RecipeMatchContext.Provider value={value}>{children}</RecipeMatchContext.Provider>;
}
