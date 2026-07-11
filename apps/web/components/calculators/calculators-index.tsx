import React from "react";

import { calculatorCardItems, calculators } from "@/features/calculators/catalog";

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
          </p>
        </div>
      </section>

      <CalculatorFavoritesProvider slugs={calculators.map((calculator) => calculator.slug)}>
        <CalculatorsSearch calculators={calculatorCardItems} />
      </CalculatorFavoritesProvider>
    </main>
  );
}
