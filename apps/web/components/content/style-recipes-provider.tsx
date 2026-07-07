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

export type StyleRecipesInitialData = { items: PublicRecipeListItem[]; total: number } | null;

/**
 * Данные рецептов стиля — сперва серверные (см. `app/(public)/bjcp/[slug]/page.tsx`,
 * `listPublicRecipesForStyle`), затем догрузка на клиенте только если сервер их не
 * отдал (пустой `initial` — БД была недоступна на билде либо в стиле правда нет
 * рецептов). Раздаёт status/items/total через контекст, чтобы hero-чип, лента
 * якорей и нижний блок не делали по отдельному запросу.
 */
export function StyleRecipesProvider({
  styleCode,
  initial = null,
  children
}: {
  styleCode: string;
  /** Серверный snapshot рецептов стиля (SSR/SSG). Непустой → карточки сразу в HTML. */
  initial?: StyleRecipesInitialData;
  children: React.ReactNode;
}) {
  const hasInitial = Boolean(initial && initial.items.length > 0);
  const [status, setStatus] = useState<StyleRecipesStatus>(hasInitial ? "ready" : "loading");
  const [items, setItems] = useState<PublicRecipeListItem[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);

  useEffect(() => {
    if (hasInitial) {
      // Сервер уже отдал непустой список рецептов в HTML — свежесть страницы
      // обеспечивает revalidate на уровне маршрута, повторный клиентский fetch
      // тут не нужен (и не должен перезатирать серверные карточки миганием).
      return;
    }

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
  }, [hasInitial, styleCode]);

  const value = useMemo<StyleRecipesContextValue>(
    () => ({ status, items, total }),
    [status, items, total]
  );

  return <StyleRecipesContext.Provider value={value}>{children}</StyleRecipesContext.Provider>;
}
