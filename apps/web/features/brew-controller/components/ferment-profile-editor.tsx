"use client";

// =============================================================================
//  features/brew-controller/components/ferment-profile-editor.tsx
//  Редактор профиля брожения (веб-HMI §8/§12.1, состояние «Live + свободен» без
//  профиля): до 6 ступеней (t° + дни, «до ручного перехода» чекбоксом для
//  hours=0), опционально предзаполняется из плана брожения привязанной партии
//  (mapFermentationPlanToDeviceSteps). Инлайн-карточка (сущностей мало) —
//  сохранение PUT /config пишет ferment.steps/nSteps целиком (тот же приём, что
//  device-config-form.tsx для sensorCal: массив по индексам шлём целиком, не
//  частичным диффом — безопаснее для устройства).
// =============================================================================
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import { MAX_FERMENT_STEPS, type MappedFermentStep } from "@/features/brew-controller/ferment-profile";

type EditorRow = { tempC: string; days: string; manual: boolean };

const emptyRow: EditorRow = { tempC: "", days: "", manual: false };

function rowsFromPlan(steps: MappedFermentStep[]): EditorRow[] {
  return steps.map((s) => ({
    tempC: String(s.tempC),
    manual: s.hours === 0,
    days: s.hours > 0 ? String(Math.round((s.hours / 24) * 10) / 10) : "",
  }));
}

export type ProfileSaveResult = { ok: boolean; error?: string | null };

type Props = {
  /** Ступени привязанной партии после маппинга (§13) — null, если нет партии/плана. */
  planSteps: MappedFermentStep[] | null;
  /** Честная причина, почему план недоступен для загрузки (>6 ступеней и т.п.). */
  planError: string | null;
  saving: boolean;
  onSave: (steps: { tempC: number; hours: number }[]) => Promise<ProfileSaveResult>;
};

export function FermentProfileEditor({ planSteps, planError, saving, onSave }: Props) {
  const [rows, setRows] = useState<EditorRow[]>([{ ...emptyRow }]);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (index: number, patch: Partial<EditorRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => (prev.length >= MAX_FERMENT_STEPS ? prev : [...prev, { ...emptyRow }]));
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const fillFromPlan = () => {
    if (!planSteps) return;
    setRows(rowsFromPlan(planSteps));
    setError(null);
  };

  const save = async () => {
    const parsed: { tempC: number; hours: number }[] = [];
    for (const row of rows) {
      const tempC = Number(row.tempC.trim().replace(",", "."));
      if (row.tempC.trim() === "" || !Number.isFinite(tempC)) {
        setError("Заполните температуру у каждой ступени");
        return;
      }
      if (row.manual) {
        parsed.push({ tempC, hours: 0 });
        continue;
      }
      const days = Number(row.days.trim().replace(",", "."));
      if (row.days.trim() === "" || !Number.isFinite(days) || days <= 0) {
        setError("Укажите длительность в днях либо отметьте «до ручного перехода»");
        return;
      }
      parsed.push({ tempC, hours: Math.round(days * 24) });
    }
    if (parsed.length === 0) {
      setError("Добавьте хотя бы одну ступень");
      return;
    }
    setError(null);
    const result = await onSave(parsed);
    if (!result.ok) setError(result.error ?? "Не удалось сохранить профиль");
  };

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
      {planSteps ? (
        <Button variant="outline" size="sm" onClick={fillFromPlan} disabled={saving}>
          Из плана рецепта
        </Button>
      ) : planError ? (
        <p className="text-xs text-zinc-400">Профиль из плана недоступен: {planError}</p>
      ) : null}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-xs text-zinc-400">{i + 1}.</span>
            <label className="flex items-center gap-1.5 text-sm text-zinc-600">
              <NumericInput
                value={row.tempC}
                onChange={(e) => updateRow(i, { tempC: e.target.value })}
                min={-2}
                max={40}
                aria-label={`Температура ступени ${i + 1}, °C`}
                placeholder="18.0"
                className="h-9 w-20 rounded-md border border-zinc-200 px-2 text-sm tabular-nums focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
              °C
            </label>
            {row.manual ? (
              <span className="text-sm text-zinc-500">до ручного перехода</span>
            ) : (
              <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                <NumericInput
                  value={row.days}
                  onChange={(e) => updateRow(i, { days: e.target.value })}
                  min={1}
                  integer
                  aria-label={`Длительность ступени ${i + 1}, дней`}
                  placeholder="7"
                  className="h-9 w-16 rounded-md border border-zinc-200 px-2 text-sm tabular-nums focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                />
                дн
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-zinc-300"
                checked={row.manual}
                onChange={(e) => updateRow(i, { manual: e.target.checked })}
              />
              до ручного перехода
            </label>
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label={`Удалить ступень ${i + 1}`}
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={addRow} disabled={rows.length >= MAX_FERMENT_STEPS}>
          <Plus className="h-4 w-4" aria-hidden />
          Добавить ступень
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить профиль"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
