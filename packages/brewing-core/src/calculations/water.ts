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
  preventTargetOvershoot?: boolean;
}

export interface WaterTargetSolverResult {
  additions: SaltAddition[];
  finalProfile: WaterProfile;
  score: number;
  warnings: string[];
}

export interface MashPhEstimateInput {
  sourceProfile: WaterProfile;
  finalProfile?: WaterProfile | null;
  mashWaterLiters: number;
  grainKg: number;
  /** Доля засыпи (0-100), приготовленная из тёмного/венского/мюнхенского солода (kilned). */
  pctKilned?: number | null;
  pctRoasted?: number | null;
  pctCrystalCaramel?: number | null;
  /** Средний цвет карамельных/кристаллических солодов в засыпи, EBC — задаёт pHi класса crystal. */
  crystalColorEbcAvg?: number | null;
  pctAcidulated?: number | null;
  /** Доля несоложёных сахаров/адъюнктов (0-100) — не буферят затор (B=0). */
  pctAdjunct?: number | null;
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
  /** pH исходной (не засолённой) воды — нужен для расчёта Ct затворной воды. По умолчанию 7. */
  sourceWaterPh?: number | null;
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

export interface SpargeAcidAdditionInput {
  spargeWaterLiters: number;
  /** pH исходной промывочной воды. По умолчанию 7. */
  sourceWaterPh?: number | null;
  targetPh20C: number;
  alkalinityAsCaCO3: number;
  acid: BrewingAcidId;
  concentrationPct?: number | null;
  maxMl?: number;
}

export interface SpargeAcidAdditionResult {
  acid: BrewingAcidId;
  concentrationPct: number;
  spargeAcidMl: number;
  acidMeq: number;
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

const getSaltAdjustedIonKeys = (salts: BrewingSaltId[]) => {
  const keys = new Set<keyof Omit<WaterProfile, "ph">>();

  for (const salt of salts) {
    const definition = brewingSaltDefinitions[salt];
    for (const key of ionKeys) {
      if ((definition.ionMassFractions[key] ?? 0) > 0) {
        keys.add(key);
      }
    }
  }

  return [...keys];
};

// Mg/Na — вкусочувствительные ионы (солоноватость, горьковатая «минеральность»): вес выше,
// чтобы солвер не жертвовал ими ради Ca/Cl/SO4/HCO3 на пути к общему минимуму.
const ION_SCORE_WEIGHTS: Record<keyof Omit<WaterProfile, "ph">, number> = {
  ca: 1,
  mg: 2,
  na: 2,
  cl: 1,
  so4: 1,
  hco3: 1
};

// Асимметричный лосс: перелить соль хуже, чем недолить (перелитый ион нельзя изъять обратно,
// а недолитый ещё можно дотитровать следующим шагом) — овершут штрафуется в 3 раза сильнее.
const OVERSHOOT_SCORE_PENALTY = 3;

const scoreWaterProfile = (
  profile: WaterProfile,
  target: WaterProfile,
  scoreIonKeys: Array<keyof Omit<WaterProfile, "ph">> = ionKeys
) => scoreIonKeys.reduce((sum, key) => {
  const diff = profile[key] - target[key];
  const overshootMultiplier = diff > 0 ? OVERSHOOT_SCORE_PENALTY : 1;
  return sum + (diff ** 2) * ION_SCORE_WEIGHTS[key] * overshootMultiplier;
}, 0);

const exceedsTargetProfile = (
  source: WaterProfile,
  candidate: WaterProfile,
  target: WaterProfile,
  scoreIonKeys: Array<keyof Omit<WaterProfile, "ph">>,
  tolerancePpm = 0.01
) => scoreIonKeys.some((key) => {
  const ceiling = Math.max(source[key], target[key]);
  return candidate[key] > ceiling + tolerancePpm;
});

const toSolverAdditions = (additions: Map<BrewingSaltId, number>) => (
  [...additions.entries()].map(([candidateSalt, grams]) => ({
    salt: candidateSalt,
    grams
  }))
);

const roundSolverAdditions = (additions: Map<BrewingSaltId, number>) => (
  [...additions.entries()]
    .filter(([, grams]) => grams > 0)
    .map(([salt, grams]) => ({ salt, grams: roundTo(grams, 2) }))
);

const hasMeaningfulWaterSolverMove = (
  candidateScore: number,
  bestScore: number,
  epsilon = 0.0001
) => candidateScore < bestScore - epsilon;

interface GreedyDescentResult {
  additions: Map<BrewingSaltId, number>;
  finalProfile: WaterProfile;
  score: number;
}

const runGreedyWaterDescent = (
  sourceProfile: WaterProfile,
  waterLiters: number,
  targetProfile: WaterProfile,
  saltOrder: BrewingSaltId[],
  maxGramsPerSalt: number,
  preventTargetOvershoot: boolean,
  // Ионы, которыми реально можно двигать текущим набором солей — используется только для
  // ворот "не перелить относительно цели" (exceedsTargetProfile). Сам score всегда считается
  // по полному набору ионов (см. вызовы ниже) — иначе сравнение score между разными наборами
  // allowedSalts (3 соли vs 5) было бы некорректным: недостижимые ионы просто выпадали бы из
  // счёта, и добавление солей могло бы "ухудшить" score чисто за счёт включения новых слагаемых.
  scoreIonKeys: Array<keyof Omit<WaterProfile, "ph">>,
  // Точка старта спуска (по умолчанию все соли — 0 г). Используется для сидирования из
  // одномерных решений и для prune-and-reoptimize (см. solveWaterTargetProfile) — спуск из
  // не-нулевой точки может найти минимум, недостижимый координатным спуском из нуля.
  initialAdditions?: Map<BrewingSaltId, number>
): GreedyDescentResult => {
  const additions = new Map<BrewingSaltId, number>(
    saltOrder.map((salt) => [salt, initialAdditions?.get(salt) ?? 0])
  );
  let finalProfile = applySaltAdditions(sourceProfile, waterLiters, toSolverAdditions(additions));
  let bestScore = scoreWaterProfile(finalProfile, targetProfile);

  for (const step of [1, 0.25, 0.05, 0.01]) {
    let improved = true;
    let guard = 0;
    while (improved && guard < 1200) {
      improved = false;
      guard += 1;

      for (const salt of saltOrder) {
        for (const direction of [1, -1]) {
          const current = additions.get(salt) ?? 0;
          const next = roundTo(current + (step * direction), 4);
          if (next < 0 || next > maxGramsPerSalt) {
            continue;
          }

          const candidateAdditions = new Map(additions);
          candidateAdditions.set(salt, next);
          const candidateProfile = applySaltAdditions(
            sourceProfile,
            waterLiters,
            toSolverAdditions(candidateAdditions)
          );

          if (
            preventTargetOvershoot &&
            exceedsTargetProfile(sourceProfile, candidateProfile, targetProfile, scoreIonKeys)
          ) {
            continue;
          }

          const candidateScore = scoreWaterProfile(candidateProfile, targetProfile);

          if (hasMeaningfulWaterSolverMove(candidateScore, bestScore)) {
            bestScore = candidateScore;
            finalProfile = candidateProfile;
            additions.set(salt, next);
            improved = true;
          }
        }
      }
    }
  }

  return { additions, finalProfile, score: bestScore };
};

const rotateSalts = (salts: BrewingSaltId[], by: number): BrewingSaltId[] => (
  salts.map((_, index) => salts[(index + by) % salts.length])
);

/**
 * Жадный спуск — координатный (по одной соли за раз) и застревает в локальном минимуме,
 * зависящем от порядка обхода солей: добавление ещё одной соли меняет порядок и может
 * увести в худший локальный минимум (наблюдалось на Burton — 5 солей хуже 3-х). Мультистарт
 * из нескольких детерминированных перестановок порядка (без Math.random — воспроизводимо)
 * лечит это: берём лучший результат, 3-4 старта достаточно на практике.
 */
const buildSaltOrderings = (salts: BrewingSaltId[]): BrewingSaltId[][] => {
  if (salts.length <= 1) {
    return [salts];
  }

  const candidates = [
    salts,
    [...salts].reverse(),
    rotateSalts(salts, 1),
    rotateSalts(salts, Math.max(2, Math.floor(salts.length / 2)))
  ];

  const seen = new Set<string>();
  const orderings: BrewingSaltId[][] = [];
  for (const candidate of candidates) {
    const key = candidate.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      orderings.push(candidate);
    }
  }

