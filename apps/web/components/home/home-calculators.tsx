import React from "react";
import Link from "next/link";
import { Gauge, Leaf, Palette, Percent } from "lucide-react";

import { srmToHex } from "@/features/recipes/beer-color";

/**
 * Секция калькуляторов на главной — презентация, а не инструмент. Колода карточек
 * лежит 3D-стопкой (CSS-перспектива + preserve-3d, статичные inline-трансформы),
 * верхняя карта — богатый мокап «Крепость», из-под неё выглядывают ещё три с
 * подписью и сигнатурным значением: сразу видно, что калькуляторов много и разных.
 * Сама колода декоративна (aria-hidden); функциональный вход — кнопка «Все
 * калькуляторы». Числа иллюстративные, без Date/random.
 */

// Свотч цвета пива из общей SRM-палитры сайта (та же srmToHex, что в hero-спектре).
const SRM_SWATCH = `linear-gradient(90deg, ${[2, 3, 4, 6, 8, 11, 17]
  .map((srm) => srmToHex(srm))
  .join(", ")})`;

type DeckCard = {
  key: string;
  icon: typeof Percent;
  title: string;
  value: string;
  accent: string;
  // Трансформа стопки: смещение и поворот в плоскости + подъём по Z (глубина).
  transform: string;
  z: number;
  body: React.ReactNode;
};

function FrontBody() {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[40px] font-extrabold leading-none tracking-tight text-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
          5.4
        </span>
        <span className="text-lg font-bold text-foreground">%</span>
        <span className="ml-1 text-sm text-muted-foreground">об.</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md bg-muted px-2 py-1 font-semibold tabular-nums text-foreground">OG 12.5°P</span>
        <span className="text-muted-foreground">→</span>
        <span className="rounded-md bg-muted px-2 py-1 font-semibold tabular-nums text-foreground">FG 2.6°P</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">сбраживание</span>
          <span className="font-semibold tabular-nums text-foreground">79%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-amber-500" style={{ width: "79%" }} />
        </div>
      </div>
    </div>
  );
}

const cards: DeckCard[] = [
  {
    key: "abv",
    icon: Percent,
    title: "Крепость",
    value: "5.4% об.",
    accent: "from-amber-400 to-amber-500",
    transform: "translate(-50%, -50%) translateZ(60px) translate(-14px, 26px) rotate(-3deg)",
    z: 60,
    body: <FrontBody />
  },
  {
    key: "color",
    icon: Palette,
    title: "Цвет пива",
    value: "7 SRM",
    accent: "from-yellow-400 to-orange-500",
    transform: "translate(-50%, -50%) translateZ(42px) translate(18px, -18px) rotate(2.5deg)",
    z: 42,
    body: (
      <div className="space-y-2">
        <div className="h-6 rounded-lg" style={{ background: SRM_SWATCH }} aria-hidden />
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">7 SRM</span>
          <span className="font-semibold tabular-nums text-foreground">14 EBC</span>
        </div>
      </div>
    )
  },
  {
    key: "ibu",
    icon: Leaf,
    title: "Горечь",
    value: "38 IBU",
    accent: "from-emerald-400 to-emerald-500",
    transform: "translate(-50%, -50%) translateZ(24px) translate(48px, -58px) rotate(6deg)",
    z: 24,
    body: (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">BU : GU</span>
          <span className="font-semibold tabular-nums text-foreground">0.75</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-emerald-500" style={{ width: "58%" }} />
        </div>
      </div>
    )
  },
  {
    key: "carb",
    icon: Gauge,
    title: "Карбонизация",
    value: "2.4 CO₂",
    accent: "from-sky-400 to-blue-500",
    transform: "translate(-50%, -50%) translateZ(8px) translate(76px, -96px) rotate(9.5deg)",
    z: 8,
    body: (
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">12 °C</span>
        <span className="font-semibold tabular-nums text-foreground">12 PSI</span>
      </div>
    )
  }
];

function DeckCardView({ card }: { card: DeckCard }) {
  const Icon = card.icon;
  return (
    <article
      className="absolute left-1/2 top-1/2 w-64 rounded-2xl border border-border bg-card p-4 shadow-[0_28px_50px_-28px_rgba(15,23,42,0.55)]"
      style={{ transform: card.transform, zIndex: card.z }}
    >
      <div className="flex items-center gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${card.accent} text-white`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold text-foreground">{card.title}</span>
        <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">{card.value}</span>
      </div>
      <div className="mt-4">{card.body}</div>
    </article>
  );
}

export function HomeCalculators() {
  return (
    <section className="grid items-center gap-8 rounded-[2rem] border border-border bg-card p-6 shadow-sm sm:p-9 lg:grid-cols-[0.85fr_1fr] lg:gap-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Инструменты</p>
        <h2 className="mt-3 text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          Калькуляторы пивоварения
        </h2>
        <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted-foreground">
          15 калькуляторов пивовара: крепость и сбраживание, горечь, цвет, вода и pH,
          карбонизация, свежесть хмеля. Каждый считает по вашим числам и объясняет формулу.
        </p>
        <Link
          href="/calculators"
          className="mt-7 inline-flex items-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Все калькуляторы
        </Link>
      </div>

      <div className="relative h-[340px] w-full [perspective:1500px]" aria-hidden>
        {/* мягкая «тень на столе» под стопкой */}
        <div className="absolute left-1/2 top-[62%] h-24 w-[70%] -translate-x-1/2 rounded-[50%] bg-foreground/10 blur-2xl" />
        <div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d", transform: "rotateX(9deg) rotateY(-13deg)" }}
        >
          {cards.map((card) => (
            <DeckCardView key={card.key} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}
