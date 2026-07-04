"use client";

// =============================================================================
//  features/brew-controller/components/ferment-loop-strip.tsx
//  «Контур» пульта ферментации (веб-HMI §8): охлаждение (+ отсчёт защиты
//  компрессора) / нагрев / разрешение нагрева. Сознательно НЕ переиспользует
//  варочный StatusStrip — тот несёт скважность/кипячение/насос/промывку,
//  бессмысленные для фермента (шум на glanceable-пульте, §12.1). Презентационный.
// =============================================================================
import type { ReactNode } from "react";

import type { Telemetry } from "@nb/brewforge-protocol";

function fmtCoolLock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Props = { telemetry: Telemetry | null };

export function FermentLoopStrip({ telemetry }: Props) {
  const coolOn = telemetry?.coolOn;
  const coolLockS = telemetry?.coolLockS;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">Контур</p>
      <dl className="mt-3 space-y-2 text-sm">
        {coolOn !== undefined ? (
          <Row
            label="Охлаждение"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Pill on={coolOn} />
                {!coolOn && coolLockS !== undefined && coolLockS > 0 ? (
                  <span className="text-xs text-zinc-500">защита компрессора {fmtCoolLock(coolLockS)}</span>
                ) : null}
              </span>
            }
          />
        ) : null}
        <Row label="Нагрев" value={<Pill on={telemetry?.heatOn ?? false} />} />
        <Row
          label="Нагрев разрешён"
          value={
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                telemetry?.heatingPermitted ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
              }`}
            >
              {telemetry?.heatingPermitted ? "ДА" : "НЕТ"}
            </span>
          }
        />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900 tabular-nums">{value}</dd>
    </div>
  );
}

function Pill({ on }: { on: boolean }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
        on ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      {on ? "ВКЛ" : "ВЫКЛ"}
    </span>
  );
}
