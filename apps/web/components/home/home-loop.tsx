import React from "react";
import { Beer, Boxes, Droplets, FlaskConical, type LucideIcon } from "lucide-react";

/**
 * Петля мастерской на главной: Склад → Рецепт → Варка → Брожение, но не иконками, а
 * фрагментами настоящего интерфейса — порядок и есть объяснение, подписи-слоганы
 * не нужны. Статичная серверная секция; числа — иллюстративные. На мобиле фреймы
 * прокручиваются горизонтально со снапом.
 */

function Meter({ value }: { value: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-warning" style={{ width: `${value}%` }} />
    </div>
  );
}

function FragRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

type LoopFrame = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const frames: LoopFrame[] = [
  {
    icon: Boxes,
    title: "Склад",
    body: (
      <>
        <FragRow label="Солод Pale Ale" value="5,5 кг" />
        <FragRow label="Хмель Citra" value="180 г" />
        <FragRow label="Дрожжи US-05" value="2 уп." />
      </>
    )
  },
  {
    icon: FlaskConical,
    title: "Рецепт",
    body: (
      <>
        <FragRow label="OG" value="15 °P" />
        <FragRow label="IBU · Цвет" value="55 · 16 EBC" />
        <FragRow label="Стиль 21A" value="American IPA" />
      </>
    )
  },
  {
    icon: Beer,
    title: "Варка",
    body: (
      <>
        <FragRow label="Кипячение" value="45 из 60 мин" />
        <Meter value={75} />
        <div className="flex items-center gap-2 pt-0.5 font-semibold text-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
          <span className="tabular-nums">Через 12:30 — внести Citra, 30 г</span>
        </div>
      </>
    )
  },
  {
    icon: Droplets,
    title: "Брожение",
    body: (
      <>
        <FragRow label="Партия №14" value="день 5" />
        <FragRow label="Замер плотности" value="6,2 °P" />
        <FragRow label="Температура" value="19 °C" />
      </>
    )
  }
];

export function HomeLoop() {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 sm:pb-0 lg:grid-cols-4">
      {frames.map((frame, index) => {
        const Icon = frame.icon;
        return (
          <div
            key={frame.title}
            className="flex w-[78%] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:w-auto sm:shrink"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="text-[17px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {frame.title}
              </span>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted p-3 text-[13px]">
              {frame.body}
            </div>
          </div>
        );
      })}
    </div>
  );
}
