import Link from "next/link";
import React from "react";

import {
  calculatorBySlug,
  calculatorCardItems,
  calculators,
  popularCalculatorSlugs
} from "@/features/calculators/catalog";

import { CalculatorFavoritesProvider } from "./calculator-favorites-provider";
import { CalculatorsSearch } from "./calculators-search";

// Реэкспорт для существующих потребителей (например, дашборд /app), чтобы не
// менять их путь импорта после выноса карточки в отдельный файл.
export { CalculatorCard } from "./calculator-card";

export function CalculatorsIndex() {
  return (
    <main className="pb-16 pt-5 sm:pt-6">
      <section className="mb-5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm sm:mb-6 sm:px-5">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            Калькуляторы для пивоварения
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Расчеты для домашнего пивоварения: плотность и алкоголь, горечь, вода, дрожжи, карбонизация и розлив.
            У каждого калькулятора — формула и допущения, на которых строится результат.
          </p>
        </div>
      </section>

      <div className="mb-5 sm:mb-6">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Популярные
        </p>
        <div className="flex flex-wrap gap-2">
          {popularCalculatorSlugs.map((slug) => {
            const calculator = calculatorBySlug[slug];
            return (
              <Link
                key={slug}
                href={calculator.href}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
              >
                {calculator.shortTitle}
              </Link>
            );
          })}
        </div>
      </div>

      <CalculatorFavoritesProvider slugs={calculators.map((calculator) => calculator.slug)}>
        <CalculatorsSearch calculators={calculatorCardItems} />
      </CalculatorFavoritesProvider>
    </main>
  );
}