  return orderings;
};

export const solveWaterTargetProfile = (input: WaterTargetSolverInput): WaterTargetSolverResult => {
  const allowedSalts = input.allowedSalts ?? ["gypsum", "calcium_chloride", "epsom_salt"];
  const maxGramsPerSalt = input.maxGramsPerSalt ?? 20;
  const preventTargetOvershoot = input.preventTargetOvershoot ?? true;
  const scoreIonKeys = getSaltAdjustedIonKeys(allowedSalts);

  const runFullDescent = (initialAdditions?: Map<BrewingSaltId, number>) => runGreedyWaterDescent(
    input.sourceProfile,
    input.waterLiters,
    input.targetProfile,
    allowedSalts,
    maxGramsPerSalt,
    preventTargetOvershoot,
    scoreIonKeys,
    initialAdditions
  );

  let best: GreedyDescentResult | null = null;
  for (const saltOrder of buildSaltOrderings(allowedSalts)) {
    const candidate = runGreedyWaterDescent(
      input.sourceProfile,
      input.waterLiters,
      input.targetProfile,
      saltOrder,
      maxGramsPerSalt,
      preventTargetOvershoot,
      scoreIonKeys
    );

    if (best === null || hasMeaningfulWaterSolverMove(candidate.score, best.score)) {
      best = candidate;
    }
  }

  // Сидирование: координатный спуск из нуля по нескольким переставленным порядкам солей может
  // не найти минимум, где ровно одна соль упирается в кэп, а остальные молчат (переплетение
  // ионов — например so4 у gypsum и epsom_salt — плюс овершут-штраф уводят спуск мимо этой
  // точки). Даём конструктивную гарантию: для каждой соли отдельно решаем одномерную задачу
  // (только эта соль двигается), затем от найденной точки прогоняем полный спуск по всем
  // allowedSalts. Результат супермножества солей тогда не может быть хуже лучшего решения
  // любой отдельной соли — оно всегда входит в число стартовых точек полного спуска.
  for (const salt of allowedSalts) {
    const singleSaltSeed = runGreedyWaterDescent(
      input.sourceProfile,
      input.waterLiters,
      input.targetProfile,
      [salt],
      maxGramsPerSalt,
      preventTargetOvershoot,
      scoreIonKeys
    );
    const seeded = runFullDescent(singleSaltSeed.additions);

    if (best === null || hasMeaningfulWaterSolverMove(seeded.score, best.score)) {
      best = seeded;
    }
  }

  // allowedSalts никогда не пуст в дефолте, но на всякий случай не падаем на пустом входе.
  let bestResult = best ?? {
    additions: new Map<BrewingSaltId, number>(),
    finalProfile: applySaltAdditions(input.sourceProfile, input.waterLiters, []),
    score: scoreWaterProfile(
      applySaltAdditions(input.sourceProfile, input.waterLiters, []),
      input.targetProfile
    )
  };

  // Post-pass prune-and-reoptimize: соли, оставшиеся в лучшем кандидате с ненулевой дозой,
  // могли попасть туда как локально-оптимальный, но глобально лишний груз (одна соль
  // "подпирает" другую хуже, чем работала бы одна из них полной дозой). Пробуем занулить
  // каждую такую соль по очереди и заново сходимся полным спуском от полученной точки;
  // принимаем, если счёт улучшился. Повторяем до отсутствия улучшений (детерминированно,
  // guard на число раундов — солей максимум несколько штук, это дёшево).
  let pruneImproved = true;
  let pruneRounds = 0;
  const maxPruneRounds = allowedSalts.length * 3;
  while (pruneImproved && pruneRounds < maxPruneRounds) {
    pruneImproved = false;
    pruneRounds += 1;

    for (const salt of allowedSalts) {
      const currentGrams = bestResult.additions.get(salt) ?? 0;
      if (currentGrams <= 0) {
        continue;
      }

      const prunedAdditions = new Map(bestResult.additions);
      prunedAdditions.set(salt, 0);
      const reoptimized = runFullDescent(prunedAdditions);

      if (hasMeaningfulWaterSolverMove(reoptimized.score, bestResult.score)) {
        bestResult = reoptimized;
        pruneImproved = true;
      }
    }
  }

  const roundedAdditions = roundSolverAdditions(bestResult.additions);
  const warnings: string[] = [];
  // Соль реально упёрлась в лимит (а не просто случайно совпала с ним) — фиксируем факт «на
  // границе»: солвер бы полил ещё, если бы кэп позволял. Проверять «улучшило бы это score»
  // отдельно избыточно: жадный спуск сходится сюда только когда шаг ограничен `next > maxGramsPerSalt`.
  if (roundedAdditions.some((addition) => addition.grams >= maxGramsPerSalt - 0.005)) {
    warnings.push("salt_addition_capped");
  }

  return {
    additions: roundedAdditions,
    finalProfile: applySaltAdditions(input.sourceProfile, input.waterLiters, roundedAdditions),
    score: roundTo(bestResult.score, 2),
    warnings
  };
};

/** Диапазон 34–60 мЭкв/(кг·pH) по Riffe/deLange для буфера светлого солода; 40 — практическая точка внутри диапазона. */
export const MASH_BUFFER_MEQ_PER_KG_PH = 40;

/**
 * pHi (DI-pH при бесконечном разведении) и Bi (буферная ёмкость, мЭкв/(кг·pH)) классов засыпи
 * по Riffe & Spencer, «A Homebrewing Perspective on Mash pH III» (2018), и deLange.
 * Кислый солод (acidulated) сюда не входит — он не участвует во взвешенном среднем,
 * а даёт отдельную аддитивную поправку (см. estimateMashPh).
 */
const MASH_GRIST_CLASS_BUFFER = {
  kilned: { diPh: 5.58, bufferMeqPerKgPh: 45 },
  crystal: { bufferMeqPerKgPh: 55 },
  roasted: { diPh: 4.64, bufferMeqPerKgPh: 69 },
  adjunct: { diPh: 0, bufferMeqPerKgPh: 0 }
} as const;

/** pHi карамельных/кристаллических солодов кусочно-линейно по цвету (EBC), Riffe & Spencer. */
const crystalMaltDiPh = (ebcColor: number | null | undefined): number => {
  if (ebcColor == null) {
    return 4.95;
  }

  const ebc = Math.max(0, ebcColor);
  let diPh: number;
  if (ebc <= 20) {
    diPh = 5.2;
  } else if (ebc <= 80) {
    diPh = 5.2 + ((ebc - 20) * (4.75 - 5.2)) / (80 - 20);
  } else if (ebc <= 240) {
    diPh = 4.75 + ((ebc - 80) * (4.63 - 4.75)) / (240 - 80);
  } else {
    diPh = 4.63;
  }

  return Math.max(4.6, Math.min(5.3, diPh));
};

export const estimateMashPh = (input: MashPhEstimateInput): MashPhEstimateResult => {
  const model = input.model ?? "hybrid_mash_ph_v1";
  const profile = input.finalProfile ?? input.sourceProfile;
  const ra = residualAlkalinityAsCaCO3(profile);

  if (model === "kolbach_ra_quick") {
    const baseMaltDiPh = input.baseMaltDiPh ?? 5.7;
    const raShift = 0.00168 * ra;
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

  // hybrid_mash_ph_v1: взвешенный DI pH засыпи по классам солода (Riffe & Spencer Eq.4) +
  // сдвиг от остаточной щёлочности воды, нормированный на буфер засыпи.
  const baseMaltDiPh = input.baseMaltDiPh ?? 5.75;
  const pctKilned = Math.max(0, input.pctKilned ?? 0);
  const pctCrystalCaramel = Math.max(0, input.pctCrystalCaramel ?? 0);
  const pctRoasted = Math.max(0, input.pctRoasted ?? 0);
  const pctAdjunct = Math.max(0, input.pctAdjunct ?? 0);
  const pctAcidulated = Math.max(0, input.pctAcidulated ?? 0);
  // Кислый солод в среднем не участвует (см. комментарий у MASH_GRIST_CLASS_BUFFER), но всё
  // равно занимает долю засыпи — остаток на base считается уже за его вычетом.
  const pctBase = Math.max(0, 100 - pctKilned - pctCrystalCaramel - pctRoasted - pctAdjunct - pctAcidulated);

  const gristBufferClasses = [
    { diPh: baseMaltDiPh, bufferMeqPerKgPh: MASH_BUFFER_MEQ_PER_KG_PH, fraction: pctBase / 100 },
    { diPh: MASH_GRIST_CLASS_BUFFER.kilned.diPh, bufferMeqPerKgPh: MASH_GRIST_CLASS_BUFFER.kilned.bufferMeqPerKgPh, fraction: pctKilned / 100 },
    { diPh: crystalMaltDiPh(input.crystalColorEbcAvg), bufferMeqPerKgPh: MASH_GRIST_CLASS_BUFFER.crystal.bufferMeqPerKgPh, fraction: pctCrystalCaramel / 100 },
    { diPh: MASH_GRIST_CLASS_BUFFER.roasted.diPh, bufferMeqPerKgPh: MASH_GRIST_CLASS_BUFFER.roasted.bufferMeqPerKgPh, fraction: pctRoasted / 100 },
    { diPh: MASH_GRIST_CLASS_BUFFER.adjunct.diPh, bufferMeqPerKgPh: MASH_GRIST_CLASS_BUFFER.adjunct.bufferMeqPerKgPh, fraction: pctAdjunct / 100 }
  ];

  const weightedBufferSum = gristBufferClasses.reduce((sum, c) => sum + c.bufferMeqPerKgPh * c.fraction, 0);
  const weightedDiPhSum = gristBufferClasses.reduce((sum, c) => sum + c.diPh * c.bufferMeqPerKgPh * c.fraction, 0);
  // Вырожденный кейс (например, 100% сахара/адъюнктов): буфер засыпи нулевой — фолбэк на буфер
  // и pHi базового солода, иначе получили бы деление на 0.
  const hasGristBuffer = weightedBufferSum > 0;
  const gristBufferTotal = hasGristBuffer ? weightedBufferSum : MASH_BUFFER_MEQ_PER_KG_PH;
  const gristDiPh = hasGristBuffer ? weightedDiPhSum / weightedBufferSum : baseMaltDiPh;

  const mashThickness = input.grainKg > 0 ? input.mashWaterLiters / input.grainKg : 3;
  const clampedThickness = Math.max(2, Math.min(6, mashThickness));

  const acidulatedMaltAdjustment = -0.1 * pctAcidulated;
  const calibrationOffset = input.calibrationOffset ?? 0;
  const basePoint = gristDiPh + acidulatedMaltAdjustment + calibrationOffset;

  // Самосогласованный водный член (Riffe Eq.4 с Z(pH)-сепциацией карбоната), заменяет линейный
  // 0,00168×RA-подход: карбонатная щёлочность нейтрализуется солодом лишь частично — только до
  // достигнутого pH затора, а не полностью (см. ремедиацию по итогам верификации кислотных солверов).
  const alk = alkalinityAsCaCO3FromHco3(profile.hco3);
  // Кольбаховский жёсткостный член (линейный): Ca/Mg реагируют с фосфатами солода независимо от pH.
  const hardnessMeqPerL = (profile.ca / 1.4 + profile.mg / 1.7) / 50;
  const sourcePh = input.sourceProfile.ph ?? 7;
  const sourceCharge = carbonateChargeFraction(sourcePh);
  const totalCarbonate = totalCarbonateMmolPerL(alk, sourcePh);

  const alkEffMeqPerL = (ph: number): number => (
    totalCarbonate * Math.max(0, sourceCharge - carbonateChargeFraction(ph))
  );

  // Стартовая точка: базовый pHi + линейная оценка сдвига (предполагает полную нейтрализацию),
  // затем уточняем фикс-поинтом с демпфером до сходимости.
  const linearRaShift = ((ra / 50) * clampedThickness) / gristBufferTotal;
  let ph = basePoint + linearRaShift;

  for (let i = 0; i < 24; i += 1) {
    const waterShiftAtPh = ((alkEffMeqPerL(ph) - hardnessMeqPerL) * clampedThickness) / gristBufferTotal;
    const phNext = basePoint + waterShiftAtPh;
    const damped = (ph + phNext) / 2;
    if (Math.abs(damped - ph) < 0.001) {
      ph = damped;
      break;
    }
    ph = damped;
  }

  const effectiveAlkalinityMeqPerL = alkEffMeqPerL(ph);
  const waterShift = ((effectiveAlkalinityMeqPerL - hardnessMeqPerL) * clampedThickness) / gristBufferTotal;
  const predicted = basePoint + waterShift;

  return {
    model,
    predictedMashPh20C: roundTo(predicted, 2),
    breakdown: {
      gristDiPh: roundTo(gristDiPh, 3),
      waterShift: roundTo(waterShift, 3),
      effectiveAlkalinityMeqPerL: roundTo(effectiveAlkalinityMeqPerL, 3),
      acidulatedMaltAdjustment: roundTo(acidulatedMaltAdjustment, 3),
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

// Карбонатная система при 20°C (deLange, "Acidification of Water").
const CARBONATE_PKA1_20C = 6.38;
const CARBONATE_PKA2_20C = 10.33;

/** Средний заряд на моль растворённого углерода при данном pH (0 при низком pH, до 2 при высоком). */
export const carbonateChargeFraction = (ph: number): number => {
  const r1 = 10 ** (ph - CARBONATE_PKA1_20C);
  const r2 = 10 ** (ph - CARBONATE_PKA2_20C);
  const denom = 1 + r1 + r1 * r2;
  const alpha1 = r1 / denom;
  const alpha2 = (r1 * r2) / denom;
  return alpha1 + 2 * alpha2;
};

/** Полный растворённый карбонат (ммоль/л), восстановленный из щёлочности при известном pH источника. */
export const totalCarbonateMmolPerL = (
  alkalinityAsCaCO3Ppm: number,
  sourceWaterPh: number
): number => {
  const charge = carbonateChargeFraction(sourceWaterPh);
  return charge > 0 ? (alkalinityAsCaCO3Ppm / 50) / charge : 0;
};

export const solveSpargeAcidAddition = (input: SpargeAcidAdditionInput): SpargeAcidAdditionResult => {
  const concentrationPct = input.concentrationPct ?? (input.acid === "lactic_acid" ? 88 : 85);
  const sourceWaterPh = input.sourceWaterPh ?? 7;
  const maxMl = input.maxMl ?? Math.max(5, input.spargeWaterLiters * 2);
  const spargeWaterLiters = Math.max(0, input.spargeWaterLiters);
  const alkalinity = Math.max(0, input.alkalinityAsCaCO3 ?? 0);

  const totalCarbonate = totalCarbonateMmolPerL(alkalinity, sourceWaterPh);
  const chargeDelta = carbonateChargeFraction(sourceWaterPh) - carbonateChargeFraction(input.targetPh20C);
  const acidMeq = totalCarbonate * spargeWaterLiters * chargeDelta;
  const meqPerMl = acidNeutralizationMeqPerMl(input.acid, concentrationPct);
  const rawMl = acidMeq > 0 && meqPerMl > 0 ? acidMeq / meqPerMl : 0;
  const spargeAcidMl = Math.max(0, Math.min(maxMl, rawMl));

  const warnings: string[] = [];
  if (rawMl > maxMl + 1e-9) {
    warnings.push("sparge_acid_capped_at_max_ml");
  }

  return {
    acid: input.acid,
    concentrationPct,
    spargeAcidMl: roundTo(spargeAcidMl, 2),
    // Диагностическое поле — не должно уходить в минус, даже если sourceWaterPh ниже цели.
    acidMeq: roundTo(Math.max(0, acidMeq), 2),
    warnings
  };
};

const mashAcidMeqForPhShift = (
  grainKg: number,
  mashWaterLiters: number,
  alkalinityAsCaCO3: number | null | undefined,
  sourceWaterPh: number,
  phFrom: number,
  phTo: number
): number => {
  const grainMeq = MASH_BUFFER_MEQ_PER_KG_PH * Math.max(0, grainKg) * Math.max(0, phFrom - phTo);
  const totalCarbonate = totalCarbonateMmolPerL(Math.max(0, alkalinityAsCaCO3 ?? 0), sourceWaterPh);
  const chargeDelta = carbonateChargeFraction(phFrom) - carbonateChargeFraction(phTo);
  const carbonateMeq = totalCarbonate * Math.max(0, mashWaterLiters) * chargeDelta;
  return grainMeq + carbonateMeq;
};

export const solveMashAcidAddition = (
  input: MashAcidAdditionInput
): MashAcidAdditionResult => {
  const concentrationPct = input.concentrationPct ?? (input.acid === "lactic_acid" ? 88 : 85);
  const sourceWaterPh = input.sourceWaterPh ?? 7;
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

  const meqPerMl = acidNeutralizationMeqPerMl(input.acid, concentrationPct);
  const requiredAcidMeq = mashAcidMeqForPhShift(
    input.grainKg,
    input.mashWaterLiters,
    input.alkalinityAsCaCO3,
    sourceWaterPh,
    input.unadjustedMashPh20C,
    input.targetMashPh20C
  );
  const requiredMl = meqPerMl > 0 ? requiredAcidMeq / meqPerMl : 0;

  if (requiredMl <= maxMl) {
    return {
      acid: input.acid,
      concentrationPct,
      mashAcidMl: roundTo(requiredMl, 2),
      predictedMashPh20C: roundTo(input.targetMashPh20C, 2),
      iterations: 0,
      warnings
    };
  }

  // Упёрлись в maxMl: формула монотонна по pH (меньше кислоты нужно тем ближе цель к исходному pH),
  // поэтому бисекцией находим достижимый при maxMl мл pH затора.
  const neededMlForPh = (ph: number): number => {
    const meq = mashAcidMeqForPhShift(
      input.grainKg,
      input.mashWaterLiters,
      input.alkalinityAsCaCO3,
      sourceWaterPh,
      input.unadjustedMashPh20C,
      ph
    );
    return meqPerMl > 0 ? meq / meqPerMl : 0;
  };

  let low = input.targetMashPh20C;
  let high = input.unadjustedMashPh20C;
  let iterations = 0;

  while (iterations < 40) {
    iterations += 1;
    const mid = (low + high) / 2;
    if (neededMlForPh(mid) > maxMl) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Допуск: если бисекция всё же сошлась достаточно близко к цели, "не долетели" не считается.
  if (high > input.targetMashPh20C + 0.01) {
    warnings.push("target_not_reached_within_max_acid");
  }

  return {
    acid: input.acid,
    concentrationPct,
    mashAcidMl: roundTo(maxMl, 2),
    predictedMashPh20C: roundTo(high, 2),
    iterations,
    warnings
  };
};

export const sulfateChlorideRatio = (profile: WaterProfile): number | null => (
  profile.cl > 0 ? roundTo(profile.so4 / profile.cl, 2) : null
);
