"use client";

import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackageMinus, RefreshCw } from "lucide-react";

import { Button, Dialog, DialogCloseButton } from "@nb/ui";
import { formatInventoryQuantityInputValue } from "@/features/inventory/display";
import { inventoryUnitShortLabels } from "@/features/inventory/units";
import type { RecipeStockCoverageDto, RecipeStockCoverageLineDto } from "@/features/recipes/contracts";

type RecipeInventoryAction = "sync" | "reserve" | "consume" | "release";

const consumableStockStatuses = new Set<RecipeStockCoverageLineDto["status"]>(["covered", "reserved"]);

const formatCoverageQuantity = (quantity: number | null | undefined, unit: RecipeStockCoverageLineDto["normalizedUnit"]) => {
  if (quantity == null) {
    return "нет данных";
  }

  return `${formatInventoryQuantityInputValue(quantity, unit)} ${inventoryUnitShortLabels[unit] ?? unit}`;
};

const getStockCoverageReadiness = (coverage: RecipeStockCoverageDto | null) => {
  const lines = coverage?.lines ?? [];
  const totalLines = coverage?.summary.totalLines ?? 0;
  const readyLines = lines.filter((line) => consumableStockStatuses.has(line.status));
  const shortLines = lines.filter((line) => line.status === "short");
  const unselectedLines = lines.filter((line) => line.status === "unselected");
  const consumedLines = lines.filter((line) => line.status === "consumed");
  const blockingLines = lines.filter((line) => !consumableStockStatuses.has(line.status));
  const canConsume = totalLines > 0 && blockingLines.length === 0;

  let label = "Появится после сохранения рецепта.";
  if (totalLines > 0 && canConsume) {
    label = `Готово к списанию: ${readyLines.length} из ${totalLines} позиций.`;
  } else if (totalLines > 0 && readyLines.length > 0) {
    const blockers = [
      shortLines.length ? `не хватает ${shortLines.length}` : null,
      unselectedLines.length ? `не выбрано ${unselectedLines.length}` : null
    ].filter(Boolean).join(", ");
    label = `К списанию готово ${readyLines.length} из ${totalLines}${blockers ? `, ${blockers}` : ""}.`;
  } else if (totalLines > 0 && consumedLines.length === totalLines) {
    label = `Уже списано: ${consumedLines.length} из ${totalLines} позиций.`;
  } else if (totalLines > 0) {
    label = "Нет готовых к списанию складских позиций.";
  }

  return {
    totalLines,
    readyLines,
    shortLines,
    unselectedLines,
    consumedLines,
    blockingLines,
    canConsume,
    label
  };
};

const stockCoverageStatusMeta: Record<RecipeStockCoverageLineDto["status"], {
  label: string;
  className: string;
}> = {
  covered: {
    label: "будет списано",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200"
  },
  reserved: {
    label: "резерв, будет списан",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200"
  },
  short: {
    label: "не хватает",
    className: "bg-rose-50 text-rose-700 ring-rose-200"
  },
  unselected: {
    label: "не выбрано",
    className: "bg-zinc-100 text-zinc-600 ring-zinc-200"
  },
  consumed: {
    label: "уже списано",
    className: "bg-zinc-100 text-zinc-600 ring-zinc-200"
  },
  released: {
    label: "резерв снят",
    className: "bg-zinc-100 text-zinc-600 ring-zinc-200"
  }
};

export function StockCoverageSummary({
  coverage,
  pending,
  activeRecipeId,
  onAction
}: {
  coverage: RecipeStockCoverageDto | null;
  pending: boolean;
  activeRecipeId: string | null;
  onAction: (action: RecipeInventoryAction) => void;
}) {
  const readiness = useMemo(() => getStockCoverageReadiness(coverage), [coverage]);
  const hasRecipe = Boolean(activeRecipeId);

  return (
    <section className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <PackageMinus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Ингредиенты со склада</h2>
            <p className="text-sm text-zinc-500">{readiness.label}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasRecipe || pending}
            onClick={() => onAction("sync")}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Обновить наличие
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!hasRecipe || pending || readiness.totalLines === 0}
            onClick={() => onAction("consume")}
          >
            <PackageMinus className="h-3.5 w-3.5" />
            Списать со склада
          </Button>
        </div>
      </div>
    </section>
  );
}

export function StockConsumeDialog({
  open,
  coverage,
  pending,
  message,
  onConfirm,
  onClose
}: {
  open: boolean;
  coverage: RecipeStockCoverageDto | null;
  pending: boolean;
  message?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const readiness = useMemo(() => getStockCoverageReadiness(coverage), [coverage]);

  const missingText = [
    readiness.shortLines.length ? `не хватает ${readiness.shortLines.length}` : null,
    readiness.unselectedLines.length ? `не выбрано ${readiness.unselectedLines.length}` : null
  ].filter(Boolean).join(", ");
  const allConsumed = readiness.totalLines > 0 && readiness.consumedLines.length === readiness.totalLines;
  const consumeDescription = allConsumed
    ? "Ингредиенты уже списаны по этой сводке."
    : readiness.canConsume
      ? `Будет списано ${readiness.readyLines.length} позиций рецепта.`
      : missingText
        ? `Списание недоступно: ${missingText}.`
        : "Списание недоступно для текущей сводки.";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Списать ингредиенты со склада"
      hideTitle
      size="lg"
      guard={{ isDirty: () => pending, onGuardedClose: () => {} }}
    >
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <PackageMinus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-950">Списать ингредиенты со склада</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                {consumeDescription}
              </p>
            </div>
          </div>
          <DialogCloseButton />
        </div>

        {message ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900" role="alert">
            {message}
          </div>
        ) : null}

        {allConsumed ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Списание уже выполнено.
          </div>
        ) : readiness.canConsume ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Все позиции готовы к списанию.
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Закройте позиции без покрытия, затем обновите наличие.
          </div>
        )}

        <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          {coverage?.lines.length ? coverage.lines.map((line) => {
            const statusMeta = stockCoverageStatusMeta[line.status];
            const requiredLabel = formatCoverageQuantity(line.requiredQuantityNormalized, line.requiredNormalizedUnit);
            const availableLabel = line.availableQuantityNormalized == null
              ? "нет складской позиции"
              : formatCoverageQuantity(line.availableQuantityNormalized, line.normalizedUnit);

            return (
              <div key={line.recipeIngredientId} className="grid gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-zinc-950">{line.ingredientDisplayName ?? "Позиция рецепта"}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-zinc-500">{line.inventoryDisplayName ?? "Складская позиция не выбрана"}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs tabular-nums text-zinc-600 sm:min-w-[220px] sm:text-right">
                  <span className="text-zinc-500 sm:hidden">Нужно</span>
                  <span>Нужно: {requiredLabel}</span>
                  <span className="text-zinc-500 sm:hidden">На складе</span>
                  <span>На складе: {availableLabel}</span>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-sm text-zinc-500">
              Сводка появится после сохранения рецепта.
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onClose}
            disabled={pending}
          >
            Отмена
          </Button>
          <Button
            type="button"
            size="md"
            onClick={onConfirm}
            disabled={pending || !readiness.canConsume}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageMinus className="h-4 w-4" />}
            {pending ? "Списываем..." : "Списать со склада"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
