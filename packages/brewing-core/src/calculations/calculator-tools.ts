import { platoToSg, roundTo, sgToPlato } from "../units";
import { kegPressurePsi } from "./carbonation";
import {
  alkalinityAsCaCO3FromHco3,
  applySaltAdditions,
  estimateMashPh,
  solveMashAcidAddition,
  sulfateChlorideRatio,
  type BrewingAcidId,
  type BrewingSaltId,
  type SaltAddition,
  type WaterProfile
} from "./water";

const L_TO_GAL = 0.2641720524;
const KG_TO_LB = 2.2046226218;
const LB_TO_KG = 0.45359237;
const OZ_TO_ML = 29.5735295625;
const QT_TO_L = 0.946352946;
const GAL_TO_L = 3.785411784;
const PSI_TO_BAR = 0.0689475729;
const PSI_TO_KPA = 6.89475729;

const assertPositive = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type CalculatorGravityUnit = "SG" | "Plato" | "Brix";
export type AbvFormula = "standard" | "alternate";

export const gravityPointsFromSg = (sg: number): number => roundTo((sg - 1) * 1000, 3);

export const sgFromGravityPoints = (points: number): number => roundTo(1 + points / 1000, 4);

export const brixToSg = (brix: number, decimals = 4): number => platoToSg(brix, decimals);

export const sgToBrix = (sg: number, decimals = 2): number => sgToPlato(sg, decimals);

export const gravityToSg = (value: number, unit: CalculatorGravityUnit = "SG"): number => {
  if (unit === "SG") {
    return value;
  }

  return platoToSg(value, 5);
};

export const sgToGravityUnit = (sg: number, unit: CalculatorGravityUnit): number => {
  if (unit === "SG") {
    return roundTo(sg, 4);
  }

  return sgToPlato(sg, 2);
};

export const calculateAbvStandard = (og: number, fg: number): number => roundTo((og - fg) * 131.25, 2);

export const calculateAbvAlternate = (og: number, fg: number): number => {
  const abv = (76.08 * (og - fg) / (1.775 - og)) * (fg / 0.794);
  return roundTo(abv, 2);
};

export const calculateApparentAttenuation = (og: number, fg: number): number => (
  roundTo(((og - fg) / (og - 1)) * 100, 1)
);

export const calculateCaloriesPerServing = (input: {
  og: number;
  fg: number;
  abv: number;
  servingSizeMl: number;
}): number => {
  const realExtractPlato = (0.1808 * sgToPlato(input.og, 4)) + (0.8192 * sgToPlato(input.fg, 4));
  const abw = input.abv * 0.79336 / input.fg;
  const caloriesPer12Oz = ((6.9 * abw) + 4 * (realExtractPlato - 0.1)) * input.fg * 3.55;
  // Вырожденные замеры (OG около воды, FG > OG) уводят формулу в минус — калорий меньше нуля не бывает.
  return roundTo(Math.max(0, caloriesPer12Oz * (input.servingSizeMl / 354.882)), 0);
};

export const calculateAbvAttenuation = (input: {
  og: number;
  fg: number;
  formula?: AbvFormula;
  servingSizeMl?: number;
}) => {
  const abv = input.formula === "alternate"
    ? calculateAbvAlternate(input.og, input.fg)
    : calculateAbvStandard(input.og, input.fg);
  const abw = roundTo(abv * 0.79336 / input.fg, 2);

  return {
    abv,
    abw,
    apparentAttenuation: calculateApparentAttenuation(input.og, input.fg),
    calories: calculateCaloriesPerServing({
      og: input.og,
      fg: input.fg,
      abv,
      servingSizeMl: input.servingSizeMl ?? 500
    })
  };
};

export type DilutionBoiloffMode =
  | "dilute_to_gravity"
  | "boil_to_gravity"
  | "gravity_after_water"
  | "gravity_after_boiloff"
  | "add_extract_to_gravity"
  | "extra_boil_time";

export type GravityAdditionType = "water" | "dme" | "sugar";

// Shared by calculateExtractAdditionGrams and the add_extract_to_gravity branch of
// calculateDilutionBoiloff — both need "how many gravity points, over what volume, must
// the addition supply" and previously duplicated this arithmetic.
const resolveGravityPointDelta = (input: {
  currentVolumeL: number;
  currentGravity: number;
  targetGravity: number;
  targetVolumeL?: number;
}) => {
  const targetVolumeL = input.targetVolumeL && input.targetVolumeL > 0 ? input.targetVolumeL : input.currentVolumeL;
  const currentPointLiters = input.currentVolumeL * gravityPointsFromSg(input.currentGravity);
  const targetPointLiters = targetVolumeL * gravityPointsFromSg(input.targetGravity);
  return {
    targetVolumeL,
    currentPointLiters,
    targetPointLiters,
    pointLitersNeeded: Math.max(0, targetPointLiters - currentPointLiters)
  };
};

