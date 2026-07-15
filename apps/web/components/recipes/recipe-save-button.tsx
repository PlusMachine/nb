"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@nb/ui";

import { loadRecipeSaveViewerState, toggleRecipeSaveAction } from "@/app/(public)/recipes/save-actions";
import { loadRecipeMatch } from "@/app/(public)/recipes/[slug]/match-actions";
import { redirectToLoginWithNext } from "@/lib/auth-links";

import { countStockGaps } from "./recipe-match-panel";
import { useRecipeMatch } from "./recipe-match-context";
import { useRecipeSaves } from "./recipe-saves-provider";

/**
 * П2: после добавления в закладки на детальной странице (`variant="button"`)
 * ведём туда, где реально можно что-то сделать — если в рецепте есть нехватки,
 * это список покупок, а не сама секция закладок.
 *
 * Ф25: «нехватка» здесь — та же семантика, что и в панели матча (missing ИЛИ
 * partial через countStockGaps), а не серверный match.missingCount (только
 * missing) — иначе для рецепта с одними partial-строками панель говорит «не
 * хватает N», а тост «В закладки» вёл бы просто в закладки без ссылки на
 * покупки.
 */
export const resolveSaveToastAction = (gapCount: number | null): { label: string; href: "/app/shopping" | "/app/saved" } =>
  gapCount != null && gapCount > 0
    ? { label: "Чего не хватает", href: "/app/shopping" }
    : { label: "Закладки", href: "/app/saved" };

/**
 * Кнопка «В закладки» рецепта. На витрине (`variant="icon"`) — флажок
 * в углу карточки, состояние берётся из {@link RecipeSavesProvider}. На детальной
 * странице (`variant="button"`) провайдера нет — состояние грузится после гидрации
 * через server action, чтобы документ оставался кэшируемым. userId — только на сервере.
 */
export function RecipeSaveButton({
  recipeId,
  slug,
  variant = "icon"
}: {
  recipeId: string;
  slug?: string;
  variant?: "icon" | "button";
}) {
  const ctx = useRecipeSaves();
  const matchCtx = useRecipeMatch();
  const router = useRouter();
  const { show } = useToast();
  const [standaloneSaved, setStandaloneSaved] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  // Детальная страница (без провайдера): тянем своё состояние после гидрации.
  useEffect(() => {
    if (ctx) {
      return;
    }
    let active = true;
    loadRecipeSaveViewerState(recipeId)
      .then((state) => {
        if (active) {
          setStandaloneSaved(state.saved);
        }
      })
      .catch(() => {
        if (active) {
          setStandaloneSaved(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ctx, recipeId]);

  const saved = ctx ? ctx.isSaved(recipeId) : standaloneSaved ?? false;

  const applyOptimistic = (next: boolean) => {
    if (ctx) {
      ctx.setSaved(recipeId, next);
    } else {
      setStandaloneSaved(next);
    }
  };

  const toggle = (event: React.MouseEvent) => {
    // Карточка обёрнута в ссылку — гасим переход/всплытие при клике по флажку.
    event.preventDefault();
    event.stopPropagation();

    const next = !saved;
    applyOptimistic(next);

    startTransition(async () => {
      const result = await toggleRecipeSaveAction({ recipeId, slug, next });
      if (!result.ok) {
        applyOptimistic(!next); // откат оптимистичного апдейта
        if (result.code === "AUTH") {
          redirectToLoginWithNext();
        }
        return;
      }
      // Явный фидбэк только при добавлении (не при снятии): куда попало и где найти.
      if (next) {
        // На детальной странице (variant="button") ведём в список покупок, если
        // в рецепте есть нехватки — иначе в закладки, как и на витрине.
        let gapCount: number | null = null;
        if (variant === "button" && matchCtx) {
          const contextMatch = matchCtx.state?.match;
          gapCount = contextMatch ? countStockGaps(contextMatch.lines) : null;
          // Матч ещё не догрузился к моменту клика — редкий путь, один лишний await.
          if (gapCount == null) {
            try {
              const fresh = await loadRecipeMatch(recipeId);
              gapCount = fresh.match ? countStockGaps(fresh.match.lines) : null;
            } catch {
              gapCount = null;
            }
          }
        }
        const toastAction = resolveSaveToastAction(gapCount);
        show({
          title: "В закладках",
          action: { label: toastAction.label, onClick: () => router.push(toastAction.href) }
        });
      }
    });
  };

  const label = saved ? "Убрать из закладок" : "Добавить в закладки";

  const trigger =
    variant === "button" ? (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={saved}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
          saved
            ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
            : "border-border bg-card text-foreground hover:border-border"
        }`}
      >
        <Bookmark className={saved ? "h-4 w-4 fill-warning text-warning" : "h-4 w-4"} aria-hidden />
        {saved ? "В закладках" : "В закладки"}
      </button>
    ) : (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-label={label}
        aria-pressed={saved}
        // Визуальный бейдж остаётся 28×28 (карточка в /app/saved держит рядом ещё
        // «Скопировать» — расти в размере некуда, до статов ~92-98px). Кликабельную
        // зону растим невидимым before-псевдоэлементом до ~44×44 (-inset-2 с обеих
        // сторон), не трогая раскладку.
        className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-card/70 text-muted-foreground backdrop-blur-sm transition before:absolute before:-inset-2 before:content-[''] hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-warning disabled:opacity-60"
      >
        <Bookmark className={saved ? "h-3.5 w-3.5 fill-warning text-warning" : "h-3.5 w-3.5"} aria-hidden />
      </button>
    );

  return trigger;
}
