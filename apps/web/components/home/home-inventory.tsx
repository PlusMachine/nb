import React from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";

/**
 * Секция склада на главной — core-механика продукта: учёт остатков + сверка
 * витрины рецептов со складом («что можно сварить»). Статичная серверная секция;
 * позиции и числа — иллюстрация формата данных, бейджи повторяют семантику и
 * палитру RecipeMatchBadge («Хватает всего» / «Не хватает N»).
 */

function StockRow({ label, value, level }: { label: string; value: string; level: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-zinc-600">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-zinc-900">{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-zinc-200" aria-hidden>
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${level}%` }} />
      </div>
    </div>
  );
}

function MatchRow({ title, ready, missing }: { title: string; ready?: boolean; missing?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <span className="min-w-0 truncate text-[13px] font-medium text-zinc-900">{title}</span>
      {ready ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          <CircleCheck className="h-3.5 w-3.5" aria-hidden />
          Хватает всего
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          Не хватает {missing}
        </span>
      )}
    </div>
  );
}

export function HomeInventory() {
  return (
    <section className="grid items-center gap-8 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-9 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Склад</p>
        <h2 className="mt-3 text-balance text-2xl font-semibold leading-tight text-zinc-950 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          Занесите остатки — увидите, что можно сварить
        </h2>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-zinc-600">
          Склад ведёт остатки солода, хмеля и дрожжей. Витрина рецептов сверяется с ним
          и показывает, на что запасов хватает уже сегодня, а чего докупить.
        </p>
        <Link
          href="/login?next=/app/ingredients"
          className="mt-7 inline-flex items-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          Начать со склада
        </Link>
      </div>

      <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-zinc-500">Мой склад</span>
          <span className="text-xs tabular-nums text-zinc-400">14 позиций</span>
        </div>
        <div className="mt-4 space-y-3">
          <StockRow label="Солод пилснер · Weyermann" value="4.2 кг" level={62} />
          <StockRow label="Хмель Saaz · 3.4% АК" value="180 г" level={34} />
          <StockRow label="Дрожжи W-34/70 · сухие" value="2 уп." level={80} />
        </div>
        <div className="mt-5 border-t border-zinc-200 pt-4">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-zinc-500">Что можно сварить</span>
          <div className="mt-3 space-y-2">
            <MatchRow title="Чешский светлый лагер 12°" ready />
            <MatchRow title="Американский пейл-эль" missing={1} />
          </div>
        </div>
      </div>
    </section>
  );
}