export const calculateExtractAdditionGrams = (input: {
  currentVolumeL: number;
  currentGravity: number;
  targetGravity: number;
  targetVolumeL?: number;
  additionType: Extract<GravityAdditionType, "dme" | "sugar">;
}) => {
  const { pointLitersNeeded } = resolveGravityPointDelta(input);
  const ppg = input.additionType === "dme" ? 44 : 46;
  const pointGallons = pointLitersNeeded * L_TO_GAL;
  const pounds = pointGallons / ppg;

  return roundTo(pounds * 453.59237, 1);
};

export const calculateDilutionBoiloff = (input: {
  mode: DilutionBoiloffMode;
  currentVolumeL: number;
  currentGravity: number;
  targetGravity?: number;
  targetVolumeL?: number;
  boilOffRateLPerHour?: number;
  additionType?: GravityAdditionType;
}) => {
  assertPositive(input.currentVolumeL, "currentVolumeL");
  const warnings: string[] = [];
  const currentPoints = gravityPointsFromSg(input.currentGravity);
  const currentPointLiters = input.currentVolumeL * currentPoints;
  const targetPoints = input.targetGravity ? gravityPointsFromSg(input.targetGravity) : currentPoints;
  const targetVolumeFromGravity = targetPoints > 0 ? currentPointLiters / targetPoints : input.currentVolumeL;
  const requestedTargetVolume = input.targetVolumeL && input.targetVolumeL > 0 ? input.targetVolumeL : targetVolumeFromGravity;

  // Diluting can only lower gravity, boiling can only raise it — a target on the wrong
  // side of current is not reachable by that mode's mechanism at all.
  if (input.mode === "dilute_to_gravity" && input.targetGravity != null && input.targetGravity > input.currentGravity) {
    warnings.push("target_gravity_above_current");
  }
  if (input.mode === "boil_to_gravity" && input.targetGravity != null && input.targetGravity < input.currentGravity) {
    warnings.push("target_gravity_below_current");
  }

  // Boiling off only removes volume, so a requested post-boil volume above current is
  // physically impossible; treat it as "no boiloff" instead of manufacturing a fake result.
  const boilRequestedVolume = input.mode === "boil_to_gravity" ? targetVolumeFromGravity : requestedTargetVolume;
  const boilModeImpossible = (input.mode === "boil_to_gravity" || input.mode === "gravity_after_boiloff" || input.mode === "extra_boil_time")
    && boilRequestedVolume > input.currentVolumeL;
  if (boilModeImpossible) {
    warnings.push("target_volume_above_current");
  }

  // Adding water only increases volume, so a requested volume below current is impossible.
  const waterModeImpossible = input.mode === "gravity_after_water" && requestedTargetVolume < input.currentVolumeL;
  if (waterModeImpossible) {
    warnings.push("target_volume_below_current");
  }

  const waterToAdd = input.mode === "dilute_to_gravity"
    ? Math.max(0, targetVolumeFromGravity - input.currentVolumeL)
    : input.mode === "gravity_after_water"
      ? Math.max(0, requestedTargetVolume - input.currentVolumeL)
      : 0;
  const volumeToBoilOff = input.mode === "boil_to_gravity"
    ? Math.max(0, input.currentVolumeL - targetVolumeFromGravity)
    : input.mode === "gravity_after_boiloff" || input.mode === "extra_boil_time"
      ? Math.max(0, input.currentVolumeL - requestedTargetVolume)
      : 0;

  let resultingVolume = input.currentVolumeL;
  let resultingGravity = input.currentGravity;

  if (input.mode === "dilute_to_gravity") {
    resultingVolume = input.currentVolumeL + waterToAdd;
    resultingGravity = sgFromGravityPoints(currentPointLiters / resultingVolume);
  } else if (input.mode === "boil_to_gravity") {
    resultingVolume = input.currentVolumeL - volumeToBoilOff;
    resultingGravity = resultingVolume > 0 ? sgFromGravityPoints(currentPointLiters / resultingVolume) : input.currentGravity;
  } else if (input.mode === "gravity_after_water" && !waterModeImpossible) {
    resultingVolume = requestedTargetVolume;
    resultingGravity = sgFromGravityPoints(currentPointLiters / resultingVolume);
  } else if ((input.mode === "gravity_after_boiloff" || input.mode === "extra_boil_time") && !boilModeImpossible) {
    resultingVolume = requestedTargetVolume;
    resultingGravity = resultingVolume > 0 ? sgFromGravityPoints(currentPointLiters / resultingVolume) : input.currentGravity;
  } else if (input.mode === "add_extract_to_gravity" && input.targetGravity) {
    // input.targetVolumeL is ignored here on purpose: the UI hides "Целевой объем" for this
    // mode, so a stale/default value must not silently expand the batch — the extract is
    // dosed into the CURRENT volume, which is why resultingVolume ends up ≈ currentVolumeL.
    const { targetVolumeL, pointLitersNeeded } = resolveGravityPointDelta({
      currentVolumeL: input.currentVolumeL,
      currentGravity: input.currentGravity,
      targetGravity: input.targetGravity
    });
    resultingVolume = targetVolumeL;
    resultingGravity = sgFromGravityPoints((currentPointLiters + pointLitersNeeded) / resultingVolume);
  }

  const extraBoilTimeMinutes = input.boilOffRateLPerHour && input.boilOffRateLPerHour > 0
    ? roundTo((volumeToBoilOff / input.boilOffRateLPerHour) * 60, 0)
    : 0;
  const additionType = input.additionType === "sugar" ? "sugar" : "dme";
  const extractGrams = input.mode === "add_extract_to_gravity" && input.targetGravity
    // Same targetVolumeL-ignoring rule as above: grams are dosed for the current volume.
    ? calculateExtractAdditionGrams({
      currentVolumeL: input.currentVolumeL,
      currentGravity: input.currentGravity,
      targetGravity: input.targetGravity,
      additionType
    })
    : 0;

  return {
    waterToAddL: roundTo(waterToAdd, 2),
    volumeToBoilOffL: roundTo(volumeToBoilOff, 2),
    extraBoilTimeMinutes,
    resultingVolumeL: roundTo(resultingVolume, 2),
    resultingGravity,
    dmeToAddG: additionType === "dme" ? extractGrams : 0,
    sugarToAddG: additionType === "sugar" ? extractGrams : 0,
    warnings
  };
};

