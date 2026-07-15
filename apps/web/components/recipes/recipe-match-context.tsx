"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { loadRecipeMatch, type RecipeMatchViewerState } from "@/app/(public)/recipes/[slug]/match-actions";

type RecipeMatchContextValue = {
  state: RecipeMatchViewerState | null;
  reload: () => Promise<void>;
};

const RecipeMatchContext = createContext<RecipeMatchContextValue | null>(null);

/**
 * Опциональный контекст персонального матчинга «склад ↔ рецепт». На публичной
 * странице рецепта провайдер есть (см. {@link RecipeMatchProvider} в
 * public-recipe-page.tsx) — панель матча, мобильная плашка-вердикт и кнопка
 * «В закладки» читают одно и то же состояние. На карточках витрины провайдера
 * нет — там useRecipeMatch() вернёт null, и потребитель ведёт себя как раньше.
 */
export const useRecipeMatch = (): RecipeMatchContextValue | null => useContext(RecipeMatchContext);

/**
 * Грузит персональный матч ОДИН раз через server action `loadRecipeMatch`
 * (после гидрации — документ рецепта остаётся кэшируемым для анонимов) и
 * раздаёт результат всем потребителям на странице. `reload` — после «На склад»
 * (computeRecipeMatch читает склад на лету, повторный вызов action достаточен).
 */
export function RecipeMatchProvider({
  recipeId,
  children
}: {
  recipeId: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<RecipeMatchViewerState | null>(null);

  // Разовая ошибка перезапроса не должна выкидывать залогиненного в аноним или
  // схлопывать панель: сохраняем прежнее состояние / прежний матч.
  const reload = useCallback(async () => {
    try {
      const next = await loadRecipeMatch(recipeId);
      setState((prev) => (!next.match && prev?.match ? prev : next));
    } catch {
      setState((prev) => prev ?? { authenticated: false, match: null });
    }
  }, [recipeId]);

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

  const value = useMemo<RecipeMatchContextValue>(() => ({ state, reload }), [state, reload]);

  return <RecipeMatchContext.Provider value={value}>{children}</RecipeMatchContext.Provider>;
}
