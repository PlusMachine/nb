"use client";

import React, { useRef, useState } from "react";
import { ChevronRight, Loader2, PackageMinus, Undo2 } from "lucide-react";

import { Button } from "@nb/ui";
import {
  consumeBrewBatchInventoryAction,
  restoreBrewBatchInventoryAction
} from "@/app/(app)/app/brew-batches/[id]/actions";
import {
  type BrewBatchInventoryLogEntry,
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

const logTypeLabels: Record<BrewBatchInventoryLogEntry["type"], string> = {
  consume: "списание",
  reserve: "резерв",
  release: "возврат",
  adjustment: "поправка"
};

const logDateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtLogDate = (value: Date) => logDateFmt.format(new Date(value));

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
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Склад</h2>
        {view.hasConsumed ? (
          <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-subtle-foreground">
            Списано
          </span>
        ) : null}
      </div>

      {view.hasConsumed ? (
        <ul className="divide-y divide-border">
          {view.consumed.map((line) => (
            <li key={line.inventoryItemId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {line.ingredientDisplayName ?? "Ингредиент"}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                −{fmtAmount(line.quantityNormalized, line.normalizedUnit)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
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
          className={`text-xs ${message.ok ? "text-success" : "text-destructive"}`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canConsume ? (
          <Button
            type="button"
            size="sm"
            onClick={() => run(() => consumeBrewBatchInventoryAction(brewBatchId))}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackageMinus className="h-4 w-4" aria-hidden />}
            Списать со склада
          </Button>
        ) : null}

        {view.canRestore ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => run(() => restoreBrewBatchInventoryAction(brewBatchId))}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
            Вернуть на склад
          </Button>
        ) : null}
      </div>

      {/* Журнал движений склада по этой партии (списания/резервы/возвраты/поправки) —
          аудит на случай расхождений, нужен редко, поэтому свёрнут по умолчанию. */}
      {view.log.length > 0 ? (
        <details className="group rounded-xl border border-border bg-muted/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-90" aria-hidden />
            <span className="font-medium">История движений</span>
            <span className="text-xs text-muted-foreground tabular-nums">{view.log.length}</span>
          </summary>
          <ul className="divide-y divide-border px-3 pb-3">
            {view.log.map((entry) => {
              const sign = entry.quantityDeltaNormalized < 0 ? "−" : entry.quantityDeltaNormalized > 0 ? "+" : "";
              const deltaColorClass = entry.type === "release" ? "text-success" : "text-muted-foreground";
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{entry.ingredientDisplayName ?? "Ингредиент"}</p>
                    {/* Время форматируется в TZ браузера → подавляем hydration-варнинг
                        (SSR-рендер клиентского компонента идёт в TZ сервера). */}
                    <p suppressHydrationWarning className="text-xs text-muted-foreground">
                      {fmtLogDate(entry.createdAt)} · {logTypeLabels[entry.type]}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${deltaColorClass}`}>
                    {sign}
                    {fmtAmount(Math.abs(entry.quantityDeltaNormalized), entry.normalizedUnit)}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
