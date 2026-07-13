"use client";

import React, { useState } from "react";
import Link from "next/link";

import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";
import type { HeroStyleVital } from "@/features/home/style-vitals";

/**
 * Hero-панель стиля (клиентский островок). Данные приходят готовым DTO с сервера
 * ({@link HeroStyleVital}) — здесь только переключение активного стиля, без фетчей
 * и конвертаций. Заливка бокала и цифры анимируются через CSS (см. globals.css:
 * `.home-glass-fill`, `.home-vital-fade`), так что «трогать» продукт можно ещё до
 * входа.
 */
export function HomeStyleVitals({ styles }: { styles: HeroStyleVital[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (styles.length === 0) {
    return null;
  }

  const active = styles[Math.min(activeIndex, styles.length - 1)];

  const stats = [
    { label: "OG", value: active.og },
    { label: "IBU", value: active.ibu },
    { label: "ABV", value: active.abv },
    { label: "Цвет", value: active.ebc }
  ];

  return (
    <div className="rounded-3xl border border-border bg-muted/70 p-5 sm:p-6">
      <div className="flex items-center gap-5">
        <div className="home-glass-fill shrink-0">
          <BeerGlassIcon
            color={active.glassHex}
            gradientFrom={active.glassFrom}
            gradientTo={active.glassTo}
            size={112}
          />
        </div>
        <div key={active.bjcpId} className="home-vital-fade min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            BJCP 2021 · {active.bjcpId}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            <Link href={active.href} className="transition-colors hover:text-muted-foreground hover:underline">
              {active.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{active.colorLabel}</p>
        </div>
      </div>

      <div key={`stats-${active.bjcpId}`} className="home-vital-fade mt-5 grid grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-xl border border-border/80 bg-card p-2.5 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{stat.label}</div>
            {/* truncate вместо whitespace-nowrap без страховки: диапазон вида «11.1–14.6 °P»
                на 360px не влезает в ячейку 4-колоночной сетки и вылезал за карточку. */}
            <div className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground" title={stat.value}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Выбор стиля">
        {styles.map((style, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={style.bjcpId}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveIndex(index)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: style.glassHex }}
                aria-hidden
              />
              {style.title}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Диапазоны — из справочника{" "}
        <Link href="/bjcp" className="border-b border-border text-muted-foreground hover:border-border">
          стилей BJCP
        </Link>
      </p>
    </div>
  );
}
