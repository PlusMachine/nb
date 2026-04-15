import { roundTo } from "../units";

export const waterEngineModes = ["profile_only", "balanced_default", "advanced_manual"] as const;
export const mashPhModels = ["kolbach_ra_quick", "hybrid_mash_ph_v1"] as const;

export type WaterEngineMode = (typeof waterEngineModes)[number];
export type MashPhModel = (typeof mashPhModels)[number];
export type BrewingSaltId =
  | "gypsum"
  | "calcium_chloride"
  | "epsom_salt"
  | "table_salt"
  | "baking_soda"
  | "chalk"
  | "slaked_lime";
export type BrewingAcidId = "lactic_acid" | "phosphoric_acid";

export interface WaterProfile {
  ca: number;
  mg: number;
  na: number;
  cl: number;
  so4: number;
  hco3: number;
  ph?: number | null;
}

export interface SaltDefinition {
  id: BrewingSaltId;
  label: string;
  formula: string;
  ionMassFractions: Partial<Record<keyof Omit<WaterProfile, "ph">, number>>;
  advancedOnly?: boolean;
  lowSolubility?: boolean;
}

export interface SaltAddition {
  salt: BrewingSaltId;
  grams: number;
}

export interface AcidDefinition {
  id: BrewingAcidId;
  label: string;
  molecularWeightGPerMol: number;
  densityGPerMl: number;
  effectiveProtons: number;
}

export interface WaterTargetSolverInput {
  sourceProfile: WaterProfile;
  targetProfile: WaterProfile;
  waterLiters: number;
  allowedSalts?: BrewingSaltId[];
  maxGramsPerSalt?: number;
}

export interface WaterTargetSolverResult {
  additions: SaltAddition[];
  finalProfile: WaterProfile;
  score: number;
}

export interface MashPhEstimateInput {
  sourceProfile: WaterProfile;
  finalProfile?: WaterProfile | null;
  mashWaterLiters: number;
  grainKg: number;
  beerSrm?: number | null;
  pctNonRoastedSpecialty?: number | null;
  pctRoasted?: number | null;
  pctCrystalCaramel?: number | null;
  pctAcidulated?: number | null;
  baseMaltDiPh?: number | null;
  calibrationOffset?: number | null;
  model?: MashPhModel;
}

export interface MashPhEstimateResult {
  model: MashPhModel;
  predictedMashPh20C: number;
  breakdown: Record<string, number>;
  warnings: string[];
}

export interface MashAcidAdditionInput {
  unadjustedMashPh20C: number;
  targetMashPh20C: number;
  mashWaterLiters: number;
  grainKg: number;
  alkalinityAsCaCO3?: number | null;
  acid: BrewingAcidId;
  concentrationPct?: number | null;
  maxMl?: number;
}

export interface MashAcidAdditionResult {
  acid: BrewingAcidId;
  concentrationPct: number;
  mashAcidMl: number;
  predictedMashPh20C: number;
  iterations: number;
  warnings: string[];
}

const ionKeys: Array<keyof Omit<WaterProfile, "ph">> = ["ca", "mg", "na", "cl", "so4", "hco3"];

export const brewingSaltDefinitions: Record<BrewingSaltId, SaltDefinition> = {
  gypsum: {
    id: "gypsum",
    label: "Gypsum",
    formula: "CaSO4.2H2O",
    ionMassFractions: { ca: 40.078 / 172.169, so4: 96.061 / 172.169 }
  },
  calcium_chloride: {
    id: "calcium_chloride",
    label: "Calcium Chloride",
    formula: "CaCl2.2H2O",
    ionMassFractions: { ca: 40.078 / 147.014, cl: 70.906 / 147.014 }
  },
  epsom_salt: {
    id: "epsom_salt",
    label: "Epsom Salt",
    formula: "MgSO4.7H2O",
    ionMassFractions: { mg: 24.305 / 246.475, so4: 96.061 / 246.475 }
  },
  table_salt: {
    id: "table_salt",
    label: "Table Salt",
    formula: "NaCl",
    ionMassFractions: { na: 22.99 / 58.44, cl: 35.45 / 58.44 }
  },
  baking_soda: {
    id: "baking_soda",
    label: "Baking Soda",
    formula: "NaHCO3",
    ionMassFractions: { na: 22.99 / 84.006, hco3: 61.016 / 84.006 }
  },
  chalk: {
    id: "chalk",
    label: "Chalk",
    formula: "CaCO3",
    ionMassFractions: { ca: 40.078 / 100.087, hco3: 122.032 / 100.087 },
    advancedOnly: true,
    lowSolubility: true
  },
  slaked_lime: {
    id: "slaked_lime",
    label: "Slaked Lime",
    formula: "Ca(OH)2",
    ionMassFractions: { ca: 40.078 / 74.093, hco3: 122.032 / 74.093 },
    advancedOnly: true
  }
};

