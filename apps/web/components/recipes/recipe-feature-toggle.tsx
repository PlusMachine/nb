"use client";

import React, { useEffect, useState, useTransition } from "react";
import { BadgeCheck } from "lucide-react";
import { Button, useToast } from "@nb/ui";

import {
  loadRecipeFeatureControl,
  setRecipeFeaturedAction,
  type RecipeFeatureControlState
} from "@/app/(public)/recipes/[slug]/actions";

/**
 * Тумблер «Выбор редакции» для кураторов (роль editor+). Состояние прав/метки
 * грузится после гидрации через server action — чтобы документ `/recipes/[slug]`
 * не читал cookie и оставался кэшируемым. Обычному пользователю (canFeature=false)
 * не рендерится вовсе.
 */
export function RecipeFeatureToggle({ recipeId, slug }: { recipeId: string; slug: string }) {
  const [state, setState] = useState<RecipeFeatureControlState | null>(null);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  useEffect(() => {
    let active = true;
    loadRecipeFeatureControl(recipeId)
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch(() => {
        if (active) {
          setState({ canFeature: false, featured: false });
        }
      });
    return () => {
      active = false;
    };
  }, [recipeId]);

  if (!state?.canFeature) {
    return null;
  }

  const toggle = () => {
    const next = !state.featured;
    startTransition(async () => {
      const result = await setRecipeFeaturedAction({ recipeId, slug, featured: next });
      if (result.ok) {
        setState((prev) => (prev ? { ...prev, featured: result.featured } : prev));
        show({ title: result.featured ? "Добавлено в «Выбор редакции»" : "Убрано из «Выбора редакции»" });
      } else {
        show({ title: result.message });
      }
    });
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-amber-900">
          <BadgeCheck className="h-4 w-4" aria-hidden />
          {state.featured ? "В «Выборе редакции»" : "Не в «Выборе редакции»"}
        </span>
        <Button type="button" variant={state.featured ? "outline" : "default"} onClick={toggle} disabled={isPending}>
          {state.featured ? "Убрать из выбора" : "В выбор редакции"}
        </Button>
      </div>
    </section>
  );
}
