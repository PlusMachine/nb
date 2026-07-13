import Link from "next/link";
import { Sticker } from "lucide-react";

import { buttonVariants } from "@nb/ui";
import { RecipeRatingForm } from "@/components/recipes/recipe-rating-form";
import type { BrewMeasurementSummary } from "@/features/brew-batches/contracts";
import { formatGravity, formatGravitySecondary, type PreferredGravityUnit } from "@/features/system/gravity-units";

const fmtAbv = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);
const fmtAtt = (value: number | null) => (value == null ? "—" : `${Math.round(value)}%`);
const fmtVolume = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)} л`);

function StatTile({
  label,
  value,
  secondary,
  target,
  targetSecondary
}: {
  label: string;
  value: string;
  /** Значение во второй (дублирующей) единице плотности — мелким muted-текстом рядом с основным. */
  secondary?: string | null;
  target?: string | null;
  targetSecondary?: string | null;
}) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
        {secondary ? <div className="text-[11px] text-muted-foreground">{secondary}</div> : null}
      </div>
      {target ? (
        <div className="text-[11px] text-muted-foreground">
          цель {target}
          {targetSecondary ? <span className="text-muted-foreground"> · {targetSecondary}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Итог варки — карточка, которая появляется на детали партии при статусе
 * `completed`. Данные не пересчитываются: сводка (OG/FG/ABV/сбраживание) уже
 * приходит из `getBrewBatchDetail` → `summarizeBrewMeasurements`. Объём — из
 * снапшота плана варки (не «факт», плана без отдельного поля фактического
 * объёма в системе нет). Оценка исходного рецепта — опциональный блок,
 * показывается только когда `ratingTarget` разрешён (см. `resolveBrewCompletionRatingSlug`).
 */
export function BrewCompletionSummary({
  summary,
  preferredGravityUnit,
  batchVolumeL,
  ratingTarget,
  labelsHref
}: {
  summary: BrewMeasurementSummary;
  preferredGravityUnit: PreferredGravityUnit;
  batchVolumeL: number | null;
  ratingTarget: { recipeId: string; slug: string } | null;
  /** Ссылка на наклейки; null — посчитать некуда (нет ни рецепта, ни снапшота). */
  labelsHref?: string | null;
}) {
  const target = summary.target;
  const fmtGravity = (value: number | null) => formatGravity(value, preferredGravityUnit);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Итог варки</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile
          label="OG"
          value={fmtGravity(summary.og)}
          secondary={formatGravitySecondary(summary.og, preferredGravityUnit)}
          target={target?.og != null ? fmtGravity(target.og) : null}
          targetSecondary={target?.og != null ? formatGravitySecondary(target.og, preferredGravityUnit) : null}
        />
        <StatTile
          label="FG"
          value={fmtGravity(summary.fg)}
          secondary={formatGravitySecondary(summary.fg, preferredGravityUnit)}
          target={target?.fg != null ? fmtGravity(target.fg) : null}
          targetSecondary={target?.fg != null ? formatGravitySecondary(target.fg, preferredGravityUnit) : null}
        />
        <StatTile label="ABV" value={fmtAbv(summary.abv)} target={target?.abv != null ? fmtAbv(target.abv) : null} />
        <StatTile label="Сбраживание" value={fmtAtt(summary.apparentAttenuation)} />
        <StatTile label="Объём" value={fmtVolume(batchVolumeL)} />
      </div>

      {ratingTarget || labelsHref ? (
        <div className="space-y-3 border-t border-border pt-4">
          {ratingTarget ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Оцените рецепт</h3>
              <RecipeRatingForm recipeId={ratingTarget.recipeId} slug={ratingTarget.slug} />
            </div>
          ) : null}
          {labelsHref ? (
            <Link href={labelsHref} className={buttonVariants({ variant: "outline", size: "md" })}>
              <Sticker className="h-4 w-4 text-muted-foreground" />
              Наклейки
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