export const brewingAcidDefinitions: Record<BrewingAcidId, AcidDefinition> = {
  lactic_acid: {
    id: "lactic_acid",
    label: "Lactic Acid",
    molecularWeightGPerMol: 90.078,
    densityGPerMl: 1.206,
    effectiveProtons: 1
  },
  phosphoric_acid: {
    id: "phosphoric_acid",
    label: "Phosphoric Acid",
    molecularWeightGPerMol: 97.994,
    densityGPerMl: 1.685,
    effectiveProtons: 1
  }
};

export const alkalinityAsCaCO3FromHco3 = (hco3Ppm: number): number => roundTo(hco3Ppm * 50 / 61, 2);

export const residualAlkalinityAsCaCO3 = (profile: WaterProfile): number => {
  const alkalinity = alkalinityAsCaCO3FromHco3(profile.hco3);
  const effectiveHardness = profile.ca / 1.4 + profile.mg / 1.7;
  return roundTo(alkalinity - effectiveHardness, 2);
};

export const ppmIonDelta = (saltGrams: number, waterLiters: number, ionMassFraction: number): number => (
  waterLiters > 0 ? (saltGrams * 1000 * ionMassFraction) / waterLiters : 0
);

export const applySaltAdditions = (
  sourceProfile: WaterProfile,
  waterLiters: number,
  additions: SaltAddition[]
): WaterProfile => {
  const next: WaterProfile = { ...sourceProfile };

  for (const addition of additions) {
    const definition = brewingSaltDefinitions[addition.salt];
    for (const key of ionKeys) {
      const fraction = definition.ionMassFractions[key] ?? 0;
      next[key] = roundTo(next[key] + ppmIonDelta(addition.grams, waterLiters, fraction), 3);
    }
  }

  return next;
};

const scoreWaterProfile = (profile: WaterProfile, target: WaterProfile) => {
  const weights: Record<keyof Omit<WaterProfile, "ph">, number> = {
    ca: 2,
    mg: 1,
    na: 1,
    cl: 2,
    so4: 2,
    hco3: 2
  };

  return ionKeys.reduce((sum, key) => sum + ((profile[key] - target[key]) ** 2) * weights[key], 0);
};

export const solveWaterTargetProfile = (input: WaterTargetSolverInput): WaterTargetSolverResult => {
  const allowedSalts = input.allowedSalts ?? ["gypsum", "calcium_chloride", "epsom_salt", "baking_soda"];
  const maxGramsPerSalt = input.maxGramsPerSalt ?? 20;
  const additions = new Map<BrewingSaltId, number>(allowedSalts.map((salt) => [salt, 0]));
  let finalProfile = applySaltAdditions(input.sourceProfile, input.waterLiters, []);
  let bestScore = scoreWaterProfile(finalProfile, input.targetProfile);

  for (const step of [1, 0.25, 0.05]) {
    let improved = true;
    let guard = 0;
    while (improved && guard < 400) {
      improved = false;
      guard += 1;

      for (const salt of allowedSalts) {
        const current = additions.get(salt) ?? 0;
        if (current + step > maxGramsPerSalt) {
          continue;
        }

        const candidateAdditions = new Map(additions);
        candidateAdditions.set(salt, current + step);
        const candidate = [...candidateAdditions.entries()].map(([candidateSalt, grams]) => ({
          salt: candidateSalt,
          grams
        }));
        const candidateProfile = applySaltAdditions(input.sourceProfile, input.waterLiters, candidate);
        const candidateScore = scoreWaterProfile(candidateProfile, input.targetProfile);

        if (candidateScore < bestScore) {
          bestScore = candidateScore;
          finalProfile = candidateProfile;
          additions.set(salt, current + step);
          improved = true;
        }
      }
    }
  }

  return {
    additions: [...additions.entries()]
      .filter(([, grams]) => grams > 0)
      .map(([salt, grams]) => ({ salt, grams: roundTo(grams, 2) })),
    finalProfile,
    score: roundTo(bestScore, 2)
  };
};