export type RefractometerMode = "pre_fermentation" | "post_fermentation";
// NOTE: these keys are historical and the community names are muddled. By coefficients
// the "novotny" key is Sean Terrill's published cubic, and the "terrill" key is the
// Bonham / Brewer's Friend cubic (derived from Novotný's dataset). The user-facing
// labels are corrected in apps/web/features/calculators/definitions.ts. The keys are
// kept stable so saved state and shared links keep working — do NOT change coefficients.
export type RefractometerFormula = "novotny" | "terrill";

export const correctRefractometer = (input: {
  mode: RefractometerMode;
  originalGravity?: number;
  originalBrix?: number;
  currentBrix: number;
  wortCorrectionFactor?: number;
  formula?: RefractometerFormula;
}) => {
  const wcf = input.wortCorrectionFactor ?? 1.04;
  const correctedBrix = input.currentBrix / wcf;

  if (input.mode === "pre_fermentation") {
    const correctedSg = brixToSg(correctedBrix);
    return {
      correctedBrix: roundTo(correctedBrix, 2),
      correctedSG: correctedSg,
      correctedPlato: sgToPlato(correctedSg),
      estimatedABV: 0,
      attenuation: 0
    };
  }

  // OG handling depends on where the number came from:
  // - originalBrix is a raw refractometer reading of the wort and carries the same
  //   instrument bias as the current reading, so it is divided by the WCF.
  // - originalGravity is a known/true gravity (hydrometer or recipe target), so it is
  //   converted straight to Brix WITHOUT the WCF.
  const ogBrix = input.originalBrix != null
    ? input.originalBrix / wcf
    : input.originalGravity != null
      ? sgToBrix(input.originalGravity)
      : correctedBrix;
  const current = correctedBrix;
  const correctedSg = input.formula === "terrill"
    // "terrill" key → Bonham / Brewer's Friend cubic (see RefractometerFormula note)
    ? 1.001843
      - 0.002318474 * ogBrix
      - 0.000007775 * ogBrix ** 2
      - 0.000000034 * ogBrix ** 3
      + 0.00574 * current
      + 0.00003344 * current ** 2
      + 0.000000086 * current ** 3
    // "novotny" key → Sean Terrill's cubic (see RefractometerFormula note)
    : 1.0000
      - 0.0044993 * ogBrix
      + 0.011774 * current
      + 0.00027581 * ogBrix ** 2
      - 0.0012717 * current ** 2
      - 0.00000728 * ogBrix ** 3
      + 0.000063293 * current ** 3;
  const og = input.originalGravity ?? brixToSg(ogBrix);

  return {
    correctedBrix: roundTo(current, 2),
    correctedSG: roundTo(correctedSg, 4),
    correctedPlato: sgToPlato(correctedSg),
    estimatedABV: calculateAbvStandard(og, correctedSg),
    attenuation: calculateApparentAttenuation(og, correctedSg)
  };
};

/**
 * Calibrate a personal Wort Correction Factor (WCF) for a refractometer.
 *
 * WCF = refractometer Brix ÷ true Brix, where the true Brix comes from a trusted
 * hydrometer/saccharometer reading of the SAME unfermented (alcohol-free) wort.
 * Saccharometers are commonly graduated in °P/% rather than SG, so both are accepted
 * (°P ≈ Brix). Done once per instrument; the value is then reused for every batch.
 */
