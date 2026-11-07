"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@nb/ui";

import { formatGravity } from "@/features/system/gravity-units";
import { summarizeBrewDayPlan } from "../brew-day";
import { BrewDayBoard } from "../components/brew-day-board";
import { BrewJournal } from "../components/brew-journal";
import { BrewNotes } from "../components/brew-notes";
import { BrewPrepCard } from "../components/brew-prep-card";
import { BatchVolumes } from "../components/batch-volumes";
import { FermentationBoard } from "../components/fermentation-board";
import { brewBatchStatusLabels } from "../contracts";
import { buildManualBrewSteps } from "../manual-brew";
import { summarizeBrewMeasurements } from "../measurements";
import { volumeLabels } from "../records";
import { OfflineBrewContext, useOfflineBrewStore, type OfflineBrewStore } from "./context";
import { canApplyOfflineBrew, readOfflineMeasurements, supportsOfflineBrew, type OfflineBrewCommand, type OfflineBrewSnapshot } from "./model";

function useOfflineShellReady() {
  const [ready, setReady] = useState<"checking" | "ready" | "unavailable">("checking");
  useEffect(() => {
    const workers = navigator.serviceWorker;
    if (!workers) { setReady("unavailable"); return; }
    let port: MessagePort | undefined;
    const check = () => {
      port?.close();
      if (!workers.controller) return;
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = event => {
        setReady(event.data === true ? "ready" : "unavailable");
        channel.port1.close();
      };
      workers.controller.postMessage({ type: "NB_OFFLINE_BREW_READY" }, [channel.port2]);
    };
    check();
    const timeout = window.setTimeout(() => setReady(current => current === "checking" ? "unavailable" : current), 12_000);
    workers.addEventListener("controllerchange", check);
    return () => {
      port?.close();
      window.clearTimeout(timeout);
      workers.removeEventListener("controllerchange", check);
    };
  }, []);
  return ready;
}

function describeChange(snapshot: OfflineBrewSnapshot, command: OfflineBrewCommand): string {
  switch (command.kind) {
    case "notes": return snapshot.notes || "Нет заметки";
    case "volumes": return Object.keys(command.patch).map(field => {
      const key = field as keyof typeof volumeLabels;
      return `${volumeLabels[key]} — ${snapshot.volumes[key] ?? "—"} л`;
    }).join("\n");
    case "transition": return brewBatchStatusLabels[snapshot.status];
    case "final-measurement": {
      const row = snapshot.measurements.find(measurement => measurement.isFinal);
      return row ? formatGravity(row.gravitySg, snapshot.unit) : "FG не выбрана";
    }
    case "delete-measurement":
    case "add-measurement": {
      const row = snapshot.measurements.find(measurement => measurement.id === command.id);
      return row ? `${formatGravity(row.gravitySg, snapshot.unit)}${row.isFinal ? " · итоговая FG" : ""}` : "Замер отсутствует";
    }
    case "transfer":
    case "step": {
      const step = snapshot.progress.steps[command.kind === "step" ? command.stepId : "brew:transfer"];
      if (!step) return "Шаг не начат";
      return [
        step.skipped ? "Шаг пропущен" : step.done ? "Шаг выполнен" : "Шаг не завершён",
        step.timerStartedAt ? `Таймер запущен в ${new Date(step.timerStartedAt).toLocaleTimeString("ru-RU")}` : null,
        step.timerDurationSeconds != null ? `Длительность ${step.timerDurationSeconds} с` : null,
        step.measurementValue != null ? `pH ${step.measurementValue}` : null,
        step.gravitySg != null ? formatGravity(step.gravitySg, snapshot.unit) : null,
        command.kind === "transfer" && snapshot.volumes.fermenterL != null ? `${snapshot.volumes.fermenterL} л` : null
      ].filter(Boolean).join("\n");
    }
  }
}

