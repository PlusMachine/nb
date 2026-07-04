"use client";

// =============================================================================
//  features/brew-batches/components/telemetry-chart.tsx
//  Исторический HMI-график телеметрии варки: температура (primaryC) vs уставка
//  (setpointC) по левой оси и скважность нагрева (%) по ОТДЕЛЬНОЙ правой оси, во
//  времени. Вертикальные аннотации событий (смена стадии / авария) с подписями.
//  Палитра по High-Performance HMI / ISA-101: нейтральный фон, цвет — только для
//  аномалий (авария) и ключевых линий (уставка/факт). Без сторонних библиотек —
//  лёгкий SVG (responsive viewBox) + HTML-подписи-оверлей (чёткие, не тянутся).
//
//  Принимает серверно-загруженную начальную историю и подтягивает свежие точки с
//  /history, пока открыт экран (transport-агностично: batch|device).
// =============================================================================
import { useEffect, useMemo, useState } from "react";

import { stageName } from "@nb/brewforge-protocol";

import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { telemetryEndpoints, type TelemetrySource } from "@/features/brew-controller/telemetry-source";
import { deriveStageTransitions } from "@/features/brew-controller/telemetry-annotations";
import { stageLabel } from "@/features/brew-controller/stage-labels";

// Геометрия viewBox (масштабируется по ширине контейнера).
const VB_W = 800;
const VB_H = 320;
const PAD_L = 44;
const PAD_R = 44;
const PAD_T = 16;
const PAD_B = 28;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

// Период подтягивания свежей истории, мс.
const REFRESH_MS = 15_000;

// Минимальный зазор между подписями событий (в единицах viewBox) — против
// наложения меток при частых сменах стадий. Авария подписывается всегда.
const LABEL_MIN_GAP = 64;

type Props = {
  /** Источник истории: партия (зона A) или устройство напрямую (зона B). */
  source: TelemetrySource;
  hasDevice: boolean;
  initial: TelemetryHistoryPoint[];
};

type Bounds = { min: number; max: number };

