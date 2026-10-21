"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Droplets, FlaskConical, Hop, Package, Scale, Wheat } from "lucide-react";

import { Dialog, DialogCloseButton } from "@nb/ui";
import { getBrewVolumeOptionsAction, getBrewPreparationPreviewAction, type BrewPreparationPreview } from "@/app/(public)/recipes/[slug]/brew-actions";
import { cloneRecipeFromPublicAction } from "@/app/(public)/recipes/[slug]/clone-actions";
import { BrewPreparationSummary } from "./brew-preparation-summary";
import { NumericInput } from "@/components/shared/numeric-input";
import { DEFAULT_BREWHOUSE_EFFICIENCY_PCT } from "@/features/equipment-profiles/contracts";
import { parseDecimalInput } from "@/features/forms/numeric-validation";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { scaleRecipeToParams, type ScaledRecipeIngredient } from "@/features/recipes/scale";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import { formatInventoryQuantityForDisplay, formatPackCountHintSuffix } from "@/features/inventory/display";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";

const litresFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
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

const formatPercent = (value: number) => `${percentFormatter.format(value)}%`;

const resolveRecipeEfficiencyPct = (recipe: RecipeDetailDto): number => (
  recipe.efficiency ?? DEFAULT_BREWHOUSE_EFFICIENCY_PCT
);

// Единицы считаем тем же форматтером, что и основная секция рецепта, — чтобы окно
// пересчёта показывало ровно те же величины (мл/г/пачки), а не сырой код единицы.
// technicalData в formatInventoryQuantityForDisplay НЕ передаём: для дрожжей она
// всегда предпочитает "pack" как display-unit, а после Ф9-конверсии (scale.ts)
// строка уже может быть в граммах/мл — пересчёт назад в дробную пачку вернул бы
// тот же баг «0.73 пачки». Подсказку «(N пачек)» добавляем отдельно, ниже.
const formatScaledAmount = (ingredient: ScaledRecipeIngredient) => {
  const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
  const base = formatInventoryQuantityForDisplay({
    enteredQuantity: ingredient.amountEnteredQuantity,
    enteredUnit: ingredient.amountEnteredUnit,
    normalizedQuantity: ingredient.amountNormalizedQuantity,
    normalizedUnit: ingredient.amountNormalizedUnit,
    type: ingredient.type,
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    defaultDisplayUnit: ingredient.defaultDisplayUnit,
    allowedUnits: ingredient.allowedUnits,
    measurementDimension: ingredient.measurementDimension
  });

  if (category === "yeast" && (ingredient.amountEnteredUnit === "g" || ingredient.amountEnteredUnit === "ml")) {
    const packEquivalent = resolveInventoryPackEquivalent(ingredient.technicalData);
    const hint = formatPackCountHintSuffix(ingredient.amountEnteredQuantity, ingredient.amountEnteredUnit, packEquivalent);
    if (hint) {
      return `${base} (${hint})`;
    }
  }

  return base;
};

/**
 * Модалка эфемерного пересчёта рецепта под объём и efficiency. Меняет ТОЛЬКО
 * отображаемые количества — без записи в БД и без копии (`scaleRecipeToParams`).
 * Залогиненному с профилем оборудования подставляет его литры и %; гостю —
 * цифры автора. Поле efficiency доступно в обоих случаях.
 */
