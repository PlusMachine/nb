// =============================================================================
//  features/brew-batches/components/fermenter-panel.tsx
//  Блок «Бродит в приборе» на акте «Брожение» (§8.4 docs/brewforge-web-hmi.md) —
//  соединяет партию с прибором-ферментером: имя + last-known температура/уставка,
//  ссылка «Пульт», привязка/отвязка. Серверный (не "use client"): готовое состояние
//  приходит пропом (resolveFermenterBindingStatus считает page.tsx), интерактив
//  (пикер/отвязка) вынесен в fermenter-binding-controls.tsx. График «план vs факт»
//  (FermentHistoryChart, features/brew-controller/components) рендерится РЯДОМ в
//  page.tsx, не здесь — он не про привязку, а про историю телеметрии сама по себе.
// =============================================================================
import Link from "next/link";
import { AlertTriangle, Radio } from "lucide-react";

import type { FermenterCandidate } from "@/features/devices/contracts";

import type { FermenterBindingStatus } from "../fermenter-status";
import { FermenterPicker, FermenterUnbindButton } from "./fermenter-binding-controls";

const fmtC = (value: number | null): string => (value == null ? "—" : `${value.toFixed(1)} °C`);

type Props = {
  brewBatchId: string;
  status: FermenterBindingStatus;
  deviceName: string | null;
  candidates: FermenterCandidate[];
  /** Давность last-known кадра, посчитанная сервером ("6 минут назад") — честная метка (§12). */
  freshnessLabel: string | null;
};

export function FermenterPanel({ brewBatchId, status, deviceName, candidates, freshnessLabel }: Props) {
  if (status.kind === "unbound") {
    // Кандидатов нет — блока выбора нет вовсе, партия живёт руками (привязка опциональна).
    if (candidates.length === 0) return null;
    return (
      <section className="space-y-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Прибор</h2>
        <FermenterPicker brewBatchId={brewBatchId} candidates={candidates} />
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-zinc-400" aria-hidden />
          <h2 className="text-base font-semibold text-zinc-900">
            Бродит в приборе{deviceName ? ` · ${deviceName}` : ""}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/devices/${status.deviceId}`}
            className="inline-flex min-h-[36px] items-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Пульт
          </Link>
          <FermenterUnbindButton brewBatchId={brewBatchId} />
        </div>
      </div>

      {status.kind === "mode-mismatch" ? (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Прибор больше не в режиме ферментации
        </p>
      ) : null}

      {status.kind === "mode-mismatch" && candidates.length > 0 ? (
        <FermenterPicker brewBatchId={brewBatchId} candidates={candidates} />
      ) : null}

      {status.kind === "no-data" ? <p className="text-sm text-zinc-500">Телеметрии с прибора пока нет.</p> : null}

      {status.kind === "fermenting" || status.kind === "mode-mismatch" ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
          <span className="text-2xl font-semibold text-zinc-950">{fmtC(status.point.primaryC)}</span>
          <span className="text-sm text-zinc-500">уставка {fmtC(status.point.setpointC)}</span>
          {freshnessLabel ? <span className="text-xs text-zinc-400">· {freshnessLabel}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
