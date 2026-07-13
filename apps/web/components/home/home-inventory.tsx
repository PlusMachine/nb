import React from "react";
import Link from "next/link";

import { BrewabilityBadgePill } from "@/components/recipes/brewability-badge-pill";
import type { BrewabilityBadge } from "@/features/recipes/brewability-badge";

/**
 * Секция склада на главной — core-механика продукта: учёт остатков + сверка
 * витрины рецептов со складом («что можно сварить»). Статичная серверная секция;
 * позиции и числа — иллюстрация формата данных, но бейдж — настоящий
 * BrewabilityBadgePill на собранном вручную BrewabilityBadge: текст и палитра не
 * должны разъезжаться с рабочей зоной, иначе главная обещает одно, а склад
 * говорит другое.
 */

function StockRow({ label, value, level }: { label: string; value: string; level: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-warning" style={{ width: `${level}%` }} />
      </div>
    </div>
  );
}

function MatchRow({ title, missing = 0 }: { title: string; missing?: number }) {
  const badge: BrewabilityBadge =
    missing > 0
      ? { tier: "almost", missing, qtyShort: false }
      : { tier: "ready", missing: 0, qtyShort: false };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{title}</span>
      <BrewabilityBadgePill badge={badge} />
    </div>
  );
}

export function HomeInventory() {
  return (
    <section className="grid grid-cols-1 items-center gap-8 rounded-[2rem] border border-border bg-card p-6 shadow-sm sm:p-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Склад</p>
        <h2 className="mt-3 text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          Занесите остатки — увидите, что можно сварить
        </h2>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
          Склад ведёт остатки солода, хмеля и дрожжей. Витрина рецептов сверяется с ним
          и показывает, на что запасов хватает уже сегодня, а чего докупить.
        </p>
        <Link
          href="/login?next=/app/ingredients"
          className="mt-7 inline-flex items-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Начать со склада
        </Link>
      </div>

      <div className="rounded-[1.25rem] border border-border bg-muted p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Мой склад</span>
          <span className="text-xs tabular-nums text-muted-foreground">14 позиций</span>
        </div>
        <div className="mt-4 space-y-3">
          <StockRow label="Солод пилснер · Weyermann" value="4.2 кг" level={62} />
          <StockRow label="Хмель Saaz · 3.4% АК" value="180 г" level={34} />
          <StockRow label="Дрожжи W-34/70 · сухие" value="2 уп." level={80} />
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Что можно сварить</span>
          <div className="mt-3 space-y-2">
            <MatchRow title="Чешский светлый лагер 12°" />
            <MatchRow title="Американский пейл-эль" missing={1} />
          </div>
        </div>
      </div>
    </section>
  );
}
