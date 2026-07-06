"use client";

// =============================================================================
//  features/brew-controller/components/distill-loop-strip.tsx
//  «Контур» пульта дистилляции (веб-HMI §7): скважность нагрева + ТЭН, клапан
//  отбора (флегма), «Нагрев разрешён». Сознательно НЕ переиспользует варочный
//  StatusStrip — тот несёт кипение/насос/промывку/2-й насос, шум для
//  glanceable-пульта дистилляции (тот же приём, что FermentLoopStrip vs
//  StatusStrip). Презентационный.
// =============================================================================
import type { ReactNode } from "react";

import type { Telemetry } from "@nb/brewforge-protocol";

type Props = { telemetry: Telemetry | null };

export function DistillLoopStrip({ telemetry }: Props) {
  const valveOn = telemetry?.valveOn;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Контур</p>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Скважность нагрева" value={telemetry ? `${telemetry.heatDutyPct}%` : "—"} />
        <Row label="Нагрев (ТЭН)" value={<Pill on={telemetry?.heatOn ?? false} />} />
        {valveOn !== undefined ? <Row label="Клапан отбора" value={<Pill on={valveOn} />} /> : null}
        <Row
          label="Нагрев разрешён"
          value={
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                telemetry?.heatingPermitted ? "bg-success-subtle text-success-subtle-foreground" : "bg-destructive-subtle text-destructive-subtle-foreground"
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
