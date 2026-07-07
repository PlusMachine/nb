"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Timer } from "lucide-react";

import {
  brewDayStageLabels,
  type BrewDayProgress,
  type BrewDayStageGroup,
  type BrewDayStep
} from "@/features/brew-batches/contracts";
import { fmtClock, remainingSeconds } from "@/features/brew-batches/components/brew-day-timer";
import { BrewStageRail } from "@/features/brew-batches/components/brew-stage-rail";

// Секция 3a «Помощник» (docs/demo-page.md §2.3.a). Реплика CurrentStepHero +
// BrewStepList из brew-day-board.tsx/brew-step-list.tsx без useBrewDayProgress —
// на публичной странице нет server actions и сессии, поэтому ни отметка «готово»,
// ни сброс таймера здесь не кликабельны, это витрина текущего состояния фикстуры.

// Плоский список шагов из групп — искать конкретный шаг по id проще, чем
// воспроизводить resolveBrewDayCursor целиком ради одной фиксированной варки.
const findStep = (groups: BrewDayStageGroup[], id: string): BrewDayStep | null =>
  groups.flatMap((group) => group.steps).find((step) => step.id === id) ?? null;

// Текст строки чеклиста: «Засыпь — 5,7 кг», «Затирание 66 °C · 60 мин», «Промывка»,
// «Кипячение 60 мин» — из title/detail/durationSeconds шага, без отдельных фикстур текста.
const checklistLabel = (step: BrewDayStep): string => {
  const minutes = step.durationSeconds != null ? `${Math.round(step.durationSeconds / 60)} мин` : null;
  if (step.kind === "timer" && step.detail && minutes && step.detail !== minutes) {
    // Пауза с температурой в detail («66 °C») — минуты добавляются отдельно.
    return `${step.title} ${step.detail} · ${minutes}`;
  }
  if (minutes && step.detail === minutes) {
    // Detail уже и есть длительность («60 мин») — дублировать не нужно.
    return `${step.title} ${minutes}`;
  }
  if (step.detail) {
    return `${step.title} — ${step.detail}`;
  }
  return step.title;
};

export function DemoBrewAssistantSection({
  groups,
  progress
}: {
  groups: BrewDayStageGroup[];
  progress: BrewDayProgress;
}) {
  // Тик раз в секунду — только для героя (крупный обратный отсчёт кипячения).
  // Строка «Следом» ниже намеренно на него не подписана (см. комментарий у initialNow).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Момент захода на страницу — «Следом: … через …» это факт на момент рендера,
  // а не ещё один тикающий счётчик (см. docs/demo-page.md §2.3.a).
  const initialNow = useRef(Date.now()).current;

  const boilStep = findStep(groups, "boil:main");
  const boilState = boilStep ? progress.steps[boilStep.id] : undefined;
  const remaining = boilStep
    ? remainingSeconds(boilStep.durationSeconds, boilState?.timerStartedAt ?? null, now)
    : null;

  const nextAddition = findStep(groups, "boil:add:citra-10");
  const boilRemainingAtLoad = boilStep
    ? remainingSeconds(boilStep.durationSeconds, boilState?.timerStartedAt ?? null, initialNow)
    : null;
  const untilAddition =
    nextAddition?.boilSecondsBeforeEnd != null && boilRemainingAtLoad != null
      ? boilRemainingAtLoad - nextAddition.boilSecondsBeforeEnd
      : null;

  // Чеклист фиксирован по спеке: засыпь → затирание → промывка → кипячение (идёт).
  const checklistIds = ["mash:add:grain", "mash:mash-1", "mash:sparge", "boil:main"];
  const checklist = checklistIds
    .map((id) => findStep(groups, id))
    .filter((step): step is BrewDayStep => step != null);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Сейчас</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-foreground">
              {boilStep ? `${brewDayStageLabels[boilStep.stage]} · ${boilStep.detail}` : "Кипячение"}
            </h3>
          </div>
          {remaining != null ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-warning-subtle px-3 py-1.5 text-2xl font-semibold tabular-nums text-warning-subtle-foreground">
              <Timer className="h-5 w-5" aria-hidden />
              {/* Значение зависит от Date.now(): между SSR и гидрацией секунда
                  успевает смениться — расхождение штатное, React просто примет
                  клиентское значение. */}
              <span suppressHydrationWarning>{fmtClock(remaining)}</span>
            </span>
          ) : null}
        </div>

        {nextAddition && untilAddition != null ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Следом: внести <span className="text-foreground">{nextAddition.title}, {nextAddition.detail}</span> — через{" "}
            <span className="tabular-nums text-foreground" suppressHydrationWarning>{fmtClock(untilAddition)}</span>
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <ul className="space-y-1.5">
          {checklist.map((step) => {
            const done = progress.steps[step.id]?.done ?? false;
            return (
              <li
                key={step.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  done ? "border-success/30 bg-success-subtle/50" : "border-border bg-card"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                    done ? "border-success bg-success text-white" : "border-border text-transparent"
                  }`}
                  aria-hidden
                >
                  <Check className="h-4 w-4" />
                </span>
                <p className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {checklistLabel(step)}
                  {!done && step.id === "boil:main" ? " — идёт" : null}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <BrewStageRail groups={groups} progress={progress} currentStage="boil" />
    </div>
  );
}
