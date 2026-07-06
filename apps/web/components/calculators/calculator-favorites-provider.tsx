"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { loadFavoriteCalculatorStates } from "@/app/(public)/calculators/favorite-actions";

type CalculatorFavoritesContextValue = {
  /** Загрузилось ли начальное состояние (до этого звёзды нейтральны). */
  ready: boolean;
  isFavorite: (slug: string) => boolean;
  setFavorite: (slug: string, favorite: boolean) => void;
};

const CalculatorFavoritesContext = createContext<CalculatorFavoritesContextValue | null>(null);

/** Опциональный контекст избранного. Без провайдера звезда сама грузит своё состояние. */
export const useCalculatorFavorites = (): CalculatorFavoritesContextValue | null =>
  useContext(CalculatorFavoritesContext);

/**
 * Грузит начальное состояние звёзд для видимых калькуляторов ОДНИМ батч-вызовом
 * после гидрации (не де-кэшируя статический документ /calculators) и раздаёт его
 * через контекст. Оптимистичные апдейты звёзд живут здесь же.
 */
export function CalculatorFavoritesProvider({
  slugs,
  initialFavoriteSlugs,
  children
}: {
  slugs: string[];
  /** Уже известное на сервере избранное — чтобы звёзды не мигали пустыми до гидрации
   *  (дашборд знает свой список избранного заранее). */
  initialFavoriteSlugs?: string[];
  children: React.ReactNode;
}) {
  const slugsKey = slugs.join(",");
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(() => new Set(initialFavoriteSlugs ?? []));
  const [ready, setReady] = useState(Boolean(initialFavoriteSlugs));

  useEffect(() => {
    let active = true;
    const ids = slugsKey ? slugsKey.split(",") : [];
    loadFavoriteCalculatorStates(ids)
      .then((favorites) => {
        if (active) {
          setFavoriteSlugs(new Set(favorites));
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
  }, [slugsKey]);

  const value = useMemo<CalculatorFavoritesContextValue>(
    () => ({
      ready,
      isFavorite: (slug) => favoriteSlugs.has(slug),
      setFavorite: (slug, favorite) =>
        setFavoriteSlugs((prev) => {
          const next = new Set(prev);
          if (favorite) {
            next.add(slug);
          } else {
            next.delete(slug);
          }
          return next;
        })
    }),
    [ready, favoriteSlugs]
  );

  return <CalculatorFavoritesContext.Provider value={value}>{children}</CalculatorFavoritesContext.Provider>;
}
