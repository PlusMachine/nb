"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Star } from "lucide-react";

import {
  loadFavoriteCalculatorState,
  toggleFavoriteCalculatorAction
} from "@/app/(public)/calculators/favorite-actions";
import { redirectToLoginWithNext } from "@/lib/auth-links";

import { useCalculatorFavorites } from "./calculator-favorites-provider";

type Props = {
  slug: string;
  className?: string;
  size?: "sm" | "md";
  /** Гасит клик/переход у кликабельного родителя (когда звезда лежит поверх карточки-ссылки). */
  suppressParentInteraction?: boolean;
};

/**
 * Звезда «в избранное» для калькулятора. По образцу {@link IngredientFavoriteToggle}:
 * optimistic-toggle через useTransition с откатом при ошибке. Состояние берётся из
 * контекста {@link useCalculatorFavorites} (индекс) либо, без провайдера, грузится
 * самостоятельно после гидрации (детальная страница). Неавторизованного уводим на
 * логин, сохраняя адрес возврата.
 */
export function CalculatorFavoriteToggle({
  slug,
  className = "",
  size = "sm",
  suppressParentInteraction = false
}: Props) {
  const favorites = useCalculatorFavorites();
  const [standaloneFavorite, setStandaloneFavorite] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Без провайдера (детальная страница) тянем своё состояние после гидрации.
  useEffect(() => {
    if (favorites) {
      return;
    }
    let active = true;
    loadFavoriteCalculatorState(slug)
      .then((state) => {
        if (active) {
          setStandaloneFavorite(state.favorite);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [favorites, slug]);

  const isFavorite = favorites ? favorites.isFavorite(slug) : standaloneFavorite;

  const applyOptimistic = (next: boolean) => {
    if (favorites) {
      favorites.setFavorite(slug, next);
    } else {
      setStandaloneFavorite(next);
    }
  };

  const iconClassName = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const buttonClassName = size === "md" ? "rounded-full p-2" : "rounded-full p-1.5";

  return (
    <button
      type="button"
      aria-label={isFavorite ? "Убрать из избранного" : "В избранное"}
      aria-pressed={isFavorite}
      disabled={isPending}
      onPointerDown={(event) => {
        if (!suppressParentInteraction) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        if (suppressParentInteraction) {
          event.preventDefault();
          event.stopPropagation();
        }

        startTransition(async () => {
          const next = !isFavorite;
          applyOptimistic(next);

          const result = await toggleFavoriteCalculatorAction({ slug, next });

          if (!result.ok) {
            applyOptimistic(!next);
            if (result.code === "AUTH") {
              redirectToLoginWithNext();
            }
            return;
          }

          applyOptimistic(result.favorite);
        });
      }}
      className={`${buttonClassName} bg-card/85 text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:text-amber-500 disabled:opacity-60 ${
        isFavorite ? "text-amber-500" : ""
      } ${className}`.trim()}
    >
      <Star className={iconClassName} fill={isFavorite ? "currentColor" : "none"} strokeWidth={1.9} />
    </button>
  );
}
