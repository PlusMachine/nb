"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

import { type BrewDayProgress, type BrewDayStageGroup } from "@/features/brew-batches/contracts";
import { BrewStepList } from "./brew-step-list";
import { HERO_STEP_IDS } from "./fermentation-board";
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

  // Прячем hero-шаги (напр. «Поставить на брожение»): в акте брожения у них нет
  // чекбокса, отметить их нельзя, и в истории они висли бы вечным «0 / 1».
  const historyGroups = groups
    .map((group) => ({ ...group, steps: group.steps.filter((step) => !HERO_STEP_IDS.has(step.id)) }))
    .filter((group) => group.steps.length > 0);

  if (historyGroups.length === 0) {
    return null;
  }

  return (
    <details className="group rounded-2xl border border-border bg-card p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-90" aria-hidden />
        Как прошла варка
      </summary>
      <div className="mt-4">
        <BrewStepList groups={historyGroups} controller={controller} readOnly />
      </div>
    </details>
  );
}