function OfflineBrewStatus({ store, ready }: { store: OfflineBrewStore; ready: ReturnType<typeof useOfflineShellReady> }) {
  const { record, snapshot, network } = store;
  const count = record?.queue.length ?? 0;
  const block = record?.block;
  const command = record?.queue[0]?.command;
  const server = block?.snapshot;
  const label = network === "auth" ? "Войдите в свой аккаунт для синхронизации"
    : network === "offline" ? "Нет связи. Варка сохраняется на устройстве."
    : network === "sending" ? "Синхронизация варки…"
    : count ? "Изменения сохранены на устройстве"
    : ready === "ready" ? "Доступно без интернета"
    : ready === "unavailable" ? "Варка сохранена на устройстве. Для работы без сети оставьте экран открытым."
    : "Варка сохранена на устройстве. Готовим экран для работы без сети…";
  return <section className="space-y-3 rounded-xl border border-border bg-card p-3 text-sm" aria-label="Сохранение варки">
    <p role="status">{label}{count > 0 ? ` · В очереди: ${count}` : ""}</p>
    {store.storageError ? <p role="alert" className="text-destructive">{store.storageError}</p> : null}
    {block ? <div className="space-y-3">
      <p role="alert" className="text-destructive">{block.message}</p>
      {server && command && snapshot ? <>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><dt className="font-medium">На устройстве</dt><dd className="whitespace-pre-wrap break-words">{describeChange(snapshot, command)}</dd></div>
          <div className="min-w-0"><dt className="font-medium">На сервере</dt><dd className="whitespace-pre-wrap break-words">{describeChange(server, command)}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void store.resolve(false)}>Принять с сервера</Button>
          {canApplyOfflineBrew(server, command) ? <Button type="button" size="sm" onClick={() => void store.resolve(true)}>Оставить моё</Button> : null}
        </div>
      </> : null}
    </div> : null}
    {count || block || network === "auth" ? <div className="flex flex-wrap items-center gap-2">
      {network === "auth" && snapshot ? <a className="text-primary underline" href={`/login?next=${encodeURIComponent(`/app/brew-batches/${snapshot.batchId}`)}`}>Войти</a> : null}
      {!server ? <Button type="button" variant="outline" size="sm" disabled={network === "sending"} onClick={() => void store.retry()}>Повторить отправку</Button> : null}
      {record ? <Button type="button" variant="ghost" size="sm" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ snapshot, queue: record.queue }, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `brew-${record.batchId}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Скачать локальные записи</Button> : null}
    </div> : null}
  </section>;
}

function OfflineBrewView({ snapshot }: { snapshot: OfflineBrewSnapshot }) {
  const { batchId, ownerId, plan, unit, progress, volumes, status } = snapshot;
  if (!supportsOfflineBrew(snapshot)) return <p>Откройте партию с интернетом, чтобы продолжить на её текущем этапе.</p>;
  const groups = buildManualBrewSteps(plan);
  const measurements = readOfflineMeasurements(snapshot);
  const summary = summarizeBrewMeasurements(measurements, snapshot.target);
  const journal = <BrewJournal brewBatchId={batchId} measurements={measurements} summary={summary} preferredGravityUnit={unit}
    measurementKind={status === "fermenting" ? "fg" : "og"} title={status === "fermenting" ? "Конечная плотность (FG)" : "Начальная плотность"} />;
  const volumePanel = <BatchVolumes brewBatchId={batchId} volumes={volumes} stage={status === "fermenting" ? "bottling" : "brew"} />;
  const notes = <BrewNotes brewBatchId={batchId} kind="brew" notes={snapshot.notes} />;
  return <div className="space-y-5">
    <header>
      <h1 className="break-words text-2xl font-semibold">{snapshot.title}</h1>
      <p className="text-sm text-muted-foreground">{brewBatchStatusLabels[status]}</p>
    </header>
    {status === "planned" ? <>
      <BrewPrepCard brewBatchId={batchId} planSummary={summarizeBrewDayPlan(groups)}
        ogTargetLabel={snapshot.target?.og == null ? null : formatGravity(snapshot.target.og, unit)}
        plannedForIso={snapshot.plannedFor} equipmentWarnings={plan.equipmentWarnings} groups={groups} snapshot={plan} showDateEditor={false} />
      {notes}
    </> : status === "brewing" ? <BrewDayBoard brewBatchId={batchId} ownerId={ownerId} groups={groups} initialProgress={progress}
      hasOg={summary.og !== null} preferredGravityUnit={unit} targetOgSg={snapshot.target?.og} initialFermenterL={volumes.fermenterL}
      records={<>{volumePanel}{journal}</>} notes={notes} /> : <>
      <FermentationBoard brewBatchId={batchId} ownerId={ownerId} groups={groups} initialProgress={progress}
        dayLabel={null} fermentDayN={null} plannedDays={null} targetTempLabel={null} nudge={null} showCompletion={false} />
      {volumePanel}{journal}{notes}
    </>}
  </div>;
}

export function OfflineBrewSession({ ownerId, batchId, initial, children }: {
  ownerId: string;
  batchId: string;
  initial?: OfflineBrewSnapshot;
  children?: ReactNode;
}) {
  const store = useOfflineBrewStore(ownerId, batchId, initial);
  const router = useRouter();
  const ready = useOfflineShellReady();
  const refreshedStatus = useRef<string>();
  const snapshot = store.snapshot;
  const showLocal = !initial || snapshot?.status !== initial.status || Boolean(snapshot?.deviceId);

  useEffect(() => {
    const confirmed = store.record?.snapshot.status;
    if (!initial || !confirmed || store.record?.queue.length || store.record?.block || store.network !== "online") return;
    if (confirmed === initial.status) { refreshedStatus.current = undefined; return; }
    if (refreshedStatus.current === confirmed) return;
    refreshedStatus.current = confirmed;
    if (confirmed === "fermenting" && initial.status === "brewing") router.replace(`/app/brew-batches/${batchId}?just-fermenting=1`, { scroll: false });
    else router.refresh();
  }, [initial, store.record, store.network, batchId, router]);

  if (store.initialError) return <><p role="status" className="text-sm text-muted-foreground">{store.initialError}</p>{children}</>;
  return <OfflineBrewContext.Provider value={store}>
    <div className="space-y-5">
      {store.record ? <OfflineBrewStatus store={store} ready={ready} /> : <p role="status" className="text-sm text-muted-foreground">Сохраняем варку на устройстве…</p>}
      {showLocal ? snapshot && <OfflineBrewView snapshot={snapshot} /> : children}
    </div>
  </OfflineBrewContext.Provider>;
}
