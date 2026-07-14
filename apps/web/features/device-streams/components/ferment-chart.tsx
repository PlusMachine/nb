"use client";

// =============================================================================
//  features/device-streams/components/ferment-chart.tsx
//  График брожения партии (§5 F3, §9 M2-B): кривая(ы) устройства + ручные замеры
//  точками поверх + температура тонкой линией по правой оси. Лёгкий SVG без
//  зависимостей, тот же приём, что features/brew-controller/components/
//  ferment-history-chart.tsx (viewBox ~800×280, HTML-оверлей подписей осей,
//  токены hsl(var(--chart-*))) — НО это отдельный компонент: у BrewForge-графика
//  другая семантика (план vs факт по дням устройства), здесь — многосеансовая
//  плотность+температура во времени с ручными замерами и офсет-калибровкой уже
//  применённой на сервере (§П3).
//
//  ⚠ Чистый презентационный компонент: получает ВСЁ через пропсы, сериализуемые
//  на границе сервер/клиент (ts — мс-эпоха, даты сеанса — number, не Date).
//  Никаких импортов series.ts/@nb/db здесь и не будет — только series-core.ts
//  (чистое ядро без побочных импортов, безопасно на клиенте) для сглаживания/
//  сегментации/даунсемпла, которые иначе пришлось бы дублировать.
// =============================================================================
import { useMemo, useState } from "react";

import type { PreferredGravityUnit } from "@nb/auth";

import { formatGravity } from "@/features/system/gravity-units";

import { downsampleSeries, smoothGravityMedian5, splitOnGaps, type FermentPointCore } from "../series-core";

const VB_W = 800;
const VB_H = 280;
const PAD_L = 52;
const PAD_R = 44;
const PAD_T = 16;
const PAD_B = 24;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

const DOWNSAMPLE_MAX_POINTS = 600;

/** Циклическая палитра кривых устройств — только существующие токены темы (без новых цветов). */
const SESSION_COLOR_VARS = ["--primary", "--chart-setpoint", "--warning", "--chart-heater"] as const;

export type FermentChartRange = "24h" | "7d" | "all";

const RANGE_OPTIONS: { key: FermentChartRange; label: string }[] = [
  { key: "24h", label: "24 ч" },
  { key: "7d", label: "7 д" },
  { key: "all", label: "Всё" }
];

const RANGE_MS: Record<Exclude<FermentChartRange, "all">, number> = {
  "24h": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000
};

/**
 * Один сеанс для графика. startedAt/endedAt — мс-эпоха (не Date): сервер
 * (M2-C) конвертирует `session.startedAt.getTime()` / `endedAt?.getTime() ?? null`
 * на границе. points — как отдаёт readBatchFermentSeries (уже со сдвигом
 * calibration_offset_sg, уже отфильтрованы excluded по умолчанию).
 */
export type FermentChartSession = {
  id: string;
  deviceName: string;
  startedAt: number;
  endedAt: number | null;
  points: FermentPointCore[];
  intervalSeconds: number | null;
};

/** Ручной замер — точка поверх кривой (П2). Форма 1:1 с ManualMeasurementPoint из series.ts. */
export type FermentChartManualMeasurement = {
  ts: number;
  gravitySg: number;
  isFinal: boolean;
};

export type FermentChartProps = {
  sessions: FermentChartSession[];
  manualMeasurements: FermentChartManualMeasurement[];
  /** Единица отображения плотности (features/system/gravity-units), не хранения. */
  gravityUnit: PreferredGravityUnit;
  /** Начальный диапазон переключателя; дальше состояние ведёт компонент. */
  defaultRange?: FermentChartRange;
};

type Bounds = { min: number; max: number };

function niceBounds(values: number[], fallback: Bounds, padRatio = 0.1): Bounds {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
  if (min === max) {
    const pad = Math.abs(min) * padRatio || 0.001;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * padRatio;
  return { min: min - pad, max: max + pad };
}

function fmtAxisTime(ts: number, range: FermentChartRange): string {
  const date = new Date(ts);
  // Явная локаль + hour12:false — иначе сервер/клиент дают разный формат (hydration mismatch),
  // тот же приём, что в telemetry-chart.tsx/ferment-history-chart.tsx.
  return range === "24h"
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/** Построить путь ломаной по точкам сегмента, пропуская перо на null-значении (без интерполяции). */
function buildLinePath(
  points: FermentPointCore[],
  pick: (p: FermentPointCore) => number | null,
  x: (ts: number) => number,
  y: (v: number) => number
): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    const v = pick(p);
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(p.ts).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  }
  return d.trim();
}

