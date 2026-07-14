"use client";

// =============================================================================
//  features/device-streams/components/session-calibration-control.tsx
//  «Выровнять по моему замеру» (§5 F4.1, M3-C): кнопка + маленький Dialog —
//  выбор замера (дефолт — последний), опционально выбор сеанса (если активных
//  сеансов несколько — редкий случай, простой Select без спец-UI), сабмит →
//  applySessionCalibrationAction. Бейдж «Кривая скорректирована на …» рядом —
//  один на каждый калиброванный активный сеанс, с крестиком → clearSessionCalibrationAction.
// =============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button, Dialog, DialogFooter, Select, useToast } from "@nb/ui";
import type { PreferredGravityUnit } from "@nb/auth";
import { sgToPlato, type CalculatorGravityUnit } from "@nb/brewing-core";

import { applySessionCalibrationAction, clearSessionCalibrationAction } from "@/features/device-streams/actions";
import { formatGravity, gravityUnitLabels, toCalculatorGravityUnit } from "@/features/system/gravity-units";

export type CalibrationSessionOption = {
  id: string;
  deviceName: string;
  calibrationOffsetSg: number;
};

export type CalibrationMeasurementOption = {
  ts: number;
  gravitySg: number;
};

/**
 * Оффсет — ДЕЛЬТА, не абсолютная плотность: конвертировать её как обычное значение
 * (через полиномы SG→Plato/Brix от абсолютного числа) нельзя — sgToPlato нелинеен.
 * Якорь — вода (1.000 SG ↔ 0 °P/°Bx): переводим «1.000+offset» в целевую шкалу и
 * вычитаем «1.000» в ней же (тот же приём, что convertGravityOffsetValue в
 * features/system/gravity-units.ts, но с сохранённым знаком «+» для положительных).
 */
function formatOffset(offsetSg: number, unit: PreferredGravityUnit): string {
  const sign = offsetSg >= 0 ? "+" : "";
  if (unit === "sg") {
    return `${sign}${offsetSg.toFixed(4)}`;
  }
  const calcUnit: CalculatorGravityUnit = toCalculatorGravityUnit(unit);
  const delta = sgToPlato(1 + offsetSg, 6) - sgToPlato(1, 6);
  const precision = calcUnit === "SG" ? 4 : 2;
  const text = delta.toFixed(precision);
  const deltaSign = Number(text) >= 0 ? "+" : "";
  return `${deltaSign}${text} ${gravityUnitLabels[unit]}`;
}

export function SessionCalibrationControl({
  sessions,
  measurements,
  gravityUnit
}: {
  sessions: CalibrationSessionOption[];
  measurements: CalibrationMeasurementOption[];
  gravityUnit: PreferredGravityUnit;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [measurementIndex, setMeasurementIndex] = useState(measurements.length - 1);
  const [pending, setPending] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sessions.length === 0 || measurements.length === 0) {
    return null;
  }

  const calibratedSessions = sessions.filter((s) => s.calibrationOffsetSg !== 0);

  const openDialog = () => {
    setSessionId(sessions[0]?.id ?? "");
    setMeasurementIndex(measurements.length - 1);
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    const measurement = measurements[measurementIndex];
    if (!measurement || !sessionId || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await applySessionCalibrationAction({
        sessionId,
        measurementTs: new Date(measurement.ts),
        measurementSg: measurement.gravitySg
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      show({ title: "Кривая выровнена по замеру", tone: "success" });
      router.refresh();
      setOpen(false);
    } finally {
      setPending(false);
    }
  };

  const clear = async (id: string) => {
    if (clearingId) return;
    setClearingId(id);
    try {
      const result = await clearSessionCalibrationAction(id);
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      show({ title: "Калибровка сброшена", tone: "success" });
      router.refresh();
    } finally {
      setClearingId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {calibratedSessions.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
        >
          Кривая скорректирована на {formatOffset(s.calibrationOffsetSg, gravityUnit)}
          <button
            type="button"
            aria-label="Отменить калибровку"
            onClick={() => void clear(s.id)}
            disabled={clearingId === s.id}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        Выровнять по замеру
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) setOpen(false);
        }}
        title="Выровнять по замеру"
        size="sm"
      >
        <div className="space-y-3 p-5">
          {sessions.length > 1 ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Сеанс
              <Select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.deviceName}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Замер
            <Select value={String(measurementIndex)} onChange={(event) => setMeasurementIndex(Number(event.target.value))}>
              {measurements.map((m, index) => (
                <option key={index} value={index}>
                  {formatGravity(m.gravitySg, gravityUnit)} · {new Date(m.ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            Кривая устройства сдвинется так, чтобы в этот момент совпасть с выбранным замером — офсет применяется ко всей кривой сеанса.
          </p>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={pending || !sessionId}>
            {pending ? "Выравниваем…" : "Выровнять"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
