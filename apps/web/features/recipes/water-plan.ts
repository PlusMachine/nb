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
  type WaterProfile,
} from "@nb/brewing-core";

import type {
  RecipeWaterManualSaltAdditionTarget,
  RecipeWaterPlanMeta,
} from "./contracts";

export type RecipeWaterPlanFermentableInput = {
  name?: string | null;
  subtype?: string | null;
  weightKg: number;
};

export type RecipeWaterPlanSaltAddition = SaltAddition & {
  target: RecipeWaterManualSaltAdditionTarget;
  label: string;
  formula: string;
};

export type RecipeWaterPlanResult = {
  engine: RecipeWaterPlanMeta["engine"];
  phModel: RecipeWaterPlanMeta["phModel"];
  waterVolumes: {
    mashWaterL: number;
    spargeWaterL: number;
    totalWaterL: number;
    suggestedMashWaterL: number | null;
    suggestedSpargeWaterL: number | null;
    source: "batch_size" | "equipment_profile" | "manual_split";
  };
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
  spargeAcidAddition:
    | (MashAcidAdditionResult & {
        label: string;
        spargeAcidMl: number;
        targetSpargePh20C: number;
      })
    | null;
  predictedMashPhAfterAcid20C: number | null;
  warnings: string[];
};

const ionKeys: Array<keyof Omit<WaterProfile, "ph">> = [
  "ca",
  "mg",
  "na",
  "cl",
  "so4",
  "hco3",
];

const emptyWaterProfile: WaterProfile = {
  ca: 0,
  mg: 0,
  na: 0,
  cl: 0,
  so4: 0,
  hco3: 0,
  ph: null,
};

const quickModeSaltIds: BrewingSaltId[] = [
  "gypsum",
  "calcium_chloride",
  "epsom_salt",
];
const advancedSaltIds = Object.keys(brewingSaltDefinitions) as BrewingSaltId[];
const brewingAcidIds = Object.keys(brewingAcidDefinitions) as BrewingAcidId[];
const manualSaltAdditionTargets = new Set<RecipeWaterManualSaltAdditionTarget>([
  "all",
  "mash",
  "sparge",
]);

type ScopedSaltAddition = SaltAddition & {
  target: RecipeWaterManualSaltAdditionTarget;
};

const isBrewingSaltId = (value: string): value is BrewingSaltId =>
  value in brewingSaltDefinitions;
const isBrewingAcidId = (value: string): value is BrewingAcidId =>
  value in brewingAcidDefinitions;

export const recipeWaterSaltPresentation: Record<
  BrewingSaltId,
  { label: string; formula: string }
> = {
  gypsum: { label: "Гипс", formula: "CaSO4" },
  calcium_chloride: {
    label: "Хлорид кальция",
    formula: "CaCl2",
  },
  epsom_salt: { label: "Эпсомская соль", formula: "MgSO4" },
  baking_soda: { label: "Сода пищевая", formula: "NaHCO3" },
  table_salt: { label: "Соль поваренная (не йодированная)", formula: "NaCl" },
  chalk: { label: "Мел (карбонат кальция)", formula: "CaCO3" },
  slaked_lime: {
    label: "Гашёная известь (гидроксид кальция)",
    formula: "Ca(OH)2",
  },
};

export const recipeWaterAcidPresentation: Record<
  BrewingAcidId,
  { label: string }
> = {
  lactic_acid: { label: "Молочная кислота" },
  phosphoric_acid: { label: "Фосфорная кислота" },
};

export const isRecipeWaterMashPhEnabled = (
  waterPlanMeta: RecipeWaterPlanMeta,
) =>
  waterPlanMeta.engine !== "profile_only" && waterPlanMeta.targetMashPh != null;

export const resolveRecipeWaterEffectiveEngine = (
  waterPlanMeta: RecipeWaterPlanMeta,
): RecipeWaterPlanMeta["engine"] => {
  if (waterPlanMeta.engine === "advanced_manual") {
    return "advanced_manual";
  }

  return isRecipeWaterMashPhEnabled(waterPlanMeta)
    ? "balanced_default"
    : "profile_only";
};

const hasMeaningfulIonTargets = (profile: WaterProfile | null) =>
  Boolean(profile && ionKeys.some((key) => profile[key] > 0));

const isZeroMineralSourceProfileAllowed = (
  waterPlanMeta: RecipeWaterPlanMeta,
) =>
  waterPlanMeta.sourceProfileMode === "ro_distilled" ||
  waterPlanMeta.sourceProfileMode === "distilled" ||
  (Boolean(waterPlanMeta.sourceProfile) &&
    (waterPlanMeta.sourceProfilePresetId === "ro_distilled" ||
      waterPlanMeta.sourceProfilePresetId === "distilled_water"));