export function FermentChart({ sessions, manualMeasurements, gravityUnit, defaultRange = "all" }: FermentChartProps) {
  const [range, setRange] = useState<FermentChartRange>(defaultRange);

  const hasAnyDataEver = sessions.some((s) => s.points.length > 0) || manualMeasurements.length > 0;

  const geom = useMemo(() => {
    // Якорь диапазона — последняя известная точка (устройство или ручной замер), а не
    // Date.now(): партия могла добродить неделю назад, «24 ч» должны показать последние
    // 24 ч АКТИВНОСТИ, а не пустоту от текущего момента.
    let latestTs = -Infinity;
    for (const s of sessions) {
      for (const p of s.points) {
        if (p.ts > latestTs) latestTs = p.ts;
      }
    }
    for (const m of manualMeasurements) {
      if (m.ts > latestTs) latestTs = m.ts;
    }
    if (!Number.isFinite(latestTs)) latestTs = Date.now();

    const cutoffMs = range === "all" ? -Infinity : latestTs - RANGE_MS[range];

    const processedSessions = sessions.map((session, index) => {
      const filtered = session.points.filter((p) => p.ts >= cutoffMs);
      const rawSegments = splitOnGaps(filtered, session.intervalSeconds);
      const segments = rawSegments.map((seg) => downsampleSeries(smoothGravityMedian5(seg), DOWNSAMPLE_MAX_POINTS));
      return {
        session,
        color: `hsl(var(${SESSION_COLOR_VARS[index % SESSION_COLOR_VARS.length]}))`,
        segments
      };
    });

    const visibleManual = manualMeasurements
      .filter((m) => m.ts >= cutoffMs)
      .sort((a, b) => a.ts - b.ts);

    const hasDeviceCurve = processedSessions.some((ps) =>
      ps.segments.some((seg) => seg.some((p) => p.gravitySg !== null))
    );
    const hasTempData = processedSessions.some((ps) => ps.segments.some((seg) => seg.some((p) => p.tempC !== null)));

    if (!hasDeviceCurve && visibleManual.length === 0) {
      return { empty: true as const, hasAnyDataEver };
    }

    const gravityValues: number[] = [];
    const tempValues: number[] = [];
    const tsValues: number[] = [];
    for (const ps of processedSessions) {
      for (const seg of ps.segments) {
        for (const p of seg) {
          tsValues.push(p.ts);
          if (p.gravitySg !== null) gravityValues.push(p.gravitySg);
          if (p.tempC !== null) tempValues.push(p.tempC);
        }
      }
    }
    for (const m of visibleManual) {
      tsValues.push(m.ts);
      gravityValues.push(m.gravitySg);
    }

    const tMin = Math.min(...tsValues);
    const tMax = Math.max(...tsValues);
    const tSpan = tMax - tMin || 1;
    const gravity = niceBounds(gravityValues, { min: 0.99, max: 1.06 });
    const gravitySpan = gravity.max - gravity.min || 1;
    const temp = hasTempData ? niceBounds(tempValues, { min: 15, max: 25 }) : null;
    const tempSpan = temp ? temp.max - temp.min || 1 : 1;

    const x = (ts: number) => PAD_L + ((ts - tMin) / tSpan) * PLOT_W;
    const y1 = (sg: number) => PAD_T + (1 - (sg - gravity.min) / gravitySpan) * PLOT_H;
    const y2 = (c: number) => PAD_T + (1 - (c - (temp?.min ?? 0)) / tempSpan) * PLOT_H;

    const curves = processedSessions.map((ps) => ({
      id: ps.session.id,
      deviceName: ps.session.deviceName,
      color: ps.color,
      gravityPaths: ps.segments.map((seg) => buildLinePath(seg, (p) => p.gravitySg, x, y1)).filter(Boolean),
      tempPaths: hasTempData ? ps.segments.map((seg) => buildLinePath(seg, (p) => p.tempC, x, y2)).filter(Boolean) : []
    }));

    // Без устройства — соединяем ручные замеры тонкой ломаной (П1 «график по одним ручным
    // замерам»); при наличии кривой устройства замеры — только точки (линия — у устройства).
    const manualConnectorPath = !hasDeviceCurve && visibleManual.length > 1
      ? visibleManual.map((m, i) => `${i === 0 ? "M" : "L"}${x(m.ts).toFixed(1)} ${y1(m.gravitySg).toFixed(1)}`).join(" ")
      : "";

    const manualMarkers = visibleManual.map((m) => ({ x: x(m.ts), y: y1(m.gravitySg), isFinal: m.isFinal }));

    const gravityTicks = [gravity.min, (gravity.min + gravity.max) / 2, gravity.max].map((v) => ({
      v,
      y: y1(v),
      label: formatGravity(v, gravityUnit)
    }));
    const tempTicks = temp
      ? [temp.min, (temp.min + temp.max) / 2, temp.max].map((v) => ({ v, y: y2(v) }))
      : [];

    return {
      empty: false as const,
      tMin,
      tMax,
      curves,
      manualConnectorPath,
      manualMarkers,
      gravityTicks,
      tempTicks,
      hasTempData,
      showLegend: sessions.length > 1 || hasTempData || visibleManual.length > 0
    };
  }, [sessions, manualMeasurements, range, gravityUnit, hasAnyDataEver]);

  if (geom.empty) {
    return (
      <p className="text-sm text-muted-foreground">
        {geom.hasAnyDataEver ? "Нет точек в выбранном периоде." : "Замеров пока нет."}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {geom.showLegend ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {sessions.length > 1
              ? geom.curves.map((curve) => <Legend key={curve.id} color={curve.color} label={curve.deviceName} />)
              : null}
            {geom.hasTempData ? <Legend color="hsl(var(--chart-temp))" label="Температура, °C" /> : null}
            {geom.manualMarkers.length > 0 ? <ManualLegend /> : null}
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-1 text-xs" role="group" aria-label="Диапазон графика">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={range === option.key}
              onClick={() => setRange(option.key)}
              className={`min-h-8 rounded-full border px-2.5 py-1 transition-colors ${
                range === option.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="h-auto w-full"
          role="img"
          aria-label="График брожения: плотность и температура во времени"
          preserveAspectRatio="none"
        >
          {geom.gravityTicks.map((t, i) => (
            <line key={`g-tick-${i}`} x1={PAD_L} x2={VB_W - PAD_R} y1={t.y} y2={t.y} stroke="hsl(var(--chart-grid))" strokeWidth={1} />
          ))}

          {geom.curves.flatMap((curve) =>
            curve.tempPaths.map((d, i) => (
              <path
                key={`temp-${curve.id}-${i}`}
                d={d}
                fill="none"
                stroke="hsl(var(--chart-temp))"
                strokeWidth={1.5}
                opacity={0.75}
              />
            ))
          )}

          {geom.curves.flatMap((curve) =>
            curve.gravityPaths.map((d, i) => (
              <path
                key={`grav-${curve.id}-${i}`}
                d={d}
                fill="none"
                stroke={curve.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))
          )}

          {geom.manualConnectorPath ? (
            <path d={geom.manualConnectorPath} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" />
          ) : null}

          {/* Ручные замеры — маркеры поверх кривых, заметнее линии (П2: ручное главнее). */}
          {geom.manualMarkers.map((m, i) => (
            <circle
              key={`manual-${i}`}
              cx={m.x}
              cy={m.y}
              r={m.isFinal ? 5 : 4}
              fill="hsl(var(--foreground))"
              stroke="hsl(var(--background))"
              strokeWidth={m.isFinal ? 2 : 1.5}
            />
          ))}
        </svg>

        {geom.gravityTicks.map((t, i) => (
          <span
            key={`g-tick-label-${i}`}
            className="pointer-events-none absolute -translate-y-1/2 -translate-x-full whitespace-nowrap pr-1 text-[11px] text-muted-foreground"
            style={{ left: `${(PAD_L / VB_W) * 100}%`, top: `${(t.y / VB_H) * 100}%` }}
          >
            {t.label}
          </span>
        ))}
        {geom.tempTicks.map((t, i) => (
          <span
            key={`temp-tick-label-${i}`}
            className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap pl-1 text-[11px]"
            style={{ left: `${((VB_W - PAD_R) / VB_W) * 100}%`, top: `${(t.y / VB_H) * 100}%`, color: "hsl(var(--chart-temp))" }}
          >
            {t.v.toFixed(0)}°
          </span>
        ))}
        <span
          className="pointer-events-none absolute bottom-0 whitespace-nowrap text-[11px] text-muted-foreground"
          style={{ left: `${(PAD_L / VB_W) * 100}%` }}
        >
          {fmtAxisTime(geom.tMin, range)}
        </span>
        <span
          className="pointer-events-none absolute bottom-0 -translate-x-full whitespace-nowrap text-[11px] text-muted-foreground"
          style={{ left: `${((VB_W - PAD_R) / VB_W) * 100}%` }}
        >
          {fmtAxisTime(geom.tMax, range)}
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={18} height={8} aria-hidden>
        <line x1={0} y1={4} x2={18} y2={4} stroke={color} strokeWidth={2} />
      </svg>
      {label}
    </span>
  );
}

function ManualLegend() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={10} height={10} aria-hidden>
        <circle cx={5} cy={5} r={4} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={1.5} />
      </svg>
      Ручной замер
    </span>
  );
}
