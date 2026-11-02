import Link from "next/link";
import { Sticker } from "lucide-react";

import { buttonVariants } from "@nb/ui";
import { RecipeRatingForm } from "@/components/recipes/recipe-rating-form";
import type { BrewMeasurementSummary } from "@/features/brew-batches/contracts";
import { formatGravity, formatGravitySecondary, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { formatGravityNumber } from "@/features/system/gravity-units";
import { signedDifference, volumeLabels, type VolumeMeasurements } from "../records";

const fmtAbv = (value: number | null) => (value == null ? "—" : `${value.toFixed(1).replace(".", ",")}%`);
const fmtAtt = (value: number | null) => (value == null ? "—" : `${Math.round(value)}%`);
const fmtVolume = (value: number | null | undefined) => (value == null ? "—" : `${value.toFixed(1).replace(".", ",")} л`);

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
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <div className="whitespace-nowrap text-lg font-semibold tabular-nums text-foreground">{value}</div>
        {secondary ? <div className="whitespace-nowrap text-[11px] text-muted-foreground">{secondary}</div> : null}
      </div>
      {target ? (
        <div className="text-[11px] text-muted-foreground">
          по расчёту <span className="whitespace-nowrap">{target}</span>
          {targetSecondary ? <span className="whitespace-nowrap text-muted-foreground"> · {targetSecondary}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Итог партии — карточка, которая появляется на детали партии при статусе
 * `completed`. Данные не пересчитываются: сводка (OG/FG/ABV/сбраживание) уже
 * приходит из `getBrewBatchDetail` → `summarizeBrewMeasurements`. Расчётные
 * объёмы сравниваем с записанными замерами. Оценка исходного рецепта — опциональный блок,
 * показывается только когда `ratingTarget` разрешён (см. `resolveBrewCompletionRatingSlug`).
 */
export function BrewCompletionSummary({
  summary,
  preferredGravityUnit,
  batchVolumeL,
  ratingTarget,
  labelsHref,
  volumes = {},
  volumeTargets = {}
}: {
  summary: BrewMeasurementSummary;
  preferredGravityUnit: PreferredGravityUnit;
  batchVolumeL: number | null;
  ratingTarget: { recipeId: string; slug: string } | null;
  /** Ссылка на наклейки; null — посчитать некуда (нет ни рецепта, ни снапшота). */
  labelsHref?: string | null;
  volumes?: VolumeMeasurements;
  volumeTargets?: VolumeMeasurements;
}) {
  const target = summary.target;
  const fmtGravity = (value: number | null) => formatGravity(value, preferredGravityUnit);
  const gravityDelta = (actual: number | null, expected: number | null | undefined) => actual == null || expected == null ? "—" : signedDifference(Number(formatGravityNumber(actual, preferredGravityUnit)), Number(formatGravityNumber(expected, preferredGravityUnit)), preferredGravityUnit === "sg" ? 3 : 1);
  const rows = [
    ...Object.entries(volumeLabels).map(([key, label]) => ({ label, actual: fmtVolume(volumes[key as keyof VolumeMeasurements]), expected: fmtVolume(volumeTargets[key as keyof VolumeMeasurements]), delta: signedDifference(volumes[key as keyof VolumeMeasurements], volumeTargets[key as keyof VolumeMeasurements]) })),
    { label: "Начальная плотность", actual: fmtGravity(summary.og), expected: fmtGravity(target?.og ?? null), delta: gravityDelta(summary.og, target?.og) },
    { label: "Конечная плотность", actual: fmtGravity(summary.fg), expected: fmtGravity(target?.fg ?? null), delta: gravityDelta(summary.fg, target?.fg) }
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Итоги партии</h2>

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
        <StatTile label="Разлито" value={fmtVolume(volumes.bottledL)} target={volumeTargets.bottledL != null ? fmtVolume(volumeTargets.bottledL) : null} />
      </div>

      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-medium">Отклонения от расчёта</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="py-2 pr-2 font-normal">Показатель</th><th className="px-2 font-normal">Расчёт</th><th className="px-2 font-normal">Замер</th><th className="pl-2 font-normal">Разница</th></tr></thead><tbody>{rows.map(row => <tr key={row.label} className="border-t border-border"><th scope="row" className="py-3 pr-2 font-normal">{row.label}</th><td className="px-2 tabular-nums">{row.expected}</td><td className="px-2 tabular-nums">{row.actual}</td><td className="pl-2 tabular-nums">{row.delta}</td></tr>)}</tbody></table></div>
      </details>

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
              Этикетки
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
