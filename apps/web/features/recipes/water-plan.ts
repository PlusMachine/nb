import {
  acidNeutralizationMeqPerMl,
  alkalinityAsCaCO3FromHco3,
  applySaltAdditions,
  brewingAcidDefinitions,
  brewingSaltDefinitions,
  estimateMashPh,
  residualAlkalinityAsCaCO3,
  roundTo,
  solveMashAcidAddition,
  solveSpargeAcidAddition,
  solveWaterTargetProfile,
  sulfateChlorideRatio,
  type BrewingAcidId,
  type BrewingSaltId,
  type MashAcidAdditionResult,
  type MashPhEstimateResult,
  type SaltAddition,
  type SpargeAcidAdditionResult,
  type WaterProfile,
} from "@nb/brewing-core";

import type {
  RecipeWaterManualSaltAdditionTarget,
  RecipeWaterPlanMeta,
} from "./contracts";
import {
  starterEquipmentProfileDefaults,
  type EquipmentProfileSnapshot,
} from "../equipment-profiles/contracts";
import {
  calculateEquipmentVolumePlan,
  type EquipmentVolumeLimits,
} from "../equipment-profiles/volume-plan";

export type RecipeWaterPlanFermentableInput = {
  name?: string | null;
  subtype?: string | null;
  weightKg: number;
  /** Каталожный класс солода (malt_type): "roasted"/"caramel"/"special" и т.д. — см. Ф6 в notes/water-wizard-fixes.md. */
  maltType?: string | null;
  colorEbcMin?: number | null;
  colorEbcMax?: number | null;
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
    grainAbsorptionLPerKg: number | null;
    grainAbsorptionLossL: number | null;
    source:
      | "batch_size"
      | "equipment_profile"
      | "estimated_total_water"
      | "manual_split"
      | "manual_total";
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
    | (SpargeAcidAdditionResult & {
        label: string;
        targetSpargePh20C: number;
      })
    | null;
  predictedMashPhAfterAcid20C: number | null;
  /** Оценка привнесённого лактата (ppm на объём партии) при выбранной молочной кислоте;
   *  null, если кислота не молочная или объём партии неизвестен. См. Ф3 в notes/water-wizard-fixes.md. */
  lactatePpmEstimate: number | null;
  /** Фактическая доля не-водопроводной воды (RO + дистиллят) в смеси, 0..100;
   *  null, если blendRatio не задан. См. Ф8 в notes/water-wizard-fixes.md. */
  dilutionRoPct: number | null;
  /** Рекомендуемая доля осмоса/дистиллята, чтобы цель по щёлочности стала достижима
   *  или доза кислоты не била порог вкуса лактата; null, если разбавление не требуется. */
  dilutionSuggestedPct: number | null;
  warnings: string[];
  /** Лимиты оборудования, на которые ссылаются предупреждения плана: нужны, чтобы
   *  назвать в тексте конкретные числа («засыпь 8,3 кг при лимите 7 кг»). */
  equipmentLimits: EquipmentVolumeLimits | null;
};

const ionKeys: Array<keyof Omit<WaterProfile, "ph">> = [
  "ca",
  "mg",
  "na",
  "cl",
  "so4",
  "hco3",
];

/** Молярная масса лактат-иона (C3H5O3-), мг на мЭкв — молочная кислота одноосновна,
 *  1 мЭкв кислоты = 1 ммоль лактата. */
const LACTATE_MG_PER_MEQ = 89.07;
/** Порог вкуса лактата (braukaiser, экспериментальный) — выше начинает ощущаться кислинка. */
const LACTIC_ACID_TASTE_THRESHOLD_PPM = 400;

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

/** Ф8 (notes/water-wizard-fixes.md): дилюция осмосом/дистиллятом. */
type WaterBlendShares = { tapShare: number; nonTapShare: number };

/** Доли смеси нормализуются к сумме 1; сумма <= 0 (blendRatio не задан или все доли
 *  нулевые) трактуется как чистая водопроводная вода — без дилюции. */
const resolveWaterBlendShares = (
  blendRatio: RecipeWaterPlanMeta["blendRatio"],
): WaterBlendShares => {
  if (!blendRatio) return { tapShare: 1, nonTapShare: 0 };
  const tap = Math.max(0, blendRatio.tap ?? 0);
  const ro = Math.max(0, blendRatio.ro ?? 0);
  const distilled = Math.max(0, blendRatio.distilled ?? 0);
  const sum = tap + ro + distilled;
  if (sum <= 0) return { tapShare: 1, nonTapShare: 0 };
  const tapShare = tap / sum;
  return { tapShare, nonTapShare: 1 - tapShare };
};