export const calibrateWcf = (input: {
  refractometerBrix: number;
  hydrometerReading: number;
  hydrometerUnit?: CalculatorGravityUnit;
  decimals?: number;
}): number => {
  const unit = input.hydrometerUnit ?? "SG";
  const trueBrix = unit === "SG" ? sgToBrix(input.hydrometerReading) : input.hydrometerReading;

  if (!Number.isFinite(input.refractometerBrix) || input.refractometerBrix <= 0 || !Number.isFinite(trueBrix) || trueBrix <= 0) {
    throw new Error("calibrateWcf requires positive, finite refractometer and hydrometer readings");
  }

  return roundTo(input.refractometerBrix / trueBrix, input.decimals ?? 3);
};

export type ApparentAttenuationBand = "low" | "normal" | "high";

/**
 * Rough qualitative band for apparent attenuation (%): below ~65% reads as an
 * unfinished/under-attenuated fermentation, 65–80% is typical for most ales, and
 * above ~80% points to a dry profile (lagers, saisons, wild/brett fermentations).
 */
export const classifyApparentAttenuation = (attenuation: number): ApparentAttenuationBand => {
  if (attenuation < 65) {
    return "low";
  }

  if (attenuation > 80) {
    return "high";
  }

  return "normal";
};

export const correctHydrometer = (input: {
  reading: number;
  readingUnit?: CalculatorGravityUnit;
  sampleTemperatureC: number;
  calibrationTemperatureC?: number;
  instrumentOffset?: number;
}) => {
  const readingSg = gravityToSg(input.reading, input.readingUnit ?? "SG");
  const sampleF = (input.sampleTemperatureC * 9) / 5 + 32;
  const calibrationF = ((input.calibrationTemperatureC ?? 20) * 9) / 5 + 32;
  const correctionPolynomial = (tempF: number): number => (
    1.00130346
    - 0.000134722124 * tempF
    + 0.00000204052596 * tempF ** 2
    - 0.00000000232820948 * tempF ** 3
  );
  const correctedSg = readingSg * (correctionPolynomial(sampleF) / correctionPolynomial(calibrationF)) + (input.instrumentOffset ?? 0);

  return {
    correctedSG: roundTo(correctedSg, 4),
    correctedPlato: sgToPlato(correctedSg)
  };
};

export type PrimingSugarType = "dextrose" | "sucrose" | "dme" | "honey";

const primingFactorsGPerLPerVolume: Record<PrimingSugarType, number> = {
  dextrose: 4.0,
  sucrose: 3.8,
  dme: 5.6,
  honey: 4.9
};

export const residualCo2VolumesAtTempC = (temperatureC: number): number => {
  const tempF = (temperatureC * 9) / 5 + 32;
  return roundTo(3.0378 - 0.050062 * tempF + 0.00026555 * tempF ** 2, 2);
};

export const calculatePrimingSugar = (input: {
  beerVolumeL: number;
  beerTemperatureC: number;
  targetCo2Volumes: number;
  sugarType?: PrimingSugarType;
  bottleSizeL?: number;
}) => {
  const residualCo2 = residualCo2VolumesAtTempC(input.beerTemperatureC);
  const warnings: string[] = [];

  if (input.targetCo2Volumes > 3.5) {
    warnings.push("high_carbonation_bottle_risk");
  }
  if (residualCo2 >= input.targetCo2Volumes) {
    warnings.push("residual_exceeds_target");
  }

  if (!Number.isFinite(input.beerVolumeL) || input.beerVolumeL <= 0) {
    return {
      totalSugarGrams: 0,
      gramsPerLiter: 0,
      gramsPerBottle: 0,
      residualCo2,
      warnings
    };
  }

  const deltaVolumes = Math.max(0, input.targetCo2Volumes - residualCo2);
  const factor = primingFactorsGPerLPerVolume[input.sugarType ?? "dextrose"];
  const totalSugarGrams = input.beerVolumeL * deltaVolumes * factor;

  return {
    totalSugarGrams: roundTo(totalSugarGrams, 1),
    gramsPerLiter: roundTo(totalSugarGrams / input.beerVolumeL, 2),
    gramsPerBottle: input.bottleSizeL && input.bottleSizeL > 0
      ? roundTo((totalSugarGrams / input.beerVolumeL) * input.bottleSizeL, 2)
      : 0,
    residualCo2,
    warnings
  };
};

export type KegCarbonationMode = "carbonate" | "serving" | "spunding";

export const convertPressure = (value: number, from: "psi" | "bar" | "kpa") => {
  const psi = from === "psi" ? value : from === "bar" ? value / PSI_TO_BAR : value / PSI_TO_KPA;
  return {
    psi: roundTo(psi, 1),
    bar: roundTo(psi * PSI_TO_BAR, 2),
    kpa: roundTo(psi * PSI_TO_KPA, 0)
  };
};

export const calculateKegCarbonationPressure = (input: {
  beerTemperatureC: number;
  targetCo2Volumes: number;
  mode?: KegCarbonationMode;
}) => {
  // Полином равновесного давления — единственный источник истины в carbonation.ts,
  // общий с таблицей карбонизации (её ячейки считаются обратной функцией того же полинома).
  const pressurePsi = kegPressurePsi(input.beerTemperatureC, input.targetCo2Volumes);
  const converted = convertPressure(Math.max(0, pressurePsi), "psi");

  return {
    ...converted,
    suggestedPressurePsi: converted.psi,
    // Высокое давление рискованно независимо от режима — не только при шпунтовании.
    warnings: converted.psi > 30 ? ["pressure_above_30_psi"] : []
  };
};

