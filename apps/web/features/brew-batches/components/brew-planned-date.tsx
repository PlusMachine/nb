"use client";

import React, { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

import { useToast } from "@nb/ui";
import { setBrewBatchPlannedForAction } from "@/app/(app)/app/brew-batches/[id]/actions";

// ISO-момент (хранится «локальный полдень», см. brew-picker-dialog.tsx) →
// yyyy-MM-dd в ТЕКУЩЕЙ таймзоне браузера, для value input[type=date].
const toLocalDateInputValue = (iso: string | null): string => {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Минимум для input[type=date] — прошлые даты не предлагаем, как и в диалоге «Сварить».
const todayLocalDate = (): string => toLocalDateInputValue(new Date().toISOString());

/**
 * Дата варки в акте «Подготовка»: задать/сдвинуть/сбросить plannedFor. Хранится
 * как момент «локальный полдень выбранного дня» (см. комментарий в
 * brew-picker-dialog.tsx) — так календарный день не съезжает от часового пояса.
 */
export function BrewPlannedDate({
  brewBatchId,
  plannedForIso
}: {
  brewBatchId: string;
  plannedForIso: string | null;
}) {
  const { show } = useToast();
  const [value, setValue] = useState(() => toLocalDateInputValue(plannedForIso));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const commit = async (nextValue: string) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    const previous = value;
    setValue(nextValue);
    try {
      const iso = nextValue ? new Date(`${nextValue}T12:00`).toISOString() : null;
      const result = await setBrewBatchPlannedForAction(brewBatchId, iso);
      if (!result.ok) {
        setValue(previous);
        show({ title: result.message, tone: "danger" });
        return;
      }
      show({ title: result.message, tone: "success" });
    } catch {
      setValue(previous);
      show({ title: "Не удалось сохранить дату.", tone: "danger" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Дата варки</span>
        <input
          type="date"
          value={value}
          min={todayLocalDate()}
          onChange={(event) => void commit(event.target.value)}
          disabled={busy}
          className="h-9 rounded-md border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      {value ? (
        <button
          type="button"
          onClick={() => void commit("")}
          disabled={busy}
          aria-label="Сбросить дату варки"
          title="Сбросить дату варки"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
        </button>
      ) : null}
    </div>
  );
}
