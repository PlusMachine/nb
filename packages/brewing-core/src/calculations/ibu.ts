import { roundTo } from "../units";
import type { HopAdditionInput } from "../types/recipe";

export const bitternessFormulas = [
  "tinseth_classic",
  "tinseth_whirlpool_v2",
  "rager",
  "garetz",
  "noonan_legacy"
] as const;

export type BitternessFormula = (typeof bitternessFormulas)[number];
export type FirstWortHopMode = "bonus_10pct" | "treat_as_20min" | "treat_as_boil_start";

export interface IbuTinsethInput {
  og: number;
  batchVolumeL: number;
  hopAdditions: HopAdditionInput[];
}

export interface BitternessEngineInput {
  formula?: BitternessFormula;
  og?: number | null;
  batchVolumeL: number;
  boilTimeMinutes?: number;
  hopAdditions: HopAdditionInput[];
  preBoilVolumeL?: number | null;
  postBoilVolumeL?: number | null;
  fermentableGravityPoints?: number | null;
  hopUtilizationFactor?: number | null;
  hopFormUtilizationFactor?: number | null;
  whirlpoolUtilizationFactor?: number | null;
  includeBoilCarryoverIntoWhirlpool?: boolean;
  whirlpoolTimeMinutes?: number | null;
  whirlpoolTemperatureC?: number | null;
  firstWortHopMode?: FirstWortHopMode;
  altitudeM?: number | null;
  yeastFlocculationFactor?: number | null;
}

export interface BitternessContribution {
  hopAdditionId: string;
  use: NonNullable<HopAdditionInput["use"]>;
  ibu: number;
  /** SG сусла на момент внесения (используется для bigness factor / утилизации), не конечный OG. */
  gravityAtAddition: number;
  /** Объём, на который делится масса изо-альфа-кислот (по Тинсету — конечный объём партии, postBoil), не объём на момент внесения. */
  volumeL: number;
  utilization: number;
  isCarryover: boolean;
}

export interface BitternessResult {
  formula: BitternessFormula;
  ibu: number;
  contributions: BitternessContribution[];
  warnings: string[];
  /** OG actually used by the engine (input.og with the og<=1 → 1.05 fallback applied). */
  resolvedOg: number;
}

const DEFAULT_FORMULA: BitternessFormula = "tinseth_whirlpool_v2";
const DEFAULT_BOIL_TIME_MINUTES = 60;
const DEFAULT_WHIRLPOOL_TEMPERATURE_C = 85;
const LATE_BOIL_CARRYOVER_THRESHOLD_MIN = 20;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const utilizationTinseth = (sg: number, boilTimeMinutes: number): number => {
  const bignessFactor = 1.65 * 0.000125 ** (sg - 1);
  const boilTimeFactor = (1 - Math.exp(-0.04 * Math.max(0, boilTimeMinutes))) / 4.15;
  return bignessFactor * boilTimeFactor;
};

const utilizationRager = (boilTimeMinutes: number): number => {
  const utilizationPct = 18.11 + (13.86 * Math.tanh((Math.max(0, boilTimeMinutes) - 31.32) / 18.27));
  return Math.max(0, utilizationPct / 100);
};

const whirlpoolTemperatureFactor = (temperatureC: number): number => {
  const kelvin = temperatureC + 273.15;
  return clamp(2.39e11 * Math.exp(-9773 / kelvin), 0, 1);
};

const calculateAdditionIbu = (addition: HopAdditionInput, utilization: number, volumeL: number) => (
  volumeL > 0
    ? (addition.weightG * (addition.alphaAcidPercent / 100) * utilization * 1000) / volumeL
    : 0
);

const resolveBoilVolumeAtAddition = (input: {
  additionTimeMinutes: number;
  boilTimeMinutes: number;
  preBoilVolumeL: number;
  postBoilVolumeL: number;
}) => {
  if (input.boilTimeMinutes <= 0) {
    return input.postBoilVolumeL;
  }

  const timeRemaining = clamp(input.additionTimeMinutes, 0, input.boilTimeMinutes);
  const evaporationProgress = timeRemaining / input.boilTimeMinutes;
  return input.postBoilVolumeL + ((input.preBoilVolumeL - input.postBoilVolumeL) * evaporationProgress);
};

const resolveGravityAtVolume = (gravityPoints: number, volumeL: number, fallbackOg: number) => (
  volumeL > 0 ? 1 + (gravityPoints / volumeL / 1000) : fallbackOg
);

const normalizeUse = (addition: HopAdditionInput): NonNullable<HopAdditionInput["use"]> => addition.use ?? "boil";