export const estimateMashPh = (input: MashPhEstimateInput): MashPhEstimateResult => {
  const model = input.model ?? "hybrid_mash_ph_v1";
  const profile = input.finalProfile ?? input.sourceProfile;
  const ra = residualAlkalinityAsCaCO3(profile);
  const baseMaltDiPh = input.baseMaltDiPh ?? 5.7;
  const raShift = 0.00168 * ra;

  if (model === "kolbach_ra_quick") {
    return {
      model,
      predictedMashPh20C: roundTo(baseMaltDiPh + raShift + (input.calibrationOffset ?? 0), 2),
      breakdown: {
        baseMaltDiPh,
        raShift: roundTo(raShift, 3),
        calibrationOffset: input.calibrationOffset ?? 0
      },
      warnings: ["mash_ph_ballpark_estimate"]
    };
  }

  const mashThickness = input.grainKg > 0 ? input.mashWaterLiters / input.grainKg : 3;
  const thicknessAdjustment = Math.max(-0.03, Math.min(0.03, (mashThickness - 3) * 0.01));
  const plato = Math.max(1, 12);
  const colorShift = input.beerSrm != null
    ? -1 * (input.beerSrm * ((0.21 * ((input.pctNonRoastedSpecialty ?? 0) / 100)) + (0.06 * ((input.pctRoasted ?? 0) / 100)))) / plato
    : 0;
  const specialtyMaltClassAdjustment =
    -0.08 * ((input.pctCrystalCaramel ?? 0) / 100)
    -0.18 * ((input.pctRoasted ?? 0) / 100);
  const acidulatedMaltAdjustment = -0.1 * (input.pctAcidulated ?? 0);
  const mineralAdjustment = Math.max(-0.06, Math.min(0.03, ((profile.ca + profile.mg) - 80) / 1000));
  const calibrationOffset = input.calibrationOffset ?? 0;
  const predicted = baseMaltDiPh
    + raShift
    + thicknessAdjustment
    + colorShift
    + specialtyMaltClassAdjustment
    + acidulatedMaltAdjustment
    + mineralAdjustment
    + calibrationOffset;

  return {
    model,
    predictedMashPh20C: roundTo(predicted, 2),
    breakdown: {
      baseMaltDiPh,
      raShift: roundTo(raShift, 3),
      thicknessAdjustment: roundTo(thicknessAdjustment, 3),
      colorShift: roundTo(colorShift, 3),
      specialtyMaltClassAdjustment: roundTo(specialtyMaltClassAdjustment, 3),
      acidulatedMaltAdjustment: roundTo(acidulatedMaltAdjustment, 3),
      mineralAdjustment: roundTo(mineralAdjustment, 3),
      calibrationOffset
    },
    warnings: ["mash_ph_ballpark_estimate"]
  };
};

export const acidNeutralizationMeqPerMl = (
  acid: BrewingAcidId,
  concentrationPct: number
): number => {
  const definition = brewingAcidDefinitions[acid];
  const boundedConcentration = Math.max(0, Math.min(100, concentrationPct)) / 100;
  const acidGramsPerMl = definition.densityGPerMl * boundedConcentration;
  const molesPerMl = acidGramsPerMl / definition.molecularWeightGPerMol;
  return molesPerMl * definition.effectiveProtons * 1000;
};

const estimateMashPhAfterAcidMl = (
  input: MashAcidAdditionInput,
  acidMl: number,
  concentrationPct: number
) => {
  const acidMeq = acidNeutralizationMeqPerMl(input.acid, concentrationPct) * acidMl;
  const alkalinityMeq = Math.max(0, input.alkalinityAsCaCO3 ?? 0) * Math.max(0, input.mashWaterLiters) / 50;
  const practicalBufferMeqPerPh = Math.max(
    20,
    (Math.max(0, input.grainKg) * 40)
    + (Math.max(0, input.mashWaterLiters) * 2)
    + (alkalinityMeq * 2)
  );
  const phDrop = acidMeq / practicalBufferMeqPerPh;

  return input.unadjustedMashPh20C - phDrop;
};

export const solveMashAcidAddition = (
  input: MashAcidAdditionInput
): MashAcidAdditionResult => {
  const concentrationPct = input.concentrationPct ?? (input.acid === "lactic_acid" ? 88 : 85);
  const maxMl = input.maxMl ?? Math.max(5, input.mashWaterLiters * 2);
  const warnings: string[] = ["mash_acid_model_practical_approximation"];

  if (input.unadjustedMashPh20C <= input.targetMashPh20C) {
    return {
      acid: input.acid,
      concentrationPct,
      mashAcidMl: 0,
      predictedMashPh20C: roundTo(input.unadjustedMashPh20C, 2),
      iterations: 0,
      warnings: [...warnings, "target_already_reached"]
    };
  }

  let low = 0;
  let high = maxMl;
  let iterations = 0;

  while (iterations < 40) {
    iterations += 1;
    const mid = (low + high) / 2;
    const predicted = estimateMashPhAfterAcidMl(input, mid, concentrationPct);
    if (predicted > input.targetMashPh20C) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const predictedMashPh20C = estimateMashPhAfterAcidMl(input, high, concentrationPct);
  if (predictedMashPh20C > input.targetMashPh20C + 0.01) {
    warnings.push("target_not_reached_within_max_acid");
  }

  return {
    acid: input.acid,
    concentrationPct,
    mashAcidMl: roundTo(high, 2),
    predictedMashPh20C: roundTo(predictedMashPh20C, 2),
    iterations,
    warnings
  };
};

export const sulfateChlorideRatio = (profile: WaterProfile): number | null => (
  profile.cl > 0 ? roundTo(profile.so4 / profile.cl, 2) : null
);
