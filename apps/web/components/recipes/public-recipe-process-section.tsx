import React from "react";
import { Flame, Thermometer, Timer } from "lucide-react";

import type { RecipeIngredientDto, RecipeProcessMeta } from "@/features/recipes/contracts";
import {
  formatRecipeIngredientAmount,
  recipeIngredientCategoryOf,
  recipeIngredientDurationDays,
  recipeIngredientTimeMinutes,
  recipeIngredientUseType,
  resolveRecipeIngredientNames
} from "@/features/recipes/ingredient-presentation";

// Read-only отображение процесса варки на публичной странице рецепта: затирание,
// кипячение и брожение. Отвечает на вопрос «хватит ли данных, чтобы сварить» без
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

function SectionHeader({
  icon,
  iconClassName,
  title,
  meta
}: {
  icon: React.ReactNode;
  iconClassName: string;
  title: string;
  meta?: string | null;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${iconClassName}`}>
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

function ProcessRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 truncate text-foreground">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-foreground">{value || "—"}</span>
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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        icon={<Thermometer className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />}
        iconClassName="bg-orange-50 dark:bg-orange-500/15"
        title="Затирание"
        meta={`${steps.length} ${steps.length === 1 ? "шаг" : steps.length < 5 ? "шага" : "шагов"}${totalMinutes > 0 ? ` · ${totalMinutes} мин` : ""}`}
      />
      <ul className="divide-y divide-border/60">
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

type BoilAdditionKind = "fwh" | "boil" | "whirlpool";

export type BoilAddition = {
  ingredient: RecipeIngredientDto;
  kind: BoilAdditionKind;
  timeMinutes: number | null;
};

/**
 * Внесения этапа кипячения: FWH → по минутам кипа (от больших к меньшим) →
 * вирпул/хопстенд. Дрожжи не участвуют; сухое охмеление живёт в секции брожения.
 */
export const buildBoilAdditions = (ingredients: RecipeIngredientDto[]): BoilAddition[] => {
  const kindRank: Record<BoilAdditionKind, number> = { fwh: 0, boil: 1, whirlpool: 2 };

  const rows = ingredients.flatMap((ingredient, index) => {
    if (recipeIngredientCategoryOf(ingredient) === "yeast") {
      return [];
    }
    const useType = recipeIngredientUseType(ingredient);
    const kind: BoilAdditionKind | null = useType === "first_wort_hop"
      ? "fwh"
      : ingredient.stage === "whirlpool" || useType === "whirlpool"
        ? "whirlpool"
        : ingredient.stage === "boil"
          ? "boil"
          : null;
    if (!kind) {
      return [];
    }
    return [{ ingredient, kind, timeMinutes: recipeIngredientTimeMinutes(ingredient), index }];
  });

  return rows
    .sort((a, b) => (
      kindRank[a.kind] - kindRank[b.kind]
      || (b.timeMinutes ?? -1) - (a.timeMinutes ?? -1)
      || a.index - b.index
    ))
    .map(({ ingredient, kind, timeMinutes }) => ({ ingredient, kind, timeMinutes }));
};

const boilMarker = (addition: BoilAddition): string => {
  if (addition.kind === "fwh") {
    return "FWH";
  }
  if (addition.kind === "whirlpool") {
    return "Вирпул";
  }
  return addition.timeMinutes != null ? `${addition.timeMinutes} мин` : "—";
};

/** Кипячение: длительность из рецепта + расписание внесений (хмель и добавки). */
export function PublicRecipeBoilSection({
  boilTimeMinutes,
  ingredients
}: {
  boilTimeMinutes: number;
  ingredients: RecipeIngredientDto[];
}) {
  const additions = buildBoilAdditions(ingredients);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        icon={<Flame className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />}
        iconClassName="bg-rose-50 dark:bg-rose-500/15"
        title="Кипячение"
        meta={`${boilTimeMinutes} мин`}
      />
      {additions.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {additions.map((addition) => {
            const { primaryName } = resolveRecipeIngredientNames(addition.ingredient);
            const whirlpoolMinutes = addition.kind === "whirlpool" && addition.timeMinutes != null && addition.timeMinutes > 0
              ? addition.timeMinutes
              : null;
            return (
              <li key={addition.ingredient.id} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-foreground">
                  {boilMarker(addition)}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {primaryName}
                  {whirlpoolMinutes != null ? <span className="text-muted-foreground"> · {whirlpoolMinutes} мин</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatRecipeIngredientAmount(addition.ingredient)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Внесений на кипячении нет.</p>
      )}
    </section>
  );
}

/** Хмель сухого охмеления: живёт на этапе брожения. */
export const buildDryHopAdditions = (ingredients: RecipeIngredientDto[]): RecipeIngredientDto[] =>
  ingredients.filter((ingredient) => (
    recipeIngredientCategoryOf(ingredient) === "hop"
    && (ingredient.stage === "fermentation" || recipeIngredientUseType(ingredient) === "dry_hop")
  ));

/**
 * Брожение: основной шаг есть практически всегда (движок берёт дефолт 20 °C / 10
 * дней), плюс опциональные доп-шаги, колд-краш, выдержка и сухое охмеление — их
 * показываем только когда включены/заданы.
 */
export function PublicRecipeFermentationSection({
  processMeta,
  ingredients = []
}: {
  processMeta: RecipeProcessMeta;
  ingredients?: RecipeIngredientDto[];
}) {
  const ferment = processMeta.fermentationProfile;

  const primaryValue = joinValues([formatTemp(ferment.primaryTemperatureC), formatDays(ferment.primaryDurationDays)]);
  const hasPrimary = primaryValue.length > 0;
  const hasExtras = ferment.extraSteps.length > 0;
  const coldCrash = ferment.coldCrash.enabled ? ferment.coldCrash : null;
  const conditioning = ferment.conditioning.enabled ? ferment.conditioning : null;
  const dryHops = buildDryHopAdditions(ingredients);

  if (!hasPrimary && !hasExtras && !coldCrash && !conditioning && dryHops.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        icon={<Timer className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
        iconClassName="bg-sky-50 dark:bg-sky-500/15"
        title="Брожение"
      />
      <ul className="divide-y divide-border/60">
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
      {dryHops.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Сухое охмеление</h3>
          <ul className="mt-1 divide-y divide-border/60">
            {dryHops.map((hop) => {
              const { primaryName } = resolveRecipeIngredientNames(hop);
              const days = recipeIngredientDurationDays(hop);
              return (
                <li key={hop.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {primaryName}
                    {days != null ? <span className="text-muted-foreground"> · {pluralDays(days)}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {formatRecipeIngredientAmount(hop)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