export type BrewingWaterMethodPreset = "BIAB" | "allInOne" | "mashTunWithSparge" | "extract";

export const calculateBrewingWaterVolume = (input: {
  targetFermenterVolumeL: number;
  grainWeightKg: number;
  mashThicknessLPerKg: number;
  boilTimeMinutes: number;
  boilOffRateLPerHour: number;
  grainAbsorptionLPerKg: number;
  kettleLossL?: number;
  trubChillerLossL?: number;
  coolingShrinkagePercent?: number;
  methodPreset?: BrewingWaterMethodPreset;
}) => {
  const trubChillerLossL = input.trubChillerLossL ?? 1;
  const kettleLossL = input.kettleLossL ?? 0.5;
  const shrinkagePercent = input.coolingShrinkagePercent ?? 4;
  const shrinkage = shrinkagePercent / 100;
  const postBoilCoolVolumeL = input.targetFermenterVolumeL + trubChillerLossL;
  const postBoilHotVolumeL = postBoilCoolVolumeL / Math.max(0.01, 1 - shrinkage);
  const preBoilVolumeL = postBoilHotVolumeL + input.boilOffRateLPerHour * (input.boilTimeMinutes / 60);
  const absorptionL = input.grainWeightKg * input.grainAbsorptionLPerKg;
  const totalWaterNeededL = preBoilVolumeL + absorptionL + kettleLossL;
  const isNoSpargeMethod = input.methodPreset === "BIAB" || input.methodPreset === "extract";
  const grainMashWaterL = input.grainWeightKg * input.mashThicknessLPerKg;
  const mashWaterL = isNoSpargeMethod ? totalWaterNeededL : Math.min(totalWaterNeededL, grainMashWaterL);
  const spargeWaterL = Math.max(0, totalWaterNeededL - mashWaterL);
  const warnings: string[] = [];

  if (shrinkagePercent >= 20) {
    warnings.push("shrinkage_suspiciously_high");
  }
  if (!isNoSpargeMethod && totalWaterNeededL < grainMashWaterL) {
    warnings.push("mash_water_capped");
  }

  return {
    totalWaterNeededL: roundTo(totalWaterNeededL, 2),
    mashWaterL: roundTo(mashWaterL, 2),
    spargeWaterL: roundTo(spargeWaterL, 2),
    preBoilVolumeL: roundTo(preBoilVolumeL, 2),
    postBoilHotVolumeL: roundTo(postBoilHotVolumeL, 2),
    postBoilCoolVolumeL: roundTo(postBoilCoolVolumeL, 2),
    intoFermenterVolumeL: roundTo(input.targetFermenterVolumeL, 2),
    warnings
  };
};

export const calculateBeerColorSimple = (input: {
  batchVolumeL: number;
  fermentables: Array<{ weightKg: number; colorLovibond: number }>;
}) => {
  const volumeGal = input.batchVolumeL * L_TO_GAL;
  const contributions = input.fermentables.map((fermentable) => {
    const mcu = volumeGal > 0 ? (fermentable.weightKg * KG_TO_LB * fermentable.colorLovibond) / volumeGal : 0;
    return {
      mcu: roundTo(mcu, 2),
      srm: roundTo(1.4922 * mcu ** 0.6859, 1)
    };
  });
  const mcu = contributions.reduce((sum, item) => sum + item.mcu, 0);
  const srm = roundTo(1.4922 * mcu ** 0.6859, 1);

  return {
    mcu: roundTo(mcu, 2),
    srm,
    ebc: roundTo(srm * 1.97, 1),
    contributions
  };
};

export const calculateBottling = (input: {
  beerVolumeL: number;
  packagingLossL?: number;
  bottleSizesL: number[];
  sugarPerLiter?: number;
}) => {
  const packageVolumeL = Math.max(0, input.beerVolumeL - (input.packagingLossL ?? 0));
  const bottleSizeL = input.bottleSizesL.find((size) => size > 0) ?? 0.5;
  const bottlesNeeded = Math.floor(packageVolumeL / bottleSizeL);
  const remainingVolumeL = packageVolumeL - bottlesNeeded * bottleSizeL;

  return {
    packageVolumeL: roundTo(packageVolumeL, 2),
    bottlesNeeded,
    remainingVolumeL: roundTo(remainingVolumeL, 2),
    sugarPerBottleG: input.sugarPerLiter ? roundTo(input.sugarPerLiter * bottleSizeL, 2) : 0
  };
};

export type SpeiseMode = "speise" | "krausen" | "gyle";