function niceTempBounds(points: TelemetryHistoryPoint[]): Bounds {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    for (const v of [p.primaryC, p.setpointC]) {
      if (v !== null && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 100 };
  }
  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  // Явная локаль + hour12:false — иначе пустая локаль ([]) даёт разный формат на
  // сервере (24ч) и в браузере (en-US 12ч «11:15 PM») → hydration mismatch.
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function TelemetryChart({ source, hasDevice, initial }: Props) {
  const [points, setPoints] = useState<TelemetryHistoryPoint[]>(initial);
  const historyUrl = telemetryEndpoints(source).history;

  // Периодически подтягиваем свежую историю (варка/устройство активны прямо сейчас).
  useEffect(() => {
    if (!hasDevice) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(historyUrl, {
          cache: "no-store"
        });
        if (!res.ok) return;
        const body = (await res.json()) as { points?: TelemetryHistoryPoint[] };
        if (!cancelled && Array.isArray(body.points)) {
          setPoints(body.points);
        }
      } catch {
        // тихо игнорируем — следующий тик повторит
      }
    };

    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [historyUrl, hasDevice]);

  const geom = useMemo(() => {
    if (points.length === 0) return null;

    const tMin = points[0].ts;
    const tMax = points[points.length - 1].ts;
    const tSpan = tMax - tMin || 1;
    const temp = niceTempBounds(points);
    const tempSpan = temp.max - temp.min || 1;

    const x = (ts: number) => PAD_L + ((ts - tMin) / tSpan) * PLOT_W;
    const yTemp = (c: number) => PAD_T + (1 - (c - temp.min) / tempSpan) * PLOT_H;
    const yDuty = (pct: number) => PAD_T + (1 - Math.max(0, Math.min(100, pct)) / 100) * PLOT_H;

    // Построить ломаную из точек серии с разрывами на null (M / L по сегментам).
    const linePath = (pick: (p: TelemetryHistoryPoint) => number | null, y: (v: number) => number) => {
      let d = "";
      let pen = false;
      for (const p of points) {
        const v = pick(p);
        if (v === null || !Number.isFinite(v)) {
          pen = false;
          continue;
        }
        const cmd = pen ? "L" : "M";
        d += `${cmd}${x(p.ts).toFixed(1)} ${y(v).toFixed(1)} `;
        pen = true;
      }
      return d.trim();
    };

    // Полосы стадий: группируем подряд идущие точки с одинаковым stage. Палитра
    // нейтральная (HMI): чередование серых оттенков; авария — единственный цвет.
    type Band = { stage: number; x0: number; x1: number };
    const bands: Band[] = [];
    let cur: Band | null = null;
    for (const p of points) {
      const s = p.stage;
      if (s === null) {
        cur = null;
        continue;
      }
      if (cur && cur.stage === s) {
        cur.x1 = x(p.ts);
      } else {
        cur = { stage: s, x0: x(p.ts), x1: x(p.ts) };
        bands.push(cur);
      }
    }

    // Подписи по оси температур слева (3 деления) и оси нагрева справа (0/50/100%).
    const tempTicks = [temp.min, (temp.min + temp.max) / 2, temp.max].map((v) => ({
      v,
      y: yTemp(v)
    }));
    const dutyTicks = [0, 50, 100].map((v) => ({ v, y: yDuty(v) }));

    // Событийные аннотации (смены стадий/аварии) с деклаттером подписей.
    const transitions = deriveStageTransitions(points);
    let lastLabelX = -Infinity;
    const annotations = transitions.map((t) => {
      const ax = x(t.ts);
      const showLabel = t.isFault || ax - lastLabelX >= LABEL_MIN_GAP;
      if (showLabel) lastLabelX = ax;
      return { x: ax, isFault: t.isFault, label: t.label, showLabel };
    });

    return {
      tMin,
      tMax,
      primaryPath: linePath((p) => p.primaryC, yTemp),
      setpointPath: linePath((p) => p.setpointC, yTemp),
      dutyPath: linePath((p) => p.heatDutyPct, yDuty),
      bands,
      tempTicks,
      dutyTicks,
      annotations
    };
  }, [points]);

  if (!hasDevice) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">История температуры</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <Legend color="#0f766e" label="Температура" />
          <Legend color="#d97706" label="Уставка" dashed />
          <Legend color="#94a3b8" label="Нагрев, %" />
          <EventLegend />
        </div>
      </div>

      {!geom ? (
        <div className="mt-6 flex h-40 items-center justify-center rounded-lg bg-zinc-50 text-sm text-zinc-500">
          нет данных
        </div>
      ) : (
        <div className="mt-4">
          {/* Контейнер для SVG + HTML-подписей событий (позиционируются в %). */}
          <div className="relative">
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              className="h-auto w-full"
              role="img"
              aria-label="График температуры, уставки и скважности нагрева во времени с отметками стадий"
              preserveAspectRatio="none"
            >
              {/* Полосы стадий (фон, нейтральные; авария — светло-красная). */}
              {geom.bands.map((b, i) => (
                <rect
                  key={`${b.stage}-${i}`}
                  x={b.x0}
                  y={PAD_T}
                  width={Math.max(0, b.x1 - b.x0)}
                  height={PLOT_H}
                  fill={isFaultStage(b.stage) ? "#fef2f2" : i % 2 === 0 ? "#fafafa" : "#f4f4f5"}
                />
              ))}

              {/* Сетка/ось температур (слева). */}
              {geom.tempTicks.map((t, i) => (
                <g key={`tick-${i}`}>
                  <line
                    x1={PAD_L}
                    x2={VB_W - PAD_R}
                    y1={t.y}
                    y2={t.y}
                    stroke="#e4e4e7"
                    strokeWidth={1}
                  />
                  <text x={PAD_L - 6} y={t.y + 3} textAnchor="end" fontSize={11} fill="#71717a">
                    {t.v.toFixed(0)}
                  </text>
                </g>
              ))}

              {/* Вторая ось (справа): скважность нагрева 0..100%. */}
              {geom.dutyTicks.map((t, i) => (
                <text
                  key={`duty-${i}`}
                  x={VB_W - PAD_R + 6}
                  y={t.y + 3}
                  textAnchor="start"
                  fontSize={11}
                  fill="#94a3b8"
                >
                  {t.v === 100 ? "100%" : t.v}
                </text>
              ))}

              {/* Вертикальные аннотации событий (смена стадии / авария). */}
              {geom.annotations.map((a, i) => (
                <line
                  key={`ann-${i}`}
                  x1={a.x}
                  x2={a.x}
                  y1={PAD_T}
                  y2={PAD_T + PLOT_H}
                  stroke={a.isFault ? "#dc2626" : "#d4d4d8"}
                  strokeWidth={a.isFault ? 1.5 : 1}
                  strokeDasharray="3 3"
                />
              ))}

              {/* Скважность нагрева (вторичная, светлая линия по правой оси). */}
              <path d={geom.dutyPath} fill="none" stroke="#94a3b8" strokeWidth={1.5} opacity={0.85} />

              {/* Уставка (пунктир) и фактическая температура. */}
              <path
                d={geom.setpointPath}
                fill="none"
                stroke="#d97706"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <path
                d={geom.primaryPath}
                fill="none"
                stroke="#0f766e"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Подписи времени (слева/справа). */}
              <text x={PAD_L} y={VB_H - 8} textAnchor="start" fontSize={11} fill="#71717a">
                {fmtTime(geom.tMin)}
              </text>
              <text x={VB_W - PAD_R} y={VB_H - 8} textAnchor="end" fontSize={11} fill="#71717a">
                {fmtTime(geom.tMax)}
              </text>
            </svg>

            {/* HTML-подписи событий поверх графика: чёткие (не тянутся вместе с
                viewBox), позиционируются в % по оси X. */}
            {geom.annotations
              .filter((a) => a.showLabel)
              .map((a, i) => (
                <span
                  key={`lbl-${i}`}
                  className={`pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded px-1 text-[10px] font-medium ${
                    a.isFault ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-600"
                  }`}
                  style={{ left: `${(a.x / VB_W) * 100}%` }}
                >
                  {a.label}
                </span>
              ))}
          </div>

          {/* Подписи стадий под графиком (компактные чипы). */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dedupeStages(geom.bands).map((s) => (
              <span
                key={s}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
              >
                {safeStageLabel(s)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function dedupeStages(bands: { stage: number }[]): number[] {
  const seen: number[] = [];
  for (const b of bands) {
    if (!seen.includes(b.stage)) seen.push(b.stage);
  }
  return seen;
}

function isFaultStage(stage: number): boolean {
  try {
    return stageName(stage) === "FAULT";
  } catch {
    return false;
  }
}

function safeStageLabel(stage: number): string {
  try {
    return stageLabel(stageName(stage));
  } catch {
    return `STAGE_${stage}`;
  }
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={18} height={8} aria-hidden>
        <line
          x1={0}
          y1={4}
          x2={18}
          y2={4}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function EventLegend() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={8} height={10} aria-hidden>
        <line x1={4} y1={0} x2={4} y2={10} stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="3 3" />
      </svg>
      Событие
    </span>
  );
}
