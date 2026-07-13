/**
 * Валидационный прогон: 20 реальных публичных рецептов (BYO / Brewer's Friend /
 * Brulosophy, см. dataset.json — заявленные параметры сняты дословно со страниц
 * первоисточников 2026-07-11) через расчётный движок мастера рецептов.
 *
 * Повторяет склейку computeRecipeStatsSnapshot (apps/web/features/recipes/service.ts):
 *   calculateOg → calculateRecipeFgEstimate → calculateAbv → calculateBitterness → calculateColor
 * с продовыми дефолтами: DEFAULT_EFFICIENCY, formula="tinseth_whirlpool_v2";
 * preBoilVolumeL — как в проде после Э1.2 (docs/recipe-stats-accuracy-fix.md): объём кипения
 * из датасета, если источник его указал (эквивалент точного профиля оборудования), иначе
 * postBoil + 3 л/ч × t (продовый фолбэк без профиля).
 * БД не нужна. Запуск:  npx tsx apps/web/scripts/validate-recipe-stats/run.ts
 *
 * Базовая линия и целевые метрики — docs/recipe-stats-accuracy-fix.md.
 */
import { readFileSync } from "node:fs";
import {
  calculateAbv,
  calculateBitterness,
  calculateColor,
  calculateFg,
  calculateOg,
  utilizationTinseth
} from "@nb/brewing-core";
import { calculateRecipeFgEstimate } from "../../features/recipes/fg-estimate";
import { resolveFermentable } from "./ppg-table";
import { HOP_AA } from "./hop-aa";

const LB_TO_KG = 0.45359237;
const OZ_TO_G = 28.349523125;
const GAL_TO_L = 3.785411784;
const DEFAULT_EFFICIENCY = 70; // = DEFAULT_BREWHOUSE_EFFICIENCY_PCT (equipment-profiles/contracts.ts), Э3
const DEFAULT_ATTENUATION = 75; // fg-estimate.ts

type Recipe = {
  id: string;
  name: string;
  sourceUrl: string;
  style: string;
  claimed: { og: number; fg: number | null; abv: number | null; ibu: number | null; srm: number | null; colorUnit?: string };
  batch: { volumeGal: number; boilVolumeGal: number | null; boilMinutes: number | null; efficiencyPct: number | null; efficiencyStated: boolean };
  fermentables: Array<{ name: string; amountLb: number; colorL: number | null; type: string }>;
  hops: Array<{ name: string; amountOz: number; alphaPct: number | null; minutes: number | null; use: string }>;
  yeast: { name: string; attenuationPct: number | null };
  notes?: string;
};

const recipes: Recipe[] = JSON.parse(
  readFileSync(new URL("./dataset.json", import.meta.url), "utf8")
);

const resolveHopAa = (name: string): { aa: number; assumed: boolean } => {
  const key = name.toLowerCase();
  for (const [pattern, aa] of HOP_AA) {
    if (key.includes(pattern)) return { aa, assumed: true };
  }
  return { aa: 5, assumed: true }; // fallback движка (getIngredientAlphaAcidPercent)
};

type Row = {
  id: string; name: string; style: string;
  assumptions: string[];
  claimed: Recipe["claimed"];
  calc: { og: number; fg: number; fgNaive: number; abv: number; ibu: number; ibuClassic: number; ibuBoilGravity: number; srm: number };
  impliedEfficiency: number;
};

const rows: Row[] = [];