// Кипятильное внесение с временем больше самого кипячения — почти всегда опечатка
// (напр. 90 мин при кипячении 60). Время клампится, но об этом стоит предупредить.
const boilTimeExceedsBoil = (addition: HopAdditionInput, boilTimeMinutes: number): boolean => (
  normalizeUse(addition) === "boil" && addition.boilTimeMinutes > boilTimeMinutes
);

const resolveBoilTimeForAddition = (
  addition: HopAdditionInput,
  boilTimeMinutes: number,
  firstWortHopMode: FirstWortHopMode
) => {
  if (normalizeUse(addition) !== "first_wort_hop") {
    // Хмель не может кипеть дольше самого кипячения — иначе утилизация (а с ней IBU)
    // завышается на «лишние» минуты. Объём уже клампится в resolveBoilVolumeAtAddition,
    // время клампим здесь, у источника, чтобы почин затронул и рецепты, и калькулятор.
    return Math.min(addition.boilTimeMinutes, boilTimeMinutes);
  }

  if (firstWortHopMode === "treat_as_20min") {
    return Math.min(20, boilTimeMinutes);
  }

  return boilTimeMinutes;
};

const buildContribution = (input: {
  addition: HopAdditionInput;
  use: NonNullable<HopAdditionInput["use"]>;
  ibu: number;
  sg: number;
  volumeL: number;
  utilization: number;
  isCarryover?: boolean;
}): BitternessContribution => ({
  hopAdditionId: input.addition.id,
  use: input.use,
  ibu: roundTo(input.ibu, 3),
  gravityAtAddition: roundTo(input.sg, 4),
  volumeL: roundTo(input.volumeL, 3),
  utilization: roundTo(input.utilization, 5),
  isCarryover: input.isCarryover ?? false
});

const resolveBitternessContext = (input: BitternessEngineInput) => {
  const og = input.og && input.og > 1 ? input.og : 1.05;
  const boilTimeMinutes = input.boilTimeMinutes ?? DEFAULT_BOIL_TIME_MINUTES;
  const postBoilVolumeL = input.postBoilVolumeL && input.postBoilVolumeL > 0
    ? input.postBoilVolumeL
    : input.batchVolumeL;
  const preBoilVolumeL = input.preBoilVolumeL && input.preBoilVolumeL >= postBoilVolumeL
    ? input.preBoilVolumeL
    : postBoilVolumeL;
  const gravityPoints = input.fermentableGravityPoints && input.fermentableGravityPoints > 0
    ? input.fermentableGravityPoints
    : (og - 1) * 1000 * postBoilVolumeL;

  return {
    og,
    boilTimeMinutes,
    postBoilVolumeL,
    preBoilVolumeL,
    gravityPoints,
    hopUtilizationFactor: input.hopUtilizationFactor ?? 1,
    hopFormUtilizationFactor: input.hopFormUtilizationFactor ?? 1,
    whirlpoolUtilizationFactor: input.whirlpoolUtilizationFactor ?? 1,
    includeBoilCarryoverIntoWhirlpool: input.includeBoilCarryoverIntoWhirlpool ?? true,
    whirlpoolTimeMinutes: Math.max(0, input.whirlpoolTimeMinutes ?? 0),
    whirlpoolTemperatureC: input.whirlpoolTemperatureC ?? DEFAULT_WHIRLPOOL_TEMPERATURE_C,
    firstWortHopMode: input.firstWortHopMode ?? "bonus_10pct",
    altitudeM: input.altitudeM ?? 0,
    yeastFlocculationFactor: input.yeastFlocculationFactor ?? 1
  };
};

const applyFinalFactors = (
  rawIbu: number,
  addition: HopAdditionInput,
  input: Pick<ReturnType<typeof resolveBitternessContext>, "hopUtilizationFactor" | "hopFormUtilizationFactor">
) => rawIbu * input.hopUtilizationFactor * input.hopFormUtilizationFactor * (addition.utilizationFactor ?? 1);

const calculateTinsethClassic = (input: BitternessEngineInput): BitternessResult => {
  const context = resolveBitternessContext(input);
  const contributions: BitternessContribution[] = [];
  const warnings: string[] = [];

  for (const addition of input.hopAdditions) {
    const use = normalizeUse(addition);
    if (use !== "boil" && use !== "first_wort_hop") {
      if (use === "whirlpool" || use === "dip_hop") warnings.push("tinseth_classic_whirlpool_ignored");
      if (use === "dry_hop") warnings.push("dry_hop_ibu_ignored");
      continue;
    }

    if (boilTimeExceedsBoil(addition, context.boilTimeMinutes)) {
      warnings.push("hop_time_exceeds_boil_capped");
    }
    const boilTime = resolveBoilTimeForAddition(addition, context.boilTimeMinutes, "treat_as_boil_start");
    const utilization = utilizationTinseth(context.og, boilTime);
    const rawIbu = calculateAdditionIbu(addition, utilization, input.batchVolumeL);
    contributions.push(buildContribution({
      addition,
      use,
      ibu: applyFinalFactors(rawIbu, addition, context),
      sg: context.og,
      volumeL: input.batchVolumeL,
      utilization
    }));
  }

  return finalizeBitterness("tinseth_classic", contributions, warnings, context.og);
};

