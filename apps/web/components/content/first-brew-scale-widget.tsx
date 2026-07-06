"use client";

import React, { useState } from "react";

import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { NumericInput } from "@/components/shared/numeric-input";

// Микрокалькулятор к гайду «Как сварить своё первое пиво»: линейно
// пересчитывает базовый рецепт статьи (~8 л) под объём, который читатель
// хочет получить, и подсказывает размер кастрюли и ёмкости для брожения.
// Базовые числа обязаны совпадать с текстом статьи.

const BASE_LITERS = 8;
const BASE = {
  maltKg: 1.7,
  hopsG: 15,
  mashWaterL: 7,
  spargeWaterL: 4,
  primingGPerL: 7
};

const MIN_LITERS = 3;
const MAX_LITERS = 40;
const PRESETS = [5, 8, 10, 15, 20, 30];

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

const fmtRu = (value: number, maxFractionDigits = 1): string =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: maxFractionDigits });

const yeastAdvice = (liters: number): string => {
  if (liters <= 12) {
    return "1 пакетик (хватит и половины)";
  }
  if (liters <= 25) {
    return "1 пакетик";
  }
  return "2 пакетика";
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="whitespace-nowrap text-sm font-semibold text-foreground">{value}</dd>
  </div>
);

export function FirstBrewScaleWidget() {
  const [raw, setRaw] = useState(String(BASE_LITERS));

  const liters = parseDecimalInput(raw);
  const valid = liters != null && Number.isFinite(liters) && liters >= MIN_LITERS && liters <= MAX_LITERS;
  const factor = valid ? liters / BASE_LITERS : 1;

  const maltKg = roundTo(BASE.maltKg * factor, 0.05);
  const hopsG = Math.max(1, Math.round(BASE.hopsG * factor));
  const mashWaterL = roundTo(BASE.mashWaterL * factor, 0.5);
  const spargeWaterL = roundTo(BASE.spargeWaterL * factor, 0.5);
  // Вверх до 5 г — чтобы на базовых 8 л сходилось с «около 60 г» из текста.
  const primingG = valid ? Math.ceil((BASE.primingGPerL * liters) / 5) * 5 : 0;
  // Кастрюля — с запасом под кипячение и зерно, ёмкость — под шапку пены.
  const kettleL = valid ? Math.ceil(liters * 1.5) : 0;
  const fermenterL = valid ? Math.ceil(liters * 1.25) : 0;

  return (
    <section className="my-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">Пересчитать под свой объём</h3>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        <label htmlFor="first-brew-liters" className="text-sm text-foreground">
          Хочу получить пива:
        </label>
        <NumericInput
          id="first-brew-liters"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          min={MIN_LITERS}
          max={MAX_LITERS}
          className="w-20 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring"
        />
        <span className="text-sm text-foreground">л</span>
        <span className="ml-1 inline-flex flex-wrap gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setRaw(String(preset))}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                valid && liters === preset
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground ring-1 ring-border hover:bg-accent"
              }`}
            >
              {preset}
            </button>
          ))}
        </span>
      </div>

      {valid ? (
        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ингредиенты</p>
            <dl className="mt-1">
              <Row label="Солод" value={`${fmtRu(maltKg, 2)} кг`} />
              <Row label="Хмель" value={`${fmtRu(hopsG, 0)} г`} />
              <Row label="Дрожжи" value={yeastAdvice(liters)} />
              <Row label="Сахар на карбонизацию" value={`≈ ${fmtRu(primingG, 0)} г`} />
              <Row label="Вода на затирание" value={`≈ ${fmtRu(mashWaterL)} л`} />
              <Row label="Вода на промывку" value={`≈ ${fmtRu(spargeWaterL)} л`} />
            </dl>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Посуда</p>
            <dl className="mt-1">
              <Row label="Кастрюля" value={`от ${fmtRu(kettleL, 0)} л`} />
              <Row label="Ёмкость для брожения" value={`от ${fmtRu(fermenterL, 0)} л`} />
            </dl>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Кастрюля и ёмкость — с запасом: под кипячение с зерном и под шапку пены при брожении.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Укажи объём от {MIN_LITERS} до {MAX_LITERS} литров.
        </p>
      )}
    </section>
  );
}