// Balling stoichiometry: fermenting 2.0665 g of extract yields 0.9565 g CO2 — ≈463 g CO2
// per kg of extract that actually ferments. Actual (not apparent) fermentability differs
// by source: speise/gyle sugar is still fully fermentable (0.63), krausen is young beer
// that has already lost some of its fermentable sugar to partial fermentation (0.50).
const CO2_GRAMS_PER_KG_FERMENTED_EXTRACT = 463;
const fermentabilityByMode: Record<SpeiseMode, number> = {
  speise: 0.63,
  // Гайл — то же самое молодое суслo, что и шпайзе; совпадение коэффициента намеренное.
  gyle: 0.63,
  krausen: 0.5
};

export const calculateSpeiseKrausen = (input: {
  beerVolumeL: number;
  targetCo2: number;
  residualCo2?: number;
  speiseGravity: number;
  temperatureC: number;
  mode?: SpeiseMode;
}) => {
  const residualCo2 = input.residualCo2 ?? residualCo2VolumesAtTempC(input.temperatureC);
  const deltaVolumes = Math.max(0, input.targetCo2 - residualCo2);
  const co2GramsNeeded = input.beerVolumeL * deltaVolumes * 1.96;
  const extractKgPerL = (sgToPlato(input.speiseGravity, 3) / 100) * input.speiseGravity;
  const fermentability = fermentabilityByMode[input.mode ?? "speise"];
  const co2YieldPerKgExtract = CO2_GRAMS_PER_KG_FERMENTED_EXTRACT * fermentability;
  const speiseVolumeToAddL = extractKgPerL > 0 ? co2GramsNeeded / co2YieldPerKgExtract / extractKgPerL : 0;
  const finalVolumeL = input.beerVolumeL + speiseVolumeToAddL;

  // Стехиометрия брожения: моль CO2 = моль этанола, масса этанола = co2GramsNeeded × 46/44;
  // объём этанола (мл) = масса / плотность этанола (0.789 г/мл).
  const ethanolGrams = co2GramsNeeded * (46 / 44);
  const ethanolMl = ethanolGrams / 0.789;
  const approximateAbvChange = finalVolumeL > 0 ? (ethanolMl / (finalVolumeL * 1000)) * 100 : 0;

  return {
    speiseVolumeToAddL: roundTo(speiseVolumeToAddL, 2),
    finalVolumeL: roundTo(finalVolumeL, 2),
    approximateAbvChange: roundTo(approximateAbvChange, 2),
    residualCo2: roundTo(residualCo2, 2)
  };
};

export type FermentationType = "ale" | "lager" | "hybrid";
export type YeastType = "dry" | "liquid";
export type StarterMode = "none" | "simple" | "stirPlate";

const pitchRatesMillionCellsPerMlPlato: Record<FermentationType, number> = {
  ale: 0.75,
  lager: 1.5,
  hybrid: 1.0
};

export const estimateYeastViability = (input: {
  yeastType: YeastType;
  manufactureDate?: Date;
  today?: Date;
  viabilityPercent?: number;
}) => {
  if (input.viabilityPercent != null) {
    return clamp(input.viabilityPercent, 0, 100);
  }

  if (!input.manufactureDate) {
    return input.yeastType === "dry" ? 90 : 75;
  }

  const today = input.today ?? new Date();
  const days = Math.max(0, (today.getTime() - input.manufactureDate.getTime()) / 86_400_000);
  const dailyLoss = input.yeastType === "dry" ? 0.002 : 0.007;
  return roundTo(clamp(100 * (1 - dailyLoss) ** days, 5, 100), 1);
};

export const calculateYeastStarter = (input: {
  wortVolumeL: number;
  gravity: number;
  fermentationType: FermentationType;
  yeastType: YeastType;
  packsCount: number;
  cellsPerPackBillion: number;
  manufactureDate?: Date;
  viabilityPercent?: number;
  starterMode?: StarterMode;
}) => {
  const plato = sgToPlato(input.gravity);
  const requiredCellsBillion = input.wortVolumeL * 1000 * plato * pitchRatesMillionCellsPerMlPlato[input.fermentationType] / 1000;
  const viability = estimateYeastViability({
    yeastType: input.yeastType,
    manufactureDate: input.manufactureDate,
    viabilityPercent: input.viabilityPercent
  });
  const viableCellsBillion = input.packsCount * input.cellsPerPackBillion * (viability / 100);
  const deficitBillion = Math.max(0, requiredCellsBillion - viableCellsBillion);
  const starterMode = input.starterMode ?? "none";
  const starterYieldBillionPerLiter = starterMode === "stirPlate" ? 160 : starterMode === "simple" ? 100 : 0;
  const warnings: string[] = [];
  // С нулём живых клеток стартеру не от чего расти — расчёт по дефициту дал бы бессмысленный объём.
  const noViableCells = viableCellsBillion === 0 && starterMode !== "none";

  if (noViableCells) {
    warnings.push("no_viable_cells");
  }

  const starterVolumeL = !noViableCells && starterYieldBillionPerLiter > 0
    ? deficitBillion / starterYieldBillionPerLiter
    : 0;

  return {
    requiredCellsBillion: roundTo(requiredCellsBillion, 0),
    viableCellsBillion: roundTo(viableCellsBillion, 0),
    pitchStatus: viableCellsBillion < requiredCellsBillion * 0.9
      ? "underpitch"
      : viableCellsBillion > requiredCellsBillion * 1.5
        ? "overpitch"
        : "ok",
    starterVolumeL: roundTo(starterVolumeL, 2),
    dmeForStarterG: roundTo(starterVolumeL * 100, 0),
    viabilityPercent: viability,
    warnings
  };
};