const normalizeProfile = (
  profile: RecipeWaterPlanMeta["sourceProfile"],
): WaterProfile => ({
  ca: profile?.ca ?? 0,
  mg: profile?.mg ?? 0,
  na: profile?.na ?? 0,
  cl: profile?.cl ?? 0,
  so4: profile?.so4 ?? 0,
  hco3: profile?.hco3 ?? 0,
  ph: profile?.ph ?? null,
});

const resolveAllowedSalts = (
  waterPlanMeta: RecipeWaterPlanMeta,
): BrewingSaltId[] => {
  const explicit = (waterPlanMeta.allowedSalts ?? []).filter(isBrewingSaltId);
  if (explicit.length) {
    return explicit;
  }

  return resolveRecipeWaterEffectiveEngine(waterPlanMeta) === "advanced_manual"
    ? advancedSaltIds
    : quickModeSaltIds;
};

const resolveAcid = (waterPlanMeta: RecipeWaterPlanMeta): BrewingAcidId => {
  if (
    waterPlanMeta.selectedAcid &&
    isBrewingAcidId(waterPlanMeta.selectedAcid)
  ) {
    return waterPlanMeta.selectedAcid;
  }

  const allowed = (waterPlanMeta.allowedAcids ?? []).find(
    (acid): acid is BrewingAcidId =>
      typeof acid === "string" && isBrewingAcidId(acid),
  );

  return allowed ?? "lactic_acid";
};

const normalizeManualSaltAdditions = (
  additions: RecipeWaterPlanMeta["manualSaltAdditions"],
): ScopedSaltAddition[] =>
  (additions ?? [])
    .filter(
      (
        addition,
      ): addition is RecipeWaterPlanMeta["manualSaltAdditions"][number] =>
        isBrewingSaltId(addition.salt) &&
        Number.isFinite(addition.grams) &&
        addition.grams > 0,
    )
    .map((addition) => ({
      salt: addition.salt as BrewingSaltId,
      grams: roundTo(addition.grams, 2),
      target:
        addition.target && manualSaltAdditionTargets.has(addition.target)
          ? addition.target
          : "all",
    }));

const toLabeledSaltAdditions = (
  additions: ScopedSaltAddition[],
): RecipeWaterPlanSaltAddition[] =>
  additions
    .filter((addition) => addition.grams > 0)
    .map((addition) => ({
      ...addition,
      grams: roundTo(addition.grams, 2),
      label: recipeWaterSaltPresentation[addition.salt].label,
      formula: recipeWaterSaltPresentation[addition.salt].formula,
    }));

const scopeSaltAdditionsToWaterBucket = (
  additions: ScopedSaltAddition[],
  mashWaterL: number,
  spargeWaterL: number,
  bucket: "mash" | "sparge",
) => {
  const totalWaterL = mashWaterL + spargeWaterL;
  const ratio =
    totalWaterL > 0
      ? bucket === "mash"
        ? mashWaterL / totalWaterL
        : spargeWaterL / totalWaterL
      : bucket === "mash"
        ? 1
        : 0;

  return additions
    .map((addition) => {
      const grams =
        addition.target === "all"
          ? addition.grams * ratio
          : addition.target === bucket
            ? addition.grams
            : 0;

      return {
        ...addition,
        grams,
      };
    })
    .filter((addition) => addition.grams > 0);
};

const splitSaltAdditionsByWaterVolume = (
  additions: ScopedSaltAddition[],
  mashWaterL: number,
  spargeWaterL: number,
  bucket: "mash" | "sparge",
) =>
  toLabeledSaltAdditions(
    scopeSaltAdditionsToWaterBucket(
      additions,
      mashWaterL,
      spargeWaterL,
      bucket,
    ),
  );

const scopeSolverSaltAdditions = (
  additions: SaltAddition[],
): ScopedSaltAddition[] =>
  additions.map((addition) => ({
    ...addition,
    target: "all",
  }));

const classifyFermentable = (fermentable: RecipeWaterPlanFermentableInput) => {
  const haystack =
    `${fermentable.name ?? ""} ${fermentable.subtype ?? ""}`.toLowerCase();
  if (haystack.includes("acidulated") || haystack.includes("sour"))
    return "acidulated";
  if (
    haystack.includes("roast") ||
    haystack.includes("black") ||
    haystack.includes("chocolate")
  )
    return "roasted";
  if (
    haystack.includes("crystal") ||
    haystack.includes("caramel") ||
    haystack.includes("cara")
  )
    return "crystal";
  if (
    haystack.includes("adjunct") ||
    haystack.includes("sugar") ||
    haystack.includes("rice") ||
    haystack.includes("corn")
  )
    return "adjunct";
  return "base";
};