function RecipeScaleDialog({
  recipe,
  baseBatchLitres,
  baseEfficiencyPct,
  open,
  onClose
}: {
  recipe: RecipeDetailDto;
  baseBatchLitres: number;
  baseEfficiencyPct: number;
  open: boolean;
  onClose: () => void;
}) {
  const [volumeInput, setVolumeInput] = useState<string>(() => String(baseBatchLitres));
  const [efficiencyInput, setEfficiencyInput] = useState<string>(() => String(baseEfficiencyPct));
  const [profileHint, setProfileHint] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const [preview, setPreview] = useState<BrewPreparationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    setVolumeInput(String(baseBatchLitres));
    setEfficiencyInput(String(baseEfficiencyPct));
    setProfileHint(null);
    setCloning(false);
    setProfileId(null);
    setProfileLoading(true);
    setProfileError(false);
    setCloneError(null);

    let cancelled = false;
    void getBrewVolumeOptionsAction(recipe.id).then((options) => {
      if (cancelled || !options?.defaultProfile) {
        return;
      }
      // Автоподстановка только при своём профиле оборудования (гость / без профиля
      // остаются на цифрах автора — поле efficiency всё равно можно править вручную).
      setVolumeInput(String(options.defaultProfile.targetBatchVolumeL));
      setEfficiencyInput(String(options.defaultProfile.brewhouseEfficiencyPct));
      setProfileHint(options.defaultProfile.name);
      setProfileId(options.defaultProfile.id);
    }).catch(() => { if (!cancelled) setProfileError(true); }).finally(() => { if (!cancelled) setProfileLoading(false); });

    return () => { cancelled = true; };
  }, [open, baseBatchLitres, baseEfficiencyPct, recipe.id, profileRetry]);

  const targetVolume = parseDecimalInput(volumeInput);
  const targetEfficiency = parseDecimalInput(efficiencyInput);
  const validInputs = targetVolume != null && targetVolume > 0 && targetVolume <= 1000
    && targetEfficiency != null && targetEfficiency >= 1 && targetEfficiency <= 100;
  useEffect(() => {
    if (!open || !validInputs || profileLoading || profileError) { setPreview(null); return; }
    let cancelled = false;
    setPreview(null);
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      void getBrewPreparationPreviewAction({ recipeId: recipe.id, targetBatchVolumeL: targetVolume!, targetEfficiencyPct: targetEfficiency!, equipmentProfileId: profileId ?? undefined })
        .then((result) => { if (!cancelled) setPreview(result); })
        .catch(() => { if (!cancelled) setPreview(null); })
        .finally(() => { if (!cancelled) setPreviewLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, validInputs, profileLoading, profileError, recipe.id, targetVolume, targetEfficiency, profileId, previewRetry]);
  const view = useMemo(
    () => scaleRecipeToParams(recipe, {
      targetLitres: targetVolume,
      targetEfficiencyPct: targetEfficiency
    }),
    [recipe, targetVolume, targetEfficiency]
  );

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

  const efficiencyDiffers = view.efficiencyFactor !== 1;

  // Скопировать сразу в пересчитанных параметрах — не только посмотреть, но и
  // забрать себе без ручной правки после (сервис принимает объём + efficiency).
  const handleCloneAtParams = () => {
    if (cloning || profileError || !validInputs || !preview || previewLoading) {
      return;
    }

    setCloning(true);
    void cloneRecipeFromPublicAction({
      recipeId: recipe.id,
      targetBatchVolumeLitres: view.targetBatchLitres,
      targetEfficiencyPct: view.targetEfficiencyPct,
      equipmentProfileId: profileId
    }).then((result) => {
      if (result.ok) {
        window.location.assign(`/app/recipes/${result.recipeId}/edit`);
        return;
      }

      setCloning(false);
      setCloneError(result.message);
      if (result.code === "AUTH") {
        window.location.assign(`/login?next=${encodeURIComponent(`/recipes/${recipe.slug}`)}`);
      }
    }).catch(() => { setCloning(false); setCloneError("Не удалось скопировать рецепт. Попробуйте ещё раз."); });
  };

  const statusParts: string[] = [];
  if (view.factor !== 1) {
    statusParts.push(`×${factorFormatter.format(view.factor)} от ${litresFormatter.format(view.baseBatchLitres)} л`);
  } else {
    statusParts.push(`базовый объём — ${litresFormatter.format(view.baseBatchLitres)} л`);
  }
  if (efficiencyDiffers) {
    statusParts.push(`засыпь ×${factorFormatter.format(view.efficiencyFactor)} (${formatPercent(view.baseEfficiencyPct)} → ${formatPercent(view.targetEfficiencyPct)})`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Пересчитать рецепт под свои параметры"
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
              <h3 className="text-base font-semibold text-foreground">Пересчитать под свои параметры</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Не меняет оригинал; чтобы сохранить — скопируйте рецепт себе.
                {profileHint ? (
                  <> Подставлено из профиля «{profileHint}».</>
                ) : null}
              </p>
            </div>
          </div>
          <DialogCloseButton />
        </div>

        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>Объём</span>
              <NumericInput
                allowNegative
                withSteppers
                wrapperClassName="w-[5.5rem]"
                min={0.1}
                max={1000}
                step={0.5}
                value={volumeInput}
                onChange={(event) => setVolumeInput(event.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1 pr-7 text-right tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Целевой объём партии, литры"
                autoFocus
                disabled={profileLoading}
                aria-invalid={!validInputs}
              />
              <span>л</span>
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>Эффективность</span>
              <NumericInput
                allowNegative
                withSteppers
                wrapperClassName="w-[5.5rem]"
                min={1}
                max={100}
                step={0.1}
                value={efficiencyInput}
                onChange={(event) => setEfficiencyInput(event.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1 pr-7 text-right tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Целевая эффективность, проценты"
              />
              <span>%</span>
            </label>
          </div>
          {!validInputs ? <p role="alert" className="text-xs text-destructive">Введите объём больше 0 и не больше 1000 л, эффективность — от 1 до 100%.</p> : <p className="text-xs text-muted-foreground">{statusParts.join(" · ")}</p>}
          {validInputs && preview ? <BrewPreparationSummary preview={preview} /> : null}
          {validInputs && previewLoading ? <p className="text-xs text-muted-foreground">Считаем показатели…</p> : null}
          {profileError ? <p role="alert" className="text-xs text-destructive">Не удалось загрузить оборудование. <button type="button" className="underline" onClick={() => setProfileRetry((value) => value + 1)}>Повторить загрузку</button></p> : null}
          {validInputs && !profileLoading && !profileError && !previewLoading && !preview ? (
            <p role="alert" className="text-xs text-destructive">
              Не удалось рассчитать рецепт. <button type="button" className="underline" onClick={() => setPreviewRetry((value) => value + 1)}>Повторить расчёт</button>
            </p>
          ) : null}
          {cloneError ? <p role="alert" className="text-xs text-destructive">{cloneError}</p> : null}
          {validInputs && efficiencyDiffers ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Количество солода пересчитано с учётом вашей эффективности {formatPercent(view.targetEfficiencyPct)}
              {" "}(у автора {formatPercent(view.baseEfficiencyPct)}), чтобы сохранить начальную плотность.
              Хмель, дрожжи и сахар пересчитаны только по объёму.
            </p>
          ) : null}
        </div>

        <div className="-mr-1 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {validInputs && groups.map((group) => {
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

        {validInputs ? (
          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={handleCloneAtParams}
              disabled={cloning || profileError || profileLoading || previewLoading || !preview}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cloning
                ? "Копируем…"
                : `Скопировать себе (${litresFormatter.format(view.targetBatchLitres)} л · ${formatPercent(view.targetEfficiencyPct)})`}
            </button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * Кнопка-триггер пересчёта на публичной странице рецепта.
 * `sidebar` — карточка в сайдбаре; `inline` — текстовая кнопка у объёма партии.
 */
export function RecipeScalePanel({
  recipe,
  variant = "sidebar"
}: {
  recipe: RecipeDetailDto;
  variant?: "sidebar" | "inline";
}) {
  const baseBatchLitres = useMemo(() => scaleRecipeToParams(recipe).baseBatchLitres, [recipe]);
  const baseEfficiencyPct = useMemo(() => resolveRecipeEfficiencyPct(recipe), [recipe]);
  const [open, setOpen] = useState(false);

  if (recipe.ingredients.length === 0 || baseBatchLitres <= 0) {
    return null;
  }

  return (
    <>
      {variant === "inline" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-sm font-medium text-primary underline-offset-2 transition hover:underline"
        >
          Пересчитать под свои параметры
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm transition hover:border-border hover:bg-muted"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Scale className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Пересчитать под свои параметры</span>
            <span className="block text-xs text-muted-foreground">
              базовый — {litresFormatter.format(baseBatchLitres)} л · {formatPercent(baseEfficiencyPct)}
            </span>
          </span>
        </button>
      )}
      <RecipeScaleDialog
        recipe={recipe}
        baseBatchLitres={baseBatchLitres}
        baseEfficiencyPct={baseEfficiencyPct}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
