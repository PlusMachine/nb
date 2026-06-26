import {
  brixToSg,
  calculateAbvAttenuation,
  calculateBeerColorSimple,
  calculateBitterness,
  calculateBottling,
  calculateBrewingWaterVolume,
  calculateDilutionBoiloff,
  calculateHopFreshness,
  calculateKegCarbonationPressure,
  calculatePrimingSugar,
  calculateSpeiseKrausen,
  calculateWaterPh,
  calculateYeastStarter,
  classifyApparentAttenuation,
  convertBrewingUnitGroup,
  correctHydrometer,
  correctRefractometer,
  gravityToSg,
  residualCo2VolumesAtTempC,
  roundTo,
  sgToBrix,
  sgToPlato,
  type ApparentAttenuationBand,
  type BitternessFormula,
  type BrewingSaltId,
  type CalculatorGravityUnit,
  type HopAdditionInput,
  type RefractometerFormula,
  type RefractometerMode,
  type SaltAddition
} from "@nb/brewing-core";

import {
  buildCalculatorHref,
  calculatorBySlug,
  calculators,
  type CalculatorCatalogItem,
  type CalculatorSlug
} from "./catalog";

export type CalculatorFieldOption = {
  value: string;
  label: string;
};

export type ScalarCalculatorField = {
  kind: "number" | "select" | "date";
  name: string;
  label: string;
  helper?: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  options?: CalculatorFieldOption[];
  advanced?: boolean;
};

export type ArrayCalculatorField = {
  kind: "array";
  name: string;
  label: string;
  helper?: string;
  addLabel: string;
  minRows?: number;
  fields: ScalarCalculatorField[];
  advanced?: boolean;
};

export type CalculatorField = ScalarCalculatorField | ArrayCalculatorField;

export type CalculatorState = Record<string, unknown>;

export type CalculatorResultStat = {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "good" | "warning";
};

export type CalculatorResultLink = {
  label: string;
  href: string;
};

export type CalculatorResult = {
  primary: CalculatorResultStat;
  stats: CalculatorResultStat[];
  warnings?: string[];
  links?: CalculatorResultLink[];
};

export type CalculatorDefinition = {
  catalog: CalculatorCatalogItem;
  defaults: CalculatorState;
  fields: CalculatorField[];
  calculate: (state: CalculatorState) => CalculatorResult;
  applyQuery?: (state: CalculatorState, params: Record<string, string>) => CalculatorState;
};

const n = (value: unknown, fallback = 0): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const s = (value: unknown, fallback = ""): string => (
  typeof value === "string" && value.trim() !== "" ? value : fallback
);

const rows = (value: unknown): Array<Record<string, unknown>> => (
  Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row))) : []
);

