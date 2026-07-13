"use client";

// =============================================================================
//  features/brew-controller/components/ferment-history-chart.tsx
//  График «план vs факт» ферментации (веб-HMI §8/§12.1): ось X — ДНИ (не время
//  суток, как у варочного TelemetryChart) — недельный процесс. Линия плана —
//  ступенчатая (уставка меняется скачком на границе ступени, по образцу
//  термостата), линия факта — реальная температура из истории устройства.
//  Дыры в данных — разрывом линии, БЕЗ интерполяции (§12.1) — тот же приём, что
//  TelemetryChart (linePath пропускает перо на null). Лёгкий SVG, без зависимостей.
//
//  Принимает серверно-загруженную начальную историю и периодически подтягивает
//  свежую через /telemetry/history?windowDays=N (§14 — окно по дням, а не по
//  точкам: варочный лимит в 1000 точек укладывается в ~3.5 суток при 5-минутном
//  даунсэмпле FERMENT).
// =============================================================================
import { useEffect, useMemo, useState } from "react";

import type { FermentStep } from "@nb/brewforge-protocol";

import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { telemetryEndpoints, type TelemetrySource } from "@/features/brew-controller/telemetry-source";

const VB_W = 800;
const VB_H = 280;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

const DAY_MS = 86_400_000;
// FERMENT персистится раз в 300с — свежая история не нужна чаще раза в минуту.
const REFRESH_MS = 60_000;
// Открытая (hours=0, «до ручного перехода») ступень плана — рисуем с запасом
// вперёд от известной длительности профиля, чтобы линия не обрывалась «в никуда».
const OPEN_STEP_PADDING_DAYS = 2;

type PlanStep = Pick<FermentStep, "tempC" | "hours">;

type Props = {
  source: TelemetrySource;
  hasDevice: boolean;
  initial: TelemetryHistoryPoint[];
  /** Ступени профиля прибора (ferment.steps[]) — для линии плана; пусто — план не рисуем. */
  planSteps: PlanStep[];
  /** Окно подгрузки свежей истории, дни (см. FERMENT_HISTORY_WINDOW_DAYS). */
  windowDays: number;
};

type Bounds = { min: number; max: number };

function fmtDay(day: number): string {
  return `день ${Math.round(day)}`;
}

function niceBounds(values: number[]): Bounds {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 30 };
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
}

/** Ступенчатая ломаная плана: горизонталь на tempC ступени, скачок на границе. Открытая (hours=0) ступень тянется до xMaxDays. */
function buildPlanPoints(steps: PlanStep[], xMaxDays: number): { day: number; tempC: number }[] {
  const points: { day: number; tempC: number }[] = [];
  let cum = 0;
  for (const step of steps) {
    const durationDays = step.hours > 0 ? step.hours / 24 : null;
    const endDay = durationDays !== null ? cum + durationDays : xMaxDays;
    points.push({ day: cum, tempC: step.tempC });
    points.push({ day: Math.max(endDay, cum), tempC: step.tempC });
    if (durationDays === null) break; // открытый конец — дальше плана нет
    cum = endDay;
  }
  return points;
}

