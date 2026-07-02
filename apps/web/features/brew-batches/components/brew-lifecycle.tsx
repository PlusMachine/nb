"use client";

import React, { useRef, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { Button } from "@nb/ui";
import { setBrewBatchStatusAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import { brewBatchStatusLabels, type BrewBatchStatus } from "@/features/brew-batches/contracts";

// Основная цепочка статусов (отмена — отдельное состояние вне линии).
const FLOW: BrewBatchStatus[] = ["planned", "brewing", "fermenting", "completed"];

const nextLabel: Partial<Record<BrewBatchStatus, string>> = {
  planned: "Начать варку",
  brewing: "В брожение",
  fermenting: "Завершить варку"
};

export function BrewLifecycle({ brewBatchId, status }: { brewBatchId: string; status: BrewBatchStatus }) {
  // React 18: useTransition.isPending не держится на await — ведём явный busy + guard.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const apply = async (next: BrewBatchStatus) => {
    if (inFlight.current || next === status) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await setBrewBatchStatusAction(brewBatchId, next);
      if (!result.ok) {
        setError(result.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const flowIndex = FLOW.indexOf(status);
  const next = flowIndex >= 0 && flowIndex < FLOW.length - 1 ? FLOW[flowIndex + 1] : null;
  const cancelled = status === "cancelled";

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Этап варки</h2>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-hidden /> : null}
      </div>

      {/* Степпер основной цепочки — клик по этапу выставляет статус (гибкая правка). */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {FLOW.map((step, index) => {
          const isCurrent = step === status;
          const isDone = !cancelled && flowIndex > index;
          const tone = isCurrent
            ? "bg-zinc-900 text-white"
            : isDone
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-100";
          return (
            <li key={step} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => apply(step)}
                disabled={busy}
                aria-current={isCurrent ? "step" : undefined}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${tone}`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                {brewBatchStatusLabels[step]}
              </button>
              {index < FLOW.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {next ? (
          <Button type="button" size="md" onClick={() => apply(next)} disabled={busy}>
            {nextLabel[status]}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}

        {cancelled ? (
          <Button type="button" variant="outline" size="sm" onClick={() => apply("planned")} disabled={busy}>
            Вернуть в план
          </Button>
        ) : status !== "completed" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => apply("cancelled")}
            disabled={busy}
            className="text-zinc-500 hover:text-rose-600"
          >
            Отменить варку
          </Button>
        ) : null}
      </div>

      {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
    </section>
  );
}
