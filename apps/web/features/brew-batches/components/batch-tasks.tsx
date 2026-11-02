"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@nb/ui";
import { addBatchTaskAction, changeBatchTaskAction } from "@/app/(app)/app/brew-batches/[id]/records-actions";
import { localDateKey, type BatchTaskDto, type OverviewTaskDto } from "../records";

const field = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm";
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export function BatchTasks({ brewBatchId, tasks: initial, overview = false }: { brewBatchId?: string; tasks: (BatchTaskDto | OverviewTaskDto)[]; overview?: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial), [today, setToday] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false), [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState(""), [date, setDate] = useState(""), [time, setTime] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => setTasks(initial), [initial]);
  useEffect(() => {
    const update = () => setToday(localDateKey(new Date())); update();
    const timer = setInterval(update, 60_000); return () => clearInterval(timer);
  }, []);
  const perform = async (work: () => Promise<{ ok: boolean; message: string }>, done?: () => void) => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError("");
    try { const result = await work(); if (!result.ok) { setError(result.message); return false; } done?.(); router.refresh(); return true; }
    catch { setError("Не удалось сохранить задачу."); return false; } finally { inFlight.current = false; setBusy(false); }
  };
  const visible = overview ? tasks.filter(task => today && (task.dueDate === today || (task.dueDate < today && !task.completedAt))) : tasks;
  if (overview && !visible.length) return null;
  const openForm = (task?: BatchTaskDto) => {
    setEditing(task?.id ?? null); setTitle(task?.title ?? ""); setDate(task?.dueDate ?? localDateKey(new Date())); setTime(task?.dueTime ?? ""); setError(""); setFormOpen(true);
  };
  return <section id={overview ? "today-tasks" : "batch-tasks"} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{overview ? "На сегодня" : "Задачи"}</h2>{!overview ? <Button type="button" variant="outline" size="sm" onClick={() => openForm()} disabled={busy}>Добавить задачу</Button> : null}</div>
    {!visible.length && !formOpen ? <p className="text-sm text-muted-foreground">Задач пока нет.</p> : null}
    <ul className="divide-y divide-border">{visible.map(task => <li key={task.id} className="flex items-start gap-3 py-3">
      <label className="flex h-7 w-7 shrink-0 items-center justify-center"><input type="checkbox" className="h-4 w-4 accent-foreground" checked={Boolean(task.completedAt)} disabled={busy} aria-label={`Выполнено: ${task.title}`} onChange={e => {
        if (inFlight.current) return;
        const completed = e.target.checked, previous = task.completedAt;
        setTasks(old => old.map(t => t.id === task.id ? { ...t, completedAt: completed ? new Date() : null } : t));
        void perform(() => changeBatchTaskAction(task.brewBatchId, task.id, { kind: "complete", completed })).then(ok => {
          if (!ok) setTasks(old => old.map(t => t.id === task.id ? { ...t, completedAt: previous } : t));
        });
      }} /></label>
      <div className="min-w-0 flex-1">
        {overview ? <Link href={`/app/brew-batches/${task.brewBatchId}#batch-tasks`} className={`block break-words text-sm font-medium hover:underline ${task.completedAt ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</Link> : <p className={`break-words text-sm font-medium ${task.completedAt ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</p>}
        <p className={`mt-1 text-xs ${today && task.dueDate < today && !task.completedAt ? "text-warning-subtle-foreground" : "text-muted-foreground"}`}>
          {today && task.dueDate < today && !task.completedAt ? "Просрочено · " : ""}{task.dueDate === today ? "Сегодня" : dateLabel(task.dueDate)}{task.dueTime ? ` · ${task.dueTime}` : ""}{"batchTitle" in task ? ` · ${task.batchTitle}` : ""}
        </p>
      </div>
      {!overview ? <div className="flex shrink-0 items-center gap-1"><Button type="button" variant="ghost" size="sm" aria-label={`Изменить: ${task.title}`} onClick={() => openForm(task)} disabled={busy}><Pencil className="h-4 w-4" aria-hidden /></Button><Button type="button" variant="ghost" size="sm" aria-label={`Удалить: ${task.title}`} disabled={busy} onClick={() => void perform(() => changeBatchTaskAction(task.brewBatchId, task.id, { kind: "remove" }), () => setTasks(old => old.filter(t => t.id !== task.id)))}><Trash2 className="h-4 w-4" aria-hidden /></Button></div> : null}
    </li>)}</ul>
    {formOpen && !overview && brewBatchId ? <form className="space-y-3 border-t border-border pt-3" onSubmit={event => {
      event.preventDefault();
      const input = { title, dueDate: date, dueTime: time || null };
      void perform(() => editing ? changeBatchTaskAction(brewBatchId, editing, { kind: "edit", input }) : addBatchTaskAction(brewBatchId, input), () => setFormOpen(false));
    }}>
      <label className="block text-sm">Что сделать<input autoFocus className={`${field} mt-1`} value={title} maxLength={160} onChange={e => setTitle(e.target.value)} required disabled={busy} /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block min-w-0 text-sm">Дата<input type="date" className={`${field} mt-1`} value={date} onChange={e => setDate(e.target.value)} required disabled={busy} /></label><label className="block min-w-0 text-sm">Время<input type="time" className={`${field} mt-1`} value={time} onChange={e => setTime(e.target.value)} disabled={busy} /></label></div>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={busy}>Отмена</Button><Button type="submit" size="sm" disabled={busy}>{busy ? "Сохранение…" : editing ? "Сохранить" : "Добавить"}</Button></div>
    </form> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}
