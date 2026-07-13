import { calculateFg, roundTo } from "@nb/brewing-core";

import type { IngredientTechnicalData } from "../ingredients/contracts";
import type {
  RecipeCalculationMeta,
  RecipeFgEstimateDetails,
  RecipeFgEstimateMode,
  RecipeProcessMeta
} from "./contracts";

const DEFAULT_ATTENUATION_PCT = 75;
const DEFAULT_ATTENUATION_RANGE_MIN_PCT = 72;
const DEFAULT_ATTENUATION_RANGE_MAX_PCT = 78;
const MIN_EFFECTIVE_ATTENUATION_PCT = 50;
const MAX_EFFECTIVE_ATTENUATION_PCT = 98;
// Видимая аттенюация классов засыпи в взвешенной модели сбраживаемости (Э2).
const SIMPLE_SUGAR_APPARENT_ATTENUATION_PCT = 100;
const LACTOSE_APPARENT_ATTENUATION_PCT = 0;
const CRYSTAL_DEXTRIN_ATTENUATION_FACTOR = 0.6;
const KG_TO_LB = 2.2046226218;

type RecipeFgEstimateFermentableInput = {
  name: string;
  weightKg: number;
  potentialPpg: number;
  technicalData?: IngredientTechnicalData | null;
};

type RecipeFgEstimateYeastInput = {
  name: string;
  technicalData?: IngredientTechnicalData | null;
};

export type RecipeFgEstimateResult = {
  predictedFg: number | null;
  fgEstimateMode: RecipeFgEstimateMode;
  fgEstimateDetails: RecipeFgEstimateDetails | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const readFiniteNumber = (value: unknown) => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

const normalizeText = (value: string) => value
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const includesAnyPattern = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));

const simpleSugarPatterns = [
  /\bdextrose\b/u,
  /\bglucose\b/u,
  /\bsucrose\b/u,
  /\bcorn sugar\b/u,
  /\bcane sugar\b/u,
  /\bbeet sugar\b/u,
  /\btable sugar\b/u,
  /\binvert sugar\b/u,
  /\bcandi sugar\b/u,
  /\bcandi syrup\b/u,
  /\bglucose syrup\b/u,
  /\bcorn syrup\b/u,
  /\bsimple sugar\b/u,
  /\bсахар\b/u,
  /\bсахароза\b/u,
  /\bдекстроз/u,
  /\bглюкоз/u,
  /\bинверт/u,
  /\bкэнди/u,
  /\bкукурузн(?:ый|ого)\s+сироп/u,
  /\bглюкозн(?:ый|ого)\s+сироп/u
];

const lactosePatterns = [
  /\blactose\b/u,
  /\bmilk sugar\b/u,
  /\bmaltodextrin\b/u,
  /\bлактоз/u,
  /\bмальтодекстрин/u
];

const crystalPatterns = [
  /\bcrystal\b/u,
  /\bcaramel\b/u,
  /\bcarapils\b/u,
  /\bcarafoam\b/u,
  /\bdextrin\b/u,
  /\bcara(?!fa)[\p{L}\p{N}_-]*/u,
  /\bкристал/u,
  /\bкарамел/u,
  /\bкарапилс/u,
  /\bкарафоам/u,
  /\bдекстрин/u
];

const buildFermentableHeuristicText = (
  fermentable: RecipeFgEstimateFermentableInput
) => {
  const technicalData = fermentable.technicalData;
  const fragments: string[] = [fermentable.name];

  if (technicalData?.type === "fermentable") {
    const values = [
      technicalData.fermentabilityClass,
      technicalData.productFamily,
      technicalData.subtypeKey,
      technicalData.physicalForm,
      technicalData.baseMaterialFamily,
      technicalData.functionalRole,
      technicalData.displayTypeRu,
      technicalData.displayTypeEn
    ];

    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        fragments.push(value);
      }
    }

    if (Array.isArray(technicalData.baseMaterials)) {
      for (const value of technicalData.baseMaterials) {
        if (typeof value === "string" && value.trim()) {
          fragments.push(value);
        }
      }
    }
  }

  if (technicalData?.type === "malt") {
    if (typeof technicalData.maltType === "string" && technicalData.maltType.trim()) {
      fragments.push(technicalData.maltType);
    }
  }

  return normalizeText(fragments.filter(Boolean).join(" "));
};

