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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Профиль брожения</p>

      <ol className="mt-3 space-y-1.5">
        {progress.steps.map((step) => (
          <li
            key={step.index}
            className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm ${
              step.state === "current" ? "bg-success-subtle" : ""
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {step.state === "done" ? (
                <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle
                  className={`h-3.5 w-3.5 shrink-0 ${
                    step.state === "current" ? "fill-success text-success" : "text-muted-foreground"
                  }`}
                  aria-hidden
                />
              )}
              <span className={`truncate ${step.state === "future" ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                {step.label}
              </span>
              {step.state === "current" ? (
                <span className="shrink-0 rounded-md bg-success-subtle px-1.5 py-0.5 text-[11px] font-medium text-success-subtle-foreground">
                  идёт
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {step.tempC.toFixed(1)}° · {formatStepDurationDays(step.hours)}
            </span>
          </li>
        ))}
      </ol>

      {current ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {editing ? (
            <>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Уставка
                <NumericInput
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  min={-2}
                  max={40}
                  autoFocus
                  aria-label="Уставка текущей ступени, °C"
                  className="h-9 w-20 rounded-md border border-border px-2 text-sm tabular-nums focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground">°C</span>
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
              <span className="text-sm text-muted-foreground">
                Уставка сейчас:{" "}
                <span className="font-medium tabular-nums text-foreground">{current.tempC.toFixed(1)} °C</span>
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
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
