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
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Контур</p>
      <dl className="mt-3 space-y-2 text-sm">
        {coolOn !== undefined ? (
          <Row
            label="Охлаждение"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Pill on={coolOn} />
                {!coolOn && coolLockS !== undefined && coolLockS > 0 ? (
                  <span className="text-xs text-muted-foreground">защита компрессора {fmtCoolLock(coolLockS)}</span>
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
                telemetry?.heatingPermitted
                  ? "bg-success-subtle text-success-subtle-foreground"
                  : "bg-destructive-subtle text-destructive-subtle-foreground"
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
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function Pill({ on }: { on: boolean }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
        on ? "bg-success-subtle text-success-subtle-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {on ? "ВКЛ" : "ВЫКЛ"}
    </span>
  );
}
