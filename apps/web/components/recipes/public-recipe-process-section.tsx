import React from "react";
import { Thermometer, Timer } from "lucide-react";

import type { RecipeProcessMeta } from "@/features/recipes/contracts";

// Read-only отображение процесса варки на публичной странице рецепта: затирание
// и брожение. Отвечает на вопрос «хватит ли данных, чтобы сварить» без
// клонирования (UX-находка #8). Терминология зеркалит редактор
// (recipe-designer/recipe-profiles.tsx): «Затирание», «Брожение», «Колд-краш»,
// «Выдержка» — новых слов не изобретаем.

const formatTemp = (value: number | null | undefined): string | null => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} °C`;
};

const pluralDays = (n: number): string => {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} дней`;
  if (last === 1) return `${n} день`;
  if (last >= 2 && last <= 4) return `${n} дня`;
  return `${n} дней`;
};

const formatDays = (value: number | null | undefined): string | null =>
  value == null || !Number.isFinite(value) ? null : pluralDays(value);

// Значение справа: «66 °C · 60 мин» / «20 °C · 10 дней». Пропускаем пустые части.
const joinValues = (parts: Array<string | null>): string =>
  parts.filter((part): part is string => Boolean(part)).join(" · ");

// Имя шага: у ручных рецептов редактор не даёт переименовать (всегда «Шаг N»),
// но импорт (BeerXML) может нести осмысленное имя — показываем его, если оно не
// генерик, иначе «Шаг N».
const stepLabel = (name: string | null | undefined, index: number): string => {
  const generic = `Шаг ${index + 1}`;
  const trimmed = name?.trim();
  if (!trimmed || trimmed === "Инфузия" || /^Шаг\s*\d+$/.test(trimmed)) {
    return generic;
  }
  return trimmed;
};

function ProcessRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-zinc-800">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-zinc-950">{value || "—"}</span>
    </li>
  );
}

/** Затирание: только если в рецепте реально заданы шаги затора. */
export function PublicRecipeMashSection({ processMeta }: { processMeta: RecipeProcessMeta }) {
  const steps = processMeta.mashProfile.steps;
  if (steps.length === 0) {
    return null;
  }

  const totalMinutes = steps.reduce(
    (acc, step) => acc + (Number.isFinite(step.durationMinutes) ? step.durationMinutes : 0),
    0
  );

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50">
          <Thermometer className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <h2 className="text-sm font-semibold text-zinc-700">Затирание</h2>
        <span className="text-xs text-zinc-400">
          {steps.length} {steps.length === 1 ? "шаг" : steps.length < 5 ? "шага" : "шагов"}
          {totalMinutes > 0 ? ` · ${totalMinutes} мин` : ""}
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => (
          <ProcessRow
            key={step.id}
            label={stepLabel(step.name, index)}
            value={joinValues([
              formatTemp(step.temperatureC),
              Number.isFinite(step.durationMinutes) ? `${step.durationMinutes} мин` : null
            ])}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Брожение: основной шаг есть практически всегда (движок берёт дефолт 20 °C / 10
 * дней), плюс опциональные доп-шаги, колд-краш и выдержка — их показываем только
 * когда включены/заданы.
 */
export function PublicRecipeFermentationSection({ processMeta }: { processMeta: RecipeProcessMeta }) {
  const ferment = processMeta.fermentationProfile;

  const primaryValue = joinValues([formatTemp(ferment.primaryTemperatureC), formatDays(ferment.primaryDurationDays)]);
  const hasPrimary = primaryValue.length > 0;
  const hasExtras = ferment.extraSteps.length > 0;
  const coldCrash = ferment.coldCrash.enabled ? ferment.coldCrash : null;
  const conditioning = ferment.conditioning.enabled ? ferment.conditioning : null;

  if (!hasPrimary && !hasExtras && !coldCrash && !conditioning) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50">
          <Timer className="h-3.5 w-3.5 text-sky-600" />
        </div>
        <h2 className="text-sm font-semibold text-zinc-700">Брожение</h2>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {hasPrimary ? <ProcessRow label="Основное" value={primaryValue} /> : null}
        {ferment.extraSteps.map((step, index) => (
          <ProcessRow
            key={step.id}
            label={stepLabel(step.name, index)}
            value={joinValues([formatTemp(step.temperatureC), formatDays(step.durationDays)])}
          />
        ))}
        {coldCrash ? (
          <ProcessRow
            label="Колд-краш"
            value={joinValues([formatTemp(coldCrash.temperatureC), formatDays(coldCrash.durationDays)])}
          />
        ) : null}
        {conditioning ? (
          <ProcessRow
            label="Выдержка"
            value={joinValues([formatTemp(conditioning.temperatureC), formatDays(conditioning.durationDays)])}
          />
        ) : null}
      </ul>
    </section>
  );
}
