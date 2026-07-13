"use client";

import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { calculatorSections, type CalculatorCardItem } from "@/features/calculators/catalog";

import { CalculatorCard } from "./calculator-card";

// ё и е — частая опечатка/вариативность ввода (тёрка ~ терка), не должна мешать поиску.
const normalize = (value: string) => value.toLowerCase().replace(/ё/g, "е");

export const matchesCalculatorQuery = (calculator: CalculatorCardItem, query: string) => {
  const haystack = normalize(
    [calculator.title, calculator.shortTitle, calculator.description, ...calculator.aliases].join(" ")
  );
  return haystack.includes(normalize(query.trim()));
};

// Подсказки в плейсхолдере — обещание: каждая обязана что-то находить (см. тест
// calculators-search.test.ts). Меняя их, проверь алиасы в каталоге.
export const calculatorSearchHints = ["ibu", "праймер", "brix"];

/**
 * Клиентская обёртка индекса калькуляторов: строка поиска + сетка карточек.
 * Пустой запрос (в т.ч. на первом рендере при SSR/SSG) рендерит секции ровно
 * как раньше — это важно для статического HTML и не требует URL-параметров
 * или дебаунса, фильтрация по 15 карточкам дешевле их обоих.
 */
export function CalculatorsSearch({
  calculators
}: {
  calculators: CalculatorCardItem[];
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalize(query.trim());

  const filtered = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }
    return calculators.filter((calculator) => matchesCalculatorQuery(calculator, normalizedQuery));
  }, [calculators, normalizedQuery]);

  return (
    <div>
      <div className="relative mb-5 sm:mb-6">
        <label htmlFor="calculators-search" className="sr-only">
          Поиск калькулятора
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="calculators-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Название или термин: ${calculatorSearchHints.join(", ")}…`}
          className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        {query ? (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {filtered === null ? (
        calculatorSections.map((section) => (
          <section key={section} aria-label={section} className="mb-6 last:mb-0 sm:mb-7">
            <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:mb-3">
              {section}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {calculators
                .filter((calculator) => calculator.section === section)
                .map((calculator) => (
                  <CalculatorCard key={calculator.slug} calculator={calculator} />
                ))}
            </div>
          </section>
        ))
      ) : filtered.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-muted p-10 text-center">
          <h2 className="text-lg font-semibold text-foreground">Ничего не нашлось</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Не нашли калькулятор по запросу «{query.trim()}». Попробуйте другое слово или сбросьте поиск.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 inline-flex items-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:bg-foreground/90"
          >
            Сбросить поиск
          </button>
        </section>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((calculator) => (
            <CalculatorCard key={calculator.slug} calculator={calculator} />
          ))}
        </div>
      )}
    </div>
  );
}