export const calculateWaterPh = (input: {
  sourceWaterProfile: WaterProfile;
  targetWaterProfile: WaterProfile;
  mashWaterVolumeL: number;
  spargeWaterVolumeL?: number;
  salts: SaltAddition[];
  acid?: BrewingAcidId;
  totalGrainKg?: number;
  colorCategory?: "pale" | "amber" | "dark";
  acidulatedMaltPercent?: number;
}) => {
  const totalWaterL = input.mashWaterVolumeL + (input.spargeWaterVolumeL ?? 0);
  const finalProfile = applySaltAdditions(input.sourceWaterProfile, Math.max(1, totalWaterL), input.salts);
  // colorCategory — грубая ручка калькулятора вместо полной раскладки засыпи по классам:
  // pale — вся засыпь база; amber/dark добавляют долю crystal (цвет ~80 EBC — «средняя карамель»);
  // dark добавляет ещё и roasted, отражая тёмное пиво на жжёных солодах.
  const pctCrystalCaramel = input.colorCategory === "amber" || input.colorCategory === "dark" ? 10 : 0;
  const pctRoasted = input.colorCategory === "dark" ? 8 : 0;
  const crystalColorEbcAvg = pctCrystalCaramel > 0 ? 80 : null;
  const mashPh = estimateMashPh({
    sourceProfile: input.sourceWaterProfile,
    finalProfile,
    mashWaterLiters: input.mashWaterVolumeL,
    grainKg: input.totalGrainKg ?? 5,
    pctRoasted,
    pctCrystalCaramel,
    crystalColorEbcAvg,
    pctAcidulated: input.acidulatedMaltPercent ?? 0
  });
  const targetMashPh20C = 5.35;
  const acidNeeded = input.acid
    ? solveMashAcidAddition({
      unadjustedMashPh20C: mashPh.predictedMashPh20C,
      targetMashPh20C,
      mashWaterLiters: input.mashWaterVolumeL,
      grainKg: input.totalGrainKg ?? 5,
      alkalinityAsCaCO3: alkalinityAsCaCO3FromHco3(finalProfile.hco3),
      sourceWaterPh: input.sourceWaterProfile.ph ?? null,
      acid: input.acid
    })
    : null;
  const warnings = [
    finalProfile.na > 150 ? "high_sodium" : null,
    finalProfile.so4 > 350 ? "high_sulfate" : null,
    finalProfile.cl > 250 ? "high_chloride" : null,
    ...mashPh.warnings,
    ...(acidNeeded?.warnings ?? [])
  ].filter((warning): warning is string => Boolean(warning));

  return {
    finalProfile,
    targetDelta: {
      ca: roundTo(finalProfile.ca - input.targetWaterProfile.ca, 1),
      mg: roundTo(finalProfile.mg - input.targetWaterProfile.mg, 1),
      na: roundTo(finalProfile.na - input.targetWaterProfile.na, 1),
      cl: roundTo(finalProfile.cl - input.targetWaterProfile.cl, 1),
      so4: roundTo(finalProfile.so4 - input.targetWaterProfile.so4, 1),
      hco3: roundTo(finalProfile.hco3 - input.targetWaterProfile.hco3, 1)
    },
    sulfateChlorideRatio: sulfateChlorideRatio(finalProfile),
    estimatedMashPh: mashPh.predictedMashPh20C,
    postAcidPh: acidNeeded?.predictedMashPh20C ?? null,
    targetPh: targetMashPh20C,
    acidNeededMl: acidNeeded?.mashAcidMl ?? 0,
    warnings
  };
};

export type HopStoragePackaging = "vacuum" | "nitrogen" | "opened" | "loose";
export type HopForm = "pellet" | "leaf";

