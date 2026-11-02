"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, BellOff, Check, NotebookPen, Plus, Undo2, WifiOff } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogHeader } from "@nb/ui";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { useWakeLock } from "@/features/brew-controller/use-wake-lock";
import type { PreferredGravityUnit } from "@/features/system/gravity-units";
import { manualBrewPhases, resolveManualBrewFocus } from "../manual-brew";
import type { BrewDayProgress, BrewDayStageGroup, BrewDayStep } from "../contracts";
import { fmtClock, stepRemainingSeconds } from "./brew-day-timer";
import { BrewProcessPlan } from "./brew-process-plan";
import { BrewQuickDock } from "./brew-quick-dock";
import { BrewTransitionButton } from "./brew-transition-button";
import { ManualBrewStep } from "./manual-brew-step";
import { ManualBrewTransfer } from "./manual-brew-transfer";
import { useBrewDayProgress } from "./use-brew-day-progress";

export function BrewDayBoard({ brewBatchId, ownerId, groups, initialProgress, hasOg, calibration, records, notes,
  preferredGravityUnit = "plato", targetOgSg = null, initialFermenterL = null, fermentationLabel }: {
  brewBatchId: string; ownerId?: string; groups: BrewDayStageGroup[]; initialProgress: BrewDayProgress;
  hasOg: boolean; calibration?: React.ReactNode; records?: React.ReactNode; notes?: React.ReactNode;
  preferredGravityUnit?: PreferredGravityUnit; targetOgSg?: number | null; initialFermenterL?: number | null; fermentationLabel?: string;
}) {
  const controller = useBrewDayProgress(brewBatchId, initialProgress, ownerId);
  const { progress, now, patchStep } = controller;
  const phases = manualBrewPhases(groups);
  const focus = resolveManualBrewFocus(phases, progress, now);
  const step = focus.current;
  const [preview, setPreview] = useState<BrewDayStep | null>(null);
  const [panel, setPanel] = useState<"measure" | "note" | null>(null);
  const [earlyHop, setEarlyHop] = useState<BrewDayStep | null>(null);
  const [sound, setSound] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const signalled = useRef(new Set<string>());
  const soundKey = `nb:brew-sound:${ownerId ?? "local"}`;
  useEffect(() => { setPreview(null); setPanel(null); signalled.current.clear(); }, [brewBatchId]);
  useEffect(() => {
    try { setSound(localStorage.getItem(soundKey) !== "off"); } catch { /* Optional preference. */ }
    return () => { void audio.current?.close(); audio.current = null; };
  }, [soundKey]);
  const unlockAudio = () => {
    if (!sound) return;
    try { audio.current ??= new AudioContext(); void audio.current.resume().then(() => setAudioReady(audio.current?.state === "running")); } catch { /* Visual alerts remain available. */ }
  };
  const timerRunning = phases.some(phase => phase.steps.some(item => item.kind === "timer" && !progress.steps[item.id]?.done && progress.steps[item.id]?.timerStartedAt && (now == null || (stepRemainingSeconds(item, progress.steps[item.id], now) ?? 0) > 0)));
  useWakeLock(timerRunning);
  useEffect(() => {
    if (now == null) return;
    const due = phases.flatMap(phase => phase.steps).filter(item => {
      if (progress.steps[item.id]?.done) return false;
      if (item.id === focus.current?.id && item.stage === "whirlpool" && !progress.steps[item.id]?.timerStartedAt && focus.holdOrigin !== null) return true;
      if (item.boilSecondsBeforeEnd != null) return Boolean(focus.boil && progress.steps[focus.boil.id]?.timerStartedAt && !progress.steps[focus.boil.id]?.done && focus.boilRemaining != null && focus.boilRemaining <= item.boilSecondsBeforeEnd);
      return item.kind === "timer" && (stepRemainingSeconds(item, progress.steps[item.id], now) ?? Infinity) <= 0;
    });
    const keys = due.map(item => `${item.id}:${progress.steps[item.id]?.timerStartedAt ?? progress.steps["boil:timer"]?.timerStartedAt}:${progress.steps[item.id]?.timerDurationSeconds ?? ""}`);
    const newSignal = keys.some(key => !signalled.current.has(key));
    signalled.current = new Set(keys);
    if (!newSignal || !sound || !audioReady || audio.current?.state !== "running") return;
    try {
      const oscillator = audio.current.createOscillator(); const gain = audio.current.createGain();
      oscillator.frequency.value = 880; gain.gain.value = 0.08;
      oscillator.connect(gain).connect(audio.current.destination); oscillator.start(); oscillator.stop(audio.current.currentTime + 0.35);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Sound is best effort; the due action stays on screen. */ }
  }, [now, progress, sound, audioReady, focus.boilRemaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const boilRunning = focus.boil && progress.steps[focus.boil.id]?.timerStartedAt && !progress.steps[focus.boil.id]?.done;
  const activeTimerRemaining = step?.kind === "timer" && now !== null && progress.steps[step.id]?.timerStartedAt
    ? Math.max(...focus.companions.map(item => stepRemainingSeconds(item, progress.steps[item.id], now) ?? 0)) : null;
  const runningBar = boilRunning && (step?.id !== "boil:timer" || panel !== null || preview !== null) ? <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
    <span>До конца кипячения</span><strong className="shrink-0 tabular-nums">{focus.boilRemaining == null ? "—:—" : fmtClock(focus.boilRemaining)}</strong>
  </div> : activeTimerRemaining !== null && (panel !== null || preview !== null) ? <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm"><span>{step?.title}</span><strong className="tabular-nums">{fmtClock(activeTimerRemaining)}</strong></div> : null;
  const holdBar = focus.holdRemaining != null && step?.stage === "whirlpool" && !progress.steps[step.id]?.timerStartedAt ? <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm"><span>До конца выдержки</span><strong className="tabular-nums">{fmtClock(focus.holdRemaining)}</strong></div> : null;
  const transfer = progress.steps["brew:transfer"];
  const ogRecorded = hasOg || transfer?.gravitySg != null;
  const showPitch = step?.id === "brew:pitch" || !step;
  const previous = phases.flatMap(phase => phase.steps).reverse().filter(item => progress.steps[item.id]?.done).sort((a, b) => (Date.parse(progress.steps[b.id]?.completedAt ?? "") || 0) - (Date.parse(progress.steps[a.id]?.completedAt ?? "") || 0))[0];
  const busySync = controller.queuedCount > 0;
  const nextHolding = focus.next?.stage === "whirlpool" && progress.steps[focus.next.id]?.timerStartedAt;
  const sanitationShownEarlier = phases.some(phase => phase.id === "dip" && phase.steps.some(item => progress.steps[item.id]?.done || progress.steps[item.id]?.timerStartedAt));
  const unscheduled = phases.filter(phase => phase.unordered).flatMap(phase => phase.steps).filter(item => !progress.steps[item.id]?.done);

  return <section className="space-y-4" aria-label="Мастер ручной варки">
    <BrewProcessPlan phases={phases} progress={progress} current={step} phaseIndex={focus.phaseIndex} now={now}
      storageKey={`nb:brew-plan:${ownerId ?? "local"}:${brewBatchId}`} onPreview={item => setPreview(item.id === step?.id ? null : item)} />

    {controller.offline ? <div role="status" className="flex items-start gap-2 rounded-xl bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div><p className="font-medium">Нет связи</p><p className="text-xs">{controller.queuedCount ? `Изменения сохранены на устройстве. В очереди: ${controller.queuedCount}.` : "Можно продолжать варку: новые отметки сохраняются на устройстве."}</p></div>
    </div> : busySync ? <span role="status" className="sr-only">Отправляем сохранённые изменения</span> : null}
    {controller.error ? <div role="alert" className="space-y-2 rounded-xl bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground"><p>{controller.error}</p><Button type="button" size="sm" variant="outline" onClick={() => controller.retry()}>Повторить отправку</Button></div> : null}

    {runningBar}
    {holdBar}
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="manual-brew-current-step">
      {preview ? <>
        <p className="text-sm text-muted-foreground">Просмотр плана</p><h2 className="text-xl font-semibold">{preview.title}</h2>
        {preview.detail ? <p className="text-sm">{preview.detail}</p> : null}
        {preview.instructions ? <p className="text-sm">{preview.instructions}</p> : null}
        {progress.steps[preview.id]?.measurementValue != null ? <p className="text-sm">pH: {progress.steps[preview.id].measurementValue}</p> : null}
        {progress.steps[preview.id]?.done ? <p className="flex items-center gap-2 text-sm text-success"><Check className="h-4 w-4" aria-hidden />{progress.steps[preview.id]?.skipped ? "Пропущено" : "Выполнено"}</p> : null}
        <Button type="button" variant="primary" className="w-full" onClick={() => setPreview(null)}>Вернуться к варке</Button>
        {progress.steps[preview.id]?.done ? <Button type="button" variant="ghost" onClick={async () => { await patchStep(preview.id, { done: false, skipped: false }); setPreview(null); }}>Вернуть шаг</Button> : null}
        {!progress.steps[preview.id]?.done && (preview.id.startsWith("brew:other:") || preview.boilSecondsBeforeEnd != null && focus.phase?.id === "boil" && boilRunning) ? <Button type="button" variant="ghost" onClick={() => setEarlyHop(preview)}>Отметить внесение сейчас</Button> : null}
      </> : showPitch ? <>
        <h2 className="text-xl font-semibold">Внесите дрожжи</h2>
        <p className="text-sm">Внесите дрожжи по рецепту, закройте ферментер и установите гидрозатвор.</p>
        {!ogRecorded && !transfer?.skipped ? <div className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"><p>Начальная плотность не записана</p><Button type="button" variant="ghost" size="sm" onClick={() => setPanel("measure")}>Записать</Button></div> : null}
        {unscheduled.length ? <div className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"><p>В плане остались внесения хмеля без отметки.</p><Button type="button" variant="ghost" size="sm" onClick={() => setPreview(unscheduled[0])}>Проверить</Button></div> : null}
        <BrewTransitionButton brewBatchId={brewBatchId} to="fermenting" label="Поставить на брожение" variant="primary" size="md" className="[&_button]:w-full" disabled={busySync} icon={<ArrowRight className="h-4 w-4" aria-hidden />} appendQueryOnSuccess="just-fermenting=1" confirm={unscheduled.length ? { title: "Поставить на брожение?", description: "Некоторые внесения хмеля не отмечены. Перейти к брожению?" } : null} />
        {busySync ? <p className="text-xs text-muted-foreground">Перед переходом дождитесь отправки сохранённых шагов.</p> : null}
        {fermentationLabel ? <p className="border-t border-border pt-3 text-sm text-muted-foreground">{fermentationLabel}</p> : null}
        {calibration ? <div className="pt-2">{calibration}</div> : null}
      </> : step?.id === "brew:transfer" ? <>
        <h2 className="text-xl font-semibold">Перелейте сусло в ферментер</h2>
        <ManualBrewTransfer controller={controller} preferredGravityUnit={preferredGravityUnit} targetOgSg={targetOgSg} initialFermenterL={initialFermenterL} />
      </> : step ? <>
        {step.boilSecondsBeforeEnd != null && focus.boilRemaining != null ? <p className="text-sm text-success">{focus.boilRemaining < step.boilSecondsBeforeEnd - 5 ? `По плану — ${fmtClock(step.boilSecondsBeforeEnd - focus.boilRemaining)} назад` : "Пора внести"}</p> : null}
        <ManualBrewStep key={brewBatchId} step={step} companions={focus.companions} controller={controller} onInteract={unlockAudio} showSanitationReminder={!sanitationShownEarlier} />
        {focus.next ? <div className="space-y-1 border-t border-border pt-3"><p className="text-xs text-muted-foreground">Далее</p><p className="text-sm">{nextHolding ? focus.next.useType === "dip_hop" ? "Выдержка хмеля в ферментере" : "Выдержка на вирпуле" : `${focus.next.title}${focus.next.ingredientName && focus.next.amountLabel ? ` · ${focus.next.amountLabel}` : ""}`}</p>{focus.next.boilSecondsBeforeEnd != null && focus.boilRemaining != null ? <p className="text-xs tabular-nums text-muted-foreground">{!progress.steps["boil:timer"]?.done && focus.boilRemaining > focus.next.boilSecondsBeforeEnd ? `Через ${fmtClock(focus.boilRemaining - focus.next.boilSecondsBeforeEnd)}` : "Пора внести"}</p> : focus.nextUntilSeconds != null ? <p className="text-xs tabular-nums text-muted-foreground">{focus.nextUntilSeconds > 0 ? `Через ${fmtClock(focus.nextUntilSeconds)}` : "Пора внести"}</p> : null}</div> : null}
      </> : null}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2">
      {previous && !preview ? <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(previous)}><Undo2 className="h-4 w-4" aria-hidden />Вернуть шаг</Button> : <span />}
      <Button type="button" variant="ghost" size="sm" aria-pressed={sound && audioReady} onClick={() => {
        const enabled = !(sound && audioReady); setSound(enabled);
        try { localStorage.setItem(soundKey, enabled ? "on" : "off"); if (enabled) { audio.current ??= new AudioContext(); void audio.current.resume().then(() => { setAudioReady(audio.current?.state === "running"); signalled.current.clear(); }); } } catch { /* Visual alerts remain available. */ }
      }}>{sound && audioReady ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}{sound && audioReady ? "Звук включён" : "Включить звук"}</Button>
    </div>
    <div className="hidden gap-2 lg:flex"><Button type="button" variant="outline" onClick={() => setPanel("measure")}><Plus className="h-4 w-4" aria-hidden />Замер</Button><Button type="button" variant="outline" onClick={() => setPanel("note")}><NotebookPen className="h-4 w-4" aria-hidden />Заметка</Button></div>
    <BrewQuickDock onMeasure={() => setPanel("measure")} onNote={() => setPanel("note")} />
    <Dialog open={panel !== null} onOpenChange={value => { if (!value) setPanel(null); }} title={panel === "measure" ? "Замеры" : "Заметки о варке"} hideTitle size="lg">
      <DialogHeader><h2 className="text-base font-semibold">{panel === "measure" ? "Замеры" : "Заметки о варке"}</h2><DialogCloseButton /></DialogHeader>
      <div className="space-y-4 p-4">{runningBar}{panel === "measure" ? records ?? <p className="text-sm">Журнал замеров доступен ниже на странице.</p> : notes ?? <p className="text-sm">Заметки доступны ниже на странице.</p>}</div>
    </Dialog>
    <ConfirmActionDialog open={earlyHop !== null} title={earlyHop?.id.startsWith("brew:other:") ? "Отметить внесение?" : "Отметить внесение раньше?"} description="Будет записано фактическое время внесения. Текущие таймеры продолжат идти." confirmLabel="Хмель внесён" tone="primary" onClose={() => setEarlyHop(null)} onConfirm={async () => { if (!earlyHop) return; await patchStep(earlyHop.id, { done: true }); setEarlyHop(null); setPreview(null); }} />
  </section>;
}
