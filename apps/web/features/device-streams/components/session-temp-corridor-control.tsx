"use client";

// =============================================================================
//  features/device-streams/components/session-temp-corridor-control.tsx
//  Температурный коридор алертов (§5 F6, M5-A): «Коридор: 18–22 °C» (или «не
//  задан») + маленький Dialog с двумя NumericInput (шаг 0.5 °C, приоритет —
//  явный ввод пользователя, предзаполнение из профиля рецепта — sessions.ts).
//  Оба поля пустыми — «снять коридор» (алерт temp_out выключается). Рядом —
//  тумблер-колокольчик «Уведомления» (alerts_muted, мьютит ВСЕ алерты сеанса).
//  Паттерн — session-bounds-control.tsx той же фичи (Dialog + локальный стейт
//  строкой, sync с router.refresh() после успешного сабмита).
// =============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";

import { Button, Dialog, DialogFooter, useToast } from "@nb/ui";
import { NumericInput } from "@/components/shared/numeric-input";

import { setSessionAlertsMutedAction, updateSessionTempCorridorAction } from "@/features/device-streams/actions";
import { TEMP_CORRIDOR_MAX_C, TEMP_CORRIDOR_MIN_C } from "@/features/device-streams/contracts";

const CORRIDOR_STEP_C = 0.5;

/** «18» либо «18.5» — без хвостового «.0» (тот же приём, что formatStepDurationDays/fmtTemp в alerts.ts). */
const formatTempValue = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export type SessionTempCorridorView = {
  sessionId: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  alertsMuted: boolean;
};

export function SessionTempCorridorControl({ sessionId, tempMinC, tempMaxC, alertsMuted }: SessionTempCorridorView) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [pending, setPending] = useState(false);
  const [mutePending, setMutePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corridorLabel =
    tempMinC !== null && tempMaxC !== null
      ? `Коридор: ${formatTempValue(tempMinC)}–${formatTempValue(tempMaxC)} °C`
      : "Коридор не задан";

  const openDialog = () => {
    setMinValue(tempMinC !== null ? String(tempMinC) : "");
    setMaxValue(tempMaxC !== null ? String(tempMaxC) : "");
    setError(null);
    setOpen(true);
  };

  const save = async (min: number | null, max: number | null) => {
    setPending(true);
    setError(null);
    try {
      const result = await updateSessionTempCorridorAction(sessionId, { tempMinC: min, tempMaxC: max });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      show({ title: min !== null ? "Коридор обновлён" : "Коридор снят", tone: "success" });
      router.refresh();
      setOpen(false);
    } finally {
      setPending(false);
    }
  };

  const submit = async () => {
    if (pending) return;
    const trimmedMin = minValue.trim();
    const trimmedMax = maxValue.trim();

    if (trimmedMin === "" && trimmedMax === "") {
      await save(null, null);
      return;
    }
    if (trimmedMin === "" || trimmedMax === "") {
      setError("Заполните обе границы коридора (или обе очистите).");
      return;
    }

    const min = Number(trimmedMin.replace(",", "."));
    const max = Number(trimmedMax.replace(",", "."));
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setError("Введите корректные числа.");
      return;
    }
    if (min >= max) {
      setError("Нижняя граница коридора должна быть меньше верхней.");
      return;
    }
    await save(min, max);
  };

  const toggleMuted = async () => {
    if (mutePending) return;
    setMutePending(true);
    try {
      const result = await setSessionAlertsMutedAction(sessionId, !alertsMuted);
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      show({ title: result.result.alertsMuted ? "Уведомления выключены" : "Уведомления включены", tone: "success" });
      router.refresh();
    } finally {
      setMutePending(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <Button type="button" variant="ghost" size="sm" onClick={openDialog}>
        {corridorLabel}
      </Button>
      <button
        type="button"
        aria-label={alertsMuted ? "Включить уведомления" : "Выключить уведомления"}
        aria-pressed={alertsMuted}
        disabled={mutePending}
        onClick={() => void toggleMuted()}
        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {alertsMuted ? <BellOff className="h-3.5 w-3.5" aria-hidden /> : <Bell className="h-3.5 w-3.5" aria-hidden />}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) setOpen(false);
        }}
        title="Температурный коридор"
        size="sm"
      >
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Мин, °C
              <NumericInput
                value={minValue}
                onChange={(event) => setMinValue(event.target.value)}
                min={TEMP_CORRIDOR_MIN_C}
                max={TEMP_CORRIDOR_MAX_C}
                step={CORRIDOR_STEP_C}
                withSteppers
                wrapperClassName="w-full"
                disabled={pending}
                className="h-10 w-full rounded-md border border-border bg-card px-2 pr-7 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Макс, °C
              <NumericInput
                value={maxValue}
                onChange={(event) => setMaxValue(event.target.value)}
                min={TEMP_CORRIDOR_MIN_C}
                max={TEMP_CORRIDOR_MAX_C}
                step={CORRIDOR_STEP_C}
                withSteppers
                wrapperClassName="w-full"
                disabled={pending}
                className="h-10 w-full rounded-md border border-border bg-card px-2 pr-7 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Уведомим, если температура выйдет за коридор дольше получаса. Оставьте поля пустыми, чтобы снять коридор.
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
          <Button type="button" onClick={() => void submit()} disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </Dialog>
    </span>
  );
}
