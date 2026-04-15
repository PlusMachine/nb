import {
  alkalinityAsCaCO3FromHco3,
  applySaltAdditions,
  brewingAcidDefinitions,
  brewingSaltDefinitions,
  estimateMashPh,
  residualAlkalinityAsCaCO3,
  roundTo,
  solveMashAcidAddition,
  solveWaterTargetProfile,
  sulfateChlorideRatio,
  type BrewingAcidId,
  type BrewingSaltId,
  type MashAcidAdditionResult,
  type MashPhEstimateResult,
  type SaltAddition,
  type WaterProfile
} from "@nb/brewing-core";

import { starterEquipmentProfileDefaults, type EquipmentProfileSnapshot } from "../equipment-profiles/contracts";
import { calculateEquipmentVolumePlan, type EquipmentVolumePlan } from "../equipment-profiles/volume-plan";
import type { RecipeWaterPlanMeta } from "./contracts";

export type RecipeWaterPlanFermentableInput = {
  name?: string | null;
  subtype?: string | null;
  weightKg: number;
};

export type RecipeWaterPlanSaltAddition = SaltAddition & {
  label: string;
};

export type RecipeWaterPlanResult = {
  engine: RecipeWaterPlanMeta["engine"];
  phModel: RecipeWaterPlanMeta["phModel"];
  waterVolumes: {
    mashWaterL: number;
    spargeWaterL: number;
    totalWaterL: number;
    source: "equipment_profile" | "starter_profile" | "manual_override";
  };
  volumePlan: EquipmentVolumePlan;
  sourceProfile: WaterProfile;
  targetProfile: WaterProfile | null;
  finalProfile: WaterProfile;
  totalSaltAdditions: RecipeWaterPlanSaltAddition[];
  mashSaltAdditions: RecipeWaterPlanSaltAddition[];
  spargeSaltAdditions: RecipeWaterPlanSaltAddition[];
  sulfateChlorideRatio: number | null;
  residualAlkalinityAsCaCO3: number;
  mashPhEstimate: MashPhEstimateResult | null;
  mashAcidAddition: (MashAcidAdditionResult & { label: string }) | null;
  spargeAcidAddition: (MashAcidAdditionResult & { label: string; spargeAcidMl: number; targetSpargePh20C: number }) | null;
  predictedMashPhAfterAcid20C: number | null;
  warnings: string[];
};

const ionKeys: Array<keyof Omit<WaterProfile, "ph">> = ["ca", "mg", "na", "cl", "so4", "hco3"];

const emptyWaterProfile: WaterProfile = {
  ca: 0,
  mg: 0,
  na: 0,
  cl: 0,
  so4: 0,
  hco3: 0,
  ph: null
};

const quickModeSaltIds: BrewingSaltId[] = ["gypsum", "calcium_chloride", "epsom_salt", "baking_soda"];
const advancedSaltIds = Object.keys(brewingSaltDefinitions) as BrewingSaltId[];
const brewingAcidIds = Object.keys(brewingAcidDefinitions) as BrewingAcidId[];

const isBrewingSaltId = (value: string): value is BrewingSaltId => value in brewingSaltDefinitions;
const isBrewingAcidId = (value: string): value is BrewingAcidId => value in brewingAcidDefinitions;

const hasMeaningfulIonTargets = (profile: WaterProfile | null) => (
  Boolean(profile && ionKeys.some((key) => profile[key] > 0))
);

const normalizeProfile = (profile: RecipeWaterPlanMeta["sourceProfile"]): WaterProfile => ({
  ca: profile?.ca ?? 0,
  mg: profile?.mg ?? 0,
  na: profile?.na ?? 0,
  cl: profile?.cl ?? 0,
  so4: profile?.so4 ?? 0,
  hco3: profile?.hco3 ?? 0,
  ph: profile?.ph ?? null
});

const buildStarterEquipmentSnapshot = (batchVolumeL?: number | null): EquipmentProfileSnapshot => ({
  ...starterEquipmentProfileDefaults,
  targetBatchVolumeL: batchVolumeL && batchVolumeL > 0
    ? batchVolumeL
    : starterEquipmentProfileDefaults.targetBatchVolumeL,
  id: null,
  snapshotAt: "1970-01-01T00:00:00.000Z"
});