type FermentableFgClassification = "simple_sugar" | "crystal_dextrin" | "lactose_nonfermentable" | null;

const classifyFermentableForFg = (
  fermentable: RecipeFgEstimateFermentableInput
): FermentableFgClassification => {
  const text = buildFermentableHeuristicText(fermentable);

  if (!text) {
    return null;
  }

  if (includesAnyPattern(text, lactosePatterns)) {
    return "lactose_nonfermentable";
  }

  if (includesAnyPattern(text, simpleSugarPatterns)) {
    return "simple_sugar";
  }

  if (includesAnyPattern(text, crystalPatterns)) {
    return "crystal_dextrin";
  }

  return null;
};

const resolveMainMashStep = (processMeta?: RecipeProcessMeta | null) => {
  const steps = processMeta?.mashProfile.steps ?? [];
  if (!steps.length) {
    return null;
  }

  const inPrimaryBand = steps.filter((step) => step.temperatureC >= 62 && step.temperatureC <= 70);
  const candidates = inPrimaryBand.length ? inPrimaryBand : steps;

  return candidates.reduce((selected, step) => {
    if (!selected) {
      return step;
    }

    if (step.durationMinutes > selected.durationMinutes) {
      return step;
    }

    return selected;
  }, candidates[0] ?? null);
};

type ResolvedYeastAttenuation = {
  minPct: number | null;
  maxPct: number | null;
  midpointPct: number | null;
  singlePct: number | null;
};

const resolveYeastAttenuation = (
  yeasts: RecipeFgEstimateYeastInput[]
): ResolvedYeastAttenuation | null => {
  for (const yeast of yeasts) {
    if (yeast.technicalData?.type !== "yeast") {
      continue;
    }

    const min = readFiniteNumber(yeast.technicalData.attenuationPctMin);
    const max = readFiniteNumber(yeast.technicalData.attenuationPctMax);
    const single = readFiniteNumber(yeast.technicalData.attenuationPctTypical);

    if (min != null && max != null) {
      const normalizedMin = Math.min(min, max);
      const normalizedMax = Math.max(min, max);

      return {
        minPct: normalizedMin,
        maxPct: normalizedMax,
        midpointPct: (normalizedMin + normalizedMax) / 2,
        singlePct: single
      };
    }

    if (single != null) {
      return {
        minPct: null,
        maxPct: null,
        midpointPct: null,
        singlePct: single
      };
    }

    const boundaryValue = min ?? max;
    if (boundaryValue != null) {
      return {
        minPct: null,
        maxPct: null,
        midpointPct: null,
        singlePct: boundaryValue
      };
    }
  }

  return null;
};

const calculateGravityContribution = (fermentable: RecipeFgEstimateFermentableInput) => (
  fermentable.weightKg > 0 && fermentable.potentialPpg > 0
    ? fermentable.weightKg * KG_TO_LB * fermentable.potentialPpg
    : 0
);

const calculateFgFromAttenuation = (og: number, attenuationPct: number) => (
  calculateFg({
    og,
    attenuationPercent: clamp(attenuationPct, MIN_EFFECTIVE_ATTENUATION_PCT, MAX_EFFECTIVE_ATTENUATION_PCT)
  })
);

