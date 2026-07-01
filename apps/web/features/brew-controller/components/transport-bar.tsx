"use client";

// =============================================================================
//  TransportBar — панель управления в стиле медиаплеера (Пауза/Продолжить/
//  Пропустить/Стоп). Рутина в один тап, без модалок (кроме graceful STOP —
//  двухшаг у родителя). Conditional visibility (Home Assistant): показываем лишь
//  релевантные контролы вместо disabled-кладбища. Управление активно только у
//  держателя аренды и при живой телеметрии.
// =============================================================================
import { Pause, Play, SkipForward, Square } from "lucide-react";

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
      <p className="text-sm text-zinc-500">
        Варка не идёт — транспортное управление появится во время варки.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPaused ? (
        <TransportButton onClick={onResume} disabled={disabled} tone="primary">
          <Play className="h-4 w-4" aria-hidden />
          Продолжить
        </TransportButton>
      ) : (
        <TransportButton onClick={onPause} disabled={disabled}>
          <Pause className="h-4 w-4" aria-hidden />
          Пауза
        </TransportButton>
      )}

      {!isPaused ? (
        <TransportButton onClick={onSkip} disabled={disabled}>
          <SkipForward className="h-4 w-4" aria-hidden />
          Пропустить стадию
        </TransportButton>
      ) : null}

      <TransportButton onClick={onStop} disabled={stopDisabled} tone="danger">
        <Square className="h-4 w-4" aria-hidden />
        Стоп
      </TransportButton>
    </div>
  );
}

function TransportButton({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : tone === "danger"
        ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${toneCls}`}
    >
      {children}
    </button>
  );
}
