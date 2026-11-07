"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@nb/ui";
import {
  updateBrewBatchNotesAction,
  updateBrewBatchTastingNotesAction
} from "@/app/(app)/app/brew-batches/[id]/actions";
import { useOfflineBrew } from "../offline/context";

/** Какое поле партии ведёт секция: заметки о варке или дегустация. */
export type BrewNotesKind = "brew" | "tasting";

// Два РАЗНЫХ поля партии, а не одна колонка под двумя заголовками: заметки о
// варке ведутся с подготовки, дегустация — когда пиво готово. Раньше заголовок
// секции на завершённой партии просто переключался на «Дегустационные заметки»,
// и дегустация затирала журнал варочного дня (одна колонка notes).
// ⚠ id секции brew-notes — якорь мобильного дока (brew-quick-dock.tsx), не менять.
const NOTE_SECTIONS: Record<BrewNotesKind, {
  id: string;
  title: string;
  placeholder: string;
  save: (brewBatchId: string, value: string | null) => Promise<{ ok: boolean; message: string }>;
}> = {
  brew: {
    id: "brew-notes",
    title: "Заметки о варке",
    placeholder: "Что учесть при следующей варке",
    save: updateBrewBatchNotesAction
  },
  tasting: {
    id: "tasting-notes",
    title: "Дегустация",
    placeholder: "Аромат, вкус, тело, карбонизация",
    save: updateBrewBatchTastingNotesAction
  }
};

export function BrewNotes({
  brewBatchId,
  kind,
  notes: serverNotes
}: {
  brewBatchId: string;
  kind: BrewNotesKind;
  /** Значение соответствующего поля партии: batch.notes или batch.tastingNotes. */
  notes: string | null;
}) {
  const section = NOTE_SECTIONS[kind];
  const store = useOfflineBrew(brewBatchId);
  const offline = kind === "brew" ? store : null;
  const notes = offline?.snapshot ? offline.snapshot.notes : serverNotes;
  const [value, setValue] = useState(notes ?? "");
  // React 18: useTransition.isPending не держится на await — явный busy + guard.
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const edited = useRef(false);

  useEffect(() => {
    if (!edited.current) setValue(notes ?? "");
  }, [notes]);

  const dirty = value.trim() !== (notes ?? "").trim();

  const save = async () => {
    if (inFlight.current || !dirty) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = value.trim() || null;
      const result = offline ? await offline.save({ kind: "notes", notes: next }) : await section.save(brewBatchId, next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      edited.current = false;
      setSaved(true);
    } catch {
      setError("Не удалось сохранить заметку. Попробуйте ещё раз.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section id={section.id} className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
      <textarea
        value={value}
        onChange={(event) => { edited.current = true; setValue(event.target.value); setSaved(false); }}
        disabled={busy}
        rows={4}
        placeholder={section.placeholder}
        className="w-full resize-y rounded-lg border border-border p-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm [@media(pointer:coarse)]:text-base"
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Сохранить
        </Button>
        {saved && !dirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" aria-hidden /> {offline && offline.record?.queue.length ? "Сохранено на устройстве" : "Сохранено"}
          </span>
        ) : null}
        {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
      </div>
    </section>
  );
}
