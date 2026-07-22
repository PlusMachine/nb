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
  stockCoverage
}: {
  brewBatchId: string;
  view: BrewBatchInventoryView;
  status: BrewBatchStatus;
  // Покрытие склада по рецепту этой партии (Ф5, docs/brew-start-flow-redesign.md):
  // считается на странице во всех неархивных актах, пока партия не списана сама
  // (см. brew-batches/[id]/page.tsx). undefined/null — коверидж-строки не рендерим
  // (терминальная партия, рецепт удалён, ошибка матча).
  // presentCount (!== "missing", partial включён) — гейтит доступность кнопки:
  // списывать можно, даже если часть строк неполные. coveredCount (covered+
  // substitute, БЕЗ partial) — честный счёт для подписи «N из M»: partial-строка
  // всё ещё «не хватает», presentCount её бы молча посчитал закрытой.
  stockCoverage?: { totalLines: number; presentCount: number; coveredCount: number; fullyCovered: boolean } | null;
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

  // Ф5 (docs/brew-start-flow-redesign.md): показываем покрытие склада, только
  // когда кнопка вообще может появиться (canConsume) и странице было что
  // посчитать (totalLines > 0 — рецепт без строк коверидж не даёт). Пустой склад
  // (presentCount === 0) — особый случай: там нет призыва списать, есть кнопка,
  // есть только объяснение и ссылка в покупки (см. рендер ниже).
  const coverage = canConsume && stockCoverage && stockCoverage.totalLines > 0 ? stockCoverage : null;
  const coverageEmpty = coverage ? coverage.presentCount === 0 : false;

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
          {coverageEmpty ? (
            <>
              Ингредиентов этого рецепта нет на складе{" · "}
              <Link href="/app/shopping" className="font-medium text-primary underline-offset-2 hover:underline">
                Чего не хватает
              </Link>
            </>
          ) : canConsume
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

      {/* Призыв/честная подпись над кнопкой (Ф5): полное покрытие — заметный
          призыв списать; неполное с реальной нехваткой (coveredCount < totalLines)
          — сколько закрыто из скольки нужно + ссылка в покупки (тот же вход, что
          был раньше отдельной строкой «Не хватает N», не дублируем). Пустой склад
          коверидж-строку не показывает вовсе — там уже сказано всё нужное во
          вводном абзаце выше. Отдельный случай — coveredCount === totalLines при
          !fullyCovered: все строки закрыты, но частью заменами (partial среди них
          нет) — покупать нечего, замены покажет диалог списания, подписи не даём. */}
      {coverage && !coverageEmpty ? (
        coverage.fullyCovered ? (
          <p className="text-sm font-medium text-success">Все ингредиенты есть на складе — списать?</p>
        ) : coverage.coveredCount < coverage.totalLines ? (
          <p className="text-sm text-muted-foreground">
            На складе {coverage.coveredCount} из {coverage.totalLines}{" "}
            {pluralize(coverage.totalLines, ["позиция", "позиции", "позиций"])}
            {" · "}
            <Link href="/app/shopping" className="font-medium text-primary underline-offset-2 hover:underline">
              Чего не хватает
            </Link>
          </p>
        ) : null
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canConsume && !coverageEmpty ? (
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
