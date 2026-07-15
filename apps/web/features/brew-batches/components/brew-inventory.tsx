"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, PackageMinus, Undo2 } from "lucide-react";

import { Button } from "@nb/ui";
import { restoreBrewBatchInventoryAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import {
  type BrewBatchInventoryLogEntry,
  type BrewBatchInventoryView,
  type BrewBatchStatus
} from "@/features/brew-batches/contracts";
import { pluralize } from "@/lib/pluralize";
import { ConsumeInventoryDialog, type ConsumeDialogResult } from "./consume-preview-dialog";

// Человекочитаемое количество из нормализованного (g→kg, ml→l при больших значениях).
// Точность — как её пишет пивовар, а не как хранит БД: варка в объёме, отличном от
// рецепта, даёт дробные количества (5 кг × 20/30 = 3.3333…), и «−83.334 г» в журнале
// склада — это шум, а не точность.
const fmtAmount = (quantity: number, unit: string): string => {
  if (unit === "g" && quantity >= 1000) {
    return `${Number((quantity / 1000).toFixed(2))} кг`;
  }
  if (unit === "ml" && quantity >= 1000) {
    return `${Number((quantity / 1000).toFixed(2))} л`;
  }
  const precision = unit === "g" || unit === "ml" ? 1 : 2;
  const value = Number(quantity.toFixed(precision));
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
  status,
  prepShortage
}: {
  brewBatchId: string;
  view: BrewBatchInventoryView;
  status: BrewBatchStatus;
  // Нехватка по рецепту этой партии — считается только в акте «Подготовка»
  // (см. brew-batches/[id]/page.tsx, S3 docs/shopping-list-redesign.md D13).
  // undefined/null — строку не рендерим (остальные акты её не передают).
  prepShortage?: { missingCount: number } | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const inFlight = useRef(false);

  // Списание — свойство ЭТОЙ партии: варка того же рецепта во второй раз (пока
  // первая ещё бродит) списывает свой склад заново. Гасим кнопку, только если эта
  // партия уже списала (и не вернула), варка закрыта или рецепта-источника больше нет.
  const recipeAvailable = Boolean(view.recipeId);
  const isTerminal = status === "cancelled" || status === "completed";
  const canConsume = !view.batchAlreadyConsumed && recipeAvailable && !isTerminal;

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

      {/* Вход в «Чего не хватает» из акта «Подготовка» (S3/D19): нехватка по
          рецепту именно этой партии, тем же предикатом, что даёт строки списка.
          Ссылкой становится весь текст — отдельный лейбл раздела не нужен. */}
      {prepShortage ? (
        prepShortage.missingCount > 0 ? (
          <p className="text-sm">
            <Link href="/app/shopping" className="font-medium text-primary underline-offset-2 hover:underline">
              Не хватает {prepShortage.missingCount} {pluralize(prepShortage.missingCount, ["позиция", "позиции", "позиций"])}
            </Link>
          </p>
        ) : (
          <p className="text-sm text-success">Ингредиенты на складе есть</p>
        )
      ) : null}

      {view.hasConsumed ? (
        <ul className="divide-y divide-border">
          {view.consumed.map((line) => (
            <li key={line.inventoryItemId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {line.ingredientDisplayName ?? "Ингредиент"}
                </span>
                {/* Позиция списана как замена другой строки рецепта (Ф2, opt-in
                    в предпросмотре) — не свой продукт, честно показываем, вместо чего. */}
                {line.substitutedFor ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    вместо «{line.substitutedFor}»
                  </span>
                ) : null}
              </span>
              {/* Списали меньше, чем нужно (дрожжей на складе не хватило — списание
                  ужалось до остатка): показываем и то, и другое, иначе «Списано»
                  врёт молчанием. */}
              {line.requiredQuantityNormalized != null ? (
                <span className="shrink-0 text-sm font-medium tabular-nums text-warning">
                  −{fmtAmount(line.quantityNormalized, line.normalizedUnit)}
                  {" из "}
                  {fmtAmount(line.requiredQuantityNormalized, line.normalizedUnit)}
                </span>
              ) : (
                <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                  −{fmtAmount(line.quantityNormalized, line.normalizedUnit)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {canConsume
            ? "Спишем со склада ингредиенты рецепта — в объёме этой варки."
            : !recipeAvailable
              ? "Рецепт этой варки удалён — списывать нечего."
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
          <>
            <Button type="button" size="sm" onClick={() => setConsumeDialogOpen(true)} disabled={busy}>
              <PackageMinus className="h-4 w-4" aria-hidden />
              Списать со склада
            </Button>
            <ConsumeInventoryDialog
              open={consumeDialogOpen}
              brewBatchId={brewBatchId}
              onOpenChange={setConsumeDialogOpen}
              onConsumed={(result: ConsumeDialogResult) => setMessage({ ok: result.ok, text: result.message })}
            />
          </>
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
