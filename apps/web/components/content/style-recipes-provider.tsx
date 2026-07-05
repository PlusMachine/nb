"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";

export type StyleRecipesStatus = "loading" | "ready" | "empty" | "error";

type StyleRecipesContextValue = {
  status: StyleRecipesStatus;
  items: PublicRecipeListItem[];
  /** Всего опубликованных рецептов в стиле (не ограничено limit). */
  total: number;
};

const StyleRecipesContext = createContext<StyleRecipesContextValue | null>(null);

/** Опциональный контекст рецептов стиля. Потребители (hero-чип, лента якорей, нижний
 *  блок) читают одно состояние; без провайдера-предка вернётся null. */
export const useStyleRecipes = (): StyleRecipesContextValue | null => useContext(StyleRecipesContext);

/** Держим в синхроне с числом карточек, которое показывает нижний блок. */
export const STYLE_RECIPES_LIMIT = 6;

/**
 * Один запрос к `/api/recipes/by-style` на всю страницу стиля. Страница SSG (без БД на
 * билде), поэтому рецепты догружаются на клиенте после гидрации — как {@link BjcpGravityPassportStats}.
 * Раздаёт status/items/total через контекст, чтобы hero-чип, лента якорей и нижний блок
 * не делали по отдельному запросу.
 */
export function StyleRecipesProvider({
  styleCode,
  children
}: {
  styleCode: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<StyleRecipesStatus>("loading");
  const [items, setItems] = useState<PublicRecipeListItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");

    const url = `/api/recipes/by-style?style=${encodeURIComponent(styleCode)}&limit=${STYLE_RECIPES_LIMIT}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`by-style ${response.status}`);
        }
        return response.json() as Promise<{ items: PublicRecipeListItem[]; total: number }>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setTotal(data.total);
        setStatus(data.items.length ? "ready" : "empty");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [styleCode]);

  const value = useMemo<StyleRecipesContextValue>(
    () => ({ status, items, total }),
    [status, items, total]
  );

  return <StyleRecipesContext.Provider value={value}>{children}</StyleRecipesContext.Provider>;
}
