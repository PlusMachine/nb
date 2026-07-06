"use client";

// =============================================================================
//  TransportBar — панель управления в стиле медиаплеера (Пауза/Продолжить/
//  Пропустить/Стоп). Рутина в один тап, без модалок (кроме graceful STOP —
//  двухшаг у родителя). Conditional visibility (Home Assistant): показываем лишь
//  релевантные контролы вместо disabled-кладбища. Управление активно только у
//  держателя аренды и при живой телеметрии. Кнопки — единая система @nb/ui.
// =============================================================================
import { Pause, Play, SkipForward, Square } from "lucide-react";

import { Button } from "@nb/ui";
import type { Stage } from "@nb/brewforge-protocol";

// Стадии, в которых варка НЕ идёт (нет транспортных действий).
const NON_RUNNING: Stage[] = ["IDLE", "DONE", "FAULT", "MANUAL"];

type Props = {
  stageName: Stage | null;
  controlsHeld: boolean;
  isLive: boolean;
  pending: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
};

export function TransportBar({
  stageName,
  controlsHeld,
  isLive,
  pending,
  onPause,
  onResume,
  onSkip,
  onStop,
}: Props) {
  const isPaused = stageName === "PAUSED";
  const running = stageName !== null && !NON_RUNNING.includes(stageName);
  // Рутина (Пауза/Продолжить/Пропустить) — только у держателя аренды и при живой
  // телеметрии. STOP — fail-safe (lease-exempt): доступен, чтобы любой мог
  // безопасно остановить варку (сервер тоже пропускает STOP без аренды).
  const disabled = !controlsHeld || !isLive || pending;
  const stopDisabled = pending;

  if (!running) {
    return (
      <p className="text-sm text-muted-foreground">
        Варка не идёт — транспортное управление появится во время варки.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPaused ? (
        <Button variant="primary" size="md" onClick={onResume} disabled={disabled}>
          <Play className="h-4 w-4" aria-hidden />
          Продолжить
        </Button>
      ) : (
        <Button variant="outline" size="md" onClick={onPause} disabled={disabled}>
          <Pause className="h-4 w-4" aria-hidden />
          Пауза
        </Button>
      )}

      {!isPaused ? (
        <Button variant="outline" size="md" onClick={onSkip} disabled={disabled}>
          <SkipForward className="h-4 w-4" aria-hidden />
          Далее
        </Button>
      ) : null}

      <Button variant="dangerOutline" size="md" onClick={onStop} disabled={stopDisabled}>
        <Square className="h-4 w-4" aria-hidden />
        Стоп
      </Button>
    </div>
  );
}
