import React from "react";
import { Check } from "lucide-react";

import { type BrewDayStage, type BrewDayStageGroup, type BrewDayProgress } from "@/features/brew-batches/contracts";

/**
 * Узкая лента этапов варки (Затор → … → Розлив) с заливкой прогресса по каждому
 * этапу и подсветкой текущего. Даёт «где я сейчас» с одного взгляда. На мобайле
 * лента горизонтально скроллится (паритет раскладки).
 */
export function BrewStageRail({
  groups,
  progress,
  currentStage = null
}: {
  groups: BrewDayStageGroup[];
  progress: BrewDayProgress;
  currentStage?: BrewDayStage | null;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <ol className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {groups.map((group) => {
        const total = group.steps.length;
        const done = group.steps.filter((step) => progress.steps[step.id]?.done).length;
        const allDone = total > 0 && done === total;
        const isCurrent = currentStage != null && group.stage === currentStage;
        const pct = total ? Math.round((done / total) * 100) : 0;

        return (
          <li key={group.stage} className="min-w-[5.5rem] flex-1 shrink-0">
            <div
              className={`flex items-center gap-1 text-[11px] font-medium ${
                isCurrent ? "text-zinc-900" : allDone ? "text-emerald-600" : "text-zinc-500"
              }`}
            >
              {allDone ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : null}
              <span className="truncate">{group.label}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
              <div
                className={`h-full rounded-full transition-all ${isCurrent ? "bg-zinc-900" : "bg-emerald-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