const calculateTinsethWhirlpoolV2 = (input: BitternessEngineInput): BitternessResult => {
  const context = resolveBitternessContext(input);
  const contributions: BitternessContribution[] = [];
  const warnings: string[] = [];
  const whirlpoolTempFactor = whirlpoolTemperatureFactor(context.whirlpoolTemperatureC);
  const postBoilGravity = resolveGravityAtVolume(context.gravityPoints, context.postBoilVolumeL, context.og);

  for (const addition of input.hopAdditions) {
    const use = normalizeUse(addition);

    if (use === "dry_hop") {
      warnings.push("dry_hop_ibu_ignored");
      continue;
    }

    if (use === "boil" || use === "first_wort_hop") {
      if (boilTimeExceedsBoil(addition, context.boilTimeMinutes)) {
        warnings.push("hop_time_exceeds_boil_capped");
      }
      const boilTime = resolveBoilTimeForAddition(addition, context.boilTimeMinutes, context.firstWortHopMode);
      const volumeL = resolveBoilVolumeAtAddition({
        additionTimeMinutes: boilTime,
        boilTimeMinutes: context.boilTimeMinutes,
        preBoilVolumeL: context.preBoilVolumeL,
        postBoilVolumeL: context.postBoilVolumeL
      });
      const sg = resolveGravityAtVolume(context.gravityPoints, volumeL, context.og);
      const fwhBonus = use === "first_wort_hop" && context.firstWortHopMode === "bonus_10pct" ? 1.1 : 1;
      const utilization = utilizationTinseth(sg, boilTime) * fwhBonus;
      // Утилизация считается по SG на момент внесения (`volumeL`, ещё не уваренное
      // сусло), но масса изо-альфа делится на конечный объём партии — при уварке
      // горечь концентрируется (Тинсет). См. BitternessContribution.volumeL.
      const rawIbu = calculateAdditionIbu(addition, utilization, context.postBoilVolumeL);
      contributions.push(buildContribution({
        addition,
        use,
        ibu: applyFinalFactors(rawIbu, addition, context),
        sg,
        volumeL: context.postBoilVolumeL,
        utilization
      }));
      continue;
    }

    if (use === "whirlpool" || use === "dip_hop") {
      const timeMinutes = Math.max(0, addition.boilTimeMinutes);
      const temperatureC = addition.temperatureC ?? context.whirlpoolTemperatureC;
      const utilization = utilizationTinseth(postBoilGravity, timeMinutes)
        * whirlpoolTemperatureFactor(temperatureC)
        * context.whirlpoolUtilizationFactor;
      const rawIbu = calculateAdditionIbu(addition, utilization, context.postBoilVolumeL);
      contributions.push(buildContribution({
        addition,
        use,
        ibu: applyFinalFactors(rawIbu, addition, context),
        sg: postBoilGravity,
        volumeL: context.postBoilVolumeL,
        utilization
      }));
    }
  }

  if (context.includeBoilCarryoverIntoWhirlpool && context.whirlpoolTimeMinutes > 0) {
    for (const addition of input.hopAdditions) {
      const use = normalizeUse(addition);
      if (use !== "boil" || addition.boilTimeMinutes > LATE_BOIL_CARRYOVER_THRESHOLD_MIN) {
        continue;
      }

      const boilTime = Math.max(0, addition.boilTimeMinutes);
      const volumeL = resolveBoilVolumeAtAddition({
        additionTimeMinutes: boilTime,
        boilTimeMinutes: context.boilTimeMinutes,
        preBoilVolumeL: context.preBoilVolumeL,
        postBoilVolumeL: context.postBoilVolumeL
      });
      const sg = resolveGravityAtVolume(context.gravityPoints, volumeL, context.og);
      const boilUtilization = utilizationTinseth(sg, boilTime);
      const maxBoilUtilization = Math.max(utilizationTinseth(sg, context.boilTimeMinutes), 0.0001);
      const remainingPotentialFraction = clamp(1 - (boilUtilization / maxBoilUtilization), 0, 1);
      const utilization = utilizationTinseth(postBoilGravity, context.whirlpoolTimeMinutes)
        * whirlpoolTempFactor
        * context.whirlpoolUtilizationFactor
        * remainingPotentialFraction;

      if (utilization <= 0) {
        continue;
      }

      const rawIbu = calculateAdditionIbu(addition, utilization, context.postBoilVolumeL);
      contributions.push(buildContribution({
        addition,
        use,
        ibu: applyFinalFactors(rawIbu, addition, context),
        sg: postBoilGravity,
        volumeL: context.postBoilVolumeL,
        utilization,
        isCarryover: true
      }));
    }

    if (contributions.some((contribution) => contribution.isCarryover)) {
      warnings.push("boil_carryover_whirlpool_approximation");
    }
  }

  return finalizeBitterness("tinseth_whirlpool_v2", contributions, warnings, context.og);
};

