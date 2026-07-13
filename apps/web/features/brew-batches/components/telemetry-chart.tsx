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
  /**
   * Управляемый режим: владелец сам ведёт ряд точек (демо-пульт с клиентской
   * симуляцией — /demo). Когда задан, история следует за пропом, а fetch-поллинг
   * source не запускается: серверу неоткуда знать состояние симуляции в браузере.
   */
  live?: TelemetryHistoryPoint[];
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

export function TelemetryChart({ source, hasDevice, initial, live }: Props) {
  const [points, setPoints] = useState<TelemetryHistoryPoint[]>(initial);
  const historyUrl = telemetryEndpoints(source).history;
  const controlled = live !== undefined;

  // Управляемый режим: ряд ведёт владелец, поллинг не нужен.
  useEffect(() => {
    if (live) setPoints(live);
  }, [live]);

  // Периодически подтягиваем свежую историю (варка/устройство активны прямо сейчас).
  useEffect(() => {
    if (!hasDevice || controlled) return;
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
  }, [historyUrl, hasDevice, controlled]);

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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">История температуры</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend color="hsl(var(--chart-temp))" label="Температура" />
          <Legend color="hsl(var(--chart-setpoint))" label="Уставка" dashed />
          <Legend color="hsl(var(--chart-heater))" label="Нагрев, %" />
          <EventLegend />
        </div>
      </div>

      {!geom ? (
        <div className="mt-6 flex h-40 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
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
                  fill={isFaultStage(b.stage) ? "hsl(var(--chart-fault-bg))" : i % 2 === 0 ? "hsl(var(--chart-zebra))" : "transparent"}
                />
              ))}

              {/* Сетка оси температур (слева) — линии SVG-масштабируемые, ОК; подписи
                  вынесены в HTML-оверлей ниже (см. под svg): текст внутри viewBox
                  тянется вместе с масштабом, а на телефоне (карточка ~290px, коэффициент
                  ≈0.36) кегль 11 превращается в ~4px и становится нечитаем. */}
              {geom.tempTicks.map((t, i) => (
                <line
                  key={`tick-${i}`}
                  x1={PAD_L}
                  x2={VB_W - PAD_R}
                  y1={t.y}
                  y2={t.y}
                  stroke="hsl(var(--chart-grid))"
                  strokeWidth={1}
                />
              ))}

              {/* Вертикальные аннотации событий (смена стадии / авария). */}
              {geom.annotations.map((a, i) => (
                <line
                  key={`ann-${i}`}
                  x1={a.x}
                  x2={a.x}
                  y1={PAD_T}
                  y2={PAD_T + PLOT_H}
                  stroke={a.isFault ? "hsl(var(--chart-fault))" : "hsl(var(--chart-grid))"}
                  strokeWidth={a.isFault ? 1.5 : 1}
                  strokeDasharray="3 3"
                />
              ))}

              {/* Скважность нагрева (вторичная, светлая линия по правой оси). */}
              <path d={geom.dutyPath} fill="none" stroke="hsl(var(--chart-heater))" strokeWidth={1.5} opacity={0.85} />

              {/* Уставка (пунктир) и фактическая температура. */}
              <path
                d={geom.setpointPath}
                fill="none"
                stroke="hsl(var(--chart-setpoint))"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <path
                d={geom.primaryPath}
                fill="none"
                stroke="hsl(var(--chart-temp))"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>

            {/* HTML-подписи осей и событий поверх графика: чёткие (не тянутся вместе с
                viewBox), позиционируются в % по осям X/Y — тот же приём, что уже был
                для событийных меток. */}
            {geom.tempTicks.map((t, i) => (
              <span
                key={`temp-tick-${i}`}
                className="pointer-events-none absolute -translate-y-1/2 -translate-x-full whitespace-nowrap pr-1 text-[11px] text-muted-foreground"
                style={{ left: `${(PAD_L / VB_W) * 100}%`, top: `${(t.y / VB_H) * 100}%` }}
              >
                {t.v.toFixed(0)}
              </span>
            ))}
            {geom.dutyTicks.map((t, i) => (
              <span
                key={`duty-tick-${i}`}
                className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap pl-1 text-[11px]"
                style={{ left: `${((VB_W - PAD_R) / VB_W) * 100}%`, top: `${(t.y / VB_H) * 100}%`, color: "hsl(var(--chart-heater))" }}
              >
                {t.v === 100 ? "100%" : t.v}
              </span>
            ))}
            <span
              className="pointer-events-none absolute bottom-0 whitespace-nowrap text-[11px] text-muted-foreground"
              style={{ left: `${(PAD_L / VB_W) * 100}%` }}
            >
              {fmtTime(geom.tMin)}
            </span>
            <span
              className="pointer-events-none absolute bottom-0 -translate-x-full whitespace-nowrap text-[11px] text-muted-foreground"
              style={{ left: `${((VB_W - PAD_R) / VB_W) * 100}%` }}
            >
              {fmtTime(geom.tMax)}
            </span>
            {geom.annotations
              .filter((a) => a.showLabel)
              .map((a, i) => (
                <span
                  key={`lbl-${i}`}
                  className={`pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded px-1 text-[10px] font-medium ${
                    a.isFault ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
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
                className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
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
        <line x1={4} y1={0} x2={4} y2={10} stroke="hsl(var(--chart-label))" strokeWidth={1.5} strokeDasharray="3 3" />
      </svg>
      Событие
    </span>
  );
}
