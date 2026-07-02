"use client";

// =============================================================================
//  features/brew-controller/components/control-dock.tsx
//  Док управления (редизайн L2 §5–6): медиаплеер-транспорт (Пауза/Продолжить/
//  Далее/Стоп, conditional visibility по стадии) + ВСЕГДА доступный аварийный
//  останов (hold-to-confirm, fail-safe) + краткий статус выполнения/подсказки.
//  Презентационный: вся логика команд/подтверждений — у владельца (LiveDashboard).
// =============================================================================
import { OctagonX } from "lucide-react";

import type { Stage } from "@nb/brewforge-protocol";

import { TransportBar } from "@/features/brew-controller/components/transport-bar";
import { HoldToConfirmButton } from "@/features/brew-controller/components/hold-to-confirm-button";

type Props = {
  stageName: Stage | null;
  hasDevice: boolean;
  controlsHeld: boolean;
  isLive: boolean;
  pending: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
  onEstop: () => void;
  /** Короткий фидбек по последней команде (принято / nack / причина гейта). */
  actionMsg?: string | null;
  /** Ошибка телеметрии — показываем только в состоянии error. */
  transportError?: string | null;
  /** Нет свежей телеметрии (stale/offline) — рутина заблокирована. */
  noFreshTelemetry?: boolean;
  /** Управляет другой сеанс — подсказать про перехват. */
  otherSessionHolds?: boolean;
};

export function ControlDock({
  stageName,
  hasDevice,
  controlsHeld,
  isLive,
  pending,
  onPause,
  onResume,
  onSkip,
  onStop,
  onEstop,
  actionMsg,
  transportError,
  noFreshTelemetry,
  otherSessionHolds,
}: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">Управление</p>
        <span className="text-xs text-zinc-400">совещательное · решает устройство</span>
      </div>

      {/* TransportBar: рутина в один тап (conditional visibility по стадии). */}
      <div className="mt-3">
        <TransportBar
          stageName={stageName}
          controlsHeld={controlsHeld}
          isLive={isLive}
          pending={pending}
          onPause={onPause}
          onResume={onResume}
          onSkip={onSkip}
          onStop={onStop}
        />
      </div>

      {/* Аварийный останов — всегда доступен (fail-safe), hold-to-confirm. */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        <HoldToConfirmButton
          label="Аварийный останов"
          holdingLabel="Держите для E-STOP…"
          disabled={pending || !hasDevice}
          onConfirm={onEstop}
          icon={<OctagonX className="h-4 w-4" aria-hidden />}
        />
        <span className="text-xs text-zinc-500">
          Программная кнопка ≠ аппаратный E-stop. Реальная защита — интерлоки и watchdog на плате.
        </span>
      </div>

      {actionMsg ? <p className="mt-3 text-sm text-zinc-600">{actionMsg}</p> : null}
      {transportError ? <p className="mt-1 text-sm text-red-600">Телеметрия: {transportError}</p> : null}
      {noFreshTelemetry ? (
        <p className="mt-1 text-sm text-amber-700">
          Нет свежей телеметрии — рутинное управление заблокировано до восстановления связи.
        </p>
      ) : null}
      {otherSessionHolds ? (
        <p className="mt-1 text-sm text-amber-700">
          Управляет другой сеанс — запросите перехват, чтобы взять контроль.
        </p>
      ) : null}
    </div>
  );
}
