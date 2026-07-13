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

function FragRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className={`shrink-0 font-semibold tabular-nums ${accent ? "text-success" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

type LoopFrame = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
  note: string;
};

const frames: LoopFrame[] = [
  {
    icon: Boxes,
    title: "Склад",
    note: "Остатки, свежесть и цены — по каждой позиции",
    body: (
      <>
        <FragRow label="Солод пилснер · Weyermann" value="4.2 кг" />
        <Meter value={62} />
        <FragRow label="Хмель Saaz · 3.4% АК" value="180 г" />
        <Meter value={34} />
      </>
    )
  },
  {
    icon: FlaskConical,
    title: "Рецепт",
    note: "Статистика пересчитывается при каждой правке засыпи",
    body: (
      <>
        <FragRow label="OG" value="12.5 °P" />
        <FragRow label="IBU · Цвет" value="38 · 12 EBC" />
        <FragRow label="Стиль 21A" value="попадание ✓" accent />
      </>
    )
  },
  {
    icon: Beer,
    title: "Варка",
    note: "План дня собирается из рецепта автоматически",
    body: (
      <>
        <FragRow label="Кипячение" value="60 мин" />
        <Meter value={78} />
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
    note: "Снапшот рецепта хранится вместе с партией",
    body: (
      <>
        <FragRow label="Партия №14" value="день 5" />
        <FragRow label="Замер плотности" value="6.2 °P" />
        <FragRow label="Списание склада" value="выполнено" accent />
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
            <p className="text-xs text-muted-foreground">{frame.note}</p>
          </div>
        );
      })}
    </div>
  );
}
