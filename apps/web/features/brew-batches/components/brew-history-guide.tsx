"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

import { type BrewDayProgress, type BrewDayStageGroup } from "@/features/brew-batches/contracts";
import { BrewStepList } from "./brew-step-list";
import { useBrewDayProgress } from "./use-brew-day-progress";

/**
 * Read-only гид как история варки — для завершённой/отменённой партии. Свёрнут в
 * `<details>`: это уже не инструкция, а «как прошёл варочный день». Отметки/таймеры
 * недоступны (readOnly), прогресс показан как есть.
 */
export function BrewHistoryGuide({
  brewBatchId,
  groups,
  initialProgress
}: {
  brewBatchId: string;
  groups: BrewDayStageGroup[];
  initialProgress: BrewDayProgress;
}) {
  const controller = useBrewDayProgress(brewBatchId, initialProgress);

  if (groups.length === 0) {
    return null;
  }

  return (
    <details className="group rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-90" aria-hidden />
        Как прошла варка
      </summary>
      <div className="mt-4">
        <BrewStepList groups={groups} controller={controller} readOnly />
      </div>
    </details>
  );
}