export const calculateHopFreshness = (input: {
  originalAlphaAcidPercent: number;
  packageDate: Date;
  openedDate?: Date;
  storageTemperatureC: number;
  packaging: HopStoragePackaging;
  form: HopForm;
  hsi?: number;
  targetAmountG?: number;
  today?: Date;
}) => {
  const today = input.today ?? new Date();
  const ageYears = Math.max(0, (today.getTime() - input.packageDate.getTime()) / 31_557_600_000);
  const rawOpenAgeYears = input.openedDate ? Math.max(0, (today.getTime() - input.openedDate.getTime()) / 31_557_600_000) : 0;
  const openAgeYears = Math.min(rawOpenAgeYears, ageYears);
  const hsi = input.hsi ?? (input.form === "pellet" ? 0.25 : 0.35);
  const tempFactor = input.storageTemperatureC <= -10 ? 0.25 : input.storageTemperatureC <= 4 ? 0.55 : input.storageTemperatureC <= 20 ? 1 : 1.8;
  const packagingFactor: Record<HopStoragePackaging, number> = {
    vacuum: 0.65,
    nitrogen: 0.5,
    opened: 1.25,
    loose: 1.6
  };
  const formFactor = input.form === "pellet" ? 0.8 : 1.15;
  // packaging описывает состояние ДО вскрытия; период после вскрытия считаем фактором "opened".
  // Без openedDate openAgeYears=0, и весь срок идёт с packagingFactor[packaging] — как раньше.
  // "opened" (1.25) хуже вакуума/азота, но ЛУЧШЕ россыпи (1.6) — вскрытие россыпи не должно
  // "улучшать" деградацию, поэтому пол по факту после вскрытия — не хуже исходной упаковки.
  const openPeriodFactor = Math.max(packagingFactor[input.packaging], packagingFactor.opened);
  const weightedAge = (ageYears - openAgeYears) * packagingFactor[input.packaging] + openAgeYears * openPeriodFactor;
  const freshnessFactor = Math.exp(-hsi * formFactor * tempFactor * weightedAge);
  const boundedFactor = clamp(freshnessFactor, 0.05, 1);
  const estimatedCurrentAA = input.originalAlphaAcidPercent * boundedFactor;
  // Ниже пола 0.05 модель уже клампится молча — «очень старый» и «за пределом модели»
  // выглядят одинаково без явного предупреждения.
  const warnings = freshnessFactor < 0.05 ? ["hops_too_old"] : [];

  return {
    estimatedCurrentAA: roundTo(estimatedCurrentAA, 2),
    freshnessFactor: roundTo(boundedFactor, 2),
    suggestedAmountForSameIbuG: input.targetAmountG
      ? roundTo(input.targetAmountG * input.originalAlphaAcidPercent / Math.max(0.1, estimatedCurrentAA), 1)
      : 0,
    warnings
  };
};

export type UnitConverterGroup =
  | "gravity"
  | "color"
  | "volume"
  | "weight"
  | "temperature"
  | "pressure"
  | "concentration";

export const convertBrewingUnitGroup = (group: UnitConverterGroup, value: number, from: string): Record<string, number> => {
  if (group === "gravity") {
    const sg = from === "SG"
      ? value
      : from === "points"
        ? sgFromGravityPoints(value)
        : brixToSg(value);
    return {
      SG: roundTo(sg, 4),
      points: gravityPointsFromSg(sg),
      Plato: sgToPlato(sg),
      Brix: sgToBrix(sg)
    };
  }

  if (group === "color") {
    const srm = from === "SRM" ? value : from === "EBC" ? value / 1.97 : (value * 1.3546) - 0.76;
    return {
      SRM: roundTo(srm, 1),
      EBC: roundTo(srm * 1.97, 1),
      Lovibond: roundTo((srm + 0.76) / 1.3546, 1)
    };
  }

  if (group === "volume") {
    const liters = from === "L" ? value : from === "ml" ? value / 1000 : from === "oz" ? value * OZ_TO_ML / 1000 : from === "qt" ? value * QT_TO_L : value * GAL_TO_L;
    return {
      ml: roundTo(liters * 1000, 1),
      L: roundTo(liters, 3),
      oz: roundTo(liters * 1000 / OZ_TO_ML, 2),
      qt: roundTo(liters / QT_TO_L, 2),
      gal: roundTo(liters / GAL_TO_L, 3)
    };
  }

  if (group === "weight") {
    const kg = from === "kg" ? value : from === "g" ? value / 1000 : from === "oz" ? value * 0.028349523125 : value * LB_TO_KG;
    return {
      g: roundTo(kg * 1000, 1),
      kg: roundTo(kg, 3),
      oz: roundTo(kg / 0.028349523125, 2),
      lb: roundTo(kg / LB_TO_KG, 3)
    };
  }

  if (group === "temperature") {
    const c = from === "C" ? value : from === "F" ? (value - 32) * 5 / 9 : value - 273.15;
    return {
      C: roundTo(c, 2),
      F: roundTo((c * 9 / 5) + 32, 2),
      K: roundTo(c + 273.15, 2)
    };
  }

  if (group === "pressure") {
    const pressure = convertPressure(value, from === "bar" ? "bar" : from === "kPa" ? "kpa" : "psi");
    return {
      PSI: pressure.psi,
      bar: pressure.bar,
      kPa: pressure.kpa
    };
  }

  // ppm и mg/L численно равны; g/L отличается в 1000 раз. Учитываем исходную единицу,
  // иначе ввод в g/L трактуется как ppm (5 г/л → 5 ppm вместо 5000).
  const ppm = from === "g/L" ? value * 1000 : value;
  return {
    ppm: roundTo(ppm, 3),
    "mg/L": roundTo(ppm, 3),
    "g/L": roundTo(ppm / 1000, 4)
  };
};

