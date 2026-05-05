import Link from "next/link";
import { ArrowRight } from "lucide-react";
import React, { type CSSProperties } from "react";

import {
  calculatorSections,
  calculators,
  type CalculatorCatalogItem,
  type CalculatorSlug
} from "@/features/calculators/catalog";

type CalculatorCardCopy = {
  title: string;
  description: string;
};

const calculatorCardCopy: Record<CalculatorSlug, CalculatorCardCopy> = {
  "abv-attenuation": {
    title: "Крепость и сбраживание",
    description: "ABV, ABW и степень сбраживания по OG и FG."
  },
  "refractometer-correction": {
    title: "Поправка рефрактометра на алкоголь",
    description: "Пересчет Brix/Plato после начала брожения."
  },
  "hydrometer-correction": {
    title: "Поправка ареометра по температуре",
    description: "Коррекция SG/Plato по температуре пробы."
  },
  "unit-converter": {
    title: "Пивоваренный конвертер единиц",
    description: "SG, Plato, Brix, объем, вес, температура и давление."
  },
  "dilution-boiloff": {
    title: "Коррекция объема и плотности сусла",
    description: "Разбавление, уваривание и добавка экстракта до цели."
  },
  ibu: {
    title: "Горечь пива (IBU)",
    description: "Расчет горечи по внесениям хмеля, времени и объему."
  },
  "brewing-water-volume": {
    title: "Вода на варку",
    description: "Общий объем, заторная, промывная и объем до кипа."
  },
  "beer-color": {
    title: "Цвет пива (SRM / EBC)",
    description: "Расчет цветности по засыпи и объему партии."
  },
  "water-ph": {
    title: "Вода и pH затора",
    description: "Соли, профиль воды и ориентировочный pH."
  },
  "yeast-starter": {
    title: "Засев дрожжей и стартер",
    description: "Сколько дрожжей нужно и нужен ли стартер."
  },
  "hop-freshness": {
    title: "Свежесть хмеля",
    description: "Оценка текущей альфа-кислоты после хранения."
  },
  "priming-sugar": {
    title: "Карбонизация сахаром",
    description: "Сколько сахара добавить на весь объем или на бутылку."
  },
  "keg-carbonation": {
    title: "Карбонизация в кеге",
    description: "Давление для карбонизации, подачи и шпунтования."
  },
  bottling: {
    title: "Бутылки и розлив",
    description: "Количество бутылок, смешанный розлив и остаток объема."
  },
  "speise-krausen": {
    title: "Шпайзе и кройцен",
    description: "Объем сусла или кройцена для натуральной карбонизации."
  }
};

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

function CalculatorCard({ calculator }: { calculator: CalculatorCatalogItem }) {
  const copy = calculatorCardCopy[calculator.slug];
  const backgroundImage = calculatorCardBackgrounds[calculator.slug];
  const style: CSSProperties | undefined = backgroundImage
    ? { backgroundImage: `url("${backgroundImage}")` }
    : undefined;

  return (
    <Link
      href={calculator.href}
      className="group block h-[150px] w-[300px] max-w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white bg-contain bg-right-center bg-no-repeat shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
      data-calculator-card={calculator.slug}
      style={style}
    >
      <article className="flex h-full items-start justify-between gap-3 px-3.5 py-3 sm:px-4">
        <div className="min-w-0 max-w-[220px] space-y-1">
          <h3 className="text-[15px] font-semibold leading-snug text-zinc-950">
            {copy.title}
          </h3>
          <p className="text-[13px] leading-5 text-zinc-600">{copy.description}</p>
        </div>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-300 transition-colors group-hover:bg-zinc-100 group-hover:text-zinc-600">
          <ArrowRight className="h-4 w-4" />
        </span>
      </article>
    </Link>
  );
}

export function CalculatorsIndex() {
  return (
    <main className="space-y-5 pb-16 pt-5 sm:pt-6">
      <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm sm:px-5">
        <div className="max-w-3xl space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">hmelo tools</p>
          <h1 className="text-2xl font-semibold leading-tight text-zinc-950 sm:text-3xl">
            Калькуляторы для пивоварения
          </h1>
        </div>
      </section>

      <section className="space-y-5" aria-label="Все калькуляторы">
        {calculatorSections.map((section) => {
          const sectionCalculators = calculators.filter((calculator) => calculator.section === section);

          return (
            <div key={section} className="space-y-2.5">
              <h2 className="sr-only">{section}</h2>
              <div className="grid justify-center gap-2.5 sm:grid-cols-2 xl:grid-cols-4 xl:justify-start">
                {sectionCalculators.map((calculator) => (
                  <CalculatorCard key={calculator.slug} calculator={calculator} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
