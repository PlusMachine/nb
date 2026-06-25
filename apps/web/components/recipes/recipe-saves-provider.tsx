"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { loadRecipeSaveStates } from "@/app/(public)/recipes/save-actions";

type RecipeSavesContextValue = {
  /** Загрузилось ли начальное состояние (до этого флажки нейтральны). */
  ready: boolean;
  isSaved: (recipeId: string) => boolean;
  setSaved: (recipeId: string, saved: boolean) => void;
};

const RecipeSavesContext = createContext<RecipeSavesContextValue | null>(null);

/** Опциональный контекст сохранений. На детальной странице провайдера нет —
 *  кнопка тогда сама грузит своё состояние. */
export const useRecipeSaves = (): RecipeSavesContextValue | null => useContext(RecipeSavesContext);

/**
 * Грузит начальное состояние флажков для видимых карточек ОДНИМ батч-вызовом
 * после гидрации (не де-кэшируя серверный документ витрины) и раздаёт его через
 * контекст. Оптимистичные апдейты кнопок живут здесь же.
 */
export function RecipeSavesProvider({
  recipeIds,
  children
}: {
  recipeIds: string[];
  children: React.ReactNode;
}) {
  const idsKey = recipeIds.join(",");
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const ids = idsKey ? idsKey.split(",") : [];
    loadRecipeSaveStates(ids)
      .then((saved) => {
        if (active) {
          setSavedIds(new Set(saved));
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

  const value = useMemo<RecipeSavesContextValue>(
    () => ({
      ready,
      isSaved: (recipeId) => savedIds.has(recipeId),
      setSaved: (recipeId, saved) =>
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (saved) {
            next.add(recipeId);
          } else {
            next.delete(recipeId);
          }
          return next;
        })
    }),
    [ready, savedIds]
  );

  return <RecipeSavesContext.Provider value={value}>{children}</RecipeSavesContext.Provider>;
}
