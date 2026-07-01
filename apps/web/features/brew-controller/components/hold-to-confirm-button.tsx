"use client";

// =============================================================================
//  HoldToConfirmButton — «нажми и удерживай» для опасных действий (ESTOP).
//  Полоса заполняется за holdMs; onConfirm срабатывает лишь при полном удержании.
//  Отпустил раньше — отмена (защита от случайного тапа), см. §confirm-политика.
// =============================================================================
import { useCallback, useRef, useState } from "react";

type Props = {
  label: string;
  holdingLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  holdMs?: number;
  className?: string;
  icon?: React.ReactNode;
};

export function HoldToConfirmButton({
  label,
  holdingLabel,
  onConfirm,
  disabled = false,
  holdMs = 800,
  className = "",
  icon,
}: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, holdMs);
  }, [disabled, holdMs, onConfirm]);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      // клавиатура/скринридер: без hold-жеста — обычный клик подтверждает
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          onConfirm();
        }
      }}
      aria-label={label}
      className={`relative select-none overflow-hidden rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 ${className}`}
    >
      {/* Полоса удержания. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-red-900/40"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding ? `width ${holdMs}ms linear` : "width 120ms ease-out",
        }}
      />
      <span className="relative inline-flex items-center gap-1.5">
        {icon}
        {holding ? holdingLabel ?? "Удерживайте…" : label}
      </span>
    </button>
  );
}