const buildFgEstimateDetails = (input: {
  attenuationSource: RecipeFgEstimateDetails["attenuationSource"];
  baseAttenuationPct: number;
  effectiveAttenuationPct: number;
  mainMashTempC: number | null;
  mashAdjPctPoints: number;
  simpleSugarSharePct: number;
  crystalDextrinSharePct: number;
  lactoseSharePct: number;
  simpleSugarAdj: number;
  crystalDextrinAdj: number;
  lactoseAdj: number;
  fgRangeMin: number | null;
  fgRangeMax: number | null;
}): RecipeFgEstimateDetails => ({
  baseAttenuationPct: roundTo(input.baseAttenuationPct, 2),
  attenuationSource: input.attenuationSource,
  mainMashTempC: input.mainMashTempC == null ? null : roundTo(input.mainMashTempC, 1),
  mashAdjPctPoints: roundTo(input.mashAdjPctPoints, 2),
  simpleSugarSharePct: roundTo(input.simpleSugarSharePct, 2),
  crystalDextrinSharePct: roundTo(input.crystalDextrinSharePct, 2),
  lactoseSharePct: roundTo(input.lactoseSharePct, 2),
  simpleSugarAdj: roundTo(input.simpleSugarAdj, 2),
  crystalDextrinAdj: roundTo(input.crystalDextrinAdj, 2),
  lactoseAdj: roundTo(input.lactoseAdj, 2),
  effectiveAttenuationPct: roundTo(input.effectiveAttenuationPct, 2),
  fgRangeMin: input.fgRangeMin == null ? null : roundTo(input.fgRangeMin, 3),
  fgRangeMax: input.fgRangeMax == null ? null : roundTo(input.fgRangeMax, 3)
});

