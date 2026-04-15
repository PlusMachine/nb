"use client";

import React from "react";
import { Package } from "lucide-react";

import type { RecipeStockCoverageDto } from "@/features/recipes/contracts";

export function StockCoverageSummary({
  coverage,
  pending,
  activeRecipeId,
  onAction
}: {
  coverage: RecipeStockCoverageDto | null;
  pending: boolean;
  activeRecipeId: string | null;
  onAction: (action: "sync" | "reserve" | "consume" | "release") => void;
}) {
  const summary = coverage?.summary;
  const totalLines = summary?.totalLines ?? 0;
  const selectedLines = summary?.selectedLines ?? 0;
  const shortLines = coverage?.lines.filter((line) => line.status === "short").length ?? 0;
  const hasRecipe = Boolean(activeRecipeId);

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
            <Package className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Покрытие складом</h2>
            <p className="text-sm text-zinc-500">
              {totalLines > 0
                ? `${selectedLines} из ${totalLines} ингредиентов`
                : "появится после сохранения рецепта"}
              {shortLines > 0 ? ` • не хватает ${shortLines} поз.` : selectedLines > 0 ? " • хватает на варку" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!hasRecipe || pending}
            onClick={() => onAction("sync")}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Проверить покрытие
          </button>
          <button
            type="button"
            disabled={!hasRecipe || pending || !selectedLines}
            onClick={() => onAction("consume")}
            className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs text-rose-700 disabled:opacity-50"
          >
            Списать на варку
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Автосохранение рецепта не списывает склад. Списание выполняется только по явному действию.</p>
    </section>
  );
}
