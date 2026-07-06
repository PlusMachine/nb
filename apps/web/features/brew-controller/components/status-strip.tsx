"use client";

// =============================================================================
//  features/brew-controller/components/status-strip.tsx
//  «Статус с одного взгляда» (glanceable, редизайн L2 §5) — состояние контура и
//  выходов: скважность нагрева, ТЭН (SSR), кипение, насос, нагрев промывки,
//  разрешение нагрева. Презентационный: только читает снимок телеметрии.
// =============================================================================
import type { ReactNode } from "react";

import type { Telemetry } from "@nb/brewforge-protocol";

type Props = { telemetry: Telemetry | null };

export function StatusStrip({ telemetry }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Контур</p>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Скважность нагрева" value={telemetry ? `${telemetry.heatDutyPct}%` : "—"} />
        <Row label="Нагрев (SSR)" value={<Pill on={telemetry?.heatOn ?? false} />} />
        <Row label="Кипение" value={telemetry ? `${telemetry.boilPct}%` : "—"} />
        <Row label="Насос" value={<Pill on={telemetry?.pumpOn ?? false} />} />
        <Row label="Нагрев промывки" value={<Pill on={telemetry?.spargeHeatOn ?? false} />} />
        {/* v6/v9/v10 (пакет 4-B, P1): показываем ТОЛЬКО когда поле реально присутствует
            в кадре — на приборах без 2-го насоса/клапана/охлаждения/HERMS-RIMS оно
            undefined (не false), строку не рисуем, чтобы не мозолить нерелевантным «ВЫКЛ». */}
        {telemetry?.pump2On !== undefined ? (
          <Row label="Насос 2" value={<Pill on={telemetry.pump2On} />} />
        ) : null}
        {telemetry?.valveOn !== undefined ? (
          <Row label="Клапан" value={<Pill on={telemetry.valveOn} />} />
        ) : null}
        {telemetry?.coolOn !== undefined ? (
          <Row label="Охлаждение" value={<Pill on={telemetry.coolOn} />} />
        ) : null}
        {telemetry?.indirectActive !== undefined ? (
          <Row
            label="Косвенный нагрев (HERMS/RIMS)"
            value={
              telemetry.indirectActive && telemetry.hxTempC !== undefined ? (
                <span className="tabular-nums">{telemetry.hxTempC.toFixed(1)}°C</span>
              ) : (
                <Pill on={telemetry.indirectActive} />
              )
            }
          />
        ) : null}
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
