"use client";

import { Pencil, X } from "lucide-react";
import React, { useState } from "react";

import { NumericInput } from "@/components/shared/numeric-input";
import {
  buildRecipeIngredientTechnicalBadges,
  RecipeIngredientTechnicalBadges,
  RecipeIngredientTitleBlock
} from "@/components/recipes/recipe-ingredient-card-display";
import { resolveWaterTreatmentFormulaLabel } from "@/features/ingredients/water-treatment";
import { getInventoryUnitInputStep, inventoryUnitLabels } from "@/features/inventory/units";
import { validateNumericInput } from "@/features/forms/numeric-validation";

import {
  stageLabels,
  getHopUseType,
  buildSummaryDetails,
  buildDesignerIngredientCardSource,
  categoryAccentBorder,
  isImportedDesignerIngredient,
  type DesignerIngredient
} from "./helpers";

export function SectionRow({
  ingredient,
  onEdit,
  onDelete,
  onQuantityChange,
  onTimeChange,
  onAddImportedAsCustom,
  onMapImportedSource,
  percentage
}: {
  ingredient: DesignerIngredient;
  onEdit: (ingredient: DesignerIngredient) => void;
  onDelete: (localId: string) => void;
  onQuantityChange: (localId: string, quantity: string) => void;
  onTimeChange: (localId: string, timeMinutes: string) => void;
  onAddImportedAsCustom?: (ingredient: DesignerIngredient) => void;
  onMapImportedSource?: (ingredient: DesignerIngredient) => void;
  percentage?: number | null;
}) {
  const accent = categoryAccentBorder[ingredient.category];
  const unitLabel = inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit;
  const quantityStep = getInventoryUnitInputStep(ingredient.amountEnteredUnit);
  const hopUseType = ingredient.category === "hop" ? getHopUseType(ingredient) : null;
  const hasInlineTimeControl = hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop";
  const isImported = isImportedDesignerIngredient(ingredient);
  const isFromStock = ingredient.inventoryIntentMode === "use_stock" || Boolean(ingredient.inventorySelectionMeta?.inventoryItemId);
  const cardSource = buildDesignerIngredientCardSource(ingredient);
  const technicalBadges = buildRecipeIngredientTechnicalBadges(cardSource, {
    includeConsumableUsageStage: ingredient.category !== "consumable"
  });
  const recipeStageBadges = ingredient.category === "consumable" && ingredient.stage !== "other"
    ? [{
      key: `recipe-stage:${ingredient.stage}`,
      label: stageLabels[ingredient.stage]
    }]
    : [];
  const badges = [...recipeStageBadges, ...technicalBadges];
  const summaryDetails = buildSummaryDetails(ingredient);
  const summaryFallback = badges.length ? null : (ingredient.selectedSummary || ingredient.familyDisplayName || null);

  // Реvил-валидация по паттерну IngredientEditor: строка редактируется инлайн без
  // отдельного «Сохранить», поэтому триггер — blur (а не попытка сейва). Пока поле
  // не потеряло фокус хотя бы раз, подсветку не показываем — иначе уже сохранённая
  // позиция выглядела бы «сломанной» сразу при открытии рецепта.
  const [quantityTouched, setQuantityTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  const quantityError = validateNumericInput(String(ingredient.amountEnteredQuantity), {
    label: "Количество",
    required: true,
    min: 0,
    exclusiveMin: true
  });
  const showQuantityError = quantityTouched && Boolean(quantityError);
  const timeError = hasInlineTimeControl
    ? validateNumericInput(String(ingredient.stepMeta.timeMinutes ?? ""), {
      label: "Время",
      required: true,
      min: 0,
      max: 600,
      integer: true
    })
    : null;
  const showTimeError = timeTouched && Boolean(timeError);

  return (
    <li className={`relative rounded-lg border-l-[3px] bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100 transition-shadow hover:shadow-md ${accent}`}>
      <div className="absolute right-2 top-2 z-10 flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(ingredient)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Редактировать"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(ingredient.localId)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          aria-label="Удалить"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-3 pr-14">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
            <RecipeIngredientTitleBlock
              source={cardSource}
              primaryName={ingredient.selectedName || "Не выбран"}
              secondaryName={ingredient.selectedSecondaryName}
            />
            {isFromStock ? (
              <span className="mt-0.5 shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700">Со склада</span>
            ) : null}
            {isImported ? (
              <span className="mt-0.5 shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">Импортировано</span>
            ) : null}
          </div>
          {summaryDetails ? <div className="mt-1 text-xs text-zinc-500">{summaryDetails}</div> : null}
          {summaryFallback ? <div className="mt-1 text-xs text-zinc-500">{summaryFallback}</div> : null}
          {!summaryDetails && !summaryFallback && !badges.length ? <div className="mt-1 text-xs text-zinc-500">-</div> : null}
          <RecipeIngredientTechnicalBadges badges={badges} className="mt-1.5" />
          {isImported ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAddImportedAsCustom?.(ingredient)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Сохранить как свой
              </button>
              <button
                type="button"
                onClick={() => onMapImportedSource?.(ingredient)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Подобрать из каталога
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="flex items-center gap-1">
            {percentage != null && percentage > 0 ? (
              <span className="shrink-0 px-1 text-[11px] font-medium tabular-nums text-zinc-600">{percentage.toFixed(1)}%</span>
            ) : null}
            <NumericInput
              value={ingredient.amountEnteredQuantity}
              onChange={(event) => onQuantityChange(ingredient.localId, event.target.value)}
              onBlur={() => setQuantityTouched(true)}
              aria-invalid={showQuantityError || undefined}
              className={`h-7 w-[72px] rounded-md border bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 transition-colors focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200 ${showQuantityError ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"}`}
              min={quantityStep}
              step={quantityStep}
            />
            <span className="text-xs text-zinc-500">{unitLabel}</span>
          </div>
          {showQuantityError ? <span className="text-[10px] leading-tight text-red-500">{quantityError}</span> : null}
        </div>
        {hasInlineTimeControl ? (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <div className="flex items-center gap-1">
              <NumericInput
                integer
                value={ingredient.stepMeta.timeMinutes ?? ""}
                onChange={(event) => onTimeChange(ingredient.localId, event.target.value)}
                onBlur={() => setTimeTouched(true)}
                aria-invalid={showTimeError || undefined}
                className={`h-7 w-[64px] rounded-md border bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 transition-colors focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200 ${showTimeError ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"}`}
                min={0}
                max={600}
                step={1}
              />
              <span className="text-xs text-zinc-500">мин</span>
            </div>
            {showTimeError ? <span className="text-[10px] leading-tight text-red-500">{timeError}</span> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function WaterTreatmentSectionRow({
  ingredient,
  onEdit,
  onDelete,
  onQuantityChange
}: {
  ingredient: DesignerIngredient;
  onEdit: (ingredient: DesignerIngredient) => void;
  onDelete: (localId: string) => void;
  onQuantityChange: (localId: string, quantity: string) => void;
}) {
  const unitLabel = inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit;
  const quantityStep = getInventoryUnitInputStep(ingredient.amountEnteredUnit);
  const cardSource = buildDesignerIngredientCardSource(ingredient);
  const formula = resolveWaterTreatmentFormulaLabel(ingredient.technicalData);
  const badges = buildRecipeIngredientTechnicalBadges(cardSource).filter(
    (badge) => badge.label !== formula,
  );
  const summaryDetails = buildSummaryDetails(ingredient);
  const isFromStock = ingredient.inventoryIntentMode === "use_stock" || Boolean(ingredient.inventorySelectionMeta?.inventoryItemId);
  const status = isFromStock
    ? { label: "Со склада", className: "text-emerald-700" }
    : ingredient.ingredientCatalogItemId
      ? { label: "Из каталога", className: "text-zinc-500" }
      : { label: "Добавлено вручную", className: "text-zinc-500" };
  const [quantityTouched, setQuantityTouched] = useState(false);
  const quantityError = validateNumericInput(String(ingredient.amountEnteredQuantity), {
    label: "Количество",
    required: true,
    min: 0,
    exclusiveMin: true
  });
  const showQuantityError = quantityTouched && Boolean(quantityError);

  return (
    <li className="relative rounded-lg border-l-[3px] border-l-sky-400 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100">
      <div className="absolute right-2 top-2 z-10 flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(ingredient)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Редактировать"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(ingredient.localId)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          aria-label="Удалить"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3 pr-14">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold text-zinc-950">
              {ingredient.selectedName || "Не выбран"}
            </span>
            {formula ? (
              <span className="text-sm font-semibold tabular-nums text-zinc-950">
                {formula}
              </span>
            ) : null}
          </div>
          {ingredient.selectedSecondaryName ? (
            <div className="mt-0.5 text-xs text-zinc-500">
              {ingredient.selectedSecondaryName}
            </div>
          ) : null}
          <div className={`mt-1 text-xs ${status.className}`}>
            {status.label}
          </div>
          {summaryDetails ? (
            <div className="mt-1 text-xs text-zinc-500">{summaryDetails}</div>
          ) : null}
          <RecipeIngredientTechnicalBadges badges={badges} className="mt-1.5" />
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1">
            <NumericInput
              value={ingredient.amountEnteredQuantity}
              onChange={(event) => onQuantityChange(ingredient.localId, event.target.value)}
              onBlur={() => setQuantityTouched(true)}
              aria-invalid={showQuantityError || undefined}
              className={`h-7 w-[72px] rounded-md border bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 transition-colors focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200 ${showQuantityError ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"}`}
              min={quantityStep}
              step={quantityStep}
            />
            <span className="text-xs text-zinc-500">{unitLabel}</span>
          </div>
          {showQuantityError ? <span className="text-[10px] leading-tight text-red-500">{quantityError}</span> : null}
        </div>
      </div>
    </li>
  );
}
