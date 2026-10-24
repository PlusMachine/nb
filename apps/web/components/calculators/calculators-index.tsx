import Link from "next/link";
import React from "react";
import { Sticker } from "lucide-react";

import type { CalculatorCardItem } from "@/features/calculators/catalog";

import { CalculatorFavoritesProvider } from "./calculator-favorites-provider";
import { CalculatorsSearch } from "./calculators-search";

// Реэкспорт для существующих потребителей (например, дашборд /app), чтобы не
// менять их путь импорта после выноса карточки в отдельный файл.
export { CalculatorCard } from "./calculator-card";

export function CalculatorsIndex({ calculators }: { calculators: CalculatorCardItem[] }) {
  return (
    <main className="pb-16 pt-5 sm:pt-6">
      <section className="mb-5 border-b border-border pb-4 sm:mb-6">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            Калькуляторы для пивоварения
          </h1>
        </div>
      </section>

      <CalculatorFavoritesProvider slugs={calculators.map((calculator) => calculator.slug)}>
        <CalculatorsSearch calculators={calculators} />
      </CalculatorFavoritesProvider>

      {/* Наклейки — не расчёт, поэтому вне каталога калькуляторов (у того свои
          контракты: формула, допущения, SEO-кластер), но рядом: инструмент из
          того же ящика. */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Инструменты</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/labels"
            className="group relative flex h-[150px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Sticker className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-base font-semibold text-foreground">Наклейки на бутылки</span>
              <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                Готовый файл для печати: заполните поля или возьмите данные рецепта
              </span>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