const resolveAllowedSalts = (waterPlanMeta: RecipeWaterPlanMeta): BrewingSaltId[] => {
  const explicit = (waterPlanMeta.allowedSalts ?? []).filter(isBrewingSaltId);
  if (explicit.length) {
    return explicit;
  }

  return waterPlanMeta.engine === "advanced_manual" ? advancedSaltIds : quickModeSaltIds;
};

const resolveAcid = (waterPlanMeta: RecipeWaterPlanMeta): BrewingAcidId => {
  if (waterPlanMeta.selectedAcid && isBrewingAcidId(waterPlanMeta.selectedAcid)) {
    return waterPlanMeta.selectedAcid;
  }

  const allowed = (waterPlanMeta.allowedAcids ?? []).find((acid): acid is BrewingAcidId => (
    typeof acid === "string" && isBrewingAcidId(acid)
  ));

  return allowed ?? "lactic_acid";
};

const normalizeManualSaltAdditions = (additions: RecipeWaterPlanMeta["manualSaltAdditions"]): SaltAddition[] => (
  (additions ?? [])
    .filter((addition): addition is SaltAddition => (
      isBrewingSaltId(addition.salt)
      && Number.isFinite(addition.grams)
      && addition.grams > 0
    ))
    .map((addition) => ({ salt: addition.salt, grams: roundTo(addition.grams, 2) }))
);

const toLabeledSaltAdditions = (additions: SaltAddition[]): RecipeWaterPlanSaltAddition[] => (
  additions
    .filter((addition) => addition.grams > 0)
    .map((addition) => ({
      ...addition,
      grams: roundTo(addition.grams, 2),
      label: brewingSaltDefinitions[addition.salt].label
    }))
);

const splitSaltAdditionsByWaterVolume = (
  additions: SaltAddition[],
  mashWaterL: number,
  spargeWaterL: number,
  bucket: "mash" | "sparge"
) => {
  const totalWaterL = mashWaterL + spargeWaterL;
  const ratio = totalWaterL > 0
    ? (bucket === "mash" ? mashWaterL / totalWaterL : spargeWaterL / totalWaterL)
    : (bucket === "mash" ? 1 : 0);

  return toLabeledSaltAdditions(additions.map((addition) => ({
    salt: addition.salt,
    grams: addition.grams * ratio
  })));
};

const classifyFermentable = (fermentable: RecipeWaterPlanFermentableInput) => {
  const haystack = `${fermentable.name ?? ""} ${fermentable.subtype ?? ""}`.toLowerCase();
  if (haystack.includes("acidulated") || haystack.includes("sour")) return "acidulated";
  if (haystack.includes("roast") || haystack.includes("black") || haystack.includes("chocolate")) return "roasted";
  if (haystack.includes("crystal") || haystack.includes("caramel") || haystack.includes("cara")) return "crystal";
  if (haystack.includes("adjunct") || haystack.includes("sugar") || haystack.includes("rice") || haystack.includes("corn")) return "adjunct";
  return "base";
};

const summarizeFermentablesForMashPh = (fermentables: RecipeWaterPlanFermentableInput[]) => {
  const totalKg = fermentables.reduce((sum, fermentable) => sum + Math.max(0, fermentable.weightKg), 0);
  if (totalKg <= 0) {
    return {
      pctNonRoastedSpecialty: 0,
      pctRoasted: 0,
      pctCrystalCaramel: 0,
      pctAcidulated: 0
    };
  }

  let nonRoastedSpecialtyKg = 0;
  let roastedKg = 0;
  let crystalKg = 0;
  let acidulatedKg = 0;

  for (const fermentable of fermentables) {
    const weightKg = Math.max(0, fermentable.weightKg);
    const className = classifyFermentable(fermentable);
    if (className === "roasted") {
      roastedKg += weightKg;
    }
    if (className === "crystal") {
      crystalKg += weightKg;
      nonRoastedSpecialtyKg += weightKg;
    }
    if (className === "acidulated") {
      acidulatedKg += weightKg;
      nonRoastedSpecialtyKg += weightKg;
    }
  }

  return {
    pctNonRoastedSpecialty: roundTo((nonRoastedSpecialtyKg / totalKg) * 100, 2),
    pctRoasted: roundTo((roastedKg / totalKg) * 100, 2),
    pctCrystalCaramel: roundTo((crystalKg / totalKg) * 100, 2),
    pctAcidulated: roundTo((acidulatedKg / totalKg) * 100, 2)
  };
};

