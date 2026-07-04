"use client";

// =============================================================================
//  features/brew-controller/components/ferment-profile-card.tsx
//  Карточка «Профиль брожения» (веб-HMI §8, непустой профиль): список ступеней
//  (пройдена/идёт/впереди), уставка текущей ступени (инлайн-правка через
//  NumericInput + PUT /config, гейта на аренду НЕТ — как настройки устройства),
//  «Перейти к следующей ступени» (SKIP_STAGE — гейт на аренду ЕСТЬ, подтверждение
//  у владельца). Презентационный: обе операции делегированы пропсами.
// =============================================================================
import { useState } from "react";
import { Check, ChevronRight, Circle } from "lucide-react";

import { Button } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import { formatStepDurationDays, type FermentProgress } from "@/features/brew-controller/ferment-profile";

export type SetpointSaveResult = { ok: boolean; error?: string | null };

type Props = {
  progress: FermentProgress;
  /** Гейт «Перейти к следующей ступени» (live + control-lease, как рутинные команды). */
  skipDisabled: boolean;
  onSkipToNext: () => void;
  savingSetpoint: boolean;
  onSaveSetpoint: (tempC: number) => Promise<SetpointSaveResult>;
};

export function FermentProfileCard({ progress, skipDisabled, onSkipToNext, savingSetpoint, onSaveSetpoint }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const current = progress.current;

  const startEdit = () => {
    if (!current) return;
    setDraft(String(current.tempC));
    setError(null);
    setEditing(true);
  };

  const commit = async () => {
    const normalized = draft.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (normalized === "" || !Number.isFinite(parsed)) {
      setError("Введите число");
      return;
    }
    const result = await onSaveSetpoint(parsed);
    if (result.ok) {
      setEditing(false);
      setError(null);
    } else {
      setError(result.error ?? "Не удалось сохранить");
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">Профиль брожения</p>

      <ol className="mt-3 space-y-1.5">
        {progress.steps.map((step) => (
          <li
            key={step.index}
            className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm ${
              step.state === "current" ? "bg-emerald-50" : ""
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {step.state === "done" ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Circle
                  className={`h-3.5 w-3.5 shrink-0 ${
                    step.state === "current" ? "fill-emerald-500 text-emerald-500" : "text-zinc-300"
                  }`}
                  aria-hidden
                />
              )}
              <span className={`truncate ${step.state === "future" ? "text-zinc-400" : "font-medium text-zinc-900"}`}>
                {step.label}
              </span>
              {step.state === "current" ? (
                <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                  идёт
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-zinc-600">
              {step.tempC.toFixed(1)}° · {formatStepDurationDays(step.hours)}
            </span>
          </li>
        ))}
      </ol>

      {current ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
          {editing ? (
            <>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                Уставка
                <NumericInput
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  min={-2}
                  max={40}
                  autoFocus
                  aria-label="Уставка текущей ступени, °C"
                  className="h-9 w-20 rounded-md border border-zinc-200 px-2 text-sm tabular-nums focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                />
                <span className="text-zinc-400">°C</span>
              </label>
              <Button size="sm" onClick={() => void commit()} disabled={savingSetpoint}>
                {savingSetpoint ? "Сохранение…" : "Сохранить"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={savingSetpoint}>
                Отмена
              </Button>
            </>
          ) : (
            <>
              <span className="text-sm text-zinc-600">
                Уставка сейчас:{" "}
                <span className="font-medium tabular-nums text-zinc-900">{current.tempC.toFixed(1)} °C</span>
              </span>
              <Button size="sm" variant="outline" onClick={startEdit}>
                Изменить уставку
              </Button>
            </>
          )}

          {progress.next ? (
            <Button size="sm" variant="outline" className="ml-auto" disabled={skipDisabled} onClick={onSkipToNext}>
              Перейти к следующей ступени
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
