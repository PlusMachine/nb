import type { BrewBatchDetail } from "./contracts";
import { formatInventoryUnitLabel, parseInventoryUnit } from "../inventory/units";
import { formatBrewBatchDisplayTitle } from "./contracts";
import type { PreferredGravityUnit } from "../system/gravity-units";
import { formatGravity } from "../system/gravity-units";
import { volumeLabels } from "./records";

export type BatchComparison = { titles: [string, string]; ids: [string, string]; rows: { label: string; values: [string, string]; changed: boolean }[] };
const number = (n: unknown, suffix = "") => typeof n === "number" && Number.isFinite(n) ? `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}${suffix}` : "—";
const mash = (d: BrewBatchDetail) => d.batch.brewPlanSnapshot.mashSteps.map(s => `${number(s.targetTemperatureC, " °C")} · ${number(s.durationMinutes, " мин")}`).join("; ") || "—";
const hops = (d: BrewBatchDetail) => {
  const p = d.batch.brewPlanSnapshot;
  return [...p.boilPlan.timedAdditions, ...p.whirlpoolPlan, ...p.dryHopPlan].filter(s => s.category === "hop").map(s => {
    const amount = s.amount as { quantity?: number; unit?: string } | undefined;
    const unit = parseInventoryUnit(amount?.unit ?? "");
    const meta = s.stepMeta as Record<string, unknown> | null;
    const stage = s.stage === "fermentation" ? "сухое охмеление" : s.stage === "whirlpool" ? "вирпул" : s.stage === "mash" ? "затор" : "кипячение";
    const timing = s.stage === "fermentation"
      ? (typeof meta?.durationDays === "number" ? ` · ${meta.durationDays} дн.` : "")
      : s.stage === "whirlpool"
        ? (typeof meta?.timeMinutes === "number" ? ` · ${meta.timeMinutes} мин` : "")
        : s.stage === "boil" && typeof s.timeOffsetMinutes === "number" ? ` · за ${s.timeOffsetMinutes} мин до конца` : "";
    return `${typeof s.name === "string" ? s.name : "Хмель"} · ${number(amount?.quantity)}${unit ? ` ${formatInventoryUnitLabel(unit, amount?.quantity)}` : ""} · ${stage}${timing}`;
  }).join("; ") || "—";
};
export const buildBatchComparison = (a: BrewBatchDetail, b: BrewBatchDetail, gravityUnit: PreferredGravityUnit): BatchComparison => {
  const rows: BatchComparison["rows"] = [];
  const row = (label: string, read: (d: BrewBatchDetail) => string) => {
    const values: [string, string] = [read(a), read(b)];
    rows.push({ label, values, changed: values[0] !== "—" && values[1] !== "—" && values[0] !== values[1] });
  };
  row("Рецепт", d => `${d.batch.brewPlanSnapshot.recipe.title} · версия ${d.batch.brewPlanSnapshot.recipe.versionNumber}`);
  row("Затирание", mash);
  row("Кипячение", d => number(d.batch.brewPlanSnapshot.boilPlan.boilTimeMinutes, " мин"));
  row("Хмель", hops);
  row("Начальная плотность", d => formatGravity(d.summary.og, gravityUnit));
  row("Конечная плотность", d => formatGravity(d.summary.fg, gravityUnit));
  row("Крепость", d => d.summary.abv == null ? "—" : `${d.summary.abv.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`);
  for (const key of Object.keys(volumeLabels) as (keyof typeof volumeLabels)[]) row(`${volumeLabels[key]}, л`, d => number(d.batch.volumeMeasurements?.[key]));
  return { titles: [formatBrewBatchDisplayTitle(a.batch.name, a.batch.brewNumber), formatBrewBatchDisplayTitle(b.batch.name, b.batch.brewNumber)], ids: [a.batch.id, b.batch.id], rows };
};
