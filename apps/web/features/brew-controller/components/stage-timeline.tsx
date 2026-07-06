"use client";

// =============================================================================
//  StageTimeline — интерактивная полоса стадий варки (зоны A/B).
//  Сворачивает bf_stage_t в 5 макро-стадий (Затор → Кипячение → Вирпул →
//  Охлаждение → Готово): пройденные залиты, текущая с долей заполнения, будущие
//  приглушены. Overlay-состояния (пауза/ручной/авария/ожидание) — баннером сверху.
//
//  Презентационный: кормится готовым снимком телеметрии из LiveDashboard (общий
//  SSE зоны A/B) — своего стрима НЕ поднимает. Клик по сегменту раскрывает, какие
//  стадии в него входят и его статус.
// =============================================================================
import { useState } from "react";
import { Pause, Hand, OctagonX, Clock } from "lucide-react";

import type { Telemetry } from "@nb/brewforge-protocol";

import { deriveAppMode } from "@/features/brew-controller/device-mode";
import {
  MACRO_STAGE_MEMBERS,
  stageTimelineFromTelemetry,
  type MacroStage,
  type TimelineOverlay,
  type TimelineSegment,
} from "@/features/brew-controller/stage-timeline";

type Props = {
  telemetry: Telemetry | null;
  hasDevice: boolean;
};

const STATE_LABEL: Record<TimelineSegment["state"], string> = {
  done: "пройдено",
  current: "идёт сейчас",
  future: "впереди",
};

// Overlay-баннер: иконка + текст + палитра (цвет — только для нештатных состояний).
// Текст режимозависим (§5) — прибор мультирежимный, «варка» на дистилляции была
// бы враньём; label здесь пара {brew, distill} по образцу SECTION_TITLE ниже.
// Тексты без слова «варка» (delayed_start/manual) одинаковы для любого режима.
const OVERLAY_BANNER: Record<
  Exclude<TimelineOverlay, "none">,
  { label: Record<"brew" | "distill", string>; cls: string; Icon: typeof Pause }
> = {
  idle: {
    label: { brew: "Ожидание запуска варки", distill: "Ожидание запуска перегона" },
    cls: "bg-muted text-muted-foreground",
    Icon: Clock,
  },
  delayed_start: {
    label: { brew: "Отложенный старт", distill: "Отложенный старт" },
    cls: "bg-muted text-muted-foreground",
    Icon: Clock,
  },
  paused: {
    label: { brew: "Пауза — варка приостановлена", distill: "Пауза — перегон приостановлен" },
    cls: "bg-warning-subtle text-warning-subtle-foreground",
    Icon: Pause,
  },
  manual: {
    label: {
      brew: "Ручной режим — прямое управление контуром",
      distill: "Ручной режим — прямое управление контуром",
    },
    cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300",
    Icon: Hand,
  },
  fault: {
    label: { brew: "Авария — варка остановлена интерлоком", distill: "Авария — перегон остановлен интерлоком" },
    cls: "bg-destructive-subtle text-destructive-subtle-foreground",
    Icon: OctagonX,
  },
};

// Заголовок секции и подпись полосы по режиму прибора (§5) — сама полоса уже
// строится из модели (segments), здесь только рамочный текст вокруг неё.
const SECTION_TITLE: Record<"brew" | "distill", string> = {
  brew: "Ход варки",
  distill: "Ход перегона",
};
const SEGMENTS_ARIA_LABEL: Record<"brew" | "distill", string> = {
  brew: "Стадии варки",
  distill: "Стадии перегона",
};

export function StageTimeline({ telemetry, hasDevice }: Props) {
  const [selected, setSelected] = useState<MacroStage | null>(null);
  const timeline = stageTimelineFromTelemetry(telemetry);

  if (!hasDevice || !timeline) return null;

  // FERMENT уже отфильтрован (timeline === null); здесь только brew/distill.
  const appMode = deriveAppMode(telemetry) === "distill" ? "distill" : "brew";

  const overlayBanner = timeline.overlay !== "none" ? OVERLAY_BANNER[timeline.overlay] : null;
  const selectedSegment = selected ? timeline.segments.find((s) => s.macro === selected) ?? null : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{SECTION_TITLE[appMode]}</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">{timeline.currentLabel || "—"}</span>
          {timeline.substepLabel ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {timeline.substepLabel}
            </span>
          ) : null}
        </div>
      </div>

      {overlayBanner ? (
        <p className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${overlayBanner.cls}`}>
          <overlayBanner.Icon className="h-3.5 w-3.5" aria-hidden />
          {overlayBanner.label[appMode]}
        </p>
      ) : null}

      {/* Полоса стадий. Сегменты — кнопки: клик раскрывает состав/статус. */}
      <ol className="mt-4 flex items-stretch gap-1.5" aria-label={SEGMENTS_ARIA_LABEL[appMode]}>
        {timeline.segments.map((segment) => (
          <li key={segment.macro} className="min-w-0 flex-1">
            <SegmentBar
              segment={segment}
              active={selected === segment.macro}
              onSelect={() => setSelected((prev) => (prev === segment.macro ? null : segment.macro))}
            />
          </li>
        ))}
      </ol>

      {/* Раскрытая подсказка по выбранному сегменту (интерактивность). */}
      {selectedSegment ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{selectedSegment.label}</span>
          {" — "}
          {STATE_LABEL[selectedSegment.state]}. {MACRO_STAGE_MEMBERS[selectedSegment.macro]}.
        </p>
      ) : null}
    </section>
  );
}

function SegmentBar({
  segment,
  active,
  onSelect,
}: {
  segment: TimelineSegment;
  active: boolean;
  onSelect: () => void;
}) {
  const isCurrent = segment.state === "current";
  const isDone = segment.state === "done";
  // Ширина заполнения: пройденная стадия — целиком, текущая — по доле прогресса.
  const fillPct = isDone ? 100 : isCurrent ? Math.round((segment.progress ?? 0) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group flex w-full flex-col gap-1 rounded-lg px-1 py-1 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "bg-muted" : ""
      }`}
    >
      <span
        className={`truncate text-[11px] font-medium ${
          isCurrent ? "text-foreground" : isDone ? "text-muted-foreground" : "text-muted-foreground"
        }`}
      >
        {segment.label}
      </span>
      <span className="relative h-2 overflow-hidden rounded-full bg-border">
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] ${
            isCurrent ? "bg-teal-500" : "bg-foreground"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </span>
    </button>
  );
}
