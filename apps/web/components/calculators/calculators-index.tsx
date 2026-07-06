import Link from "next/link";
import React, { type CSSProperties } from "react";

import {
  calculatorSections,
  calculators,
  isCalculatorVerified,
  type CalculatorCatalogItem,
  type CalculatorSlug
} from "@/features/calculators/catalog";

import { CalculatorFavoriteToggle } from "./calculator-favorite-toggle";
import { CalculatorFavoritesProvider } from "./calculator-favorites-provider";

// Пометка статуса валидации — только в dev, чтобы отслеживать непроверенные калькуляторы.
const devMode = process.env.NODE_ENV !== "production";

const calculatorCardBackgrounds: Partial<Record<CalculatorSlug, string>> = {
  "abv-attenuation": "/images/calculators/2-Photoroom.png",
  "refractometer-correction": "/images/calculators/3-Photoroom.png",
  "hydrometer-correction": "/images/calculators/4-Photoroom.png",
  "unit-converter": "/images/calculators/6-Photoroom.png",
  "dilution-boiloff": "/images/calculators/5-Photoroom.png",
  ibu: "/images/calculators/8-Photoroom.png",
  "brewing-water-volume": "/images/calculators/13-Photoroom.png",
  "beer-color": "/images/calculators/9-Photoroom.png",
  "water-ph": "/images/calculators/15-Photoroom.png",
  "yeast-starter": "/images/calculators/7-Photoroom.png",
  "hop-freshness": "/images/calculators/10-Photoroom.png",
  "priming-sugar": "/images/calculators/16-Photoroom.png",
  "keg-carbonation": "/images/calculators/1-Photoroom.png",
  bottling: "/images/calculators/18-Photoroom.png",
  "speise-krausen": "/images/calculators/17-Photoroom.png"
};

export function CalculatorCard({ calculator }: { calculator: CalculatorCatalogItem }) {
  const backgroundImage = calculatorCardBackgrounds[calculator.slug];
  const style: CSSProperties | undefined = backgroundImage
    ? { backgroundImage: `url("${backgroundImage}")` }
    : undefined;

  return (
    <div
      className="group relative h-[150px] overflow-hidden rounded-2xl border border-border bg-card bg-contain bg-right-bottom bg-no-repeat shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md active:scale-[0.98]"
      data-calculator-card={calculator.slug}
      style={style}
    >
      <Link
        href={calculator.href}
        aria-label={calculator.shortTitle}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card from-50% to-transparent" />
      <CalculatorFavoriteToggle
        slug={calculator.slug}
        suppressParentInteraction
        className="absolute right-2 top-2 z-10"
      />
      <article className="pointer-events-none relative z-[1] flex h-full flex-col justify-between p-3.5 sm:p-4">
        <div className="max-w-[65%] space-y-0.5">
          <h3 className="text-[14px] font-semibold leading-snug text-foreground sm:text-[15px]">
            {calculator.shortTitle}
          </h3>
          <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
            {calculator.description}
          </p>
        </div>
        {devMode ? (
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isCalculatorVerified(calculator.slug)
                ? "bg-success-subtle text-success-subtle-foreground"
                : "bg-warning-subtle text-warning-subtle-foreground"
            }`}
          >
            {isCalculatorVerified(calculator.slug) ? "✓ проверен" : "не проверен"}
          </span>
        ) : null}
      </article>
    </div>
  );
}

export function CalculatorsIndex() {
  return (
    <main className="pb-16 pt-5 sm:pt-6">
      <section className="mb-5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm sm:mb-6 sm:px-5">
        <div className="max-w-3xl space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">hmelo tools</p>
          <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            Калькуляторы для пивоварения
          </h1>
        </div>
      </section>

      <section aria-label="Все калькуляторы">
        <CalculatorFavoritesProvider slugs={calculators.map((calculator) => calculator.slug)}>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {calculatorSections.flatMap((section) =>
              calculators
                .filter((calculator) => calculator.section === section)
                .map((calculator) => (
                  <CalculatorCard key={calculator.slug} calculator={calculator} />
                ))
            )}
          </div>
        </CalculatorFavoritesProvider>
      </section>
    </main>
  );
}