const buildWarningsForFinalProfile = (profile: WaterProfile) => {
  const warnings: string[] = [];

  if (profile.ca > 250) warnings.push("calcium_above_practical_range");
  if (profile.mg > 40) warnings.push("magnesium_above_practical_range");
  if (profile.na > 150) warnings.push("sodium_above_practical_range");
  if (profile.cl > 250) warnings.push("chloride_above_practical_range");
  if (profile.so4 > 350) warnings.push("sulfate_above_practical_range");
  if (profile.hco3 > 250) warnings.push("bicarbonate_above_practical_range");

  return warnings;
};

export const buildRecipeWaterPlanResult = (input: {
  waterPlanMeta: RecipeWaterPlanMeta;
  equipmentProfileSnapshot?: EquipmentProfileSnapshot | null;
  fallbackBatchVolumeL?: number | null;
  grainKg: number;
  beerSrm?: number | null;
  fermentables?: RecipeWaterPlanFermentableInput[];
}): RecipeWaterPlanResult => {
  const warnings: string[] = [];
  const grainKg = Math.max(0, input.grainKg);
  const equipmentProfile = input.equipmentProfileSnapshot ?? buildStarterEquipmentSnapshot(input.fallbackBatchVolumeL);
  const volumePlan = calculateEquipmentVolumePlan(equipmentProfile, grainKg);

  if (!input.equipmentProfileSnapshot) {
    warnings.push("equipment_profile_missing_using_starter");
  }

  warnings.push(...volumePlan.warnings);

  const volumeSource = input.waterPlanMeta.mashWaterVolumeL != null
    || input.waterPlanMeta.spargeWaterVolumeL != null
    || input.waterPlanMeta.totalWaterVolumeL != null
    ? "manual_override"
    : input.equipmentProfileSnapshot ? "equipment_profile" : "starter_profile";
  const mashWaterL = roundTo(input.waterPlanMeta.mashWaterVolumeL ?? volumePlan.mashWaterL, 2);
  const spargeWaterL = roundTo(input.waterPlanMeta.spargeWaterVolumeL ?? volumePlan.spargeWaterL, 2);
  const totalWaterL = roundTo(input.waterPlanMeta.totalWaterVolumeL ?? (mashWaterL + spargeWaterL), 2);
  const sourceProfile = normalizeProfile(input.waterPlanMeta.sourceProfile ?? emptyWaterProfile);
  const targetProfile = input.waterPlanMeta.targetProfile
    ? normalizeProfile(input.waterPlanMeta.targetProfile)
    : null;

  if (!hasMeaningfulIonTargets(sourceProfile)) {
    warnings.push("source_profile_missing_or_zero");
  }

  if (!hasMeaningfulIonTargets(targetProfile)) {
    warnings.push("target_profile_missing_or_zero");
  }

  const manualSaltAdditions = normalizeManualSaltAdditions(input.waterPlanMeta.manualSaltAdditions);
  const useManualAdditions = input.waterPlanMeta.engine === "advanced_manual" && manualSaltAdditions.length > 0;
  const solverResult = !useManualAdditions && targetProfile && hasMeaningfulIonTargets(targetProfile) && totalWaterL > 0
    ? solveWaterTargetProfile({
      sourceProfile,
      targetProfile,
      waterLiters: totalWaterL,
      allowedSalts: resolveAllowedSalts(input.waterPlanMeta)
    })
    : null;
  const saltAdditions = useManualAdditions ? manualSaltAdditions : solverResult?.additions ?? [];
  const finalProfile = totalWaterL > 0
    ? applySaltAdditions(sourceProfile, totalWaterL, saltAdditions)
    : sourceProfile;
  const mashPhEstimate = input.waterPlanMeta.engine === "profile_only" || grainKg <= 0 || mashWaterL <= 0
    ? null
    : estimateMashPh({
      sourceProfile,
      finalProfile,
      mashWaterLiters: mashWaterL,
      grainKg,
      beerSrm: input.beerSrm ?? null,
      ...summarizeFermentablesForMashPh(input.fermentables ?? []),
      calibrationOffset: input.waterPlanMeta.calibrationOffset ?? null,
      model: input.waterPlanMeta.phModel
    });

  if (input.waterPlanMeta.engine !== "profile_only" && grainKg <= 0) {
    warnings.push("grain_bill_missing_for_mash_ph");
  }

  const acidId = resolveAcid(input.waterPlanMeta);
  const targetMashPh = input.waterPlanMeta.targetMashPh ?? 5.35;
  const mashAcidAddition = mashPhEstimate
    ? solveMashAcidAddition({
      unadjustedMashPh20C: mashPhEstimate.predictedMashPh20C,
      targetMashPh20C: targetMashPh,
      mashWaterLiters: mashWaterL,
      grainKg,
      alkalinityAsCaCO3: alkalinityAsCaCO3FromHco3(finalProfile.hco3),
      acid: acidId,
      concentrationPct: input.waterPlanMeta.acidConcentrationPct ?? null
    })
    : null;
  const spargeSourcePh = input.waterPlanMeta.spargeSourcePh
    ?? sourceProfile.ph
    ?? 7;
  const targetSpargePh = input.waterPlanMeta.targetSpargePh ?? 5.7;
  const spargeAcidAddition = input.waterPlanMeta.spargeAcidificationEnabled && spargeWaterL > 0
    ? solveMashAcidAddition({
      unadjustedMashPh20C: spargeSourcePh,
      targetMashPh20C: targetSpargePh,
      mashWaterLiters: spargeWaterL,
      grainKg: 0,
      alkalinityAsCaCO3: input.waterPlanMeta.targetSpargeAlkalinity
        ?? alkalinityAsCaCO3FromHco3(sourceProfile.hco3),
      acid: acidId,
      concentrationPct: input.waterPlanMeta.acidConcentrationPct ?? null
    })
    : null;

  warnings.push(
    ...buildWarningsForFinalProfile(finalProfile),
    ...(mashPhEstimate?.warnings ?? []),
    ...(mashAcidAddition?.warnings ?? []),
    ...(spargeAcidAddition?.warnings ?? [])
  );

  return {
    engine: input.waterPlanMeta.engine,
    phModel: input.waterPlanMeta.phModel,
    waterVolumes: {
      mashWaterL,
      spargeWaterL,
      totalWaterL,
      source: volumeSource
    },
    volumePlan,
    sourceProfile,
    targetProfile,
    finalProfile,
    totalSaltAdditions: toLabeledSaltAdditions(saltAdditions),
    mashSaltAdditions: splitSaltAdditionsByWaterVolume(saltAdditions, mashWaterL, spargeWaterL, "mash"),
    spargeSaltAdditions: splitSaltAdditionsByWaterVolume(saltAdditions, mashWaterL, spargeWaterL, "sparge"),
    sulfateChlorideRatio: sulfateChlorideRatio(finalProfile),
    residualAlkalinityAsCaCO3: residualAlkalinityAsCaCO3(finalProfile),
    mashPhEstimate,
    mashAcidAddition: mashAcidAddition
      ? { ...mashAcidAddition, label: brewingAcidDefinitions[mashAcidAddition.acid].label }
      : null,
    spargeAcidAddition: spargeAcidAddition
      ? {
        ...spargeAcidAddition,
        label: brewingAcidDefinitions[spargeAcidAddition.acid].label,
        spargeAcidMl: spargeAcidAddition.mashAcidMl,
        targetSpargePh20C: targetSpargePh
      }
      : null,
    predictedMashPhAfterAcid20C: mashAcidAddition?.predictedMashPh20C ?? mashPhEstimate?.predictedMashPh20C ?? null,
    warnings: [...new Set(warnings)]
  };
};
