"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { Button, Textarea } from "@nb/ui";

import {
  deleteRecipeRatingAction,
  loadRecipeRatingViewerState,
  rateRecipeAction,
  type RecipeRatingViewerState
} from "@/app/(public)/recipes/[slug]/actions";

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Презентационная часть формы оценки (Phase D, §3.4) — отрисовывает ветку по
 * уже загруженному `viewerState`. Вынесена отдельно ради синхронной тестируемости
 * (renderToStaticMarkup, без эффектов/DOM). Все доменные проверки — на сервере.
 */
export function RecipeRatingFormView({
  recipeId,
  slug,
  viewerState
}: {
  recipeId: string;
  slug: string;
  viewerState: RecipeRatingViewerState;
}) {
  const initialRating = viewerState.rating;
  const [stars, setStars] = useState<number>(initialRating?.stars ?? 0);
  const [hovered, setHovered] = useState<number>(0);
  const [body, setBody] = useState<string>(initialRating?.body ?? "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!viewerState.authenticated) {
    return (
      <p className="text-sm text-zinc-600">
        <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-2">
          Войдите
        </Link>
        , чтобы оценить рецепт.
      </p>
    );
  }

  if (!viewerState.canRate) {
    return <p className="text-sm text-zinc-500">Нельзя оценивать собственный рецепт.</p>;
  }

  const submit = () => {
    if (stars < 1 || stars > 5) {
      setMessage({ kind: "error", text: "Выберите оценку от 1 до 5 звёзд." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await rateRecipeAction({ recipeId, slug, stars, body: body.trim() || null });
      if (result.ok) {
        setMessage({ kind: "ok", text: "Оценка сохранена." });
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  };

  const remove = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteRecipeRatingAction({ recipeId, slug });
      if (result.ok) {
        setStars(0);
        setBody("");
        setMessage({ kind: "ok", text: "Оценка удалена." });
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  };

  const activeStars = hovered || stars;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
        {STAR_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Оценить на ${value} из 5`}
            aria-pressed={stars === value}
            disabled={isPending}
            onMouseEnter={() => setHovered(value)}
            onFocus={() => setHovered(value)}
            onBlur={() => setHovered(0)}
            onClick={() => setStars(value)}
            className="rounded-md p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50"
          >
            <Star
              className={
                value <= activeStars
                  ? "h-7 w-7 fill-amber-500 text-amber-500"
                  : "h-7 w-7 text-zinc-300"
              }
              aria-hidden
            />
          </button>
        ))}
      </div>

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={isPending}
        maxLength={2000}
        rows={3}
        placeholder="Комментарий к оценке (необязательно)"
        aria-label="Комментарий к оценке"
      />

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={isPending || stars < 1}>
          {initialRating ? "Обновить оценку" : "Оценить"}
        </Button>
        {initialRating ? (
          <Button type="button" variant="ghost" onClick={remove} disabled={isPending}>
            Убрать оценку
          </Button>
        ) : null}
      </div>

      {message ? (
        <p className={message.kind === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Звёздный инпут оценки рецепта. Персональное состояние (залогинен / свой рецепт /
 * текущая оценка) тянется ПОСЛЕ гидрации через server action, чтобы документ
 * `/recipes/[slug]` не читал cookie и оставался кэшируемым (ISR/static) для анонимов.
 */
export function RecipeRatingForm({ recipeId, slug }: { recipeId: string; slug: string }) {
  const [viewerState, setViewerState] = useState<RecipeRatingViewerState | null>(null);

  useEffect(() => {
    let active = true;
    loadRecipeRatingViewerState(recipeId)
      .then((state) => {
        if (active) {
          setViewerState(state);
        }
      })
      .catch(() => {
        if (active) {
          setViewerState({ authenticated: false, canRate: false, rating: null });
        }
      });
    return () => {
      active = false;
    };
  }, [recipeId]);

  if (!viewerState) {
    return <p className="text-sm text-zinc-400">Загрузка…</p>;
  }

  return <RecipeRatingFormView recipeId={recipeId} slug={slug} viewerState={viewerState} />;
}