/** RO и дистиллят считаются нулевыми по всем ионам (осмос/дистилляция снимают
 *  минерализацию практически полностью) — упрощение для дилюции; pH оставляем
 *  исходным, сдвиг к нейтральному pH при разбавлении — эффект второго порядка,
 *  щёлочность (Ct) и так падает пропорционально доле водопроводной воды. */
const applyWaterBlendDilution = (
  profile: WaterProfile,
  tapShare: number,
): WaterProfile => ({
  ca: profile.ca * tapShare,
  mg: profile.mg * tapShare,
  na: profile.na * tapShare,
  cl: profile.cl * tapShare,
  so4: profile.so4 * tapShare,
  hco3: profile.hco3 * tapShare,
  ph: profile.ph,
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

export type FermentableMashPhClass =
  | "roasted"
  | "acidulated"
  | "crystal"
  | "kilned"
  | "adjunct"
  | "base";

/** malt_type-значения каталога, однозначно определяющие класс без чтения имени/цвета. */
const MALT_TYPE_ROASTED = new Set(["roasted"]);
const MALT_TYPE_CRYSTAL = new Set(["caramel", "wheat_caramel", "rye_caramel"]);
/** malt_type-значения, для которых цвет служит арбитром при отсутствии ключевых слов в имени. */
const MALT_TYPE_COLOR_ARBITRATED = new Set(["special", "specialty"]);

/** Порядок проверки строгий: roasted перед crystal, иначе «Carafa» (жжёный) ловится по «cara». */
const FERMENTABLE_NAME_KEYWORDS: Array<{
  className: Exclude<FermentableMashPhClass, "base">;
  keywords: string[];
}> = [
  {
    className: "roasted",
    keywords: [
      "carafa",
      "chocolat",
      "шокол",
      "жжён",
      "жжен",
      "чёрны",
      "черны",
      "black",
      "roast",
      "роаст",
    ],
  },
  {
    className: "acidulated",
    keywords: ["acidulated", "sour", "sauer", "кисл"],
  },
  {
    className: "crystal",
    keywords: ["crystal", "caramel", "карамел", "cara", "кристал"],
  },
  {
    className: "kilned",
    keywords: [
      "munich",
      "мюних",
      "мюнхен",
      "vienna",
      "венск",
      "melanoidin",
      "меланоид",
      "biscuit",
      "бисквит",
      "печенье",
    ],
  },
  {
    className: "adjunct",
    keywords: [
      "adjunct",
      "sugar",
      "сахар",
      "syrup",
      "сироп",
      "honey",
      "мёд",
      "мед",
      "rice",
      "рис",
      "corn",
      "кукуруз",
      "мальтодекстр",
      "candi",
      // Фруктово-соковые добавки (имя-only импорт, subtype=null) — хотфикс верификации,
      // см. notes/water-wizard-fixes.md.
      "фрукт",
      "ягод",
      "пюре",
      "сок",
      "виш",
      "смород",
      "черник",
      "клубник",
      "малин",
      "juice",
      "puree",
      // Стемы вместо словоформ единственного числа: "berry"/"cherry" не матчили
      // множественное BeerXML-имя ("Blackberries", "Raspberries", "Black Cherries") —
      // y→ies меняет хвост слова. "berr" покрывает berry/berries/blackberries/
      // raspberries, "cherr" — cherry/cherries. currant не трогаем: "currants" —
      // суффиксное множественное (+s), уже ловится как есть.
      "berr",
      "cherr",
      "currant",
      // Меласса/патока (хвост классификатора, notes/water-wizard-fixes.md) — без этого
      // «Blackstrap Molasses» ловился roasted-ключом «black» раньше, чем добирался сюда.
      "molasses",
      "меласса",
      "патока",
      // Треакл/меласса-хвост (ремедиация Black Treacle, notes/water-wizard-fixes.md) —
      // «Black Treacle» реален в британских стаутах и приходит из BeerXML без subtype/
      // maltType; без этого ключа имя проваливалось в солодовые ключи и «black» ложно
      // ловил roasted.
      "treacle",
      "тритл",
    ],
  },
];

/** Короткие ключи-омографы: без границы начала слова ложно матчатся внутри других слов
 *  («кРИСтальный» → «рис», «оЧЁРНенный»-подобные конструкции). Проверяются через negative
 *  lookbehind — запрещаем букву того же алфавита непосредственно перед ключом. */
const WORD_START_GUARDED_KEYWORDS = new Set([
  "рис",
  "мёд",
  "мед",
  "кисл",
  "чёрны",
  "черны",
  "жжён",
  "жжен",
  "rice",
  "corn",
  "black",
  // Короткие фруктово-соковые ключи (Ф-хотфикс): без границы начала слова «сок» ловит
  // «носок», «виш» рискует матчиться внутри случайных слов.
  "сок",
  "виш",
]);

const guardedKeywordRegexCache = new Map<string, RegExp>();

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildGuardedKeywordRegex = (keyword: string): RegExp => {
  const cached = guardedKeywordRegexCache.get(keyword);
  if (cached) return cached;
  const isCyrillic = /[а-яё]/.test(keyword);
  const guard = isCyrillic ? "(?<![а-яё])" : "(?<![a-z])";
  const regex = new RegExp(`${guard}${escapeRegExp(keyword)}`, "u");
  guardedKeywordRegexCache.set(keyword, regex);
  return regex;
};

const matchesFermentableKeyword = (haystack: string, keyword: string) =>
  WORD_START_GUARDED_KEYWORDS.has(keyword)
    ? buildGuardedKeywordRegex(keyword).test(haystack)
    : haystack.includes(keyword);

/** Средний цвет по диапазону EBC; null, если оба края диапазона неизвестны. */
const averageColorEbc = (
  colorEbcMin?: number | null,
  colorEbcMax?: number | null,
): number | null => {
  const values = [colorEbcMin, colorEbcMax].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

/** Ключи, которые применяются к солоду (roasted → acidulated → crystal → kilned).
 *  adjunct сюда не входит: у солода (maltType известен ИЛИ subtype="malt") не бывает
 *  адъюнктового класса — см. ветки А/В в notes/water-wizard-fixes.md. */
const MALT_ONLY_NAME_CLASSES: ReadonlyArray<
  Exclude<FermentableMashPhClass, "base" | "adjunct">
> = ["roasted", "acidulated", "crystal", "kilned"];

const matchFermentableNameClass = (
  haystack: string,
  allowedClasses: ReadonlyArray<Exclude<FermentableMashPhClass, "base">>,
  keywordTable: typeof FERMENTABLE_NAME_KEYWORDS = FERMENTABLE_NAME_KEYWORDS,
): Exclude<FermentableMashPhClass, "base"> | null => {
  for (const { className, keywords } of keywordTable) {
    if (!allowedClasses.includes(className)) continue;
    if (keywords.some((keyword) => matchesFermentableKeyword(haystack, keyword))) {
      return className;
    }
  }
  return null;
};

/** roasted-ключи, которые остаются валидным сигналом ТОЛЬКО когда есть более сильный
 *  контекст (maltType известен, subtype="malt", либо имя само называет себя «malt»/
 *  «солод»). На последней ветке классификатора (subtype null, имя не даёт солодового
 *  сигнала вовсе) это слишком слабый сигнал: цветовое прилагательное «black»/«чёрный»/
 *  «chocolate» само по себе не отличает жжёный солод от чёрной смородины, шоколадного
 *  сиропа или чёрной мелассы (см. ремедиацию Black Treacle, notes/water-wizard-fixes.md). */
const WEAK_COLOR_ONLY_ROASTED_KEYWORDS = new Set([
  "black",
  "чёрны",
  "черны",
  "chocolat",
  "шокол",
]);

/** Таблица ключей для финальной ветки классификатора (ветка В, subtype null, имя не
 *  называет себя солодом): roasted сужен до сильных ключей (carafa/roast/жжён и т.п.),
 *  acidulated/crystal/kilned — без изменений. */
const NAME_ONLY_WEAK_SIGNAL_KEYWORD_TABLE: typeof FERMENTABLE_NAME_KEYWORDS =
  FERMENTABLE_NAME_KEYWORDS.map((entry) =>
    entry.className === "roasted"
      ? {
          ...entry,
          keywords: entry.keywords.filter(
            (keyword) => !WEAK_COLOR_ONLY_ROASTED_KEYWORDS.has(keyword),
          ),
        }
      : entry,
  );

/** Имя явно называет себя солодом («malt»/«солод») — используется только на ветке В
 *  (subtype null), чтобы отличить «Honey Malt»-подобные имена от фруктово-сахарных
 *  добавок, у которых имя не даёт солодового сигнала вовсе. */
const NAME_CLAIMS_MALT_REGEX = /malt|солод/;

/** Экспортируется для юнит-тестов классификатора (Ф6/хвост, notes/water-wizard-fixes.md).
 *  Три ветки по надёжности сигнала:
 *  А — maltType известен: это точно солод, адъюнктовые ключи не применяются, цвет —
 *      арбитр для special/specialty.
 *  Б — maltType неизвестен, subtype="fermentable": это точно НЕ солод (фрукты/сахара/
 *      сиропы/мёд) — всегда adjunct, никаких ключей.
 *  В — maltType неизвестен, subtype "malt" или null (имя-only, напр. импорт рецепта):
 *      - subtype явно "malt" (BeerXML-импорт без maltType, напр. «Honey Malt») — это точно
 *        солод, сперва солодовые ключи roasted → acidulated → crystal → kilned, adjunct-ключи
 *        (в т.ч. «honey») не применяются, при отсутствии совпадения — base.
 *      - subtype null (имя-only без даже каталожного намёка): если имя само называет себя
 *        солодом («malt»/«солод», напр. «Honey Malt», «Солодовый экстракт») — только
 *        солодовые ключи, adjunct не применяется (иначе «Honey Malt» ложно уходил в adjunct).
 *        Иначе имя не даёт солодового сигнала вовсе (напр. «Blackstrap Molasses», «Black
 *        Currant juice concentrate», «Black Treacle») — сперва adjunct-ключи (включая
 *        мелассу/треакл), потом солодовые, но roasted здесь сужен до сильных ключей
 *        (carafa/roast/жжён — напр. «Carafa III» без единого «malt»/«солод» в названии);
 *        цветовые слова (black/чёрны/chocolat/шокол) без солодового контекста — слишком
 *        слабый сигнал для roasted и больше НЕ матчатся в этой подветке, иначе base.
 *        Осознанная деградация: «Black Patent»/«Chocolate Rye» без «malt»/«солод» в имени
 *        уходят в base, а не roasted — умеренный буфер безопаснее ложного крайнего класса. */
export const classifyFermentable = (
  fermentable: RecipeWaterPlanFermentableInput,
): FermentableMashPhClass => {
  const maltType = fermentable.maltType?.toLowerCase().trim() || null;
  const haystack =
    `${fermentable.name ?? ""} ${fermentable.subtype ?? ""}`.toLowerCase();

  if (maltType) {
    if (MALT_TYPE_ROASTED.has(maltType)) return "roasted";
    if (MALT_TYPE_CRYSTAL.has(maltType)) return "crystal";

    const maltNameClass = matchFermentableNameClass(
      haystack,
      MALT_ONLY_NAME_CLASSES,
    );
    if (maltNameClass) return maltNameClass;

    if (MALT_TYPE_COLOR_ARBITRATED.has(maltType)) {
      const colorEbc = averageColorEbc(
        fermentable.colorEbcMin,
        fermentable.colorEbcMax,
      );
      if (colorEbc != null) {
        if (colorEbc >= 500) return "roasted";
        if (colorEbc >= 100 && colorEbc <= 400) return "crystal";
      }
    }

    return "base";
  }

  const subtype = fermentable.subtype?.toLowerCase().trim() || null;
  if (subtype === "fermentable") {
    return "adjunct";
  }

  if (subtype === "malt") {
    // subtype === "malt" здесь означает точно солод (просто без каталожного malt_type) —
    // adjunct-ключи («honey», «sugar» и т.п.) в этом случае не применяются, иначе
    // «Honey Malt» без maltType ложно уходил в adjunct.
    return matchFermentableNameClass(haystack, MALT_ONLY_NAME_CLASSES) ?? "base";
  }

  if (NAME_CLAIMS_MALT_REGEX.test(haystack)) {
    // Имя само называет себя солодом («Honey Malt», «Солодовый экстракт») — только
    // солодовые ключи; adjunct-ключи («honey», «сахар») не применяются, иначе «Honey
    // Malt» ложно уходил бы в adjunct.
    return matchFermentableNameClass(haystack, MALT_ONLY_NAME_CLASSES) ?? "base";
  }

  // Имя не даёт вообще никакого солодового сигнала («Blackstrap Molasses», «Black
  // Currant juice concentrate», «Black Treacle») — сперва adjunct-ключи (иначе
  // «Blackstrap Molasses»/«Black Treacle» ловились бы roasted-ключом «black» раньше,
  // чем добирались до «molasses»/«treacle»), потом солодовые — но roasted здесь сужен
  // до сильных ключей (carafa/roast/жжён), без цветовых слов (black/чёрны/chocolat/
  // шокол): цвет без солодового контекста — слишком слабый сигнал для крайнего класса
  // roasted (см. ремедиацию Black Treacle, notes/water-wizard-fixes.md). Это осознанная
  // деградация: «Black Patent»/«Chocolate Rye» без «malt»/«солод» в имени и без
  // maltType/subtype="malt" теперь уходят в base, а не roasted — умеренный буфер
  // безопаснее ложного roasted.
  return (
    matchFermentableNameClass(haystack, ["adjunct"]) ??
    matchFermentableNameClass(
      haystack,
      MALT_ONLY_NAME_CLASSES,
      NAME_ONLY_WEAK_SIGNAL_KEYWORD_TABLE,
    ) ??
    "base"
  );
};

/** Экспортируется для юнит-тестов (Ф6/Ф7, notes/water-wizard-fixes.md). */
export const summarizeFermentablesForMashPh = (
  fermentables: RecipeWaterPlanFermentableInput[],
) => {
  const totalKg = fermentables.reduce(
    (sum, fermentable) => sum + Math.max(0, fermentable.weightKg),
    0,
  );
  if (totalKg <= 0) {
    return {
      pctKilned: 0,
      pctRoasted: 0,
      pctCrystalCaramel: 0,
      pctAcidulated: 0,
      pctAdjunct: 0,
      crystalColorEbcAvg: null as number | null,
    };
  }

  let kilnedKg = 0;
  let roastedKg = 0;
  let crystalKg = 0;
  let acidulatedKg = 0;
  let adjunctKg = 0;
  let crystalColorWeightedSum = 0;
  let crystalColorWeightKg = 0;

  for (const fermentable of fermentables) {
    const weightKg = Math.max(0, fermentable.weightKg);
    const className = classifyFermentable(fermentable);
    if (className === "kilned") {
      kilnedKg += weightKg;
    }
    if (className === "roasted") {
      roastedKg += weightKg;
    }
    if (className === "crystal") {
      crystalKg += weightKg;
      const colorEbc = averageColorEbc(
        fermentable.colorEbcMin,
        fermentable.colorEbcMax,
      );
      if (colorEbc != null) {
        crystalColorWeightedSum += colorEbc * weightKg;
        crystalColorWeightKg += weightKg;
      }
    }
    if (className === "acidulated") {
      acidulatedKg += weightKg;
    }
    if (className === "adjunct") {
      adjunctKg += weightKg;
    }
  }

  return {
    pctKilned: roundTo((kilnedKg / totalKg) * 100, 2),
    pctRoasted: roundTo((roastedKg / totalKg) * 100, 2),
    pctCrystalCaramel: roundTo((crystalKg / totalKg) * 100, 2),
    pctAcidulated: roundTo((acidulatedKg / totalKg) * 100, 2),
    pctAdjunct: roundTo((adjunctKg / totalKg) * 100, 2),
    crystalColorEbcAvg:
      crystalColorWeightKg > 0
        ? roundTo(crystalColorWeightedSum / crystalColorWeightKg, 1)
        : null,
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

const fallbackEquipmentProfileSnapshot = (
  targetBatchVolumeL: number,
  grainAbsorptionLPerKg: number | null,
): EquipmentProfileSnapshot => ({
  ...starterEquipmentProfileDefaults,
  targetBatchVolumeL,
  grainAbsorptionLPerKg:
    grainAbsorptionLPerKg ??
    starterEquipmentProfileDefaults.grainAbsorptionLPerKg,
  id: null,
  snapshotAt: "1970-01-01T00:00:00.000Z",
});

export const buildRecipeWaterPlanResult = (input: {
  waterPlanMeta: RecipeWaterPlanMeta;
  fallbackBatchVolumeL?: number | null;
  boilTimeMinutes?: number | null;
  equipmentVolumePlan?: {
    totalWaterL: number;
    mashWaterL: number;
    spargeWaterL: number;
    grainAbsorptionLPerKg?: number | null;
    grainAbsorptionLossL?: number | null;
    warnings?: string[];
    limits?: EquipmentVolumeLimits | null;
  } | null;
  grainKg: number;
  /** Оставлено для обратной совместимости с существующими вызывающими (brew-plan.ts,
   *  public-recipe-water-section.tsx, recipe-designer.tsx). Модель hybrid_mash_ph_v1 (Ф5)
   *  больше не использует цвет пива — оценка pH идёт по классам солода (см. Ф6),
   *  поэтому поле принимается, но в estimateMashPh не передаётся. */
  beerSrm?: number | null;
  fermentables?: RecipeWaterPlanFermentableInput[];
}): RecipeWaterPlanResult => {
  const warnings: string[] = [];
  const grainKg = Math.max(0, input.grainKg);
  const recipeBatchVolumeL =
    input.fallbackBatchVolumeL != null
      ? Math.max(0, input.fallbackBatchVolumeL)
      : null;
  const waterPlanGrainAbsorptionLPerKg =
    input.waterPlanMeta.grainAbsorptionLPerKg != null &&
    Number.isFinite(input.waterPlanMeta.grainAbsorptionLPerKg)
      ? Math.max(0, input.waterPlanMeta.grainAbsorptionLPerKg)
      : null;
  const estimatedEquipmentVolumePlan =
    !input.equipmentVolumePlan && recipeBatchVolumeL != null && recipeBatchVolumeL > 0
      ? calculateEquipmentVolumePlan(
          fallbackEquipmentProfileSnapshot(
            recipeBatchVolumeL,
            waterPlanGrainAbsorptionLPerKg,
          ),
          grainKg,
          input.boilTimeMinutes ?? 60,
        )
      : null;
  const resolvedSuggestedVolumePlan =
    input.waterPlanMeta.totalWaterVolumeL == null
      ? input.equipmentVolumePlan ?? estimatedEquipmentVolumePlan
      : input.equipmentVolumePlan;
  const equipmentTotalWaterL =
    input.equipmentVolumePlan && Number.isFinite(input.equipmentVolumePlan.totalWaterL)
      ? Math.max(0, input.equipmentVolumePlan.totalWaterL)
      : null;
  const estimatedTotalWaterL =
    estimatedEquipmentVolumePlan &&
    Number.isFinite(estimatedEquipmentVolumePlan.totalWaterL)
      ? Math.max(0, estimatedEquipmentVolumePlan.totalWaterL)
      : null;
  const suggestedMashWaterL =
    resolvedSuggestedVolumePlan && Number.isFinite(resolvedSuggestedVolumePlan.mashWaterL)
      ? roundTo(Math.max(0, resolvedSuggestedVolumePlan.mashWaterL), 2)
      : null;
  const suggestedSpargeWaterL =
    resolvedSuggestedVolumePlan && Number.isFinite(resolvedSuggestedVolumePlan.spargeWaterL)
      ? roundTo(Math.max(0, resolvedSuggestedVolumePlan.spargeWaterL), 2)
      : null;
  const grainAbsorptionLossL =
    resolvedSuggestedVolumePlan &&
    resolvedSuggestedVolumePlan.grainAbsorptionLossL != null &&
    Number.isFinite(resolvedSuggestedVolumePlan.grainAbsorptionLossL)
      ? roundTo(Math.max(0, resolvedSuggestedVolumePlan.grainAbsorptionLossL), 2)
      : null;
  const grainAbsorptionLPerKg =
    resolvedSuggestedVolumePlan &&
    "grainAbsorptionLPerKg" in resolvedSuggestedVolumePlan &&
    resolvedSuggestedVolumePlan.grainAbsorptionLPerKg != null &&
    Number.isFinite(resolvedSuggestedVolumePlan.grainAbsorptionLPerKg)
      ? roundTo(Math.max(0, resolvedSuggestedVolumePlan.grainAbsorptionLPerKg), 2)
      : grainKg > 0 && grainAbsorptionLossL != null
        ? roundTo(grainAbsorptionLossL / grainKg, 2)
        : waterPlanGrainAbsorptionLPerKg ??
          starterEquipmentProfileDefaults.grainAbsorptionLPerKg;
  const hasManualTotal = input.waterPlanMeta.totalWaterVolumeL != null;
  const automaticTotalWaterL = roundTo(
    Math.max(
      0,
      input.waterPlanMeta.totalWaterVolumeL ??
        equipmentTotalWaterL ??
        estimatedTotalWaterL ??
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
    : hasManualTotal
      ? "manual_total"
      : equipmentTotalWaterL != null
        ? "equipment_profile"
        : estimatedTotalWaterL != null
          ? "estimated_total_water"
          : "batch_size";
  const sourceProfileRaw = normalizeProfile(
    input.waterPlanMeta.sourceProfile ?? emptyWaterProfile,
  );
  const blendRatio = input.waterPlanMeta.blendRatio ?? null;
  const blendShares = resolveWaterBlendShares(blendRatio);
  // Ф8: дальше по функции (солвер, bucket-профили, кислоты, лактат, RA, предупреждения)
  // работает уже разбавленный (effective) профиль — это фактическая вода варки.
  const sourceProfile = applyWaterBlendDilution(
    sourceProfileRaw,
    blendShares.tapShare,
  );
  const dilutionRoPct =
    blendRatio != null ? roundTo(blendShares.nonTapShare * 100, 1) : null;
  const targetProfile = input.waterPlanMeta.targetProfile
    ? normalizeProfile(input.waterPlanMeta.targetProfile)
    : null;

  const setupEnabled = input.waterPlanMeta.setupEnabled === true;

  if (
    setupEnabled &&
    !hasMeaningfulIonTargets(sourceProfile) &&
    !isZeroMineralSourceProfileAllowed(input.waterPlanMeta)
  ) {
    warnings.push("source_profile_missing_or_zero");
  }

  if (setupEnabled && !hasMeaningfulIonTargets(targetProfile)) {
    warnings.push("target_profile_missing_or_zero");
  }

  const effectiveEngine = resolveRecipeWaterEffectiveEngine(
    input.waterPlanMeta,
  );
  const mashPhEnabled =
    setupEnabled && isRecipeWaterMashPhEnabled(input.waterPlanMeta);
  const manualSaltAdditions = normalizeManualSaltAdditions(
    input.waterPlanMeta.manualSaltAdditions,
  );
  const useManualAdditions = setupEnabled && effectiveEngine === "advanced_manual";
  const solverResult =
    setupEnabled &&
    !useManualAdditions &&
    targetProfile &&
    hasMeaningfulIonTargets(targetProfile) &&
    totalWaterL > 0
      ? solveWaterTargetProfile({
          sourceProfile,
          targetProfile,
          waterLiters: totalWaterL,
          allowedSalts: resolveAllowedSalts(input.waterPlanMeta),
          preventTargetOvershoot: false,
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
          ...summarizeFermentablesForMashPh(input.fermentables ?? []),
          calibrationOffset: input.waterPlanMeta.calibrationOffset ?? null,
          model: input.waterPlanMeta.phModel,
        });

  if (mashPhEnabled && grainKg <= 0) {
    warnings.push("grain_bill_missing_for_mash_ph");
  }

  // Ф11: заторной воды 0 л при ручном сплите — либо цель pH затора включена
  // (без воды затирать нечем), либо в рецепте вовсе нет засыпи (сплит без
  // засыпи — тот же тупик по факту, даже без включённого pH затора).
  if (hasManualSplit && mashWaterL <= 0 && (grainKg <= 0 || mashPhEnabled)) {
    warnings.push("mash_water_volume_zero");
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
          alkalinityAsCaCO3: alkalinityAsCaCO3FromHco3(mashProfileForPh.hco3),
          sourceWaterPh: sourceProfile.ph ?? null,
          acid: acidId,
          concentrationPct: input.waterPlanMeta.acidConcentrationPct ?? null,
        })
      : null;
  const spargeSourceWaterPh =
    input.waterPlanMeta.spargeSourcePh ?? sourceProfile.ph ?? null;
  const targetSpargePh = input.waterPlanMeta.targetSpargePh ?? 5.7;
  const spargeProfileForPh =
    spargeWaterL > 0
      ? applySaltAdditions(
          sourceProfile,
          spargeWaterL,
          scopeSaltAdditionsToWaterBucket(
            saltAdditions,
            mashWaterL,
            spargeWaterL,
            "sparge",
          ),
        )
      : finalProfile;
  const spargeAlkalinityAsCaCO3 = alkalinityAsCaCO3FromHco3(
    spargeProfileForPh.hco3,
  );
  const spargeAcidAddition =
    setupEnabled && input.waterPlanMeta.spargeAcidificationEnabled && spargeWaterL > 0
      ? solveSpargeAcidAddition({
          spargeWaterLiters: spargeWaterL,
          sourceWaterPh: spargeSourceWaterPh,
          targetPh20C: targetSpargePh,
          alkalinityAsCaCO3: spargeAlkalinityAsCaCO3,
          acid: acidId,
          concentrationPct: input.waterPlanMeta.acidConcentrationPct ?? null,
        })
      : null;

  const totalAcidMl =
    (mashAcidAddition?.mashAcidMl ?? 0) + (spargeAcidAddition?.spargeAcidMl ?? 0);
  const lactateConcentrationPct =
    mashAcidAddition?.concentrationPct ??
    spargeAcidAddition?.concentrationPct ??
    (acidId === "lactic_acid" ? 88 : 85);
  const lactatePpmEstimate =
    acidId === "lactic_acid" && recipeBatchVolumeL != null && recipeBatchVolumeL > 0
      ? roundTo(
          (totalAcidMl *
            acidNeutralizationMeqPerMl(acidId, lactateConcentrationPct) *
            LACTATE_MG_PER_MEQ) /
            recipeBatchVolumeL,
          1,
        )
      : null;

  const lacticTasteThresholdTriggered =
    lactatePpmEstimate != null &&
    lactatePpmEstimate > LACTIC_ACID_TASTE_THRESHOLD_PPM;

  if (lacticTasteThresholdTriggered) {
    warnings.push("lactic_acid_taste_threshold");
  }

  // Ф8 (notes/water-wizard-fixes.md): подсказка «разбавьте осмосом», когда цель по
  // щёлочности недостижима (солвер умеет только добавлять ионы, снять HCO3 нельзя)
  // — код dilution_suggested_target — или честная доза кислоты уже бьёт порог вкуса
  // лактата без учёта целевого профиля — код dilution_suggested_acid. Разные причины,
  // разные тексты в wizard-словаре (buildWaterPlanResultWarningLabel), иначе текст
  // «цель недостижима» врёт, когда варнинг триггернулся только лактатом.
  const targetHco3Unreachable =
    targetProfile != null && sourceProfile.hco3 > targetProfile.hco3 + 25;
  let dilutionSuggestedPct: number | null = null;

  if (
    (targetHco3Unreachable || lacticTasteThresholdTriggered) &&
    sourceProfileRaw.hco3 > 0
  ) {
    const targetHco3ForSuggestion = targetProfile?.hco3 ?? 0;
    const rawSuggestedShare = Math.max(
      0,
      1 - targetHco3ForSuggestion / sourceProfileRaw.hco3,
    );
    const suggestedPct = Math.min(
      90,
      Math.ceil((rawSuggestedShare * 100) / 10) * 10,
    );
    const currentDilutionPct = dilutionRoPct ?? 0;

    if (currentDilutionPct < suggestedPct) {
      dilutionSuggestedPct = suggestedPct;
      warnings.push(
        targetHco3Unreachable
          ? "dilution_suggested_target"
          : "dilution_suggested_acid",
      );
    }
  }

  // Предупреждения объёмного плана (котёл/заторник/засыпь) до сих пор считались
  // и молча выбрасывались: показать их было негде. Отдаём вместе с водными — это
  // единственное место, где пользователь видит план варки целиком.
  const effectiveVolumePlan = input.equipmentVolumePlan ?? estimatedEquipmentVolumePlan;

  warnings.push(
    ...buildWarningsForFinalProfile(finalProfile),
    ...(solverResult?.warnings ?? []),
    ...(mashPhEstimate?.warnings ?? []),
    ...(mashAcidAddition?.warnings ?? []),
    ...(spargeAcidAddition?.warnings ?? []),
    ...(effectiveVolumePlan?.warnings ?? []),
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
      grainAbsorptionLPerKg,
      grainAbsorptionLossL,
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
          targetSpargePh20C: targetSpargePh,
        }
      : null,
    lactatePpmEstimate,
    dilutionRoPct,
    dilutionSuggestedPct,
    predictedMashPhAfterAcid20C:
      mashAcidAddition?.predictedMashPh20C ??
      mashPhEstimate?.predictedMashPh20C ??
      null,
    warnings: [...new Set(warnings)],
    equipmentLimits: effectiveVolumePlan?.limits ?? null,
  };
};
