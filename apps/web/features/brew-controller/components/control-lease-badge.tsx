"use client";

// =============================================================================
//  ControlLeaseBadge — статус single-writer аренды устройства + перехват.
//  Состояния (см. docs §control-lease):
//   - держу я            → «Вы управляете» (+ уведомление, если кто-то просит);
//   - держит другой      → «Управляет другой сеанс» + [Запросить перехват];
//   - свободно/подключаюсь → нейтральная подсказка.
// =============================================================================
import { Radio, ShieldCheck, ShieldQuestion } from "lucide-react";

import type { LeaseStatus } from "../control-lease";

type Props = {
  lease: LeaseStatus | null;
  /** Есть ли вообще устройство за источником (иначе аренда неприменима). */
  hasDevice: boolean;
  onRequestTakeover: () => void;
  /** Отдать управление (release) — когда другой сеанс просит перехват. */
  onRelease: () => void;
  pending?: boolean;
};

export function ControlLeaseBadge({ lease, hasDevice, onRequestTakeover, onRelease, pending }: Props) {
  if (!hasDevice) return null;

  // Я держу аренду.
  if (lease?.heldByMe) {
    return (
      <div className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-success-subtle-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Вы управляете
        </span>
        {lease.takeoverRequested ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-warning-subtle px-3 py-1 text-xs font-medium text-warning-subtle-foreground">
            Другой сеанс просит управление
            <button
              type="button"
              onClick={onRelease}
              disabled={pending}
              className="rounded-md bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground hover:bg-warning/90 disabled:opacity-50"
            >
              Передать
            </button>
          </span>
        ) : null}
      </div>
    );
  }

  // Держит другой валидный сеанс.
  if (lease?.held) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-warning-subtle px-3 py-1 text-xs font-medium text-warning-subtle-foreground">
        <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
        Управляет другой сеанс
        {lease.takeoverByMe ? (
          <span className="rounded-md bg-warning-subtle px-2 py-0.5 text-[11px] font-semibold text-warning-subtle-foreground">
            Перехват запрошен…
          </span>
        ) : (
          <button
            type="button"
            onClick={onRequestTakeover}
            disabled={pending}
            className="rounded-md bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground hover:bg-warning/90 disabled:opacity-50"
          >
            Запросить перехват
          </button>
        )}
      </span>
    );
  }

  // Аренда свободна / идёт подключение.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
      <Radio className="h-3.5 w-3.5" aria-hidden />
      Управление свободно
    </span>
  );
}
