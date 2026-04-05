"use client";

import { useEffect, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toggleIngredientFavoriteAction } from "@/app/(app)/app/ingredients/metadata-actions";
import type { UserIngredientReference } from "@/features/ingredients/contracts";

type Props = {
  reference: UserIngredientReference;
  initialFavorite?: boolean;
  className?: string;
  label?: string;
  size?: "sm" | "md";
  suppressParentInteraction?: boolean;
  onFavoriteChange?: (isFavorite: boolean) => void;
};

export function IngredientFavoriteToggle({
  reference,
  initialFavorite = false,
  className = "",
  label = "Переключить избранное",
  size = "sm",
  suppressParentInteraction = false,
  onFavoriteChange
}: Props) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsFavorite(initialFavorite);
  }, [initialFavorite]);

  const iconClassName = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const buttonClassName = size === "md"
    ? "rounded-full p-2"
    : "rounded-full p-1.5";

  return (
    <button
      type="button"
      aria-label={label}
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
          const nextFavorite = !isFavorite;
          setIsFavorite(nextFavorite);

          const result = await toggleIngredientFavoriteAction({
            reference,
            next: nextFavorite
          });

          if (!result.ok) {
            setIsFavorite(!nextFavorite);
            return;
          }

          setIsFavorite(result.isFavorite);
          onFavoriteChange?.(result.isFavorite);
        });
      }}
      className={`${buttonClassName} text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-amber-500 disabled:opacity-60 ${className}`.trim()}
    >
      <Star
        className={iconClassName}
        fill={isFavorite ? "currentColor" : "none"}
        strokeWidth={1.9}
      />
    </button>
  );
}