const summarizeFermentablesForMashPh = (
  fermentables: RecipeWaterPlanFermentableInput[],
) => {
  const totalKg = fermentables.reduce(
    (sum, fermentable) => sum + Math.max(0, fermentable.weightKg),
    0,
  );
  if (totalKg <= 0) {
    return {
      pctNonRoastedSpecialty: 0,
      pctRoasted: 0,
      pctCrystalCaramel: 0,
      pctAcidulated: 0,
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
    pctAcidulated: roundTo((acidulatedKg / totalKg) * 100, 2),
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
  fallbackBatchVolumeL?: number | null;
  equipmentVolumePlan?: {
    totalWaterL: number;
    mashWaterL: number;
    spargeWaterL: number;
  } | null;
  grainKg: number;
  beerSrm?: number | null;
  fermentables?: RecipeWaterPlanFermentableInput[];
}): RecipeWaterPlanResult => {
  const warnings: string[] = [];
  const grainKg = Math.max(0, input.grainKg);
  const recipeBatchVolumeL =
    input.fallbackBatchVolumeL != null
      ? Math.max(0, input.fallbackBatchVolumeL)
      : null;
  const equipmentTotalWaterL =
    input.equipmentVolumePlan && Number.isFinite(input.equipmentVolumePlan.totalWaterL)
      ? Math.max(0, input.equipmentVolumePlan.totalWaterL)
      : null;
  const suggestedMashWaterL =
    input.equipmentVolumePlan && Number.isFinite(input.equipmentVolumePlan.mashWaterL)
      ? roundTo(Math.max(0, input.equipmentVolumePlan.mashWaterL), 2)
      : null;
  const suggestedSpargeWaterL =
    input.equipmentVolumePlan && Number.isFinite(input.equipmentVolumePlan.spargeWaterL)
      ? roundTo(Math.max(0, input.equipmentVolumePlan.spargeWaterL), 2)
      : null;
  const automaticTotalWaterL = roundTo(
    Math.max(
      0,
      input.waterPlanMeta.totalWaterVolumeL ??
        equipmentTotalWaterL ??
        recipeBatchVolumeL ??
        0,
    ),
    2,
  );
  const hasManualSplit =
    input.waterPlanMeta.mashWaterVolumeL != null ||
    input.waterPlanMeta.spargeWaterVolumeL != null;
  const mashWaterL = roundTo(
    hasManualSplit
      ? Math.max(
          0,
          input.waterPlanMeta.mashWaterVolumeL ??
            automaticTotalWaterL - (input.waterPlanMeta.spargeWaterVolumeL ?? 0),
        )
      : automaticTotalWaterL,
    2,
  );
  const spargeWaterL = roundTo(
    hasManualSplit
      ? Math.max(
          0,
          input.waterPlanMeta.spargeWaterVolumeL ?? automaticTotalWaterL - mashWaterL,
        )
      : 0,
    2,
  );
  const splitTotalWaterL = roundTo(mashWaterL + spargeWaterL, 2);
  const totalWaterL = hasManualSplit ? splitTotalWaterL : automaticTotalWaterL;

  if (
    hasManualSplit &&
    recipeBatchVolumeL != null &&
    splitTotalWaterL + 0.05 < recipeBatchVolumeL
  ) {
    warnings.push("water_split_below_batch_volume");
  }

  const volumeSource = hasManualSplit
    ? "manual_split"
    : equipmentTotalWaterL != null
      ? "equipment_profile"
      : "batch_size";
  const sourceProfile = normalizeProfile(
    input.waterPlanMeta.sourceProfile ?? emptyWaterProfile,
  );
  const targetProfile = input.waterPlanMeta.targetProfile
    ? normalizeProfile(input.waterPlanMeta.targetProfile)
    : null;

  if (
    !hasMeaningfulIonTargets(sourceProfile) &&
    !isZeroMineralSourceProfileAllowed(input.waterPlanMeta)
  ) {
    warnings.push("source_profile_missing_or_zero");
  }

  if (!hasMeaningfulIonTargets(targetProfile)) {
    warnings.push("target_profile_missing_or_zero");
  }

  const effectiveEngine = resolveRecipeWaterEffectiveEngine(
    input.waterPlanMeta,
  );
  const mashPhEnabled = isRecipeWaterMashPhEnabled(input.waterPlanMeta);
  const manualSaltAdditions = normalizeManualSaltAdditions(
    input.waterPlanMeta.manualSaltAdditions,
  );
  const useManualAdditions = effectiveEngine === "advanced_manual";
  const solverResult =
    !useManualAdditions &&
    targetProfile &&
    hasMeaningfulIonTargets(targetProfile) &&
    totalWaterL > 0
      ? solveWaterTargetProfile({
          sourceProfile,
          targetProfile,
          waterLiters: totalWaterL,
          allowedSalts: resolveAllowedSalts(input.waterPlanMeta),
        })
      : null;
  const saltAdditions: ScopedSaltAddition[] = useManualAdditions
    ? manualSaltAdditions
    : scopeSolverSaltAdditions(solverResult?.additions ?? []);
  const finalProfile =
    totalWaterL > 0
      ? applySaltAdditions(sourceProfile, totalWaterL, saltAdditions)
      : sourceProfile;
  const mashProfileForPh =
    mashWaterL > 0
      ? applySaltAdditions(
          sourceProfile,
          mashWaterL,
          scopeSaltAdditionsToWaterBucket(
            saltAdditions,
            mashWaterL,
            spargeWaterL,
            "mash",
          ),
        )
      : finalProfile;
  const mashPhEstimate =
    !mashPhEnabled || grainKg <= 0 || mashWaterL <= 0
      ? null
      : estimateMashPh({
          sourceProfile,
          finalProfile: mashProfileForPh,
          mashWaterLiters: mashWaterL,
          grainKg,
          beerSrm: input.beerSrm ?? null,
          ...summarizeFermentablesForMashPh(input.fermentables ?? []),
          calibrationOffset: input.waterPlanMeta.calibrationOffset ?? null,
          model: input.waterPlanMeta.phModel,
        });

  if (mashPhEnabled && grainKg <= 0) {
    warnings.push("grain_bill_missing_for_mash_ph");
  }

  const acidId = resolveAcid(input.waterPlanMeta);
  const targetMashPh = input.waterPlanMeta.targetMashPh;
  const mashAcidAddition =
    mashPhEstimate && targetMashPh != null
      ? solveMashAcidAddition({
          unadjustedMashPh20C: mashPhEstimate.predictedMashPh20C,
          targetMashPh20C: targetMashPh,
          mashWaterLiters: mashWaterL,
          grainKg,
          alkalinityAsCaCO3: alkalinityAsCaCO3FromHco3(finalProfile.hco3),
          acid: acidId,
          concentrationPct: input.waterPlanMeta.acidConcentrationPct ?? null,
        })
      : null;
  const spargeSourcePh =
    input.waterPlanMeta.spargeSourcePh ?? sourceProfile.ph ?? 7;
  const targetSpargePh = input.waterPlanMeta.targetSpargePh ?? 5.7;
  const spargeAcidAddition =
    input.waterPlanMeta.spargeAcidificationEnabled && spargeWaterL > 0
      ? solveMashAcidAddition({
          unadjustedMashPh20C: spargeSourcePh,
          targetMashPh20C: targetSpargePh,
          mashWaterLiters: spargeWaterL,
          grainKg: 0,
          alkalinityAsCaCO3:
            input.waterPlanMeta.targetSpargeAlkalinity ??
            alkalinityAsCaCO3FromHco3(sourceProfile.hco3),
          acid: acidId,
          concentrationPct: input.waterPlanMeta.acidConcentrationPct ?? null,
        })
      : null;

  warnings.push(
    ...buildWarningsForFinalProfile(finalProfile),
    ...(mashPhEstimate?.warnings ?? []),
    ...(mashAcidAddition?.warnings ?? []),
    ...(spargeAcidAddition?.warnings ?? []),
  );

  return {
    engine: effectiveEngine,
    phModel: input.waterPlanMeta.phModel,
    waterVolumes: {
      mashWaterL,
      spargeWaterL,
      totalWaterL,
      suggestedMashWaterL,
      suggestedSpargeWaterL,
      source: volumeSource,
    },
    sourceProfile,
    targetProfile,
    finalProfile,
    totalSaltAdditions: toLabeledSaltAdditions(saltAdditions),
    mashSaltAdditions: splitSaltAdditionsByWaterVolume(
      saltAdditions,
      mashWaterL,
      spargeWaterL,
      "mash",
    ),
    spargeSaltAdditions: splitSaltAdditionsByWaterVolume(
      saltAdditions,
      mashWaterL,
      spargeWaterL,
      "sparge",
    ),
    sulfateChlorideRatio: sulfateChlorideRatio(finalProfile),
    residualAlkalinityAsCaCO3: residualAlkalinityAsCaCO3(finalProfile),
    mashPhEstimate,
    mashAcidAddition: mashAcidAddition
      ? {
          ...mashAcidAddition,
          label: recipeWaterAcidPresentation[mashAcidAddition.acid].label,
        }
      : null,
    spargeAcidAddition: spargeAcidAddition
      ? {
          ...spargeAcidAddition,
          label: recipeWaterAcidPresentation[spargeAcidAddition.acid].label,
          spargeAcidMl: spargeAcidAddition.mashAcidMl,
          targetSpargePh20C: targetSpargePh,
        }
      : null,
    predictedMashPhAfterAcid20C:
      mashAcidAddition?.predictedMashPh20C ??
      mashPhEstimate?.predictedMashPh20C ??
      null,
    warnings: [...new Set(warnings)],
  };
};