for (const r of recipes) {
  const assumptions: string[] = [];
  const batchVolumeL = r.batch.volumeGal * GAL_TO_L;
  const boilTimeMinutes = r.batch.boilMinutes ?? 60;
  if (r.batch.boilMinutes == null) assumptions.push("boil=60 (не указано)");

  const efficiency = r.batch.efficiencyPct ?? DEFAULT_EFFICIENCY;
  if (r.batch.efficiencyPct == null) assumptions.push(`eff=${DEFAULT_EFFICIENCY}% (дефолт движка)`);

  const fermentables = r.fermentables
    .map((f, i) => {
      const preset = resolveFermentable(f.name, f.type);
      if (!preset) assumptions.push(`ppg? ${f.name} → 36/2°L (fallback движка)`);
      const colorL = f.colorL ?? preset?.colorL ?? 2;
      if (f.colorL == null && preset) assumptions.push(`цвет ${f.name}=${colorL}°L (типовой)`);
      return {
        id: `f${i}`,
        name: f.name,
        weightKg: f.amountLb * LB_TO_KG,
        potentialPpg: preset?.ppg ?? 36,
        colorLovibond: colorL,
        appliesBrewhouseEfficiency: preset?.appliesEff ?? true
      };
    })
    .filter((f) => f.weightKg > 0 && f.potentialPpg > 0);

  const hops = r.hops.map((h, i) => {
    let use: "boil" | "whirlpool" | "dry_hop" | "first_wort_hop" = "boil";
    if (h.use === "dryhop" || h.use === "dry_hop") use = "dry_hop";
    else if (h.use === "whirlpool") use = "whirlpool";
    else if (h.use === "first_wort_hop" || h.use === "fwh") use = "first_wort_hop";

    let alpha = h.alphaPct;
    if (alpha == null && use !== "dry_hop") {
      const guess = resolveHopAa(h.name);
      alpha = guess.aa;
      assumptions.push(`AA ${h.name}=${alpha}% (типовой, на странице нет)`);
    }

    let minutes = h.minutes;
    if (minutes == null) {
      if (use === "dry_hop") minutes = 0;
      else if (use === "whirlpool") { minutes = 15; assumptions.push(`${h.name}: стенд 15 мин (не указан)`); }
      else { use = "first_wort_hop"; minutes = boilTimeMinutes; assumptions.push(`${h.name}: FWH (время не указано)`); }
    }

    return {
      id: `h${i}`,
      name: h.name,
      alphaAcidPercent: alpha ?? 5,
      weightG: h.amountOz * OZ_TO_G,
      boilTimeMinutes: minutes,
      use,
      temperatureC: null
    };
  }).filter((h) => h.weightG > 0);

  const og = calculateOg({ fermentables, batchVolumeL, brewhouseEfficiencyPercent: efficiency });

  // Обратный расчёт: какая эффективность нужна, чтобы попасть в заявленный OG.
  const grainPoints = fermentables.reduce((s, f) => (
    s + (f.appliesBrewhouseEfficiency ? f.weightKg * 2.2046226218 * f.potentialPpg : 0)
  ), 0);
  const sugarPoints = fermentables.reduce((s, f) => (
    s + (f.appliesBrewhouseEfficiency ? 0 : f.weightKg * 2.2046226218 * f.potentialPpg)
  ), 0);
  const claimedPoints = (r.claimed.og - 1) * 1000 * (batchVolumeL * 0.2641720524);
  const impliedEfficiency = grainPoints > 0 ? ((claimedPoints - sugarPoints) / grainPoints) * 100 : NaN;

  if (r.yeast.attenuationPct == null) assumptions.push(`аттенюация=${DEFAULT_ATTENUATION}% (дефолт движка)`);
  // Ровно как в проде: эвристика FG (аттенюация дрожжей + поправки на сахара/кристалл/лактозу).
  const fgEstimate = calculateRecipeFgEstimate({
    og,
    fermentables: fermentables.map((f) => ({ name: f.name, weightKg: f.weightKg, potentialPpg: f.potentialPpg, technicalData: null })),
    yeasts: r.yeast.attenuationPct == null
      ? []
      : [{ name: r.yeast.name, technicalData: { type: "yeast", attenuationPctTypical: r.yeast.attenuationPct } as never }],
    processMeta: null,
    calculationMeta: null
  });
  const fg = fgEstimate.predictedFg ?? calculateFg({ og, attenuationPercent: DEFAULT_ATTENUATION });
  const fgNaive = calculateFg({ og, attenuationPercent: r.yeast.attenuationPct ?? DEFAULT_ATTENUATION });
  const abv = calculateAbv(og, fg);

  const postBoilVolumeL = batchVolumeL;
  const fermentableGravityPoints = (og - 1) * 1000 * postBoilVolumeL;
  const whirlpool = hops.filter((h) => h.use === "whirlpool");
  const whirlpoolTimeMinutes = whirlpool.reduce((m, h) => Math.max(m, h.boilTimeMinutes), 0);

  // Как в проде (Э1.2): preBoil = postBoil + evapRate × t/60. Если источник указал объём
  // кипения — берём его (это эквивалент профиля оборудования с точной скоростью выпаривания),
  // иначе продовый фолбэк 3 л/ч.
  const DEFAULT_EVAPORATION_RATE_L_PER_HR = 3;
  const preBoilVolumeL = r.batch.boilVolumeGal != null
    ? r.batch.boilVolumeGal * GAL_TO_L
    : postBoilVolumeL + (DEFAULT_EVAPORATION_RATE_L_PER_HR * boilTimeMinutes / 60);
  if (r.batch.boilVolumeGal == null) assumptions.push("preBoil: выпаривание 3 л/ч (объём кипения не указан)");

  const ibuInput = {
    og,
    batchVolumeL,
    boilTimeMinutes,
    hopAdditions: hops,
    preBoilVolumeL,
    postBoilVolumeL,
    fermentableGravityPoints,
    hopUtilizationFactor: 1,
    hopFormUtilizationFactor: 1,
    whirlpoolUtilizationFactor: 1,
    includeBoilCarryoverIntoWhirlpool: true,
    whirlpoolTimeMinutes,
    whirlpoolTemperatureC: null,
    firstWortHopMode: "bonus_10pct" as const,
    altitudeM: 0
  };
  const ibu = calculateBitterness({ formula: "tinseth_whirlpool_v2", ...ibuInput }).ibu;
  const ibuClassic = calculateBitterness({ formula: "tinseth_classic", ...ibuInput }).ibu;
  const srm = calculateColor(fermentables, batchVolumeL).srm;

  // ЭКСПЕРИМЕНТ: Tinseth, где утилизация считается по плотности сусла В КОТЛЕ на момент
  // внесения (она ниже OG, т.к. сусло ещё не уварено → утилизация выше), а масса изогумулона
  // делится на КОНЕЧНЫЙ объём партии. Так считают BeerSmith / Brewer's Friend.
  const preBoilL = (r.batch.boilVolumeGal ?? r.batch.volumeGal * 1.25) * GAL_TO_L;
  const ibuBoilGravity = hops.reduce((sum, h) => {
    if (h.use === "dry_hop") return sum;
    const t = Math.min(h.boilTimeMinutes, boilTimeMinutes);
    const volAt = boilTimeMinutes > 0
      ? batchVolumeL + (preBoilL - batchVolumeL) * (t / boilTimeMinutes)
      : batchVolumeL;
    const sgAt = 1 + fermentableGravityPoints / volAt / 1000;
    const util = utilizationTinseth(sgAt, h.use === "whirlpool" ? 0 : t);
    return sum + (h.weightG * (h.alphaAcidPercent / 100) * util * 1000) / batchVolumeL;
  }, 0);

  rows.push({
    id: r.id, name: r.name, style: r.style,
    assumptions: [...new Set(assumptions)],
    claimed: r.claimed,
    calc: { og, fg, fgNaive, abv, ibu, ibuClassic, ibuBoilGravity: Math.round(ibuBoilGravity*10)/10, srm },
    impliedEfficiency
  });
}

