"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { NumericInput } from "@/components/shared/numeric-input";
import type { BrewDayStep } from "../contracts";
import { manualStepAction } from "../manual-brew";
import { fmtClock, stepRemainingSeconds } from "./brew-day-timer";
import type { BrewDayProgressController, BrewDayStepPatch } from "./use-brew-day-progress";

const minutesLabel = (seconds: number) => `${Number((seconds / 60).toFixed(1)).toLocaleString("ru-RU")} мин`;

export function ManualBrewStep({ step, companions, controller, onInteract, showSanitationReminder = true }: {
  step: BrewDayStep; companions: BrewDayStep[]; controller: BrewDayProgressController; onInteract: () => void;
  showSanitationReminder?: boolean;
}) {
  const state = controller.progress.steps[step.id];
  const peers = companions.length ? companions : [step];
  const busy = peers.some(peer => controller.pending[peer.id]);
  const running = Boolean(state?.timerStartedAt);
  const duration = state?.timerDurationSeconds ?? step.durationSeconds;
  const remaining = controller.now != null ? Math.max(...peers.map(peer => stepRemainingSeconds(peer, controller.progress.steps[peer.id], controller.now!) ?? -Infinity)) : null;
  const [confirm, setConfirm] = useState<"early" | "reset" | "skip" | null>(null);
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ph, setPh] = useState(state?.measurementValue == null ? "" : String(state.measurementValue));
  const editPeers = useRef<BrewDayStep[] | null>(null);
  const confirmPeers = useRef<BrewDayStep[] | null>(null);
  useEffect(() => {
    if (step.id === "mash:ph-check" && state?.measurementValue != null) setPh(String(state.measurementValue));
  }, [step.id, state?.measurementValue]);
  const isAddition = Boolean(step.ingredientName);
  const isHop = step.ingredientCategory === "hop";
  const isStand = step.stage === "whirlpool" && step.kind === "timer";
  const items = peers.flatMap(peer => (peer.items ?? []).map(item => ({ ...item, stepId: peer.id })));
  const waterTitle = items.some(item => item.id.endsWith(":acid"))
    ? items.length > 1 ? "Внесите соли и кислоту" : "Внесите кислоту в воду"
    : "Внесите соли в воду";
  const update = async (patch: BrewDayStepPatch, targets = peers) => {
    onInteract();
    // Different step IDs are merged under the server's row lock. All optimistic marks appear together.
    await Promise.all(targets.map(peer => controller.patchStep(peer.id, patch)));
  };
  const complete = async (targets = peers) => { setConfirm(null); confirmPeers.current = null; await update({ done: true, skipped: false }, targets); };
  const start = (targets = peers) => update({ timerStartedAt: new Date().toISOString(), done: false }, targets);
  const ask = (action: "early" | "reset" | "skip") => { confirmPeers.current = peers; setConfirm(action); };
  const confirmationRemaining = confirmPeers.current && controller.now != null ? Math.max(...confirmPeers.current.map(peer => stepRemainingSeconds(peer, controller.progress.steps[peer.id], controller.now!) ?? 0)) : remaining;
  const confirmationDuration = confirmPeers.current?.[0] ? controller.progress.steps[confirmPeers.current[0].id]?.timerDurationSeconds ?? confirmPeers.current[0].durationSeconds : duration;
  const adjust = async (remainingSeconds: number, targets = editPeers.current ?? peers) => {
    const targetState = controller.progress.steps[targets[0].id];
    if (!targetState?.timerStartedAt) return;
    const totals = targets.map(peer => ({ peer, total: Math.round(Math.max(0, ((controller.now ?? Date.now()) - Date.parse(controller.progress.steps[peer.id]?.timerStartedAt ?? targetState.timerStartedAt!)) / 1000) + remainingSeconds) }));
    if (totals.some(item => item.total > 86400)) { setError("Таймер можно продлить максимум до 24 часов."); return; }
    setEditing(false);
    editPeers.current = null;
    await Promise.all(totals.map(({ peer, total }) => controller.patchStep(peer.id, { timerDurationSeconds: total })));
  };

  if (step.id === "mash:ph-check") return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    const value = Number(ph.replace(",", "."));
    if (!ph.trim() || !Number.isFinite(value) || value < 0 || value > 14) { setError("Введите pH от 0 до 14."); return; }
    await controller.patchStep(step.id, { done: true, skipped: false, measurementValue: value });
  }}>
    <h2 className="text-xl font-semibold">Измерьте pH затора</h2>
    {step.detail ? <p className="text-sm text-muted-foreground">{step.detail.replace("цель", "По рецепту:")}</p> : null}
    <label className="block text-sm">pH<NumericInput value={ph} onChange={event => { setPh(event.target.value); setError(null); }} min={0} max={14} step={0.1} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" /></label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" variant="primary" className="w-full" disabled={busy}>Сохранить и продолжить</Button>
    <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => controller.patchStep(step.id, { done: true, skipped: true, measurementValue: null })}>Пропустить</Button>
  </form>;

  return <>
    <div className="space-y-4">
      {isAddition && isStand && !running ? <p className="text-sm text-muted-foreground">{step.useType === "dip_hop" ? "Дип-хоппинг" : "Вирпул"}</p> : null}
      <h2 className="break-words text-xl font-semibold">{isStand && running ? step.useType === "dip_hop" ? "Выдержка хмеля в ферментере" : "Выдержка на вирпуле" : items.length ? step.id === "mash:sparge-water" ? step.title : waterTitle : peers.length > 1 ? peers.every(peer => peer.ingredientCategory === "hop") ? "Внесите хмель" : "Внесите добавки" : step.title}</h2>
      {isAddition && !running ? <div className="space-y-3">
        {peers.map(peer => <div key={peer.id} className="space-y-1">
          {peers.length > 1 ? <p className="font-medium">{peer.ingredientName}</p> : null}
          {peer.amountLabel ? <p className={peers.length === 1 ? "text-3xl font-semibold tabular-nums" : "text-lg font-semibold tabular-nums"}>{peer.amountLabel}</p> : null}
        </div>)}
        {step.temperatureC != null ? <p className="text-sm">{step.temperatureC.toLocaleString("ru-RU")} °C{duration != null ? ` · ${minutesLabel(duration)}` : ""}</p> : duration != null ? <p className="text-sm">{minutesLabel(duration)}</p> : null}
        {step.instructions ? <p className="text-sm">{step.instructions}</p> : step.stage === "whirlpool" && step.temperatureC != null ? <p className="text-sm text-muted-foreground">Доведите сусло до указанной температуры перед внесением.</p> : null}
      </div> : null}

      {items.length ? <div className="space-y-1">
        {items.map(item => <label key={item.id} className="flex min-h-11 items-center gap-3 border-b border-border py-2 text-sm last:border-0">
          {items.length > 1 ? <input type="checkbox" className="h-5 w-5 shrink-0 accent-success" checked={controller.progress.steps[item.stepId]?.checkedItems?.includes(item.id) ?? false}
            onChange={event => {
              const checked = controller.progress.steps[item.stepId]?.checkedItems ?? [];
              void controller.patchStep(item.stepId, { checkedItems: event.target.checked ? [...checked.filter(id => id !== item.id), item.id] : checked.filter(id => id !== item.id) });
            }} /> : null}
          <span className="min-w-0 flex-1">{item.label}</span><strong className="shrink-0 font-medium tabular-nums">{item.amount}</strong>
        </label>)}
      </div> : null}

      {!isAddition && !items.length && step.kind !== "timer" ? <>
        {step.detail ? <p className={`${["mash:dough-in", "chill:target"].includes(step.id) ? "text-3xl font-semibold" : "text-base"} tabular-nums`}>{step.detail}</p> : null}
        {step.instructions ? <p className="text-sm">{step.instructions}</p> : null}
      </> : null}
      {showSanitationReminder && (step.id === "chill:target" || step.useType === "dip_hop" && !running) ? <p className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">{step.id === "chill:target" ? "Пока сусло остывает, продезинфицируйте ферментер, крышку и гидрозатвор, если ещё не сделали." : "Перед внесением продезинфицируйте ферментер, крышку и гидрозатвор, если ещё не сделали."}</p> : null}

      {step.kind === "timer" ? <>
        {running ? <>
          <p className="text-xs text-muted-foreground">Осталось</p>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={`text-4xl font-semibold tabular-nums ${remaining != null && remaining <= 0 ? "text-success" : "text-foreground"}`} role="timer">{remaining == null ? "—:—" : fmtClock(remaining)}</span>
            {step.temperatureC != null ? <span className="text-sm">{step.temperatureC} °C</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => adjust(Math.max(0, remaining ?? 0) + 300, peers)}>+5 мин</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { editPeers.current = peers; setMinutes(String(Math.ceil(Math.max(0, remaining ?? 0) / 60))); setEditing(true); setError(null); }}>Изменить время</Button>
          </div>
          <Button type="button" className="w-full" variant={remaining != null && remaining <= 0 ? "primary" : "ghost"} onClick={() => remaining != null && remaining <= 0 ? complete() : ask("early")}>{step.id === "boil:timer" ? "Завершить кипячение" : "Завершить паузу"}{remaining != null && remaining > 0 ? " раньше" : ""}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => ask("reset")}>Начать таймер заново</Button>
        </> : <>
          {!isAddition && step.detail ? <p className="text-lg font-medium">{step.detail}</p> : null}
          {!isAddition ? <p className="text-sm text-muted-foreground">{step.id === "boil:timer" ? "Когда сусло закипит, запустите таймер." : step.temperatureC != null ? `Когда затор нагреется до ${step.temperatureC} °C, запустите таймер.` : "Запустите таймер в начале паузы."}</p> : null}
          <Button type="button" variant="primary" className="w-full" disabled={busy} onClick={() => start()}>{isStand ? "Хмель внесён · начать выдержку" : `Начать шаг${duration != null ? ` · ${minutesLabel(duration)}` : ""}`}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => ask("skip")}>Завершить без таймера</Button>
        </>}
      </> : <Button type="button" variant="primary" className="w-full" disabled={busy && !items.length} onClick={() => complete()}>{items.length > 1 ? "Далее" : items.length === 1 ? "Добавка внесена" : manualStepAction(step)}</Button>}
    </div>

    <ConfirmActionDialog open={confirm !== null} title={confirm === "reset" ? "Начать отсчёт заново?" : confirm === "skip" ? "Завершить без таймера?" : "Завершить раньше?"}
      description={confirm === "reset" ? `Таймер снова начнёт отсчёт ${confirmationDuration != null ? minutesLabel(confirmationDuration) : "времени паузы"}.` : confirm === "skip" ? "Шаг будет отмечен выполненным." : `Осталось ${fmtClock(confirmationRemaining ?? 0)}. Подтвердите завершение шага.`}
      confirmLabel={confirm === "reset" ? "Начать заново" : "Завершить шаг"} tone="primary" pending={busy && !running}
      onClose={() => { setConfirm(null); confirmPeers.current = null; }} onConfirm={async () => {
        const targets = confirmPeers.current ?? peers;
        if (confirm === "reset") { setConfirm(null); confirmPeers.current = null; await start(targets); } else await complete(targets);
      }} />
    <Dialog open={editing} onOpenChange={value => { setEditing(value); if (!value) editPeers.current = null; }} title="Изменить время" hideTitle size="sm">
      <DialogHeader><h2 className="text-base font-semibold">Изменить время</h2><DialogCloseButton /></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); const value = Number(minutes.replace(",", ".")); if (!minutes.trim() || !Number.isFinite(value) || value < 0 || value > 1440) { setError("Введите от 0 до 1440 минут."); return; } void adjust(value * 60); }}>
        <div className="space-y-3 p-5"><label className="block text-sm">Осталось минут<NumericInput value={minutes} onChange={event => setMinutes(event.target.value)} min={0} max={1440} step={1} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" /></label>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(false)}>Отмена</Button><Button type="submit" variant="primary">Сохранить</Button></DialogFooter>
      </form>
    </Dialog>
  </>;
}
