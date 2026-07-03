"use client";

import React, { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@nb/ui";
import { updateBrewBatchNotesAction } from "@/app/(app)/app/brew-batches/[id]/actions";

export function BrewNotes({
  brewBatchId,
  notes,
  completed = false
}: {
  brewBatchId: string;
  notes: string | null;
  /** Варка завершена — заголовок секции контекстно смещается на дегустацию. */
  completed?: boolean;
}) {
  const [value, setValue] = useState(notes ?? "");
  // React 18: useTransition.isPending не держится на await — явный busy + guard.
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

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
      const result = await updateBrewBatchNotesAction(brewBatchId, value.trim() || null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section id="brew-notes" className="space-y-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">{completed ? "Дегустационные заметки" : "Заметки"}</h2>
      <textarea
        value={value}
        onChange={(event) => { setValue(event.target.value); setSaved(false); }}
        disabled={busy}
        rows={4}
        placeholder="Наблюдения по варке: температура брожения, отклонения, дегустация…"
        className="w-full resize-y rounded-lg border border-zinc-200 p-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Сохранить
        </Button>
        {saved && !dirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3.5 w-3.5" aria-hidden /> Сохранено
          </span>
        ) : null}
        {error ? <span role="alert" className="text-xs text-rose-600">{error}</span> : null}
      </div>
    </section>
  );
}