// --- отчёт
const pts = (sg: number) => Math.round((sg - 1) * 1000);
const fmt = (n: number, d = 1) => n.toFixed(d);

console.log("\n=== ПОРЕЦЕПТНОЕ СРАВНЕНИЕ (ист. → расч., Δ) ===\n");
const header = ["#", "Рецепт", "OG пт", "FG пт", "ABV %", "IBU", "IBU(classic)", "SRM"];
console.log(header.join(" | "));

for (const [i, row] of rows.entries()) {
  const c = row.claimed;
  const k = row.calc;
  const cell = (claimed: number | null, calc: number, digits = 1) =>
    claimed == null ? `— → ${fmt(calc, digits)}` : `${fmt(claimed, digits)} → ${fmt(calc, digits)} (${calc - claimed >= 0 ? "+" : ""}${fmt(calc - claimed, digits)})`;
  console.log([
    i + 1,
    row.name.slice(0, 38),
    cell(pts(c.og), pts(k.og), 0),
    c.fg == null ? `— → ${pts(k.fg)}` : cell(pts(c.fg), pts(k.fg), 0),
    cell(c.abv, k.abv, 1),
    cell(c.ibu, k.ibu, 1),
    c.ibu == null ? fmt(k.ibuClassic) : `${fmt(k.ibuClassic)} (${k.ibuClassic - c.ibu >= 0 ? "+" : ""}${fmt(k.ibuClassic - c.ibu)})`,
    cell(c.srm, k.srm, 1)
  ].join(" | "));
}