const dateValue = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const compactNumber = (value: number, decimals = 1): string => {
  const rounded = roundTo(value, decimals);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const formatLiters = (value: number) => `${compactNumber(value, 2)} л`;
const formatGrams = (value: number) => `${compactNumber(value, 1)} г`;
const formatPercent = (value: number, decimals = 1) => `${compactNumber(value, decimals)}%`;
const formatSg = (value: number) => value.toFixed(3);
const formatPressure = (psi: number, bar: number, kpa: number) => `${compactNumber(psi, 1)} PSI / ${compactNumber(bar, 2)} bar / ${compactNumber(kpa, 0)} kPa`;

const numberField = (
  name: string,
  label: string,
  unit?: string,
  extra: Partial<ScalarCalculatorField> = {}
): ScalarCalculatorField => ({
  kind: "number",
  name,
  label,
  unit,
  step: extra.step ?? 0.1,
  min: extra.min,
  max: extra.max,
  helper: extra.helper,
  advanced: extra.advanced
});

const selectField = (
  name: string,
  label: string,
  options: CalculatorFieldOption[],
  extra: Partial<ScalarCalculatorField> = {}
): ScalarCalculatorField => ({
  kind: "select",
  name,
  label,
  options,
  helper: extra.helper,
  advanced: extra.advanced
});

const dateField = (
  name: string,
  label: string,
  extra: Partial<ScalarCalculatorField> = {}
): ScalarCalculatorField => ({
  kind: "date",
  name,
  label,
  helper: extra.helper,
  advanced: extra.advanced
});

const calculator = (
  slug: CalculatorSlug,
  definition: Omit<CalculatorDefinition, "catalog">
): CalculatorDefinition => ({
  catalog: calculatorBySlug[slug],
  ...definition
});

const relatedLinks = (slugs: CalculatorSlug[]): CalculatorResultLink[] => (
  slugs.map((slug) => ({ label: calculatorBySlug[slug].shortTitle, href: calculatorBySlug[slug].href }))
);

const gravityUnitOptions = [
  { value: "SG", label: "SG" },
  { value: "Plato", label: "Plato" },
  { value: "Brix", label: "Brix" }
];

const sugarTypeOptions = [
  { value: "dextrose", label: "Декстроза" },
  { value: "sucrose", label: "Сахароза" },
  { value: "dme", label: "DME" },
  { value: "honey", label: "Мед" }
];

const hopUseLabels: Record<string, string> = {
  boil: "Кипячение",
  first_wort_hop: "FWH",
  whirlpool: "Whirlpool",
  dry_hop: "Dry hop",
  dip_hop: "Dip hop",
  other: "Другое"
};

const pitchStatusLabels = {
  underpitch: "Мало дрожжей",
  ok: "OK",
  overpitch: "С запасом"
} as const;

const formatHopUse = (use: HopAdditionInput["use"]) => hopUseLabels[String(use ?? "")] ?? "Другое";

const formatPitchStatus = (status: string) => (
  pitchStatusLabels[status as keyof typeof pitchStatusLabels] ?? status
);

const waterProfileFields = (prefix: string, advanced = false): ScalarCalculatorField[] => [
  numberField(`${prefix}Ca`, "Ca", "ppm", { min: 0, step: 1, advanced }),
  numberField(`${prefix}Mg`, "Mg", "ppm", { min: 0, step: 1, advanced }),
  numberField(`${prefix}Na`, "Na", "ppm", { min: 0, step: 1, advanced }),
  numberField(`${prefix}Cl`, "Cl", "ppm", { min: 0, step: 1, advanced }),
  numberField(`${prefix}So4`, "SO4", "ppm", { min: 0, step: 1, advanced }),
  numberField(`${prefix}Hco3`, "HCO3", "ppm", { min: 0, step: 1, advanced })
];

const buildProfile = (state: CalculatorState, prefix: string) => ({
  ca: n(state[`${prefix}Ca`]),
  mg: n(state[`${prefix}Mg`]),
  na: n(state[`${prefix}Na`]),
  cl: n(state[`${prefix}Cl`]),
  so4: n(state[`${prefix}So4`]),
  hco3: n(state[`${prefix}Hco3`])
});

const buildSalts = (state: CalculatorState): SaltAddition[] => {
  const saltMap: Array<[BrewingSaltId, string]> = [
    ["calcium_chloride", "cacl2G"],
    ["gypsum", "caso4G"],
    ["epsom_salt", "mgso4G"],
    ["table_salt", "naclG"],
    ["baking_soda", "nahco3G"]
  ];

  return saltMap
    .map(([salt, key]) => ({ salt, grams: n(state[key]) }))
    .filter((addition) => addition.grams > 0);
};

// ── Refractometer correction: shared input marshalling + view model ─────────────
// The keys "novotny"/"terrill" are historical; the displayed names are the corrected
// attribution (see RefractometerFormula in @nb/brewing-core). Keys stay stable so saved
// state and shared links keep working; only the coefficients are authoritative.
export const REFRACTOMETER_FORMULA_OPTIONS: CalculatorFieldOption[] = [
  { value: "novotny", label: "Terrill (кубическая)" },
  { value: "terrill", label: "Bonham (Brewer's Friend)" }
];

export const refractometerOgUnitOptions: CalculatorFieldOption[] = [
  { value: "Brix", label: "Brix" },
  { value: "SG", label: "SG" },
  { value: "Plato", label: "°P" }
];

export const refractometerOgDefault = (unit: string): number => (unit === "SG" ? 1.05 : 12.4);

type RefractometerInput = Parameters<typeof correctRefractometer>[0];

// Marshal calculator state into the core input. The OG unit decides WCF routing:
// SG is a known/true gravity (no WCF), Brix/°P are raw refractometer readings (÷ WCF).
export const readRefractometerInput = (state: CalculatorState): {
  input: RefractometerInput;
  originalUnit: CalculatorGravityUnit;
  originalValue: number;
  ogSg: number;
} => {
  const mode = s(state.mode, "post_fermentation") as RefractometerMode;
  const currentBrix = n(state.currentBrix, 6.5);
  const wortCorrectionFactor = n(state.wortCorrectionFactor, 1.04);
  const formula = s(state.formula, "novotny") as RefractometerFormula;
  const originalUnit = s(state.originalUnit, "Brix") as CalculatorGravityUnit;
  const originalValue = n(state.originalValue, refractometerOgDefault(originalUnit));

  const input: RefractometerInput = { mode, currentBrix, wortCorrectionFactor, formula };

  let ogSg: number;
  if (originalUnit === "SG") {
    input.originalGravity = originalValue;
    ogSg = originalValue;
  } else {
    input.originalBrix = originalValue;
    ogSg = brixToSg(originalValue / wortCorrectionFactor);
  }

  return { input, originalUnit, originalValue, ogSg };
};

export type RefractometerView = {
  mode: RefractometerMode;
  corrected: { sg: number; plato: number; brix: number };
  estimatedABV: number;
  attenuation: number;
  attenuationBand: ApparentAttenuationBand | null;
  ogSg: number;
};

export const computeRefractometerView = (state: CalculatorState): RefractometerView => {
  const { input, ogSg } = readRefractometerInput(state);
  const result = correctRefractometer(input);
  // All three units describe the SAME corrected gravity, derived from corrected SG.
  // (result.correctedBrix is the corrected *current reading*, not the final gravity in Brix.)
  const corrected = {
    sg: result.correctedSG,
    plato: result.correctedPlato,
    brix: sgToBrix(result.correctedSG)
  };

  if (input.mode === "pre_fermentation") {
    return { mode: input.mode, corrected, estimatedABV: 0, attenuation: 0, attenuationBand: null, ogSg };
  }

  return {
    mode: input.mode,
    corrected,
    estimatedABV: result.estimatedABV,
    attenuation: result.attenuation,
    attenuationBand: classifyApparentAttenuation(result.attenuation),
    ogSg
  };
};

export const calculatorDefinitions: CalculatorDefinition[] = [
  calculator("dilution-boiloff", {
    defaults: {
      mode: "dilute_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.06,
      targetGravity: 1.05,
      targetVolumeL: 24,
      boilOffRateLPerHour: 4,
      additionType: "water"
    },
    fields: [
      selectField("mode", "Режим", [
        { value: "dilute_to_gravity", label: "Разбавить до целевой плотности" },
        { value: "boil_to_gravity", label: "Уварить до целевой плотности" },
        { value: "gravity_after_water", label: "Новая плотность после добавления воды" },
        { value: "gravity_after_boiloff", label: "Новая плотность после испарения" },
        { value: "add_extract_to_gravity", label: "Добавить DME/сахар до цели" },
        { value: "extra_boil_time", label: "Дополнительное время кипячения" }
      ]),
      numberField("currentVolumeL", "Текущий объем", "л", { min: 0.1 }),
      numberField("currentGravity", "Текущая плотность", "SG", { min: 1, step: 0.001 }),
      numberField("targetGravity", "Целевая плотность", "SG", { min: 1, step: 0.001 }),
      numberField("targetVolumeL", "Целевой объем", "л", { min: 0.1, advanced: true }),
      numberField("boilOffRateLPerHour", "Испарение", "л/ч", { min: 0, advanced: true }),
      selectField("additionType", "Что добавляем", [
        { value: "water", label: "Вода" },
        { value: "dme", label: "DME" },
        { value: "sugar", label: "Сахар" }
      ], { advanced: true })
    ],
    calculate: (state) => {
      const result = calculateDilutionBoiloff({
        mode: s(state.mode, "dilute_to_gravity") as Parameters<typeof calculateDilutionBoiloff>[0]["mode"],
        currentVolumeL: n(state.currentVolumeL, 20),
        currentGravity: n(state.currentGravity, 1.06),
        targetGravity: n(state.targetGravity, 1.05),
        targetVolumeL: n(state.targetVolumeL, 0),
        boilOffRateLPerHour: n(state.boilOffRateLPerHour, 0),
        additionType: s(state.additionType, "water") as Parameters<typeof calculateDilutionBoiloff>[0]["additionType"]
      });
      const extract = result.dmeToAddG || result.sugarToAddG;
      const primary = result.waterToAddL > 0
        ? { label: "Добавить воды", value: formatLiters(result.waterToAddL), helper: `Итоговая плотность ${formatSg(result.resultingGravity)}` }
        : result.volumeToBoilOffL > 0
          ? { label: "Уварить", value: formatLiters(result.volumeToBoilOffL), helper: result.extraBoilTimeMinutes ? `Около ${result.extraBoilTimeMinutes} мин` : undefined }
          : extract > 0
            ? { label: "Добавить экстракт", value: formatGrams(extract), helper: result.dmeToAddG ? "DME" : "Сахар" }
            : { label: "Итоговая плотность", value: formatSg(result.resultingGravity), helper: `Итоговый объем ${formatLiters(result.resultingVolumeL)}` };

      return {
        primary,
        stats: [
          { label: "Итоговый объем", value: formatLiters(result.resultingVolumeL) },
          { label: "Итоговая плотность", value: formatSg(result.resultingGravity) },
          { label: "Вода", value: formatLiters(result.waterToAddL) },
          { label: "Испарить", value: formatLiters(result.volumeToBoilOffL) },
          { label: "Доп. кипячение", value: `${result.extraBoilTimeMinutes} мин` },
          { label: "Экстракт/сахар", value: result.dmeToAddG ? formatGrams(result.dmeToAddG) : formatGrams(result.sugarToAddG) }
        ],
        links: [
          { label: "Использовать объем и SG в IBU", href: buildCalculatorHref("ibu", { postBoilVolume: result.resultingVolumeL, wortGravity: result.resultingGravity }) },
          ...relatedLinks(["abv-attenuation", "brewing-water-volume", "unit-converter"])
        ]
      };
    }
  }),
  calculator("abv-attenuation", {
    defaults: {
      og: 1.05,
      fg: 1.012,
      gravityUnit: "SG",
      abvFormula: "standard",
      servingSizeMl: 500
    },
    fields: [
      numberField("og", "OG", undefined, { min: 0, step: 0.001 }),
      numberField("fg", "FG", undefined, { min: 0, step: 0.001 }),
      selectField("gravityUnit", "Единицы плотности", gravityUnitOptions),
      selectField("abvFormula", "Формула ABV", [
        { value: "standard", label: "Стандартная" },
        { value: "alternate", label: "Альтернативная" }
      ], { advanced: true }),
      numberField("servingSizeMl", "Размер порции", "мл", { min: 1, step: 50, advanced: true })
    ],
    calculate: (state) => {
      const unit = s(state.gravityUnit, "SG") as "SG" | "Plato" | "Brix";
      const og = gravityToSg(n(state.og, 1.05), unit);
      const fg = gravityToSg(n(state.fg, 1.012), unit);
      const result = calculateAbvAttenuation({
        og,
        fg,
        formula: s(state.abvFormula, "standard") as "standard" | "alternate",
        servingSizeMl: n(state.servingSizeMl, 500)
      });

      return {
        primary: { label: "ABV", value: formatPercent(result.abv, 2), helper: `Видимое сбраживание ${formatPercent(result.apparentAttenuation)}` },
        stats: [
          { label: "ABW", value: formatPercent(result.abw, 2) },
          { label: "Сбраживание", value: formatPercent(result.apparentAttenuation) },
          { label: "Калории", value: `${result.calories} ккал`, helper: `${compactNumber(n(state.servingSizeMl, 500), 0)} мл` },
          { label: "OG / FG", value: `${formatSg(og)} / ${formatSg(fg)}` }
        ],
        links: relatedLinks(["priming-sugar", "keg-carbonation", "refractometer-correction", "hydrometer-correction", "unit-converter"])
      };
    }
  }),
  calculator("refractometer-correction", {
    defaults: {
      mode: "post_fermentation",
      currentBrix: 6.5,
      originalValue: 12.4,
      originalUnit: "Brix",
      wortCorrectionFactor: 1.04,
      formula: "novotny"
    },
    // Fields drive query (de)serialization and the localStorage allowlist. Inputs are
    // rendered by a dedicated block (RefractometerFieldsBlock), so the labels here are a
    // fallback only — but the list must still enumerate every persisted/shared key.
    fields: [
      selectField("mode", "Режим", [
        { value: "pre_fermentation", label: "До брожения" },
        { value: "post_fermentation", label: "Во время/после брожения" }
      ]),
      numberField("currentBrix", "Текущий Brix", "Brix", { min: 0, step: 0.1 }),
      numberField("originalValue", "Начальное OG", "Brix", { min: 0, step: 0.1 }),
      selectField("originalUnit", "Единица OG", refractometerOgUnitOptions),
      numberField("wortCorrectionFactor", "WCF", undefined, { min: 0.8, step: 0.01, advanced: true }),
      selectField("formula", "Формула после брожения", REFRACTOMETER_FORMULA_OPTIONS, { advanced: true })
    ],
    // Migrate legacy shared links (originalGravity in SG / originalBrix in raw Brix) to the
    // unified originalValue + originalUnit model. New links already carry the new keys.
    applyQuery: (state, params) => {
      if (params.originalValue != null) {
        return state;
      }
      if (params.originalGravity != null) {
        return { ...state, originalValue: params.originalGravity, originalUnit: "SG" };
      }
      if (params.originalBrix != null) {
        return { ...state, originalValue: params.originalBrix, originalUnit: "Brix" };
      }
      return state;
    },
    calculate: (state) => {
      const view = computeRefractometerView(state);
      const { corrected, ogSg, mode } = view;
      const sg = corrected.sg.toFixed(3);
      const plato = corrected.plato.toFixed(1);
      const brix = corrected.brix.toFixed(1);

      const stats: CalculatorResultStat[] = [
        { label: "°P", value: `${plato} °P` },
        { label: "Brix", value: `${brix} Brix` }
      ];
      const links: CalculatorResultLink[] = [];

      if (mode === "post_fermentation") {
        stats.push({ label: "ABV оценка", value: formatPercent(view.estimatedABV, 1) });
        stats.push({
          label: "Сбраживание",
          value: formatPercent(view.attenuation),
          tone: view.attenuationBand === "normal" ? "good" : "warning"
        });
        links.push({
          label: "Использовать как FG в ABV",
          href: buildCalculatorHref("abv-attenuation", { og: ogSg.toFixed(3), fg: corrected.sg.toFixed(3) })
        });
      }

      links.push(...relatedLinks(["hydrometer-correction", "unit-converter"]));

      return {
        primary: { label: "Скорр. плотность", value: `${sg} SG`, helper: `${plato} °P · ${brix} Brix` },
        stats,
        links
      };
    }
  }),
  calculator("hydrometer-correction", {
    defaults: {
      reading: 1.05,
      readingUnit: "SG",
      sampleTemperatureC: 30,
      calibrationTemperatureC: 20,
      instrumentOffset: 0
    },
    fields: [
      numberField("reading", "Показание", undefined, { min: 0, step: 0.001 }),
      selectField("readingUnit", "Единицы", gravityUnitOptions),
      numberField("sampleTemperatureC", "Температура пробы", "°C", { step: 0.5 }),
      numberField("calibrationTemperatureC", "Калибровка", "°C", { step: 0.5, advanced: true }),
      numberField("instrumentOffset", "Поправка прибора", "SG", { step: 0.001, advanced: true })
    ],
    calculate: (state) => {
      const result = correctHydrometer({
        reading: n(state.reading, 1.05),
        readingUnit: s(state.readingUnit, "SG") as "SG" | "Plato" | "Brix",
        sampleTemperatureC: n(state.sampleTemperatureC, 30),
        calibrationTemperatureC: n(state.calibrationTemperatureC, 20),
        instrumentOffset: n(state.instrumentOffset, 0)
      });

      return {
        primary: { label: "Скорр. SG", value: result.correctedSG.toFixed(3), helper: `${result.correctedPlato.toFixed(2)} °P` },
        stats: [
          { label: "Скорр. Plato", value: `${result.correctedPlato.toFixed(2)} °P` },
          { label: "Поправка", value: `${(result.correctedSG - gravityToSg(n(state.reading, 1.05), s(state.readingUnit, "SG") as "SG" | "Plato" | "Brix")).toFixed(4)} SG` }
        ],
        links: [
          { label: "Использовать как OG в ABV", href: buildCalculatorHref("abv-attenuation", { og: result.correctedSG.toFixed(3) }) },
          ...relatedLinks(["refractometer-correction", "unit-converter"])
        ]
      };
    }
  }),
  calculator("ibu", {
    defaults: {
      postBoilVolumeL: 20,
      wortGravity: 1.05,
      formula: "tinseth_whirlpool_v2",
      boilTimeMinutes: 60,
      whirlpoolTemperatureC: 85,
      additions: [
        { name: "Горечь", amountG: 20, alphaAcidPercent: 10, timeMinutes: 60, use: "boil", form: "pellet", whirlpoolTemperatureC: 85 },
        { name: "Аромат", amountG: 30, alphaAcidPercent: 8, timeMinutes: 15, use: "whirlpool", form: "pellet", whirlpoolTemperatureC: 85 }
      ]
    },
    applyQuery: (state, params) => {
      if (!params.aa) return state;
      const currentRows = rows(state.additions);
      const first = currentRows[0] ?? {};
      return { ...state, additions: [{ ...first, alphaAcidPercent: params.aa }, ...currentRows.slice(1)] };
    },
    fields: [
      numberField("postBoilVolumeL", "Объем после кипа", "л", { min: 0.1 }),
      numberField("wortGravity", "Плотность сусла", "SG", { min: 1, step: 0.001 }),
      selectField("formula", "Формула", [
        { value: "tinseth_whirlpool_v2", label: "Tinseth + whirlpool" },
        { value: "tinseth_classic", label: "Tinseth classic" },
        { value: "rager", label: "Rager" }
      ]),
      {
        kind: "array",
        name: "additions",
        label: "Внесения хмеля",
        addLabel: "Добавить внесение",
        minRows: 1,
        fields: [
          numberField("amountG", "Масса", "г", { min: 0 }),
          numberField("alphaAcidPercent", "AA", "%", { min: 0, step: 0.1 }),
          numberField("timeMinutes", "Время", "мин", { min: 0, step: 1 }),
          selectField("use", "Тип", [
            { value: "boil", label: hopUseLabels.boil },
            { value: "first_wort_hop", label: hopUseLabels.first_wort_hop },
            { value: "whirlpool", label: hopUseLabels.whirlpool },
            { value: "dry_hop", label: hopUseLabels.dry_hop }
          ]),
          selectField("form", "Форма", [
            { value: "pellet", label: "Гранулы" },
            { value: "leaf", label: "Листовой" }
          ]),
          numberField("whirlpoolTemperatureC", "Темп. whirlpool", "°C", { min: 0, step: 1, advanced: true })
        ]
      },
      numberField("boilTimeMinutes", "Длительность кипа", "мин", { min: 0, step: 5, advanced: true }),
      numberField("whirlpoolTemperatureC", "Темп. whirlpool", "°C", { min: 0, step: 1, advanced: true })
    ],
    calculate: (state) => {
      const additions: HopAdditionInput[] = rows(state.additions).map((row, index) => ({
        id: `hop-${index}`,
        name: s(row.name, `Hop ${index + 1}`),
        alphaAcidPercent: n(row.alphaAcidPercent, 8),
        weightG: n(row.amountG, 20),
        boilTimeMinutes: n(row.timeMinutes, 60),
        use: s(row.use, "boil") as HopAdditionInput["use"],
        temperatureC: n(row.whirlpoolTemperatureC, n(state.whirlpoolTemperatureC, 85)),
        utilizationFactor: s(row.form, "pellet") === "leaf" ? 0.9 : 1
      }));
      const result = calculateBitterness({
        formula: s(state.formula, "tinseth_whirlpool_v2") as BitternessFormula,
        og: n(state.wortGravity, 1.05),
        batchVolumeL: n(state.postBoilVolumeL, 20),
        postBoilVolumeL: n(state.postBoilVolumeL, 20),
        boilTimeMinutes: n(state.boilTimeMinutes, 60),
        whirlpoolTemperatureC: n(state.whirlpoolTemperatureC, 85),
        hopAdditions: additions
      });
      const bugu = result.ibu / Math.max(1, (n(state.wortGravity, 1.05) - 1) * 1000);

      return {
        primary: { label: "IBU всего", value: compactNumber(result.ibu, 1), helper: `BU:GU ${bugu.toFixed(2)}` },
        stats: [
          { label: "BU:GU", value: bugu.toFixed(2) },
          { label: "Внесений", value: String(additions.length) },
          ...result.contributions.slice(0, 4).map((item, index) => ({
            label: `${index + 1}. ${formatHopUse(item.use)}`,
            value: `${compactNumber(item.ibu, 1)} IBU`,
            helper: item.isCarryover ? "перенос" : undefined
          }))
        ],
        warnings: result.warnings.map((warning) => warning.replaceAll("_", " ")),
        links: relatedLinks(["hop-freshness", "dilution-boiloff", "beer-color", "unit-converter"])
      };
    }
  }),
  calculator("priming-sugar", {
    defaults: {
      beerVolumeL: 20,
      beerTemperatureC: 20,
      targetCo2Volumes: 2.4,
      sugarType: "dextrose",
      mode: "bulk",
      bottleSizeL: 0.5
    },
    applyQuery: (state, params) => ({ ...state, beerVolumeL: params.volume ?? state.beerVolumeL }),
    fields: [
      numberField("beerVolumeL", "Объем пива", "л", { min: 0.1 }),
      numberField("beerTemperatureC", "Температура пива", "°C", { step: 0.5 }),
      numberField("targetCo2Volumes", "Целевой CO2", "vol", { min: 0, step: 0.1 }),
      selectField("sugarType", "Тип сахара", sugarTypeOptions),
      selectField("mode", "Режим", [
        { value: "bulk", label: "Общий объем" },
        { value: "perBottle", label: "На бутылку" }
      ], { advanced: true }),
      numberField("bottleSizeL", "Размер бутылки", "л", { min: 0.1, step: 0.01, advanced: true })
    ],
    calculate: (state) => {
      const result = calculatePrimingSugar({
        beerVolumeL: n(state.beerVolumeL, 20),
        beerTemperatureC: n(state.beerTemperatureC, 20),
        targetCo2Volumes: n(state.targetCo2Volumes, 2.4),
        sugarType: s(state.sugarType, "dextrose") as "dextrose" | "sucrose" | "dme" | "honey",
        bottleSizeL: n(state.bottleSizeL, 0.5)
      });

      return {
        primary: { label: "Всего сахара", value: formatGrams(result.totalSugarGrams), helper: `${result.gramsPerLiter.toFixed(2)} г/л` },
        stats: [
          { label: "На бутылку", value: formatGrams(result.gramsPerBottle) },
          { label: "Остаточный CO2", value: `${result.residualCo2.toFixed(2)} vol` },
          { label: "Целевой CO2", value: `${compactNumber(n(state.targetCo2Volumes, 2.4), 1)} vol` }
        ],
        links: [
          { label: "Посчитать бутылки", href: buildCalculatorHref("bottling", { volume: n(state.beerVolumeL, 20), sugarPerLiter: result.gramsPerLiter }) },
          ...relatedLinks(["speise-krausen", "keg-carbonation", "abv-attenuation"])
        ]
      };
    }
  }),
  calculator("water-ph", {
    defaults: {
      sourceCa: 35,
      sourceMg: 8,
      sourceNa: 12,
      sourceCl: 35,
      sourceSo4: 55,
      sourceHco3: 90,
      targetCa: 80,
      targetMg: 10,
      targetNa: 20,
      targetCl: 90,
      targetSo4: 140,
      targetHco3: 60,
      mashWaterVolumeL: 15,
      spargeWaterVolumeL: 12,
      cacl2G: 2,
      caso4G: 3,
      mgso4G: 0,
      naclG: 0,
      nahco3G: 0,
      acid: "lactic_acid",
      totalGrainKg: 5,
      colorCategory: "pale",
      acidulatedMaltPercent: 0
    },
    applyQuery: (state, params) => ({
      ...state,
      mashWaterVolumeL: params.mashWater ?? state.mashWaterVolumeL,
      spargeWaterVolumeL: params.spargeWater ?? state.spargeWaterVolumeL
    }),
    fields: [
      numberField("mashWaterVolumeL", "Заторная вода", "л", { min: 0.1 }),
      numberField("spargeWaterVolumeL", "Промывочная вода", "л", { min: 0, advanced: true }),
      ...waterProfileFields("source"),
      ...waterProfileFields("target", true),
      numberField("cacl2G", "CaCl2", "г", { min: 0, step: 0.1 }),
      numberField("caso4G", "CaSO4", "г", { min: 0, step: 0.1 }),
      numberField("mgso4G", "MgSO4", "г", { min: 0, step: 0.1, advanced: true }),
      numberField("naclG", "NaCl", "г", { min: 0, step: 0.1, advanced: true }),
      numberField("nahco3G", "NaHCO3", "г", { min: 0, step: 0.1, advanced: true }),
      selectField("acid", "Кислота", [
        { value: "lactic_acid", label: "Молочная" },
        { value: "phosphoric_acid", label: "Фосфорная" }
      ], { advanced: true }),
      numberField("totalGrainKg", "Зерно", "кг", { min: 0.1, advanced: true }),
      selectField("colorCategory", "Цвет засыпи", [
        { value: "pale", label: "Светлая" },
        { value: "amber", label: "Янтарная" },
        { value: "dark", label: "Темная" }
      ], { advanced: true }),
      numberField("acidulatedMaltPercent", "Кислый солод", "%", { min: 0, step: 0.1, advanced: true })
    ],
    calculate: (state) => {
      const result = calculateWaterPh({
        sourceWaterProfile: buildProfile(state, "source"),
        targetWaterProfile: buildProfile(state, "target"),
        mashWaterVolumeL: n(state.mashWaterVolumeL, 15),
        spargeWaterVolumeL: n(state.spargeWaterVolumeL, 0),
        salts: buildSalts(state),
        acid: s(state.acid, "lactic_acid") as "lactic_acid" | "phosphoric_acid",
        totalGrainKg: n(state.totalGrainKg, 5),
        colorCategory: s(state.colorCategory, "pale") as "pale" | "amber" | "dark",
        acidulatedMaltPercent: n(state.acidulatedMaltPercent, 0)
      });

      return {
        primary: { label: "pH затора", value: result.estimatedMashPh.toFixed(2), helper: `SO4:Cl ${result.sulfateChlorideRatio ?? "—"}` },
        stats: [
          { label: "Ca", value: `${compactNumber(result.finalProfile.ca, 0)} ppm` },
          { label: "Mg", value: `${compactNumber(result.finalProfile.mg, 0)} ppm` },
          { label: "Na", value: `${compactNumber(result.finalProfile.na, 0)} ppm` },
          { label: "Cl", value: `${compactNumber(result.finalProfile.cl, 0)} ppm` },
          { label: "SO4", value: `${compactNumber(result.finalProfile.so4, 0)} ppm` },
          { label: "HCO3", value: `${compactNumber(result.finalProfile.hco3, 0)} ppm` },
          { label: "Кислота", value: `${compactNumber(result.acidNeededMl, 2)} мл` }
        ],
        warnings: result.warnings.map((warning) => warning.replaceAll("_", " ")),
        links: relatedLinks(["brewing-water-volume", "unit-converter", "beer-color"])
      };
    }
  }),
  calculator("yeast-starter", {
    defaults: {
      wortVolumeL: 20,
      gravity: 1.05,
      fermentationType: "ale",
      yeastType: "liquid",
      packsCount: 1,
      cellsPerPackBillion: 100,
      manufactureDate: "",
      viabilityPercent: 75,
      starterMode: "stirPlate"
    },
    fields: [
      numberField("wortVolumeL", "Объем сусла", "л", { min: 0.1 }),
      numberField("gravity", "Плотность", "SG", { min: 1, step: 0.001 }),
      selectField("fermentationType", "Тип брожения", [
        { value: "ale", label: "Эль" },
        { value: "lager", label: "Лагер" },
        { value: "hybrid", label: "Гибрид" }
      ]),
      selectField("yeastType", "Тип дрожжей", [
        { value: "dry", label: "Сухие" },
        { value: "liquid", label: "Жидкие" }
      ]),
      numberField("packsCount", "Пакеты", "шт", { min: 0, step: 1 }),
      numberField("cellsPerPackBillion", "Клеток в пакете", "млрд", { min: 0, step: 10 }),
      dateField("manufactureDate", "Дата производства", { advanced: true }),
      numberField("viabilityPercent", "Жизнеспособность", "%", { min: 0, max: 100, step: 1, advanced: true }),
      selectField("starterMode", "Стартер", [
        { value: "none", label: "Без стартера" },
        { value: "simple", label: "Простой" },
        { value: "stirPlate", label: "Мешалка" }
      ], { advanced: true })
    ],
    calculate: (state) => {
      const result = calculateYeastStarter({
        wortVolumeL: n(state.wortVolumeL, 20),
        gravity: n(state.gravity, 1.05),
        fermentationType: s(state.fermentationType, "ale") as "ale" | "lager" | "hybrid",
        yeastType: s(state.yeastType, "liquid") as "dry" | "liquid",
        packsCount: n(state.packsCount, 1),
        cellsPerPackBillion: n(state.cellsPerPackBillion, 100),
        manufactureDate: dateValue(state.manufactureDate),
        viabilityPercent: n(state.viabilityPercent, 75),
        starterMode: s(state.starterMode, "stirPlate") as "none" | "simple" | "stirPlate"
      });

      return {
        primary: {
          label: "Статус внесения",
          value: formatPitchStatus(result.pitchStatus),
          helper: result.starterVolumeL > 0 ? `${formatLiters(result.starterVolumeL)} стартера` : "Без стартера по расчету"
        },
        stats: [
          { label: "Нужно клеток", value: `${compactNumber(result.requiredCellsBillion, 0)} млрд` },
          { label: "Доступно", value: `${compactNumber(result.viableCellsBillion, 0)} млрд` },
          { label: "Жизнеспособность", value: formatPercent(result.viabilityPercent) },
          { label: "DME на стартер", value: formatGrams(result.dmeForStarterG) },
          { label: "°P", value: `${sgToPlato(n(state.gravity, 1.05)).toFixed(1)} °P` }
        ],
        links: relatedLinks(["abv-attenuation", "unit-converter"])
      };
    }
  }),
  calculator("keg-carbonation", {
    defaults: {
      mode: "carbonate",
      beerTemperatureC: 4,
      targetCo2Volumes: 2.4,
      pressureUnit: "PSI"
    },
    fields: [
      selectField("mode", "Режим", [
        { value: "carbonate", label: "Карбонизация" },
        { value: "serving", label: "Подача" },
        { value: "spunding", label: "Шпунтование" }
      ]),
      numberField("beerTemperatureC", "Температура пива", "°C", { step: 0.5 }),
      numberField("targetCo2Volumes", "Целевой CO2", "vol", { min: 0, step: 0.1 }),
      selectField("pressureUnit", "Единицы", [
        { value: "PSI", label: "PSI" },
        { value: "bar", label: "bar" },
        { value: "kPa", label: "kPa" }
      ], { advanced: true })
    ],
    calculate: (state) => {
      const result = calculateKegCarbonationPressure({
        beerTemperatureC: n(state.beerTemperatureC, 4),
        targetCo2Volumes: n(state.targetCo2Volumes, 2.4),
        mode: s(state.mode, "carbonate") as "carbonate" | "serving" | "spunding"
      });

      return {
        primary: { label: "Давление", value: formatPressure(result.psi, result.bar, result.kpa), helper: "Равновесное давление при температуре пива" },
        stats: [
          { label: "PSI", value: compactNumber(result.psi, 1) },
          { label: "bar", value: compactNumber(result.bar, 2) },
          { label: "kPa", value: compactNumber(result.kpa, 0) }
        ],
        warnings: result.warnings.map((warning) => warning.replaceAll("_", " ")),
        links: [
          { label: "Конвертер давления", href: buildCalculatorHref("unit-converter", { group: "pressure", value: result.psi, from: "PSI" }) },
          ...relatedLinks(["priming-sugar", "speise-krausen", "abv-attenuation"])
        ]
      };
    }
  }),
  calculator("brewing-water-volume", {
    defaults: {
      targetFermenterVolumeL: 20,
      grainWeightKg: 5,
      mashThicknessLPerKg: 3,
      boilTimeMinutes: 60,
      boilOffRateLPerHour: 4,
      grainAbsorptionLPerKg: 0.8,
      kettleLossL: 0.5,
      trubChillerLossL: 1,
      coolingShrinkagePercent: 4,
      methodPreset: "mashTunWithSparge"
    },
    fields: [
      numberField("targetFermenterVolumeL", "В ферментер", "л", { min: 0.1 }),
      numberField("grainWeightKg", "Зерно", "кг", { min: 0 }),
      numberField("mashThicknessLPerKg", "Гидромодуль", "л/кг", { min: 0, step: 0.1 }),
      numberField("boilTimeMinutes", "Кипячение", "мин", { min: 0, step: 5 }),
      numberField("boilOffRateLPerHour", "Испарение", "л/ч", { min: 0, step: 0.1 }),
      numberField("grainAbsorptionLPerKg", "Впитывание зерна", "л/кг", { min: 0, step: 0.05, advanced: true }),
      numberField("kettleLossL", "Потери в котле", "л", { min: 0, advanced: true }),
      numberField("trubChillerLossL", "Осадок/чиллер", "л", { min: 0, advanced: true }),
      numberField("coolingShrinkagePercent", "Усадка охлаждения", "%", { min: 0, advanced: true }),
      selectField("methodPreset", "Метод", [
        { value: "BIAB", label: "BIAB" },
        { value: "allInOne", label: "All-in-one система" },
        { value: "mashTunWithSparge", label: "Заторник + промывка" },
        { value: "extract", label: "Экстракт" }
      ], { advanced: true })
    ],
    calculate: (state) => {
      const result = calculateBrewingWaterVolume({
        targetFermenterVolumeL: n(state.targetFermenterVolumeL, 20),
        grainWeightKg: n(state.grainWeightKg, 5),
        mashThicknessLPerKg: n(state.mashThicknessLPerKg, 3),
        boilTimeMinutes: n(state.boilTimeMinutes, 60),
        boilOffRateLPerHour: n(state.boilOffRateLPerHour, 4),
        grainAbsorptionLPerKg: n(state.grainAbsorptionLPerKg, 0.8),
        kettleLossL: n(state.kettleLossL, 0.5),
        trubChillerLossL: n(state.trubChillerLossL, 1),
        coolingShrinkagePercent: n(state.coolingShrinkagePercent, 4),
        methodPreset: s(state.methodPreset, "mashTunWithSparge") as "BIAB" | "allInOne" | "mashTunWithSparge" | "extract"
      });

      return {
        primary: { label: "Всего воды", value: formatLiters(result.totalWaterNeededL), helper: `Затор ${formatLiters(result.mashWaterL)} · промывка ${formatLiters(result.spargeWaterL)}` },
        stats: [
          { label: "Затор", value: formatLiters(result.mashWaterL) },
          { label: "Промывка", value: formatLiters(result.spargeWaterL) },
          { label: "До кипа", value: formatLiters(result.preBoilVolumeL) },
          { label: "После кипа", value: formatLiters(result.postBoilHotVolumeL) },
          { label: "Холодный объем", value: formatLiters(result.postBoilCoolVolumeL) },
          { label: "В ферментер", value: formatLiters(result.intoFermenterVolumeL) }
        ],
        links: [
          { label: "Использовать объемы в воде и pH", href: buildCalculatorHref("water-ph", { mashWater: result.mashWaterL, spargeWater: result.spargeWaterL }) },
          ...relatedLinks(["dilution-boiloff", "ibu", "unit-converter"])
        ]
      };
    }
  }),
  calculator("beer-color", {
    defaults: {
      batchVolumeL: 20,
      fermentables: [
        { weightKg: 4.5, colorLovibond: 2 },
        { weightKg: 0.3, colorLovibond: 40 }
      ]
    },
    fields: [
      numberField("batchVolumeL", "Объем партии", "л", { min: 0.1 }),
      {
        kind: "array",
        name: "fermentables",
        label: "Сбраживаемые",
        addLabel: "Добавить солод",
        minRows: 1,
        fields: [
          numberField("weightKg", "Вес", "кг", { min: 0, step: 0.1 }),
          numberField("colorLovibond", "Цвет", "Lovibond", { min: 0, step: 0.5 })
        ]
      }
    ],
    calculate: (state) => {
      const result = calculateBeerColorSimple({
        batchVolumeL: n(state.batchVolumeL, 20),
        fermentables: rows(state.fermentables).map((row) => ({
          weightKg: n(row.weightKg, 0),
          colorLovibond: n(row.colorLovibond, 0)
        }))
      });

      return {
        primary: { label: "Цвет", value: `${result.srm.toFixed(1)} SRM / ${result.ebc.toFixed(0)} EBC`, helper: `MCU ${result.mcu.toFixed(1)}` },
        stats: [
          { label: "SRM", value: result.srm.toFixed(1) },
          { label: "EBC", value: result.ebc.toFixed(1) },
          { label: "MCU", value: result.mcu.toFixed(2) },
          ...result.contributions.slice(0, 3).map((item, index) => ({ label: `Сбраживаемое ${index + 1}`, value: `${item.srm.toFixed(1)} SRM`, helper: `MCU ${item.mcu}` }))
        ],
        links: relatedLinks(["ibu", "water-ph", "unit-converter"])
      };
    }
  }),
  calculator("bottling", {
    defaults: {
      beerVolumeL: 20,
      packagingLossL: 0,
      mode: "singleSize",
      bottleSizeL: 0.5,
      sugarPerLiter: 0
    },
    applyQuery: (state, params) => ({
      ...state,
      beerVolumeL: params.volume ?? state.beerVolumeL,
      sugarPerLiter: params.sugarPerLiter ?? state.sugarPerLiter
    }),
    fields: [
      numberField("beerVolumeL", "Объем пива", "л", { min: 0.1 }),
      numberField("packagingLossL", "Потери розлива", "л", { min: 0, advanced: true }),
      selectField("mode", "Режим", [
        { value: "singleSize", label: "Один размер" },
        { value: "mixed", label: "Смешанный" }
      ]),
      selectField("bottleSizeL", "Бутылка", [
        { value: "0.33", label: "0.33 л" },
        { value: "0.45", label: "0.45 л" },
        { value: "0.5", label: "0.5 л" },
        { value: "0.75", label: "0.75 л" },
        { value: "1", label: "1.0 л" }
      ]),
      numberField("sugarPerLiter", "Сахар на литр", "г/л", { min: 0, step: 0.1, advanced: true })
    ],
    calculate: (state) => {
      const result = calculateBottling({
        beerVolumeL: n(state.beerVolumeL, 20),
        packagingLossL: n(state.packagingLossL, 0),
        bottleSizesL: [n(state.bottleSizeL, 0.5)],
        sugarPerLiter: n(state.sugarPerLiter, 0)
      });

      return {
        primary: { label: "Бутылок нужно", value: `${result.bottlesNeeded} шт`, helper: `Остаток ${formatLiters(result.remainingVolumeL)}` },
        stats: [
          { label: "Объем розлива", value: formatLiters(result.packageVolumeL) },
          { label: "Остаток", value: formatLiters(result.remainingVolumeL) },
          { label: "Сахар на бутылку", value: formatGrams(result.sugarPerBottleG) }
        ],
        links: [
          { label: "Посчитать сахар", href: buildCalculatorHref("priming-sugar", { volume: result.packageVolumeL }) },
          ...relatedLinks(["speise-krausen", "unit-converter"])
        ]
      };
    }
  }),
  calculator("speise-krausen", {
    defaults: {
      mode: "speise",
      beerVolumeL: 20,
      targetCo2: 2.4,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20
    },
    fields: [
      selectField("mode", "Режим", [
        { value: "speise", label: "Speise" },
        { value: "krausen", label: "Krausen" },
        { value: "gyle", label: "Gyle" }
      ]),
      numberField("beerVolumeL", "Объем пива", "л", { min: 0.1 }),
      numberField("targetCo2", "Целевой CO2", "vol", { min: 0, step: 0.1 }),
      numberField("residualCo2", "Остаточный CO2", "vol", { min: 0, step: 0.01 }),
      numberField("speiseGravity", "Плотность speise", "SG", { min: 1, step: 0.001 }),
      numberField("temperatureC", "Температура", "°C", { step: 0.5, advanced: true })
    ],
    calculate: (state) => {
      const result = calculateSpeiseKrausen({
        mode: s(state.mode, "speise") as "speise" | "krausen" | "gyle",
        beerVolumeL: n(state.beerVolumeL, 20),
        targetCo2: n(state.targetCo2, 2.4),
        residualCo2: n(state.residualCo2, 0.86),
        speiseGravity: n(state.speiseGravity, 1.05),
        temperatureC: n(state.temperatureC, 20)
      });

      return {
        primary: { label: "Добавить сусло", value: formatLiters(result.speiseVolumeToAddL), helper: `Финальный объем ${formatLiters(result.finalVolumeL)}` },
        stats: [
          { label: "Финальный объем", value: formatLiters(result.finalVolumeL) },
          { label: "Изменение ABV", value: formatPercent(result.approximateAbvChange, 2) },
          { label: "Остаточный CO2", value: `${compactNumber(n(state.residualCo2, 0.86), 2)} vol` }
        ],
        links: relatedLinks(["priming-sugar", "bottling", "keg-carbonation", "unit-converter"])
      };
    }
  }),
  calculator("hop-freshness", {
    defaults: {
      originalAlphaAcidPercent: 10,
      packageDate: "2025-05-04",
      openedDate: "",
      storageTemperatureC: 4,
      packaging: "vacuum",
      form: "pellet",
      hsi: 0.25,
      targetAmountG: 50
    },
    fields: [
      numberField("originalAlphaAcidPercent", "Исходный AA", "%", { min: 0, step: 0.1 }),
      dateField("packageDate", "Дата упаковки"),
      dateField("openedDate", "Дата вскрытия", { advanced: true }),
      numberField("storageTemperatureC", "Температура хранения", "°C", { step: 1 }),
      selectField("packaging", "Упаковка", [
        { value: "vacuum", label: "Вакуум" },
        { value: "nitrogen", label: "Азот" },
        { value: "opened", label: "Вскрытая" },
        { value: "loose", label: "Негерметичная" }
      ]),
      selectField("form", "Форма", [
        { value: "pellet", label: "Гранулы" },
        { value: "leaf", label: "Листовой" }
      ]),
      numberField("hsi", "HSI", undefined, { min: 0, step: 0.01, advanced: true }),
      numberField("targetAmountG", "Исходная масса", "г", { min: 0, step: 1, advanced: true })
    ],
    calculate: (state) => {
      const result = calculateHopFreshness({
        originalAlphaAcidPercent: n(state.originalAlphaAcidPercent, 10),
        packageDate: dateValue(state.packageDate) ?? new Date(),
        openedDate: dateValue(state.openedDate),
        storageTemperatureC: n(state.storageTemperatureC, 4),
        packaging: s(state.packaging, "vacuum") as "vacuum" | "nitrogen" | "opened" | "loose",
        form: s(state.form, "pellet") as "pellet" | "leaf",
        hsi: n(state.hsi, 0.25),
        targetAmountG: n(state.targetAmountG, 0)
      });

      return {
        primary: { label: "Текущий AA", value: formatPercent(result.estimatedCurrentAA, 2), helper: `Коэф. свежести ${result.freshnessFactor}` },
        stats: [
          { label: "Свежесть", value: formatPercent(result.freshnessFactor * 100) },
          { label: "Масса для той же IBU", value: formatGrams(result.suggestedAmountForSameIbuG) }
        ],
        links: [
          { label: "Использовать новый AA% в IBU", href: buildCalculatorHref("ibu", { aa: result.estimatedCurrentAA }) },
          ...relatedLinks(["unit-converter"])
        ]
      };
    }
  }),
  calculator("unit-converter", {
    defaults: {
      group: "gravity",
      value: 1.05,
      from: "SG"
    },
    applyQuery: (state, params) => {
      if (params.psi) {
        return { ...state, group: "pressure", value: params.psi, from: "PSI" };
      }

      return state;
    },
    fields: [
      selectField("group", "Группа", [
        { value: "gravity", label: "Плотность" },
        { value: "color", label: "Цвет" },
        { value: "volume", label: "Объем" },
        { value: "weight", label: "Вес" },
        { value: "temperature", label: "Температура" },
        { value: "pressure", label: "Давление" },
        { value: "concentration", label: "Концентрации" }
      ]),
      numberField("value", "Значение", undefined, { step: 0.001 }),
      selectField("from", "Из", [
        { value: "SG", label: "SG" },
        { value: "points", label: "gravity points" },
        { value: "Plato", label: "Plato" },
        { value: "Brix", label: "Brix" },
        { value: "SRM", label: "SRM" },
        { value: "EBC", label: "EBC" },
        { value: "Lovibond", label: "Lovibond" },
        { value: "ml", label: "ml" },
        { value: "L", label: "L" },
        { value: "oz", label: "oz" },
        { value: "qt", label: "qt" },
        { value: "gal", label: "gal" },
        { value: "g", label: "g" },
        { value: "kg", label: "kg" },
        { value: "lb", label: "lb" },
        { value: "C", label: "°C" },
        { value: "F", label: "°F" },
        { value: "K", label: "K" },
        { value: "PSI", label: "PSI" },
        { value: "bar", label: "bar" },
        { value: "kPa", label: "kPa" },
        { value: "ppm", label: "ppm / mg/L" },
        { value: "g/L", label: "g/L" }
      ])
    ],
    calculate: (state) => {
      const group = s(state.group, "gravity") as Parameters<typeof convertBrewingUnitGroup>[0];
      const converted = convertBrewingUnitGroup(group, n(state.value, 0), s(state.from, "SG"));
      const entries = Object.entries(converted);
      const first = entries[0] ?? ["—", 0];

      return {
        primary: { label: first[0], value: String(first[1]), helper: `Из ${s(state.from, "SG")}` },
        stats: entries.map(([label, value]) => ({ label, value: String(value) })),
        links: relatedLinks(["abv-attenuation", "ibu", "water-ph", "keg-carbonation"])
      };
    }
  })
];

export const calculatorDefinitionBySlug = Object.fromEntries(
  calculatorDefinitions.map((definition) => [definition.catalog.slug, definition])
) as Record<CalculatorSlug, CalculatorDefinition>;

export const getCalculatorDefinition = (slug: string): CalculatorDefinition | null => (
  slug in calculatorDefinitionBySlug ? calculatorDefinitionBySlug[slug as CalculatorSlug] : null
);

export const allCalculatorSlugs = calculators.map((item) => item.slug);

export const parseCalculatorQuery = (params: Record<string, string | string[] | undefined>) => {
  const parsed: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value[0] != null) parsed[key] = value[0];
      continue;
    }

    if (value != null) {
      parsed[key] = value;
    }
  }

  return parsed;
};

export const initialCalculatorStateFromQuery = (
  definition: CalculatorDefinition,
  query: Record<string, string>,
  baseState: CalculatorState = definition.defaults
): CalculatorState => {
  const scalarFieldNames = new Set(
    definition.fields.flatMap((field) => field.kind === "array" ? [] : [field.name])
  );
  const next: CalculatorState = { ...baseState };

  for (const [key, value] of Object.entries(query)) {
    if (scalarFieldNames.has(key)) {
      next[key] = value;
    }
  }

  return definition.applyQuery ? definition.applyQuery(next, query) : next;
};

export const serializeCalculatorStateToQuery = (
  definition: CalculatorDefinition,
  state: CalculatorState
): URLSearchParams => {
  const params = new URLSearchParams();

  for (const field of definition.fields) {
    if (field.kind === "array") {
      continue;
    }

    const value = state[field.name];
    if (value == null || String(value).trim() === "") {
      continue;
    }

    params.set(field.name, String(value));
  }

  return params;
};

export const calculatorStorageKey = (slug: CalculatorSlug) => `hmelo.calculators.${slug}.lastState`;
