import { RecipeRatingForm } from "@/components/recipes/recipe-rating-form";
import type { BrewMeasurementSummary } from "@/features/brew-batches/contracts";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";

const fmtAbv = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);
const fmtAtt = (value: number | null) => (value == null ? "—" : `${Math.round(value)}%`);
const fmtVolume = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)} л`);

function StatTile({ label, value, target }: { label: string; value: string; target?: string | null }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
      {target ? <div className="text-[11px] text-zinc-500">цель {target}</div> : null}
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
  ratingTarget
}: {
  summary: BrewMeasurementSummary;
  preferredGravityUnit: PreferredGravityUnit;
  batchVolumeL: number | null;
  ratingTarget: { recipeId: string; slug: string } | null;
}) {
  const target = summary.target;
  const fmtGravity = (value: number | null) => formatGravity(value, preferredGravityUnit);

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">Итог варки</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="OG" value={fmtGravity(summary.og)} target={target?.og != null ? fmtGravity(target.og) : null} />
        <StatTile label="FG" value={fmtGravity(summary.fg)} target={target?.fg != null ? fmtGravity(target.fg) : null} />
        <StatTile label="ABV" value={fmtAbv(summary.abv)} target={target?.abv != null ? fmtAbv(target.abv) : null} />
        <StatTile label="Сбраживание" value={fmtAtt(summary.apparentAttenuation)} />
        <StatTile label="Объём" value={fmtVolume(batchVolumeL)} />
      </div>

      {ratingTarget ? (
        <div className="space-y-2 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-semibold text-zinc-900">Оцените рецепт</h3>
          <RecipeRatingForm recipeId={ratingTarget.recipeId} slug={ratingTarget.slug} />
        </div>
      ) : null}
    </section>
  );
}