console.log("\n=== СВОДКА ===\n");
type Metric = { key: string; claimed: (r: Row) => number | null; calc: (r: Row) => number };
const metrics: Metric[] = [
  { key: "OG (пункты)", claimed: (r) => (r.claimed.og == null ? null : pts(r.claimed.og)), calc: (r) => pts(r.calc.og) },
  { key: "FG (пункты)", claimed: (r) => (r.claimed.fg == null ? null : pts(r.claimed.fg)), calc: (r) => pts(r.calc.fg) },
  { key: "ABV (%)", claimed: (r) => r.claimed.abv, calc: (r) => r.calc.abv },
  { key: "IBU (default v2)", claimed: (r) => r.claimed.ibu, calc: (r) => r.calc.ibu },
  { key: "IBU (tinseth classic)", claimed: (r) => r.claimed.ibu, calc: (r) => r.calc.ibuClassic },
  { key: "IBU (эксперимент: boil-gravity)", claimed: (r) => r.claimed.ibu, calc: (r) => r.calc.ibuBoilGravity },
  { key: "FG наивный (без поправок)", claimed: (r) => (r.claimed.fg == null ? null : pts(r.claimed.fg)), calc: (r) => pts(r.calc.fgNaive) },
  { key: "SRM", claimed: (r) => r.claimed.srm, calc: (r) => r.calc.srm }
];

console.log("Метрика | n | ср.|Δ| | медиана |Δ| | max |Δ| | сист. сдвиг | ср. |Δ|%");
for (const m of metrics) {
  const pairs = rows
    .map((r) => ({ c: m.claimed(r), k: m.calc(r), name: r.name }))
    .filter((p): p is { c: number; k: number; name: string } => p.c != null && Number.isFinite(p.c));
  if (!pairs.length) continue;
  const diffs = pairs.map((p) => p.k - p.c);
  const abs = diffs.map(Math.abs).sort((a, b) => a - b);
  const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
  const median = abs[Math.floor(abs.length / 2)];
  const max = abs[abs.length - 1];
  const bias = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  const pct = pairs.map((p) => (p.c === 0 ? 0 : Math.abs((p.k - p.c) / p.c) * 100));
  const meanPct = pct.reduce((s, v) => s + v, 0) / pct.length;
  console.log(`${m.key} | ${pairs.length} | ${fmt(mean, 2)} | ${fmt(median, 2)} | ${fmt(max, 2)} | ${bias >= 0 ? "+" : ""}${fmt(bias, 2)} | ${fmt(meanPct, 1)}%`);
}

console.log("\n=== ХУДШИЕ ОТКЛОНЕНИЯ ===\n");
for (const m of metrics) {
  const pairs = rows
    .map((r) => ({ c: m.claimed(r), k: m.calc(r), name: r.name }))
    .filter((p): p is { c: number; k: number; name: string } => p.c != null);
  const worst = pairs.sort((a, b) => Math.abs(b.k - b.c) - Math.abs(a.k - a.c)).slice(0, 3);
  console.log(`${m.key}: ${worst.map((w) => `${w.name} (${fmt(w.c, 1)} → ${fmt(w.k, 1)})`).join("; ")}`);
}

console.log("\n=== ДОПУЩЕНИЯ ПО РЕЦЕПТАМ ===\n");
for (const row of rows) {
  if (row.assumptions.length) console.log(`- ${row.name}: ${row.assumptions.join("; ")}`);
}

console.log("\n=== ЭФФЕКТИВНОСТЬ, НЕОБХОДИМАЯ ДЛЯ ЗАЯВЛЕННОГО OG ===\n");
for (const row of rows) {
  console.log(`- ${row.name}: ${fmt(row.impliedEfficiency, 1)}%`);
}

console.log(`\nВсего рецептов: ${rows.length}`);
