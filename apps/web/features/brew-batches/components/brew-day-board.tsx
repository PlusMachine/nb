"use client";

import React, { useEffect, useRef } from "react";
import { ArrowRight, Check, CheckCircle2, Loader2, Play, RotateCcw, Timer, Undo2 } from "lucide-react";

import { Button } from "@nb/ui";
import {
  groupsForAct,
  resolveBrewDayCursor,
  resolveLastDoneStep
} from "@/features/brew-batches/brew-day";
import { type BrewDayProgress, type BrewDayStageGroup } from "@/features/brew-batches/contracts";
import { useWakeLock } from "@/features/brew-controller/use-wake-lock";
import { fmtClock, remainingSeconds } from "./brew-day-timer";
import { BrewStageRail } from "./brew-stage-rail";
import { BrewStepList } from "./brew-step-list";
import { BrewTransitionButton } from "./brew-transition-button";
import { useBrewDayProgress, type BrewDayProgressController } from "./use-brew-day-progress";

// Короткий одиночный сигнал по завершении таймера текущего шага (переживает то,
// что вкладка на переднем плане; серверный web-push — отдельная будущая фаза).
const beep = () => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    // Звук — best-effort; без него шаг всё равно виден как «готово».
  }
};

function CurrentStepHero({
  controller,
  brewdayGroups,
  brewBatchId,
  hasOg
}: {
  controller: BrewDayProgressController;
  brewdayGroups: BrewDayStageGroup[];
  brewBatchId: string;
  hasOg: boolean;
}) {
  const { progress, pending, now, patchStep } = controller;
  const cursor = resolveBrewDayCursor(brewdayGroups, progress, "brewday");
  const step = cursor.current;
  const lastDone = resolveLastDoneStep(brewdayGroups, progress, "brewday");
  const lastDoneBusy = lastDone ? Boolean(pending[lastDone.id]) : false;
  const beeped = useRef<Set<string>>(new Set());

  const isTimer = step?.kind === "timer" && step.durationSeconds != null;
  const state = step ? progress.steps[step.id] ?? { done: false, timerStartedAt: null } : null;
  const remaining = isTimer && now != null ? remainingSeconds(step!.durationSeconds, state?.timerStartedAt ?? null, now) : null;
  const timerRunning = isTimer && state?.timerStartedAt != null;
  const timerDone = remaining != null && remaining <= 0;
  const busy = step ? Boolean(pending[step.id]) : false;

  // Экран не гаснет, только пока реально идёт отсчёт активного шага — у котла телефон
  // не должен разряжаться зря, а таймер/сигнал завершения не должны пропадать из виду.
  useWakeLock(isTimer && timerRunning);

  useEffect(() => {
    if (step && timerDone && !beeped.current.has(step.id)) {
      beeped.current.add(step.id);
      beep();
    }
  }, [step, timerDone]);

  // Акт пройден (или план пуст) — герой уступает место переходу «на брожение»:
  // primary CTA живёт прямо в зелёной панели, а не отдельным виджетом ниже.
  if (!step) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success-subtle/60 p-5">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <p className="text-sm font-semibold">Варочный день пройден</p>
        </div>
        <p className="mt-1 text-sm text-success">Перелейте сусло в ферментер, внесите дрожжи и поставьте на брожение.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <BrewTransitionButton
            brewBatchId={brewBatchId}
            to="fermenting"
            label="Поставить на брожение"
            variant="primary"
            size="md"
            icon={<ArrowRight className="h-4 w-4" aria-hidden />}
            appendQueryOnSuccess="just-fermenting=1"
          />
          {lastDone ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => patchStep(lastDone.id, { done: false })}
              disabled={lastDoneBusy}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              Вернуть шаг
            </Button>
          ) : null}
        </div>
        {cursor.actComplete && !hasOg ? (
          <a href="#brew-journal" className="mt-2 inline-block text-xs text-warning-subtle-foreground underline-offset-2 hover:underline">
            Замерьте начальную плотность (OG) перед брожением
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Сейчас</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* line-clamp — длинное название шага не должно раздвигать герой и таймер на узких экранах. */}
          <h2 className="line-clamp-2 text-xl font-semibold text-foreground">{step.title}</h2>
          {step.detail ? <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p> : null}
        </div>

        {isTimer && timerRunning ? (
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-2xl font-semibold tabular-nums ${
                timerDone ? "bg-success-subtle text-success-subtle-foreground" : "bg-warning-subtle text-warning-subtle-foreground"
              }`}
            >
              <Timer className="h-5 w-5" aria-hidden />
              {now == null ? "—:—" : timerDone ? "готово" : fmtClock(remaining ?? 0)}
            </span>
            <button
              type="button"
              onClick={() => patchStep(step.id, { timerStartedAt: null })}
              disabled={busy}
              aria-label="Сбросить таймер"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50 before:absolute before:-inset-1 before:content-['']"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {/* Таймер ещё не запущен — крупная primary-кнопка «Начать шаг», читаемая как
          основное действие героя. Пока она не нажата, «Готово» ниже — outline, чтобы
          на экране была только одна primary-кнопка одновременно. */}
      {isTimer && !timerRunning ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => patchStep(step.id, { timerStartedAt: new Date().toISOString() })}
            disabled={busy}
          >
            <Play className="h-4 w-4" aria-hidden />
            Начать шаг{step.durationSeconds != null ? ` · ${fmtClock(step.durationSeconds)}` : ""}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {cursor.next ? (
          <p className="text-xs text-muted-foreground">
            Следом: <span className="text-foreground">{cursor.next.title}</span>
          </p>
        ) : <span />}
        <div className="flex items-center gap-2">
          {lastDone ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => patchStep(lastDone.id, { done: false })}
              disabled={lastDoneBusy}
              aria-label="Вернуть шаг"
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              Вернуть шаг
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isTimer && !timerRunning ? "outline" : "primary"}
            size="md"
            onClick={() => patchStep(step.id, { done: true })}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            Готово
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Акт «Варочный день» (статус brewing): герой с текущим шагом и таймером, лента
 * этапов, список шагов затора→охлаждения (текущий этап раскрыт), переход на
 * брожение. Шаги брожения/розлива в этом акте не показываются (следующий акт).
 */
export function BrewDayBoard({
  brewBatchId,
  groups,
  initialProgress,
  hasOg
}: {
  brewBatchId: string;
  groups: BrewDayStageGroup[];
  initialProgress: BrewDayProgress;
  hasOg: boolean;
}) {
  const controller = useBrewDayProgress(brewBatchId, initialProgress);
  const brewdayGroups = groupsForAct(groups, "brewday");
  const cursor = resolveBrewDayCursor(brewdayGroups, controller.progress, "brewday");
  const currentStage = cursor.current?.stage ?? null;

  const undone = cursor.total - cursor.doneCount;
  const transitionConfirm = !cursor.actComplete && undone > 0
    ? {
        title: "Поставить на брожение?",
        description: `Ещё ${undone} ${undone === 1 ? "шаг" : undone < 5 ? "шага" : "шагов"} варочного дня не отмечено. Всё равно перейти к брожению?`
      }
    : null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Варочный день</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{cursor.doneCount} / {cursor.total}</span>
      </div>

      <BrewStageRail groups={brewdayGroups} progress={controller.progress} currentStage={currentStage} />

      {controller.error ? <p role="alert" className="text-xs text-destructive">{controller.error}</p> : null}

      <CurrentStepHero controller={controller} brewdayGroups={brewdayGroups} brewBatchId={brewBatchId} hasOg={hasOg} />

      <BrewStepList groups={brewdayGroups} controller={controller} currentStage={currentStage} />

      {/* Пока в дне остались неотмеченные шаги — мягкий переход с подтверждением,
          последним элементом секции. Когда день пройден (или план пуст), CTA
          переезжает в зелёную панель героя выше — см. CurrentStepHero. */}
      {cursor.current ? (
        <BrewTransitionButton
          brewBatchId={brewBatchId}
          to="fermenting"
          label="Поставить на брожение"
          variant="outline"
          size="md"
          icon={<ArrowRight className="h-4 w-4" aria-hidden />}
          confirm={transitionConfirm}
          appendQueryOnSuccess="just-fermenting=1"
        />
      ) : null}
    </section>
  );
}