export const calculateRecipeFgEstimate = (input: {
  og: number | null;
  fermentables: RecipeFgEstimateFermentableInput[];
  yeasts: RecipeFgEstimateYeastInput[];
  processMeta?: RecipeProcessMeta | null;
  calculationMeta?: RecipeCalculationMeta | null;
}): RecipeFgEstimateResult => {
  if (!input.fermentables.length || input.og == null) {
    return {
      predictedFg: null,
      fgEstimateMode: "unavailable",
      fgEstimateDetails: null
    };
  }

  const manualFgOverrideValue = readFiniteNumber(input.calculationMeta?.manualFgOverrideValue);
  if (manualFgOverrideValue != null) {
    return {
      predictedFg: roundTo(manualFgOverrideValue, 3),
      fgEstimateMode: "manual_fg_override",
      fgEstimateDetails: null
    };
  }

  const rawManualAttenuationOverridePct = readFiniteNumber(input.calculationMeta?.manualAttenuationOverridePct);
  const manualAttenuationOverridePct = rawManualAttenuationOverridePct == null
    ? null
    : clamp(rawManualAttenuationOverridePct, MIN_EFFECTIVE_ATTENUATION_PCT, MAX_EFFECTIVE_ATTENUATION_PCT);
  const resolvedYeastAttenuation = resolveYeastAttenuation(input.yeasts);
  const baseAttenuationPct = manualAttenuationOverridePct
    ?? resolvedYeastAttenuation?.midpointPct
    ?? resolvedYeastAttenuation?.singlePct
    ?? DEFAULT_ATTENUATION_PCT;
  const fgEstimateMode: RecipeFgEstimateMode = manualAttenuationOverridePct != null
    ? "manual_attenuation_override"
    : resolvedYeastAttenuation
      ? "yeast_estimate"
      : "default_estimate";
  const attenuationSource: RecipeFgEstimateDetails["attenuationSource"] = manualAttenuationOverridePct != null
    ? "manual"
    : resolvedYeastAttenuation
      ? "yeast"
      : "default";

  const mainMashStep = resolveMainMashStep(input.processMeta);
  const mainMashTempC = mainMashStep?.temperatureC ?? null;
  const mashAdjPctPoints = mainMashTempC == null
    ? 0
    : clamp((67 - mainMashTempC) * 0.75, -4, 4);

  const totalGravityContribution = input.fermentables.reduce(
    (sum, fermentable) => sum + calculateGravityContribution(fermentable),
    0
  );

  let simpleSugarSharePct = 0;
  let crystalDextrinSharePct = 0;
  let lactoseSharePct = 0;

  if (totalGravityContribution > 0) {
    for (const fermentable of input.fermentables) {
      const sharePct = calculateGravityContribution(fermentable) / totalGravityContribution * 100;
      const classification = classifyFermentableForFg(fermentable);

      if (classification === "simple_sugar") {
        simpleSugarSharePct += sharePct;
      } else if (classification === "crystal_dextrin") {
        crystalDextrinSharePct += sharePct;
      } else if (classification === "lactose_nonfermentable") {
        lactoseSharePct += sharePct;
      }
    }
  }

  // Взвешенная модель сбраживаемости (Э2): у каждого класса засыпи своя видимая
  // аттенюация, итоговая attEff — среднее по долям gravity-вклада. shareBase —
  // доля обычной засыпи, унаследующая базовую аттенюацию дрожжей как есть.
  const shareBase = Math.max(0, 100 - simpleSugarSharePct - crystalDextrinSharePct - lactoseSharePct);

  const computeWeightedAttenuation = (attBase: number) => (
    (
      shareBase * attBase
      + simpleSugarSharePct * SIMPLE_SUGAR_APPARENT_ATTENUATION_PCT
      + lactoseSharePct * LACTOSE_APPARENT_ATTENUATION_PCT
      + crystalDextrinSharePct * (attBase * CRYSTAL_DEXTRIN_ATTENUATION_FACTOR)
    ) / 100
  );

  const attBase = baseAttenuationPct + mashAdjPctPoints;

  // Эффективные дельты по классам — вклад каждого в (attEff − attBase), п.п.
  // Хранятся ≥0 (как и в прежнем контракте), знак применяется при отображении.
  const simpleSugarAdj = simpleSugarSharePct * (SIMPLE_SUGAR_APPARENT_ATTENUATION_PCT - attBase) / 100;
  const crystalDextrinAdj = crystalDextrinSharePct * (attBase * (1 - CRYSTAL_DEXTRIN_ATTENUATION_FACTOR)) / 100;
  const lactoseAdj = lactoseSharePct * (attBase - LACTOSE_APPARENT_ATTENUATION_PCT) / 100;

  const effectiveAttenuationPct = clamp(
    computeWeightedAttenuation(attBase),
    MIN_EFFECTIVE_ATTENUATION_PCT,
    MAX_EFFECTIVE_ATTENUATION_PCT
  );

  let fgRangeMin: number | null = null;
  let fgRangeMax: number | null = null;

  if (fgEstimateMode === "default_estimate") {
    fgRangeMin = calculateFgFromAttenuation(
      input.og,
      computeWeightedAttenuation(DEFAULT_ATTENUATION_RANGE_MAX_PCT + mashAdjPctPoints)
    );
    fgRangeMax = calculateFgFromAttenuation(
      input.og,
      computeWeightedAttenuation(DEFAULT_ATTENUATION_RANGE_MIN_PCT + mashAdjPctPoints)
    );
  } else if (
    fgEstimateMode === "yeast_estimate"
    && resolvedYeastAttenuation?.minPct != null
    && resolvedYeastAttenuation.maxPct != null
  ) {
    fgRangeMin = calculateFgFromAttenuation(
      input.og,
      computeWeightedAttenuation(resolvedYeastAttenuation.maxPct + mashAdjPctPoints)
    );
    fgRangeMax = calculateFgFromAttenuation(
      input.og,
      computeWeightedAttenuation(resolvedYeastAttenuation.minPct + mashAdjPctPoints)
    );
  }

  return {
    predictedFg: calculateFg({ og: input.og, attenuationPercent: effectiveAttenuationPct }),
    fgEstimateMode,
    fgEstimateDetails: buildFgEstimateDetails({
      attenuationSource,
      baseAttenuationPct,
      effectiveAttenuationPct,
      mainMashTempC,
      mashAdjPctPoints,
      simpleSugarSharePct,
      crystalDextrinSharePct,
      lactoseSharePct,
      simpleSugarAdj,
      crystalDextrinAdj,
      lactoseAdj,
      fgRangeMin,
      fgRangeMax
    })
  };
};

export const resolveRecipeFgSourceLabel = (
  fgEstimateMode: RecipeFgEstimateMode | null | undefined,
  _fgEstimateDetails: RecipeFgEstimateDetails | null | undefined
) => {
  if (fgEstimateMode === "manual_fg_override") {
    return "Ручной FG";
  }

  if (fgEstimateMode === "manual_attenuation_override") {
    return "Ручная attenuation";
  }

  if (fgEstimateMode === "default_estimate") {
    return "Прогноз по умолчанию";
  }

  return null;
};

export const resolveRecipeFgHelperText = (
  fgEstimateMode: RecipeFgEstimateMode | null | undefined,
  predictedFg: number | null | undefined
) => (
  predictedFg == null && fgEstimateMode === "unavailable"
    ? "Добавьте сбраживаемое"
    : null
);
