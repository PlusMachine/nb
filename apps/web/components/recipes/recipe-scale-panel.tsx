"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Droplets, FlaskConical, Hop, Package, Scale, Wheat } from "lucide-react";

import { Dialog, DialogCloseButton } from "@nb/ui";
import { cloneRecipeFromPublicAction } from "@/app/(public)/recipes/[slug]/clone-actions";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { scaleRecipeToVolume, type ScaledRecipeIngredient } from "@/features/recipes/scale";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import { formatInventoryQuantityForDisplay } from "@/features/inventory/display";

const litresFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const factorFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const sectionOrder = ["fermentable", "hop", "yeast", "water_treatment", "consumable"] as const;
type SectionCategory = (typeof sectionOrder)[number];

const sectionLabels: Record<SectionCategory, string> = {
  fermentable: "Сбраживаемое",
  hop: "Хмель",
  yeast: "Дрожжи",
  water_treatment: "Водоподготовка",
  consumable: "Специи и добавки"
};

const sectionIcons: Record<SectionCategory, React.ComponentType<{ className?: string }>> = {
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_treatment: Droplets,
  consumable: Package
};

const sectionIconBg: Record<SectionCategory, string> = {
  fermentable: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  hop: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  yeast: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  water_treatment: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  consumable: "bg-muted text-muted-foreground"
};

const ingredientCategory = (ingredient: ScaledRecipeIngredient): SectionCategory | null => {
  const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
  return (sectionOrder as readonly string[]).includes(category) ? (category as SectionCategory) : null;
};

// Единицы считаем тем же форматтером, что и основная секция рецепта, — чтобы окно
// пересчёта показывало ровно те же величины (мл/г/пачки), а не сырой код единицы.
const formatScaledAmount = (ingredient: ScaledRecipeIngredient) => formatInventoryQuantityForDisplay({
  enteredQuantity: ingredient.amountEnteredQuantity,
  enteredUnit: ingredient.amountEnteredUnit,
  normalizedQuantity: ingredient.amountNormalizedQuantity,
  normalizedUnit: ingredient.amountNormalizedUnit,
  type: ingredient.type,
  category: ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type }),
  subtype: ingredient.ingredientSubtype ?? null,
  defaultDisplayUnit: ingredient.defaultDisplayUnit,
  allowedUnits: ingredient.allowedUnits,
  measurementDimension: ingredient.measurementDimension
});

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

  // Группируем как в основной секции рецепта (солод → хмель → дрожжи → …), чтобы
  // каждый ингредиент читался в своём разделе, а не плоским списком.
  const groups = useMemo(
    () => sectionOrder
      .map((category) => ({
        category,
        items: view.ingredients.filter((ingredient) => ingredientCategory(ingredient) === category)
      }))
      .filter((group) => group.items.length > 0),
    [view.ingredients]
  );

  // Скопировать сразу в пересчитанном объёме — не только посмотреть, но и забрать
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Пересчитать под объём</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Не меняет оригинал; чтобы сохранить — скопируйте рецепт себе.
              </p>
            </div>
          </div>
          <DialogCloseButton />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Объём, л</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="w-24 rounded-lg border border-border px-2 py-1 text-right tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Целевой объём партии, литры"
              autoFocus
            />
          </label>
          <span className="text-xs text-muted-foreground">
            {view.scaled
              ? `×${factorFormatter.format(view.factor)} от ${litresFormatter.format(view.baseBatchLitres)} л`
              : `базовый объём — ${litresFormatter.format(view.baseBatchLitres)} л`}
          </span>
        </div>

        <div className="-mr-1 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => {
            const IconComponent = sectionIcons[group.category];
            return (
              <div key={group.category} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md ${sectionIconBg[group.category]}`}>
                    <IconComponent className="h-3 w-3" />
                  </span>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sectionLabels[group.category]}</h4>
                  <span className="text-xs tabular-nums text-muted-foreground">({group.items.length})</span>
                </div>
                <ul className="space-y-1">
                  {group.items.map((ingredient) => {
                    const { primaryName, secondaryName } = resolveIngredientDisplayNames({
                      displayName: ingredient.displayName ?? ingredient.type,
                      displayNameRu: ingredient.displayNameRu,
                      displayNameEn: ingredient.displayNameEn
                    });
                    return (
                      <li key={ingredient.persistentKey} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-foreground">
                          {primaryName}
                          {secondaryName ? <span className="ml-1.5 text-xs text-muted-foreground">{secondaryName}</span> : null}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-foreground">{formatScaledAmount(ingredient)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {view.scaled ? (
          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={handleCloneAtVolume}
              disabled={cloning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cloning ? "Копируем…" : `Скопировать себе в этом объёме (${litresFormatter.format(view.targetBatchLitres)} л)`}
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
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm transition hover:border-border hover:bg-muted"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Scale className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">Пересчитать под объём</span>
          <span className="block text-xs text-muted-foreground">
            базовый — {litresFormatter.format(baseBatchLitres)} л
          </span>
        </span>
      </button>
      <RecipeScaleDialog recipe={recipe} baseBatchLitres={baseBatchLitres} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