export function FermentHistoryChart({ source, hasDevice, initial, planSteps, windowDays }: Props) {
  const [points, setPoints] = useState<TelemetryHistoryPoint[]>(initial);
  const historyUrl = telemetryEndpoints(source).history;

  useEffect(() => {
    setPoints(initial);
  }, [initial]);

  useEffect(() => {
    if (!hasDevice) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`${historyUrl}?windowDays=${windowDays}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { points?: TelemetryHistoryPoint[] };
        if (!cancelled && Array.isArray(body.points)) setPoints(body.points);
      } catch {
        // тихо игнорируем — следующий тик повторит
      }
    };

    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [historyUrl, hasDevice, windowDays]);

  const geom = useMemo(() => {
    if (points.length === 0 && planSteps.length === 0) return null;

    const originMs = points.length > 0 ? points[0]!.ts : Date.now();
    const historyMaxDay = points.length > 0 ? (points[points.length - 1]!.ts - originMs) / DAY_MS : 0;
    const planKnownDays = planSteps.reduce((sum, s) => sum + (s.hours > 0 ? s.hours / 24 : 0), 0);
    const hasOpenStep = planSteps.some((s) => s.hours === 0);
    const xMaxDays = Math.max(
      planKnownDays + (hasOpenStep ? OPEN_STEP_PADDING_DAYS : 0),
      historyMaxDay,
      1,
    );

    const planPoints = buildPlanPoints(planSteps, xMaxDays);
    const tempValues = [
      ...planPoints.map((p) => p.tempC),
      ...points.flatMap((p) => [p.primaryC, p.setpointC]).filter((v): v is number => v !== null),
    ];
    const temp = niceBounds(tempValues);
    const tempSpan = temp.max - temp.min || 1;

    const x = (day: number) => PAD_L + (Math.max(0, day) / xMaxDays) * PLOT_W;
    const y = (c: number) => PAD_T + (1 - (c - temp.min) / tempSpan) * PLOT_H;

    const planPath = planPoints.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)} ${y(p.tempC).toFixed(1)}`).join(" ");

    // Факт — разрыв на пропуск данных (null), без интерполяции (§12.1).
    let factPath = "";
    let pen = false;
    for (const p of points) {
      const dayOfPoint = (p.ts - originMs) / DAY_MS;
      if (p.primaryC === null || !Number.isFinite(p.primaryC)) {
        pen = false;
        continue;
      }
      factPath += `${pen ? "L" : "M"}${x(dayOfPoint).toFixed(1)} ${y(p.primaryC).toFixed(1)} `;
      pen = true;
    }

    const tempTicks = [temp.min, (temp.min + temp.max) / 2, temp.max].map((v) => ({ v, y: y(v) }));
    const dayTicks = Array.from({ length: 4 }, (_, i) => (xMaxDays / 3) * i);

    return { xMaxDays, planPath, factPath, tempTicks, dayTicks, x, hasFact: points.some((p) => p.primaryC !== null) };
  }, [points, planSteps]);

  if (!hasDevice) return null;

  return (
    <section className="rounded-2xl border border-border bg-muted/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">План vs факт</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend color="hsl(var(--chart-setpoint))" label="План" dashed />
          <Legend color="hsl(var(--chart-temp))" label="Факт" />
        </div>
      </div>

      {!geom || !geom.hasFact ? (
        <div className="mt-3 flex h-32 items-center justify-center rounded-lg bg-card text-sm text-muted-foreground">
          истории пока нет
        </div>
      ) : (
        // Контейнер для SVG + HTML-подписей осей (см. telemetry-chart.tsx): текст
        // внутри viewBox тянется вместе с масштабом и на телефоне (карточка ~290px)
        // кегль 11 превращается в ~4px — подписи выносим HTML-оверлеем поверх.
        <div className="relative mt-3">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-auto w-full"
            role="img"
            aria-label="График температуры брожения: план и факт по дням"
            preserveAspectRatio="none"
          >
            {geom.tempTicks.map((t, i) => (
              <line key={`tick-${i}`} x1={PAD_L} x2={VB_W - PAD_R} y1={t.y} y2={t.y} stroke="hsl(var(--chart-grid))" strokeWidth={1} />
            ))}

            {geom.planPath ? (
              <path d={geom.planPath} fill="none" stroke="hsl(var(--chart-setpoint))" strokeWidth={2} strokeDasharray="5 4" />
            ) : null}
            <path d={geom.factPath} fill="none" stroke="hsl(var(--chart-temp))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </svg>

          {geom.tempTicks.map((t, i) => (
            <span
              key={`temp-tick-${i}`}
              className="pointer-events-none absolute -translate-y-1/2 -translate-x-full whitespace-nowrap pr-1 text-[11px] text-muted-foreground"
              style={{ left: `${(PAD_L / VB_W) * 100}%`, top: `${(t.y / VB_H) * 100}%` }}
            >
              {t.v.toFixed(0)}
            </span>
          ))}
          {geom.dayTicks.map((d, i) => (
            <span
              key={`day-tick-${i}`}
              className="pointer-events-none absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
              style={{ left: `${(geom.x(d) / VB_W) * 100}%` }}
            >
              {fmtDay(d)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={18} height={8} aria-hidden>
        <line x1={0} y1={4} x2={18} y2={4} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
