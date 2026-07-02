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
const OVERLAY_BANNER: Record<
  Exclude<TimelineOverlay, "none">,
  { label: string; cls: string; Icon: typeof Pause }
> = {
  idle: { label: "Ожидание запуска варки", cls: "bg-zinc-100 text-zinc-600", Icon: Clock },
  delayed_start: { label: "Отложенный старт", cls: "bg-zinc-100 text-zinc-600", Icon: Clock },
  paused: { label: "Пауза — варка приостановлена", cls: "bg-amber-100 text-amber-800", Icon: Pause },
  manual: { label: "Ручной режим — прямое управление контуром", cls: "bg-indigo-100 text-indigo-800", Icon: Hand },
  fault: { label: "Авария — варка остановлена интерлоком", cls: "bg-red-100 text-red-800", Icon: OctagonX },
};

export function StageTimeline({ telemetry, hasDevice }: Props) {
  const [selected, setSelected] = useState<MacroStage | null>(null);
  const timeline = stageTimelineFromTelemetry(telemetry);

  if (!hasDevice || !timeline) return null;

  const overlayBanner = timeline.overlay !== "none" ? OVERLAY_BANNER[timeline.overlay] : null;
  const selectedSegment = selected ? timeline.segments.find((s) => s.macro === selected) ?? null : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Ход варки</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-zinc-900">{timeline.currentLabel || "—"}</span>
          {timeline.substepLabel ? (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {timeline.substepLabel}
            </span>
          ) : null}
        </div>
      </div>

      {overlayBanner ? (
        <p className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${overlayBanner.cls}`}>
          <overlayBanner.Icon className="h-3.5 w-3.5" aria-hidden />
          {overlayBanner.label}
        </p>
      ) : null}

      {/* Полоса стадий. Сегменты — кнопки: клик раскрывает состав/статус. */}
      <ol className="mt-4 flex items-stretch gap-1.5" aria-label="Стадии варки">
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
        <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <span className="font-semibold text-zinc-800">{selectedSegment.label}</span>
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
      className={`group flex w-full flex-col gap-1 rounded-lg px-1 py-1 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
        active ? "bg-zinc-50" : ""
      }`}
    >
      <span
        className={`truncate text-[11px] font-medium ${
          isCurrent ? "text-zinc-900" : isDone ? "text-zinc-600" : "text-zinc-400"
        }`}
      >
        {segment.label}
      </span>
      <span className="relative h-2 overflow-hidden rounded-full bg-zinc-200">
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] ${
            isCurrent ? "bg-teal-500" : "bg-zinc-800"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </span>
    </button>
  );
}
