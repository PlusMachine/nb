import { platoToSg, roundTo, sgToPlato } from "../units";
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
  return roundTo(caloriesPer12Oz * (input.servingSizeMl / 354.882), 0);
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

export const calculateExtractAdditionGrams = (input: {
  currentVolumeL: number;
  currentGravity: number;
  targetGravity: number;
  targetVolumeL?: number;
  additionType: Extract<GravityAdditionType, "dme" | "sugar">;
}) => {
  const targetVolumeL = input.targetVolumeL ?? input.currentVolumeL;
  const currentPointLiters = input.currentVolumeL * gravityPointsFromSg(input.currentGravity);
  const targetPointLiters = targetVolumeL * gravityPointsFromSg(input.targetGravity);
  const pointLitersNeeded = Math.max(0, targetPointLiters - currentPointLiters);
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
  const currentPoints = gravityPointsFromSg(input.currentGravity);
  const currentPointLiters = input.currentVolumeL * currentPoints;
  const targetPoints = input.targetGravity ? gravityPointsFromSg(input.targetGravity) : currentPoints;
  const targetVolumeFromGravity = targetPoints > 0 ? currentPointLiters / targetPoints : input.currentVolumeL;
  const requestedTargetVolume = input.targetVolumeL && input.targetVolumeL > 0 ? input.targetVolumeL : targetVolumeFromGravity;
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
  const resultingVolume = input.mode === "dilute_to_gravity"
    ? input.currentVolumeL + waterToAdd
    : input.mode === "boil_to_gravity"
      ? input.currentVolumeL - volumeToBoilOff
      : input.mode === "gravity_after_water" || input.mode === "gravity_after_boiloff" || input.mode === "extra_boil_time"
        ? requestedTargetVolume
        : input.currentVolumeL;
  const resultingGravity = resultingVolume > 0
    ? sgFromGravityPoints(currentPointLiters / resultingVolume)
    : input.currentGravity;
  const extraBoilTimeMinutes = input.boilOffRateLPerHour && input.boilOffRateLPerHour > 0
    ? roundTo((volumeToBoilOff / input.boilOffRateLPerHour) * 60, 0)
    : 0;
  const additionType = input.additionType === "sugar" ? "sugar" : "dme";
  const extractGrams = input.mode === "add_extract_to_gravity" && input.targetGravity
    ? calculateExtractAdditionGrams({
      currentVolumeL: input.currentVolumeL,
      currentGravity: input.currentGravity,
      targetGravity: input.targetGravity,
      targetVolumeL: input.targetVolumeL,
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
    sugarToAddG: additionType === "sugar" ? extractGrams : 0
  };
};

export type RefractometerMode = "pre_fermentation" | "post_fermentation";
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

  const originalBrix = input.originalBrix ?? (input.originalGravity ? sgToBrix(input.originalGravity) : correctedBrix);
  const ogBrix = originalBrix / wcf;
  const current = correctedBrix;
  const correctedSg = input.formula === "terrill"
    ? 1.001843
      - 0.002318474 * ogBrix
      - 0.000007775 * ogBrix ** 2
      - 0.000000034 * ogBrix ** 3
      + 0.00574 * current
      + 0.00003344 * current ** 2
      + 0.000000086 * current ** 3
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
  const deltaVolumes = Math.max(0, input.targetCo2Volumes - residualCo2);
  const factor = primingFactorsGPerLPerVolume[input.sugarType ?? "dextrose"];
  const totalSugarGrams = input.beerVolumeL * deltaVolumes * factor;

  return {
    totalSugarGrams: roundTo(totalSugarGrams, 1),
    gramsPerLiter: roundTo(totalSugarGrams / input.beerVolumeL, 2),
    gramsPerBottle: input.bottleSizeL && input.bottleSizeL > 0
      ? roundTo((totalSugarGrams / input.beerVolumeL) * input.bottleSizeL, 2)
      : 0,
    residualCo2
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
  const tempF = (input.beerTemperatureC * 9) / 5 + 32;
  const volumes = input.targetCo2Volumes;
  const pressurePsi = -16.6999
    - 0.0101059 * tempF
    + 0.00116512 * tempF ** 2
    + 0.173354 * tempF * volumes
    + 4.24267 * volumes
    - 0.0684226 * volumes ** 2;
  const converted = convertPressure(Math.max(0, pressurePsi), "psi");

  return {
    ...converted,
    suggestedPressurePsi: converted.psi,
    warnings: input.mode === "spunding" && converted.psi > 30 ? ["spunding_pressure_high"] : []
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
  const shrinkage = (input.coolingShrinkagePercent ?? 4) / 100;
  const postBoilCoolVolumeL = input.targetFermenterVolumeL + trubChillerLossL;
  const postBoilHotVolumeL = postBoilCoolVolumeL / Math.max(0.01, 1 - shrinkage);
  const preBoilVolumeL = postBoilHotVolumeL + input.boilOffRateLPerHour * (input.boilTimeMinutes / 60);
  const absorptionL = input.grainWeightKg * input.grainAbsorptionLPerKg;
  const totalWaterNeededL = preBoilVolumeL + absorptionL + kettleLossL;
  const mashWaterL = input.methodPreset === "BIAB" || input.methodPreset === "extract"
    ? totalWaterNeededL
    : Math.min(totalWaterNeededL, input.grainWeightKg * input.mashThicknessLPerKg);
  const spargeWaterL = Math.max(0, totalWaterNeededL - mashWaterL);

  return {
    totalWaterNeededL: roundTo(totalWaterNeededL, 2),
    mashWaterL: roundTo(mashWaterL, 2),
    spargeWaterL: roundTo(spargeWaterL, 2),
    preBoilVolumeL: roundTo(preBoilVolumeL, 2),
    postBoilHotVolumeL: roundTo(postBoilHotVolumeL, 2),
    postBoilCoolVolumeL: roundTo(postBoilCoolVolumeL, 2),
    intoFermenterVolumeL: roundTo(input.targetFermenterVolumeL, 2)
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

export const calculateSpeiseKrausen = (input: {
  beerVolumeL: number;
  targetCo2: number;
  residualCo2: number;
  speiseGravity: number;
  temperatureC: number;
  mode?: SpeiseMode;
}) => {
  const deltaVolumes = Math.max(0, input.targetCo2 - input.residualCo2);
  const co2GramsNeeded = input.beerVolumeL * deltaVolumes * 1.96;
  const extractKgPerL = (sgToPlato(input.speiseGravity, 3) / 100) * input.speiseGravity;
  const fermentability = input.mode === "krausen" ? 0.75 : 0.82;
  const co2YieldPerKgExtract = 490 * fermentability;
  const speiseVolumeToAddL = extractKgPerL > 0 ? co2GramsNeeded / co2YieldPerKgExtract / extractKgPerL : 0;

  return {
    speiseVolumeToAddL: roundTo(speiseVolumeToAddL, 2),
    finalVolumeL: roundTo(input.beerVolumeL + speiseVolumeToAddL, 2),
    approximateAbvChange: roundTo((speiseVolumeToAddL / Math.max(1, input.beerVolumeL)) * 0.15, 2)
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
  const starterYieldBillionPerLiter = input.starterMode === "stirPlate" ? 160 : input.starterMode === "simple" ? 100 : 0;
  const starterVolumeL = starterYieldBillionPerLiter > 0 ? deficitBillion / starterYieldBillionPerLiter : 0;

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
    viabilityPercent: viability
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
  const beerSrm = input.colorCategory === "dark" ? 28 : input.colorCategory === "amber" ? 12 : 5;
  const mashPh = estimateMashPh({
    sourceProfile: input.sourceWaterProfile,
    finalProfile,
    mashWaterLiters: input.mashWaterVolumeL,
    grainKg: input.totalGrainKg ?? 5,
    beerSrm,
    pctRoasted: input.colorCategory === "dark" ? 8 : 0,
    pctCrystalCaramel: input.colorCategory === "amber" ? 8 : 2,
    pctAcidulated: input.acidulatedMaltPercent ?? 0
  });
  const acidNeeded = input.acid
    ? solveMashAcidAddition({
      unadjustedMashPh20C: mashPh.predictedMashPh20C,
      targetMashPh20C: 5.35,
      mashWaterLiters: input.mashWaterVolumeL,
      grainKg: input.totalGrainKg ?? 5,
      alkalinityAsCaCO3: alkalinityAsCaCO3FromHco3(finalProfile.hco3),
      acid: input.acid
    })
    : null;
  const warnings = [
    finalProfile.na > 150 ? "high_sodium" : null,
    finalProfile.so4 > 350 ? "high_sulfate" : null,
    finalProfile.cl > 250 ? "high_chloride" : null,
    ...mashPh.warnings
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
  const openAgeYears = input.openedDate ? Math.max(0, (today.getTime() - input.openedDate.getTime()) / 31_557_600_000) : 0;
  const hsi = input.hsi ?? (input.form === "pellet" ? 0.25 : 0.35);
  const tempFactor = input.storageTemperatureC <= -10 ? 0.25 : input.storageTemperatureC <= 4 ? 0.55 : input.storageTemperatureC <= 20 ? 1 : 1.8;
  const packagingFactor: Record<HopStoragePackaging, number> = {
    vacuum: 0.65,
    nitrogen: 0.5,
    opened: 1.25,
    loose: 1.6
  };
  const formFactor = input.form === "pellet" ? 0.8 : 1.15;
  const freshnessFactor = Math.exp(-hsi * ((ageYears * tempFactor * packagingFactor[input.packaging] * formFactor) + openAgeYears));
  const boundedFactor = clamp(freshnessFactor, 0.05, 1);
  const estimatedCurrentAA = input.originalAlphaAcidPercent * boundedFactor;

  return {
    estimatedCurrentAA: roundTo(estimatedCurrentAA, 2),
    freshnessFactor: roundTo(boundedFactor, 2),
    suggestedAmountForSameIbuG: input.targetAmountG
      ? roundTo(input.targetAmountG * input.originalAlphaAcidPercent / Math.max(0.1, estimatedCurrentAA), 1)
      : 0
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

  return {
    ppm: roundTo(value, 3),
    "mg/L": roundTo(value, 3),
    "g/L": roundTo(value / 1000, 4)
  };
};

