"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";

import { Dialog, DialogCloseButton } from "@nb/ui";
import { cloneRecipeFromPublicAction } from "@/app/(public)/recipes/[slug]/clone-actions";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { scaleRecipeToVolume } from "@/features/recipes/scale";

const litresFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const factorFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const amountFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

/**
 * Модалка эфемерного пересчёта рецепта под объём пользователя. Меняет ТОЛЬКО
 * отображаемые количества — без записи в БД и без копии (`scaleRecipeToVolume`).
 */
function RecipeScaleDialog({
  recipe,
  baseBatchLitres,
  open,
  onClose
}: {
  recipe: RecipeDetailDto;
  baseBatchLitres: number;
  open: boolean;
  onClose: () => void;
}) {
  const [input, setInput] = useState<string>(() => String(baseBatchLitres));
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    if (open) {
      setInput(String(baseBatchLitres));
      setCloning(false);
    }
  }, [open, baseBatchLitres]);

  const target = Number(input.replace(",", "."));
  const view = useMemo(() => scaleRecipeToVolume(recipe, target), [recipe, target]);

  // Клонировать сразу в пересчитанном объёме — не только посмотреть, но и забрать
  // себе без ручной правки после (сервис принимает targetBatchVolumeLitres — см.
  // features/recipes/service.ts, cloneRecipeFromPublic).
  const handleCloneAtVolume = () => {
    if (cloning) {
      return;
    }

    setCloning(true);
    void cloneRecipeFromPublicAction({
      recipeId: recipe.id,
      targetBatchVolumeLitres: view.targetBatchLitres
    }).then((result) => {
      if (result.ok) {
        window.location.assign(`/app/recipes/${result.recipeId}/edit`);
        return;
      }

      setCloning(false);
      if (result.code === "AUTH") {
        window.location.assign(`/login?next=${encodeURIComponent(`/recipes/${recipe.slug}`)}`);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Пересчитать рецепт под объём"
      hideTitle
      size="md"
    >
      <div className="flex max-h-[85vh] flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-950">Пересчитать под объём</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Не меняет оригинал; чтобы сохранить — клонируйте рецепт.
              </p>
            </div>
          </div>
          <DialogCloseButton />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <span>Объём, л</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="w-24 rounded-lg border border-zinc-200 px-2 py-1 text-right tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              aria-label="Целевой объём партии, литры"
              autoFocus
            />
          </label>
          <span className="text-xs text-zinc-500">
            {view.scaled
              ? `×${factorFormatter.format(view.factor)} от ${litresFormatter.format(view.baseBatchLitres)} л`
              : `базовый объём — ${litresFormatter.format(view.baseBatchLitres)} л`}
          </span>
        </div>

        <ul className="-mr-1 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {view.ingredients.map((ingredient) => (
            <li key={ingredient.persistentKey} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-zinc-700">{ingredient.displayName ?? "—"}</span>
              <span className="shrink-0 font-medium tabular-nums text-zinc-900">
                {amountFormatter.format(ingredient.amountEnteredQuantity)} {ingredient.amountEnteredUnit}
              </span>
            </li>
          ))}
        </ul>

        {view.scaled ? (
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <button
              type="button"
              onClick={handleCloneAtVolume}
              disabled={cloning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cloning ? "Клонируем…" : `Клонировать в этом объёме (${litresFormatter.format(view.targetBatchLitres)} л)`}
            </button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * Кнопка-триггер пересчёта в сайдбаре публичной страницы рецепта. Сам пересчёт
 * показывается в модалке — это про адаптацию рецепта, а не про сам рецепт,
 * поэтому не занимает место на первом экране.
 */
export function RecipeScalePanel({ recipe }: { recipe: RecipeDetailDto }) {
  const baseBatchLitres = useMemo(() => scaleRecipeToVolume(recipe, Number.NaN).baseBatchLitres, [recipe]);
  const [open, setOpen] = useState(false);

  if (recipe.ingredients.length === 0 || baseBatchLitres <= 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-zinc-200 hover:bg-zinc-50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <Scale className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-900">Пересчитать под объём</span>
          <span className="block text-xs text-zinc-500">
            базовый — {litresFormatter.format(baseBatchLitres)} л
          </span>
        </span>
      </button>
      <RecipeScaleDialog recipe={recipe} baseBatchLitres={baseBatchLitres} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
