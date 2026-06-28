"use client";

import React, { useRef, useState } from "react";
import { Loader2, PackageMinus, Undo2 } from "lucide-react";

import {
  consumeBrewBatchInventoryAction,
  restoreBrewBatchInventoryAction
} from "@/app/(app)/app/brew-batches/[id]/actions";
import {
  type BrewBatchInventoryView,
  type BrewBatchStatus
} from "@/features/brew-batches/contracts";

// Человекочитаемое количество из нормализованного (g→kg, ml→l при больших значениях).
const fmtAmount = (quantity: number, unit: string): string => {
  if (unit === "g" && quantity >= 1000) {
    return `${Number((quantity / 1000).toFixed(3))} кг`;
  }
  if (unit === "ml" && quantity >= 1000) {
    return `${Number((quantity / 1000).toFixed(3))} л`;
  }
  const value = Number(quantity.toFixed(3));
  const label = unit === "g" ? "г" : unit === "ml" ? "мл" : unit === "item" ? "шт" : unit === "pack" ? "уп" : unit;
  return `${value} ${label}`;
};

export function BrewInventory({
  brewBatchId,
  view,
  status
}: {
  brewBatchId: string;
  view: BrewBatchInventoryView;
  status: BrewBatchStatus;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inFlight = useRef(false);

  const canConsume = !view.recipeAlreadyConsumed && status !== "cancelled" && status !== "completed";

  const run = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      setMessage({ ok: result.ok, text: result.message });
    } catch {
      setMessage({ ok: false, text: "Не удалось выполнить операцию." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Склад</h2>
        {view.hasConsumed ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Списано
          </span>
        ) : null}
      </div>

      {view.hasConsumed ? (
        <ul className="divide-y divide-zinc-100">
          {view.consumed.map((line) => (
            <li key={line.inventoryItemId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                {line.ingredientDisplayName ?? "Ингредиент"}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-600">
                −{fmtAmount(line.quantityNormalized, line.normalizedUnit)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          {canConsume
            ? "Спишем со склада сопоставленные позиции рецепта (по точному совпадению ингредиента и единицы)."
            : view.recipeAlreadyConsumed
              ? "Ингредиенты рецепта уже списаны со склада."
              : "По этой варке ингредиенты со склада не списывались."}
        </p>
      )}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-xs ${message.ok ? "text-emerald-700" : "text-rose-600"}`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canConsume ? (
          <button
            type="button"
            onClick={() => run(() => consumeBrewBatchInventoryAction(brewBatchId))}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackageMinus className="h-4 w-4" aria-hidden />}
            Списать со склада
          </button>
        ) : null}

        {view.canRestore ? (
          <button
            type="button"
            onClick={() => run(() => restoreBrewBatchInventoryAction(brewBatchId))}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
            Вернуть на склад
          </button>
        ) : null}
      </div>
    </section>
  );
}