const calculateRager = (input: BitternessEngineInput): BitternessResult => {
  const context = resolveBitternessContext(input);
  const contributions: BitternessContribution[] = [];
  const warnings: string[] = [];

  for (const addition of input.hopAdditions) {
    const use = normalizeUse(addition);
    if (use !== "boil" && use !== "first_wort_hop") {
      warnings.push(`${use}_unsupported_for_rager`);
      continue;
    }

    if (boilTimeExceedsBoil(addition, context.boilTimeMinutes)) {
      warnings.push("hop_time_exceeds_boil_capped");
    }
    const boilTime = resolveBoilTimeForAddition(addition, context.boilTimeMinutes, context.firstWortHopMode);
    const volumeL = resolveBoilVolumeAtAddition({
      additionTimeMinutes: boilTime,
      boilTimeMinutes: context.boilTimeMinutes,
      preBoilVolumeL: context.preBoilVolumeL,
      postBoilVolumeL: context.postBoilVolumeL
    });
    const sg = resolveGravityAtVolume(context.gravityPoints, volumeL, context.og);
    const gravityCorrection = sg > 1.05 ? 1 + ((sg - 1.05) / 0.2) : 1;
    const utilization = utilizationRager(boilTime) / gravityCorrection;
    // Как и в v2: SG на момент внесения (`volumeL`) — только для утилизации,
    // деление массы изо-альфа — на конечный объём партии.
    const rawIbu = calculateAdditionIbu(addition, utilization, context.postBoilVolumeL);
    contributions.push(buildContribution({
      addition,
      use,
      ibu: applyFinalFactors(rawIbu, addition, context),
      sg,
      volumeL: context.postBoilVolumeL,
      utilization
    }));
  }

  return finalizeBitterness("rager", contributions, warnings, context.og);
};

const calculateGaretz = (input: BitternessEngineInput): BitternessResult => {
  const context = resolveBitternessContext(input);
  const classic = calculateTinsethClassic(input);
  const altitudeFactor = clamp(1 - (Math.max(0, context.altitudeM) * 0.00003), 0.75, 1);
  const flocculationFactor = clamp(context.yeastFlocculationFactor, 0.8, 1.2);
  const gravityFactor = context.og > 1.05 ? 1 / (1 + ((context.og - 1.05) * 5)) : 1;
  const factor = altitudeFactor * flocculationFactor * gravityFactor;

  return finalizeBitterness(
    "garetz",
    classic.contributions.map((contribution) => ({
      ...contribution,
      ibu: roundTo(contribution.ibu * factor, 3),
      utilization: roundTo(contribution.utilization * factor, 5)
    })),
    [...classic.warnings, "garetz_conservative_compat_approximation"],
    context.og
  );
};

const calculateNoonanLegacy = (input: BitternessEngineInput): BitternessResult => {
  const classic = calculateTinsethClassic(input);

  return finalizeBitterness(
    "noonan_legacy",
    classic.contributions.map((contribution) => ({
      ...contribution,
      ibu: roundTo(contribution.ibu * 0.9, 3),
      utilization: roundTo(contribution.utilization * 0.9, 5)
    })),
    [...classic.warnings, "noonan_legacy_compat_approximation"],
    classic.resolvedOg
  );
};

const finalizeBitterness = (
  formula: BitternessFormula,
  contributions: BitternessContribution[],
  warnings: string[],
  resolvedOg: number
): BitternessResult => ({
  formula,
  ibu: roundTo(contributions.reduce((sum, contribution) => sum + contribution.ibu, 0), 1),
  contributions,
  resolvedOg,
  warnings: [...new Set(warnings)]
});

export const calculateBitterness = (input: BitternessEngineInput): BitternessResult => {
  const formula = input.formula ?? DEFAULT_FORMULA;

  if (formula === "tinseth_classic") {
    return calculateTinsethClassic(input);
  }

  if (formula === "rager") {
    return calculateRager(input);
  }

  if (formula === "garetz") {
    return calculateGaretz(input);
  }

  if (formula === "noonan_legacy") {
    return calculateNoonanLegacy(input);
  }

  return calculateTinsethWhirlpoolV2(input);
};

export const calculateIbuTinseth = ({ og, batchVolumeL, hopAdditions }: IbuTinsethInput): number => (
  calculateBitterness({
    formula: "tinseth_classic",
    og,
    batchVolumeL,
    hopAdditions
  }).ibu
);
