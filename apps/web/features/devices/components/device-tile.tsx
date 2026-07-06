"use client";

// =============================================================================
//  features/devices/components/device-tile.tsx
//  Плитка L1 командного центра: статус пивоварни одним взглядом (last-known срез +
//  sparkline температуры), клик «Пульт» → L2. По High-Performance HMI / ISA-101:
//  нейтральный фон, цвет — ТОЛЬКО для аномалий (активные аварии) и «устарело».
//
//  Презентационная: получает готовую плитку + общий тик времени nowMs из грида
//  (свежесть считается на клиенте). Своего опроса/стрима не поднимает.
// =============================================================================
import Link from "next/link";
import { AlertOctagon } from "lucide-react";

import { Button } from "@nb/ui";

import { stageLabelForValue } from "@/features/brew-controller/stage-labels";
import { deriveTileBadge } from "@/features/brew-controller/device-mode";
import { summarizeFaults, type FaultPriority } from "@/features/brew-controller/faults";
import {
  classifyTileFreshness,
  type DeviceTile as DeviceTileData,
} from "@/features/devices/contracts";
import { summarizeDeviceConnection } from "@/features/devices/connection";

const STATUS_DOT: Record<DeviceTileData["status"], string> = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  unknown: "bg-warning",
};

const ALARM_CHIP: Record<FaultPriority, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-warning text-warning-foreground",
};

function fmtAgo(ageMs: number): string {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 5) return "только что";
  if (s < 60) return `${s} с назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

type Props = {
  tile: DeviceTileData;
  nowMs: number;
  onRevoke: () => void;
};

export function DeviceTile({ tile, nowMs, onRevoke }: Props) {
  const snap = tile.snapshot;
  const alarms = snap ? summarizeFaults(snap.faultMask) : { count: 0, top: null as FaultPriority | null };
  const ageMs = snap && snap.ts > 0 ? nowMs - snap.ts : Infinity;
  const freshness = Number.isFinite(ageMs) ? classifyTileFreshness(ageMs) : "stale";
  const stale = freshness === "stale";
  const hasData = Boolean(snap) && snap!.ts > 0;
  const modeBadge = deriveTileBadge(snap?.stage ?? null, snap?.pausedFrom ?? null);
  // Статус связи — из того же helper, что и страница настроек (единая формулировка, #14).
  const connection = summarizeDeviceConnection(
    {
      status: tile.status,
      lastSeenAtMs: tile.lastSeenAt ? Date.parse(tile.lastSeenAt) : null,
      lastTelemetryAtMs: hasData ? snap!.ts : null,
    },
    nowMs,
  );

  // HMI: числовые значения гасим при устаревании (last-known, но «не живо»).
  const valueTone = stale ? "text-muted-foreground" : "text-foreground";

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition ${
        alarms.count > 0 ? "border-destructive-border" : "border-border"
      }`}
    >
      {/* Шапка: имя + статус + бейджи. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{tile.name}</h3>
            {tile.isDemo ? (
              <span className="inline-flex shrink-0 items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                Демо
              </span>
            ) : null}
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{tile.hardwareId}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2">
          {modeBadge ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {modeBadge}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[connection.tone]}`} />
            {connection.label}
          </span>
        </span>
      </div>

      {/* Аварии — единственный цветовой акцент (ISA-18.2). */}
      {alarms.count > 0 && alarms.top ? (
        <p className={`mt-3 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-0.5 text-xs font-semibold ${ALARM_CHIP[alarms.top]}`}>
          <AlertOctagon className="h-3.5 w-3.5" aria-hidden />
          {alarms.count} {alarms.count === 1 ? "авария" : "аварий"}
        </p>
      ) : null}

      {/* Тело: температура / уставка / стадия / нагрев (last-known). */}
      {hasData ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className={`text-3xl font-semibold tabular-nums ${valueTone}`}>
              {snap!.primaryC !== null ? `${snap!.primaryC.toFixed(1)}°` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              уставка {snap!.setpointC !== null ? `${snap!.setpointC.toFixed(1)}°` : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">
              {snap!.stage !== null ? stageLabelForValue(snap!.stage) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              нагрев {snap!.heatDutyPct !== null ? `${snap!.heatDutyPct}%` : "—"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Нет телеметрии — откройте пульт.</p>
      )}

      {/* Sparkline недавней температуры. */}
      {tile.spark.length >= 2 ? <Sparkline values={tile.spark} muted={stale} /> : null}

      {/* Свежесть last-known. */}
      <p className="mt-2 text-xs text-muted-foreground">
        {hasData ? (stale ? `последние данные · ${fmtAgo(ageMs)}` : `обновлено ${fmtAgo(ageMs)}`) : "—"}
      </p>

      {/* Действия. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Link
          href={`/app/devices/${tile.id}`}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90"
        >
          Пульт
        </Link>
        <Link
          href={`/app/devices/${tile.id}/settings`}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          Настройки
        </Link>
        <Button
          variant="outline"
          className="ml-auto border-destructive-border text-destructive hover:bg-destructive-subtle"
          onClick={onRevoke}
        >
          Отозвать
        </Button>
      </div>
    </div>
  );
}

/** Лёгкий SVG-sparkline температуры (нейтральный/приглушённый при устаревании). */
function Sparkline({ values, muted }: { values: number[]; muted: boolean }) {
  const W = 120;
  const H = 28;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const stepX = values.length > 1 ? W / (values.length - 1) : W;
  const d = values
    .map((v, i) => {
      const x = i * stepX;
      const y = H - ((v - min) / span) * (H - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 h-7 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Тренд температуры"
    >
      <path
        d={d}
        fill="none"
        stroke={muted ? "#a1a1aa" : "#0f766e"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
