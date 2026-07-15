import {
  brixToSg,
  calculateAbvAttenuation,
  calculateBeerColorSimple,
  calculateBitterness,
  calculateBottling,
  calculateBrewingWaterVolume,
  calculateDilutionBoiloff,
  calculateHopFreshness,
  calculateInfusionStep,
  calculateKegCarbonationPressure,
  calculatePrimingSugar,
  calculateSpeiseKrausen,
  calculateStrikeWater,
  calculateWaterPh,
  calculateYeastStarter,
  classifyApparentAttenuation,
  convertBrewingUnitGroup,
  correctHydrometer,
  correctRefractometer,
  estimateBrewhouseEfficiency,
  FERMENTABLE_PPG_PRESETS,
  gravityToSg,
  predictOgAtEfficiency,
  residualCo2VolumesAtTempC,
  roundTo,
  sgToBrix,
  sgToPlato,
  solveWaterTargetProfile,
  type ApparentAttenuationBand,
  type BitternessFormula,
  type BrewingSaltId,
  type CalculatorGravityUnit,
  type FermentableGrainBillItem,
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

import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import type { IngredientCategory, IngredientSuggestionItem } from "@/features/ingredients/contracts";
import { fermentableAppliesMashEfficiency, getIngredientPotentialPpg } from "@/features/ingredients/technical-fields";
import { waterTargetProfileCatalog } from "@/features/recipes/water-target-profiles";
import { convertGravityFieldValue, convertGravityOffsetValue, formatGravity, formatGravitySecondary, fromCalculatorGravityUnit } from "@/features/system/gravity-units";

export type CalculatorFieldOption = {
  value: string;
  label: string;
};

export type CalculatorState = Record<string, unknown>;

export type ScalarCalculatorField = {
  // "ingredient" — только внутри строк ArrayCalculatorField.fields (см. ArrayFieldEditor):
  // рендерит IngredientPicker вместо обычного контрола, хранит свободный текст названия
  // в своём поле (ручной ввод без выбора из каталога — валиден) и умеет заполнять соседние
  // подполя строки при выборе ингредиента (см. onPick).
  kind: "number" | "select" | "date" | "ingredient";
  name: string;
  label: string;
  helper?: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  options?: CalculatorFieldOption[];
  advanced?: boolean;
  // kind: "ingredient" — категория каталога для IngredientPicker (напр. "fermentable").
  ingredientCategory?: IngredientCategory;
  // kind: "ingredient" — плейсхолдер строки поиска пикера.
  placeholder?: string;
  // kind: "ingredient" — при выборе элемента каталога решает, какие подполя ЭТОЙ ЖЕ строки
  // обновить (включая само название) — массив [имя_подполя, значение], по духу
  // transformOnChange. Свободный ввод текста (без выбора) идёт в значение поля как есть,
  // onPick не вызывается.
  onPick?: (item: IngredientSuggestionItem) => Array<[string, unknown]>;
  // Целочисленное поле (счётчики, минуты) — NumericInput переключает inputMode на "numeric"
  // и не пропускает разделитель дробной части.
  integer?: boolean;
  // "segmented" рендерит select через SegmentedControl (2-4 равных по ширине опции в один
  // ряд); "chips" — переносящиеся по строкам пилюли авто-ширины (для опций с длинными,
  // разной длины подписями, которые не влезают в segmented). Оба вместо нативного <select>.
  variant?: "segmented" | "chips";
  // Растянуть поле на всю ширину грида (обе колонки sm:grid-cols-2). Для chips с длинными
  // подписями (иначе они переносятся вразнобой в узкой полуколонке) и широких контролов.
  fullWidth?: boolean;
  // Группирует поля внутри одного FieldsBlock под общим заголовком-разделителем (см.
  // water-ph). Поля без group идут как раньше, без заголовка — только до первой группы.
  // Смена group от поля к полю печатает новый заголовок; одинаковый group подряд — нет.
  group?: string;
  // Скрывает поле, когда текущий режим/состояние делает его нерелевантным.
  // Для полей внутри ArrayCalculatorField.fields вызывается как visibleWhen(state, row) —
  // строка доступна вторым аргументом; для обычных верхнеуровневых полей row не передаётся.
  visibleWhen?: (state: CalculatorState, row?: Record<string, unknown>) => boolean;
  // Динамический список опций select (например, скрыть неприменимую опцию в конкретном
  // режиме). Если задан — используется вместо статичного options.
  dynamicOptions?: (state: CalculatorState, row?: Record<string, unknown>) => CalculatorFieldOption[];
  // Динамическая подпись единицы у number-поля, когда единица выбирается другим контролом
  // (например, шкала плотности SG/°P). Если задан — используется вместо статичного unit.
  dynamicUnit?: (state: CalculatorState, row?: Record<string, unknown>) => string | undefined;
  // Динамический шаг number-поля — параллель dynamicUnit для случаев, когда шаг тоже
  // зависит от выбранной единицы (SG: 0.001, °P/°Bx: 0.1). Если задан — вместо статичного step.
  dynamicStep?: (state: CalculatorState, row?: Record<string, unknown>) => number | undefined;
  // Побочные обновления состояния при изменении значения этого поля — массив [имя, значение].
  // Пример: переключение шкалы плотности пересчитывает связанное число из старой шкалы в новую.
  // Вызывается со СТАРЫМ снимком state (до применения нового значения самого поля).
  transformOnChange?: (nextValue: string, state: CalculatorState) => Array<[string, unknown]>;
};

export type ArrayCalculatorField = {
  kind: "array";
  name: string;
  label: string;
  rowLabel?: string;
  helper?: string;
  addLabel: string;
  minRows?: number;
  fields: ScalarCalculatorField[];
  advanced?: boolean;
  // Скрывает всю секцию массива целиком (например, поле актуально только в одном режиме).
  visibleWhen?: (state: CalculatorState) => boolean;
};

export type CalculatorField = ScalarCalculatorField | ArrayCalculatorField;

export type CalculatorResultStat = {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "good" | "warning";
  // Цветовой чип рядом со значением (сейчас используется только в primary у beer-color).
  swatchColor?: string;
};

export type CalculatorResultWarning = {
  text: string;
  tone: "info" | "warning";
};

export type CalculatorResultLink = {
  label: string;
  href: string;
};

export type CalculatorResult = {
  // primary тоже читает tone (те же emerald/amber, что у stats) — красится ResultPanel.
  primary: CalculatorResultStat;
  stats: CalculatorResultStat[];
  // Строка — уже готовый русский текст с тоном warning (обратная совместимость).
  // Объект — код из coreWarningCopy/translateCoreWarnings с явным тоном info|warning.
  warnings?: Array<string | CalculatorResultWarning>;
  links?: CalculatorResultLink[];
};

export type CalculatorDefinition = {
  catalog: CalculatorCatalogItem;
  defaults: CalculatorState;
  fields: CalculatorField[];
  calculate: (state: CalculatorState) => CalculatorResult;
  applyQuery?: (state: CalculatorState, params: Record<string, string>) => CalculatorState;
  // Серая контекстная подсказка под блоком полей — что в текущем режиме главное
  // (аналог текста под SegmentedControl в RefractometerFieldsBlock). null — не показывать.
  modeHint?: (state: CalculatorState) => string | null;
  // Акцентная карточка-ссылка под полями: «для этого кейса — другой калькулятор». Заметнее
  // рядового чипа в блоке «Дальше»; для случаев, когда альтернативный метод — частый юзкейс
  // (напр. карбонизация суслом вместо сахара → шпайзе). href строится из текущего state.
  altMethod?: {
    title: string;
    description: string;
    href: (state: CalculatorState) => string;
  };
  // Разово чинит устаревшие значения из localStorage: удалённые опции select (осиротевшие
  // значения без соответствующего контрола) или изменившийся смысл дефолта (например,
  // beer-color раньше хранил цвет в Lovibond, а новый дефолт шкалы — EBC). Применяется к
  // распарсенному storedState ДО мержа с definition.defaults, только если storedState есть.
  migrateStoredState?: (stored: CalculatorState) => CalculatorState;
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

// Пустое поле — не "0", а "не указано": ядро само подставит оценку (по дате
// производства/температуре и т.п.), а не молча посчитает от нуля.
const nOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

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

// Словарь переводов кодов warning из @nb/brewing-core в готовый русский текст с тоном.
// info — постоянная сноска (не ошибка, без тревожной иконки), warning — требует внимания.
export const coreWarningCopy: Record<string, { text: string; tone: "info" | "warning" }> = {
  mash_ph_ballpark_estimate: { text: "Оценка pH ориентировочная — не замена pH-метру.", tone: "info" },
  mash_acid_model_practical_approximation: { text: "Расчет кислоты — практическое приближение, не точная лабораторная модель.", tone: "info" },
  high_sodium: { text: "Высокий натрий (>150 ppm) — возможен солоноватый привкус.", tone: "warning" },
  high_sulfate: { text: "Высокий сульфат (>350 ppm) — резкая, сухая горечь.", tone: "warning" },
  high_chloride: { text: "Высокий хлорид (>250 ppm) — риск излишней полноты/солоноватости.", tone: "warning" },
  target_already_reached: { text: "Целевой pH уже достигнут — кислота не нужна.", tone: "info" },
  target_not_reached_within_max_acid: { text: "Целевой pH не достигается разумной дозой кислоты — проверьте воду и засыпь.", tone: "warning" },
  dry_hop_ibu_ignored: { text: "Сухое охмеление почти не даёт горечи — в IBU не учитывается.", tone: "info" },
  hop_time_exceeds_boil_capped: { text: "Время внесения больше времени кипячения — для расчёта ограничено кипячением.", tone: "warning" },
  tinseth_classic_whirlpool_ignored: { text: "Классический Tinseth не считает вирпул — переключитесь на «Tinseth + вирпул».", tone: "warning" },
  whirlpool_unsupported_for_rager: { text: "Формула Rager не учитывает вирпул — это внесение не посчитано.", tone: "warning" },
  dry_hop_unsupported_for_rager: { text: "Формула Rager не учитывает сухое охмеление.", tone: "info" },
  boil_carryover_whirlpool_approximation: { text: "Догорчение в вирпуле — приближённая оценка.", tone: "info" },
  spunding_pressure_high: { text: "Давление выше 30 PSI — проверьте, на что рассчитан клапан и кег.", tone: "warning" },
  pressure_above_30_psi: { text: "Давление выше 30 PSI — проверьте, на что рассчитан клапан и кег.", tone: "warning" },
  target_volume_above_current: { text: "Целевой объём больше текущего — испарением его не получить. Проверьте «Целевой объём».", tone: "warning" },
  target_volume_below_current: { text: "Целевой объём меньше текущего — добавлением воды его не получить.", tone: "warning" },
  target_gravity_above_current: { text: "Целевая плотность выше текущей — разбавлением её не поднять, нужен экстракт.", tone: "warning" },
  target_gravity_below_current: { text: "Целевая плотность ниже текущей — уваривание её не снизит, нужна вода.", tone: "warning" },
  high_carbonation_bottle_risk: { text: "Выше ~3.5 об. CO2 — опасно для стандартной стеклянной бутылки.", tone: "warning" },
  residual_exceeds_target: { text: "В пиве уже не меньше CO2, чем цель — сахар не нужен.", tone: "info" },
  shrinkage_suspiciously_high: { text: "Усадка больше 20% — похоже на опечатку (обычно ~4%).", tone: "warning" },
  mash_water_capped: { text: "Вся вода уходит в затор — на промывку не остаётся.", tone: "info" },
  no_viable_cells: { text: "Живых клеток нет — стартеру не из чего расти.", tone: "warning" },
  hops_too_old: { text: "Хмель на пределе модели — расчёту не стоит доверять.", tone: "warning" },
  strike_temp_above_boiling: { text: "Расчётная температура воды выше кипения — с таким объёмом и гидромодулем цель недостижима. Добавьте воды или снизьте целевую температуру.", tone: "warning" },
  strike_temp_near_boiling: { text: "Расчётная температура воды у самого кипения — проверьте объём воды и зерна.", tone: "warning" },
  mash_thickness_unusual: { text: "Гидромодуль вне обычного диапазона 2–5 л/кг — проверьте объём воды и вес зерна.", tone: "warning" },
  infusion_temp_not_above_target: { text: "Долив не горячее целевой температуры — так затор не поднять. Увеличьте температуру долива.", tone: "warning" },
  infusion_volume_excessive: { text: "Долив больше 60% текущего объёма затора — проверьте температуры и объём воды.", tone: "warning" },
  infusion_step_downward: { text: "Следующая пауза не выше текущей — доливом температуру не снизить, долив не нужен.", tone: "info" },
  efficiency_above_100: { text: "Эффективность выше 100% — проверьте вес засыпи, объём партии и замер OG.", tone: "warning" },
  efficiency_low: { text: "Эффективность ниже 50% — необычно низко, проверьте засыпь и замер OG.", tone: "warning" },
  no_grain_bill: { text: "В засыпи нет зерна, которое затирается — эффективность посчитать не из чего.", tone: "warning" },
  no_grain_potential: { text: "Экстрактивность засыпи не задана (PPG = 0 у «Другое») — эффективность посчитать не из чего.", tone: "warning" },
  measured_og_below_extras: { text: "Замеренная плотность ниже вклада одних только экстрактов и сахара — проверьте замер или состав засыпи.", tone: "warning" },
  no_measured_points: { text: "Замеренная OG не выше 1.000 — эффективность посчитать не из чего.", tone: "warning" },
  mash_water_required: { text: "Укажите объём заторной воды больше нуля — без него температуру не посчитать.", tone: "warning" },
  salt_addition_capped: { text: "Подбор солей упёрся в лимит на одну соль — профиль достигнут не полностью.", tone: "warning" }
};

export const translateCoreWarnings = (codes: string[]): CalculatorResultWarning[] => (
  codes.map((code) => {
    const copy = coreWarningCopy[code];
    if (copy) {
      return copy;
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[calculators] неизвестный код предупреждения без перевода: ${code}`);
    }
    return { text: code, tone: "warning" as const };
  })
);

const numberField = (
  name: string,
  label: string,
  unit?: string,
  extra: Partial<ScalarCalculatorField> = {}
): ScalarCalculatorField => ({
  ...extra,
  kind: "number",
  name,
  label,
  unit,
  step: extra.step ?? 0.1
});

const selectField = (
  name: string,
  label: string,
  options: CalculatorFieldOption[],
  extra: Partial<ScalarCalculatorField> = {}
): ScalarCalculatorField => ({
  ...extra,
  kind: "select",
  name,
  label,
  options
});

const dateField = (
  name: string,
  label: string,
  extra: Partial<ScalarCalculatorField> = {}
): ScalarCalculatorField => ({
  ...extra,
  kind: "date",
  name,
  label
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

// ABV намеренно без Brix: показание рефрактометра после брожения занижает крепость,
// поэтому Brix-путь уводим в калькулятор поправки рефрактометра (он вернёт исправленный FG).
const abvGravityUnitOptions = [
  { value: "SG", label: "SG" },
  { value: "Plato", label: "°P" }
];

// dilution-boiloff: какие поля/статы относятся к какому режиму (см. calculateDilutionBoiloff).
// Экспортируются — те же три набора нужны DilutionFieldsBlock в calculator-page-client.tsx
// (какие поля показывать), чтобы не держать два независимых списка режимов в разных файлах.
export const DILUTION_GRAVITY_TARGET_MODES = new Set(["dilute_to_gravity", "boil_to_gravity", "add_extract_to_gravity"]);
// add_extract_to_gravity сюда не входит: ядро больше не читает targetVolumeL для этого режима
// (экстракт дозируется под текущий объём) — показ поля был бы бессмысленным no-op полем.
export const DILUTION_VOLUME_TARGET_MODES = new Set(["gravity_after_water", "gravity_after_boiloff", "extra_boil_time"]);
export const DILUTION_BOILOFF_RATE_MODES = new Set(["boil_to_gravity", "extra_boil_time"]);
const DILUTION_WATER_STAT_MODES = new Set(["dilute_to_gravity", "gravity_after_water"]);
const DILUTION_BOILOFF_STAT_MODES = new Set(["boil_to_gravity", "gravity_after_boiloff", "extra_boil_time"]);

// Двухуровневый выбор режима: сверху операция (что делаем с суслом), ниже — что рассчитать.
// Значения mode остаются прежними ради совместимости query-ссылок и localStorage.
export type DilutionOperation = "water" | "boil" | "extract";

export const dilutionOperationOptions: Array<{ id: DilutionOperation; label: string }> = [
  { id: "water", label: "Разбавить" },
  { id: "boil", label: "Уварить" },
  { id: "extract", label: "Добавить" }
];

// Для каждой операции — что можно рассчитать (второй уровень). Одна опция → второй ряд не нужен.
export const dilutionFindOptions: Record<DilutionOperation, Array<{ mode: string; label: string }>> = {
  water: [
    { mode: "dilute_to_gravity", label: "Сколько воды" },
    { mode: "gravity_after_water", label: "Итоговая плотность" }
  ],
  boil: [
    { mode: "boil_to_gravity", label: "Сколько выпарить" },
    { mode: "gravity_after_boiloff", label: "Итоговая плотность" },
    { mode: "extra_boil_time", label: "Время кипячения" }
  ],
  extract: [
    { mode: "add_extract_to_gravity", label: "Сколько экстракта" }
  ]
};

export const dilutionOperationOfMode = (mode: string): DilutionOperation => {
  if (mode === "boil_to_gravity" || mode === "gravity_after_boiloff" || mode === "extra_boil_time") {
    return "boil";
  }
  if (mode === "add_extract_to_gravity") {
    return "extract";
  }
  return "water";
};

const sugarTypeOptions = [
  { value: "dextrose", label: "Декстроза (глюкоза)" },
  { value: "sucrose", label: "Обычный сахар (сахароза)" },
  { value: "dme", label: "Сухой солодовый экстракт (DME)" },
  { value: "honey", label: "Мед" }
];

const hopUseLabels: Record<string, string> = {
  boil: "Кипячение",
  first_wort_hop: "Первое сусло",
  whirlpool: "Вирпул",
  dry_hop: "Сухое охмеление",
  dip_hop: "Дип-хоп",
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

// ibu: значение формулы из URL/localStorage вне трёх известных откатывается к дефолту.
const IBU_FORMULAS = new Set(["tinseth_whirlpool_v2", "tinseth_classic", "rager"]);
const resolveIbuFormula = (state: CalculatorState): BitternessFormula => {
  const raw = s(state.formula, "tinseth_whirlpool_v2");
  return (IBU_FORMULAS.has(raw) ? raw : "tinseth_whirlpool_v2") as BitternessFormula;
};
// Вирпул-модель (глобальное время/темп отстоя + перенос горечи поздних кипятильных
// внесений) существует только в формуле «Tinseth + вирпул»: у классики и Rager этих
// входов нет, поэтому и поля вирпула, и перенос завязаны на выбор формулы, а не на
// наличие вирпул-строки — отстой без вирпульного хмеля тоже реально догорчает.
const ibuWhirlpoolActive = (state: CalculatorState) => (
  resolveIbuFormula(state) === "tinseth_whirlpool_v2"
);

// Шкала плотности SG/°P/°Bx, общая для ibu/yeast-starter/speise-krausen: один и тот же
// сегментированный переключатель + связка dynamicUnit/dynamicStep/transformOnChange.
const gravityScaleOptions: CalculatorFieldOption[] = [
  { value: "SG", label: "SG" },
  { value: "Plato", label: "°P" },
  { value: "Brix", label: "°Bx" }
];

const gravityScaleUnitLabel = (unit: CalculatorGravityUnit): string => (
  unit === "SG" ? "SG" : unit === "Brix" ? "°Bx" : "°P"
);

// SG вводится с точностью до тысячных, Plato/Brix — до десятых.
const gravityScaleStep = (unit: CalculatorGravityUnit): number => (unit === "SG" ? 0.001 : 0.1);

const resolveGravityUnit = (state: CalculatorState, key = "gravityUnit"): CalculatorGravityUnit => {
  const raw = s(state[key], "SG");
  return raw === "Plato" || raw === "Brix" ? raw : "SG";
};

// Сегментированный переключатель шкалы плотности: пересчитывает связанное числовое поле
// через общий convertGravityFieldValue и помечает выбор как ручной (gravityUnitTouched) —
// иначе следующая догрузка предпочтения из профиля переписала бы выбор пользователя (см.
// GRAVITY_PREFERENCE_CONFIG в calculator-page-client.tsx).
const gravityScaleField = (unitFieldName: string, valueFieldName: string): ScalarCalculatorField => (
  selectField(unitFieldName, "Шкала плотности", gravityScaleOptions, {
    variant: "segmented",
    transformOnChange: (nextUnit, state) => [
      [valueFieldName, convertGravityFieldValue(state[valueFieldName], resolveGravityUnit(state, unitFieldName), nextUnit as CalculatorGravityUnit)],
      ["gravityUnitTouched", true]
    ]
  })
);

// brewing-water-volume: BIAB/экстракт не промывают — вся вода уходит в затор (см. calculateBrewingWaterVolume).
const BREWING_WATER_NO_SPARGE_METHODS = new Set(["BIAB", "extract"]);

const buguProfile = (value: number): { label: string; tone: CalculatorResultStat["tone"] } => {
  if (value < 0.4) return { label: "солодовый акцент", tone: "default" };
  if (value <= 0.6) return { label: "сбалансированное", tone: "good" };
  if (value <= 0.8) return { label: "хмелевой акцент", tone: "default" };
  return { label: "горькое", tone: "default" };
};

const waterProfileFields = (prefix: string, advanced = false, group?: string): ScalarCalculatorField[] => [
  numberField(`${prefix}Ca`, "Ca", "ppm", { min: 0, step: 1, advanced, group }),
  numberField(`${prefix}Mg`, "Mg", "ppm", { min: 0, step: 1, advanced, group }),
  numberField(`${prefix}Na`, "Na", "ppm", { min: 0, step: 1, advanced, group }),
  numberField(`${prefix}Cl`, "Cl", "ppm", { min: 0, step: 1, advanced, group }),
  numberField(`${prefix}So4`, "SO4", "ppm", { min: 0, step: 1, advanced, group }),
  numberField(`${prefix}Hco3`, "HCO3", "ppm", { min: 0, step: 1, advanced, group })
];

const buildProfile = (state: CalculatorState, prefix: string) => ({
  ca: n(state[`${prefix}Ca`]),
  mg: n(state[`${prefix}Mg`]),
  na: n(state[`${prefix}Na`]),
  cl: n(state[`${prefix}Cl`]),
  so4: n(state[`${prefix}So4`]),
  hco3: n(state[`${prefix}Hco3`])
});

// Соль → имя ручного поля ввода в граммах. Единственный источник для buildSalts (сбор
// доз из формы) и WATER_SALT_FIELD_NAME (обратная мапа для «Подставить соли в ручной
// режим» ниже) — держать список в одном месте, а не дублировать его в обе стороны.
const WATER_SALT_FIELD_MAP: Array<[BrewingSaltId, string]> = [
  ["calcium_chloride", "cacl2G"],
  ["gypsum", "caso4G"],
  ["epsom_salt", "mgso4G"],
  ["table_salt", "naclG"],
  ["baking_soda", "nahco3G"]
];

const buildSalts = (state: CalculatorState): SaltAddition[] => (
  WATER_SALT_FIELD_MAP
    .map(([salt, key]) => ({ salt, grams: n(state[key]) }))
    .filter((addition) => addition.grams > 0)
);

// ── water-ph: режим "Подобрать соли" ────────────────────────────────────────────
// Классические профили воды по стилю (ppm), по мотивам Bru'n Water — круглые ориентиры,
// а не лабораторная точность. Используются как targetProfile для solveWaterTargetProfile.
type WaterTargetProfilePreset = {
  id: string;
  label: string;
  profile: { ca: number; mg: number; na: number; cl: number; so4: number; hco3: number };
};

// Единственный источник ppm — каталог целевых профилей воды (features/recipes/water-target-profiles.ts,
// тот же, что питает мастер рецептов). Здесь только выбираем 4 стабильных id-профиля под
// собственные 4 подписи калькулятора (глоссарий калькулятора) — точных тёзок IPA/лагер/
// янтарное/стаут в каталоге нет, взяты ближайшие по составу солей.
const WATER_TARGET_PROFILE_SOURCE: Array<{ id: string; label: string; catalogSlug: string }> = [
  { id: "hoppy_pale", label: "Светлое хмелевое (IPA)", catalogSlug: "scott-janish-2015-ipa" },
  { id: "malty_lager", label: "Светлое солодовое (лагер)", catalogSlug: "munich-decarbonated-bf" },
  { id: "balanced_amber", label: "Сбалансированное янтарное", catalogSlug: "balanced-profile-bf" },
  { id: "dark_stout", label: "Тёмное (стаут/портер)", catalogSlug: "dusseldorf-altbier-bf" }
];

const WATER_TARGET_PROFILE_PRESETS: WaterTargetProfilePreset[] = WATER_TARGET_PROFILE_SOURCE.map(({ id, label, catalogSlug }) => {
  const catalogItem = waterTargetProfileCatalog.find((item) => item.slug === catalogSlug);
  if (!catalogItem) {
    throw new Error(`[calculators] целевой профиль воды "${catalogSlug}" не найден в features/recipes/water-target-profiles.ts`);
  }
  const { ca, mg, na, cl, so4, hco3 } = catalogItem.profile;
  return { id, label, profile: { ca, mg, na, cl, so4, hco3 } };
});

const WATER_TARGET_PROFILE_OPTIONS: CalculatorFieldOption[] = WATER_TARGET_PROFILE_PRESETS.map((preset) => (
  { value: preset.id, label: preset.label }
));

const waterTargetProfileById = (id: string): WaterTargetProfilePreset => (
  WATER_TARGET_PROFILE_PRESETS.find((preset) => preset.id === id) ?? WATER_TARGET_PROFILE_PRESETS[0]
);

// Соли, которые solver умеет подбирать — те же пять, что доступны вручную (мел и гашёная
// известь — advancedOnly и плохо растворимы в brewing-core, вручную их тоже нет).
const WATER_SOLVER_ALLOWED_SALTS: BrewingSaltId[] = ["gypsum", "calcium_chloride", "epsom_salt", "table_salt", "baking_soda"];

// Обратное отображение соль → имя ручного поля (для «Подставить соли в ручной режим»),
// выведено из WATER_SALT_FIELD_MAP выше — не отдельный вручную инвертированный список.
const WATER_SALT_FIELD_NAME: Partial<Record<BrewingSaltId, string>> = Object.fromEntries(WATER_SALT_FIELD_MAP);

const WATER_SALT_RU_LABELS: Partial<Record<BrewingSaltId, { name: string; formula: string }>> = {
  gypsum: { name: "Гипс", formula: "CaSO4" },
  calcium_chloride: { name: "Хлорид кальция", formula: "CaCl2" },
  epsom_salt: { name: "Английская соль", formula: "MgSO4" },
  table_salt: { name: "Поваренная соль", formula: "NaCl" },
  baking_soda: { name: "Питьевая сода", formula: "NaHCO3" }
};

// Эмпирический порог: score solveWaterTargetProfile — сумма квадратов отклонений (ppm) по
// всем ионам. У реалистичных пар источник/цель (даже когда избыток HCO3 solver не может
// снять солями — это работа кислоты) счёт обычно в пределах пары тысяч; при действительно
// несовместимой паре (например, почти нулевая по солям вода и цель с высоким HCO3 при
// низком Na — соду больше не добавить, иначе перелетит Na) счёт улетает на порядок выше.
const WATER_SOLVER_SCORE_WARNING_THRESHOLD = 6000;

const isWaterPhTargetMode = (state: CalculatorState): boolean => s(state.mode, "manual") === "target";
const isWaterPhManualMode = (state: CalculatorState): boolean => !isWaterPhTargetMode(state);

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
// Brix — сырое показание рефрактометра (÷ WCF); SG и °P — истинная плотность без WCF
// (ареометр/сахаромер АС-3 или рецепт — °P-шкала у сахаромеров именно истинная).
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
  if (originalUnit === "Brix") {
    input.originalBrix = originalValue;
    ogSg = brixToSg(originalValue / wortCorrectionFactor);
  } else {
    const trueSg = gravityToSg(originalValue, originalUnit);
    input.originalGravity = trueSg;
    ogSg = trueSg;
  }

  return { input, originalUnit, originalValue, ogSg };
};

// Пересчёт значения OG при смене шкалы. Обычной конверсии плотности недостаточно:
// Brix — сырое показание рефрактометра (завышено в WCF раз), SG/°P — истинная плотность,
// поэтому пересечение границы Brix ↔ SG/°P делит/умножает на WCF. Плоская конверсия
// молча сдвигала бы физический смысл OG (и ABV на ~0.3%) при каждом переключении —
// как ручном, так и автоматическом (предпочтение плотности из профиля, «Сбросить»).
export const convertRefractometerOgFieldValue = (
  state: CalculatorState,
  rawValue: unknown,
  fromUnit: CalculatorGravityUnit,
  toUnit: CalculatorGravityUnit
): string => {
  if (fromUnit === toUnit) {
    return String(rawValue ?? "");
  }
  // SG ↔ °P — обе шкалы истинные, WCF не участвует.
  if (fromUnit !== "Brix" && toUnit !== "Brix") {
    return convertGravityFieldValue(rawValue, fromUnit, toUnit);
  }

  const wcf = n(state.wortCorrectionFactor, 1.04);
  const factor = wcf > 0 ? wcf : 1.04;
  // parseDecimalInput вместо голого Number — по тем же причинам, что в convertGravityFieldValue
  // («12,4» посреди набора). Мусорный ввод возвращаем как есть, чтобы не мешать набору.
  const value = typeof rawValue === "number" ? rawValue : parseDecimalInput(String(rawValue ?? "")) ?? Number.NaN;
  if (!Number.isFinite(value) || (fromUnit === "SG" && value <= 0)) {
    return String(rawValue ?? "");
  }

  if (fromUnit === "Brix") {
    // Сырое показание → истинный Brix → целевая истинная шкала.
    return convertGravityFieldValue(value / factor, "Brix", toUnit);
  }

  // Истинная шкала → истинный Brix → сырое показание рефрактометра.
  const rawReading = sgToBrix(gravityToSg(value, fromUnit)) * factor;
  const text = rawReading.toFixed(1);
  // «−0.0» после округления — артефакт полинома у нулевой плотности.
  return Number(text) === 0 ? (0).toFixed(1) : text;
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

// ── ABV / сбраживание: структурный вид для кастомной панели ──────────────────
export type AbvView = {
  ogSg: number;
  fgSg: number;
  abv: number;
  abw: number;
  attenuation: number;
  attenuationBand: ApparentAttenuationBand | null;
  calories: number;
  servingSizeMl: number;
  fgAboveOg: boolean;
  ogTooLow: boolean;
};

export const computeAbvView = (state: CalculatorState): AbvView => {
  const unit = s(state.gravityUnit, "SG") as CalculatorGravityUnit;
  // Фолбэки пустых полей — в текущей шкале: числа 1.05/1.012, прочитанные как °P,
  // дают почти воду, и с введённым FG вылезало ложное «FG выше OG».
  const ogSg = gravityToSg(n(state.og, unit === "SG" ? 1.05 : 12.4), unit);
  const fgSg = gravityToSg(n(state.fg, unit === "SG" ? 1.012 : 3.1), unit);
  const servingSizeMl = n(state.servingSizeMl, 100);
  const fgAboveOg = fgSg > ogSg;
  // OG ≤ 1.000 — сусла нет: деление на (OG − 1) в сбраживании даёт NaN/Infinity,
  // калории уходят в минус. Не считаем, панель покажет предупреждение.
  const ogTooLow = ogSg <= 1;
  if (ogTooLow) {
    return { ogSg, fgSg, abv: 0, abw: 0, attenuation: 0, attenuationBand: null, calories: 0, servingSizeMl, fgAboveOg, ogTooLow };
  }
  const result = calculateAbvAttenuation({
    og: ogSg,
    fg: fgSg,
    formula: s(state.abvFormula, "standard") as "standard" | "alternate",
    servingSizeMl
  });

  return {
    ogSg,
    fgSg,
    abv: result.abv,
    abw: result.abw,
    attenuation: result.apparentAttenuation,
    // Полосу считаем только для осмысленного замера: при FG > OG сбраживание отрицательное.
    attenuationBand: fgAboveOg ? null : classifyApparentAttenuation(result.apparentAttenuation),
    calories: result.calories,
    servingSizeMl,
    fgAboveOg,
    ogTooLow
  };
};

// ── Поправка ареометра по температуре: структурный вид для кастомной панели ───
export type HydrometerView = {
  unit: CalculatorGravityUnit;
  rawInUnit: number;
  correctedInUnit: number;
  correctedSg: number;
  correctedPlato: number;
  correctedBrix: number;
  deltaInUnit: number;
  offsetInUnit: number;
  sampleTemperatureC: number;
  calibrationTemperatureC: number;
  tempDeltaC: number;
  direction: "hot" | "cold" | "equal";
  // hot — >60 °C: замер ареометром физически ненадёжен (испарение пробы, конвекция),
  // поправка не спасает; out_of_range — вне жидкой воды (0–100 °C), расчёт не имеет смысла.
  sampleTempBand: "ok" | "hot" | "out_of_range";
};

export const computeHydrometerView = (state: CalculatorState): HydrometerView => {
  const unit = s(state.readingUnit, "SG") as CalculatorGravityUnit;
  // Фолбэк пустого поля — в текущей шкале (ср. computeAbvView): 1.05, прочитанный
  // как °P, дал бы почти воду вместо эквивалента дефолтных 1.050 SG.
  const reading = n(state.reading, unit === "SG" ? 1.05 : 12.4);
  const sampleTemperatureC = n(state.sampleTemperatureC, 30);
  const calibrationTemperatureC = n(state.calibrationTemperatureC, 20);
  // Поправка прибора хранится в шкале показания, ядро ждёт SG-дельту. Якорь конвертации —
  // вода: «0.5 °P в дистилляте» = platoToSg(0.5) − 1.000 (см. convertGravityOffsetValue).
  const offsetInUnit = n(state.offset, 0);
  const offsetSg = unit === "SG" || offsetInUnit === 0 ? offsetInUnit : gravityToSg(offsetInUnit, unit) - 1;
  const result = correctHydrometer({
    reading,
    readingUnit: unit,
    sampleTemperatureC,
    calibrationTemperatureC,
    instrumentOffset: offsetSg
  });
  const correctedSg = result.correctedSG;
  const correctedPlato = result.correctedPlato;
  const correctedBrix = sgToBrix(correctedSg);
  const correctedInUnit = unit === "SG" ? correctedSg : unit === "Brix" ? correctedBrix : correctedPlato;
  const tempDeltaC = roundTo(sampleTemperatureC - calibrationTemperatureC, 1);

  return {
    unit,
    rawInUnit: reading,
    correctedInUnit,
    correctedSg,
    correctedPlato,
    correctedBrix,
    deltaInUnit: correctedInUnit - reading,
    offsetInUnit,
    sampleTemperatureC,
    calibrationTemperatureC,
    tempDeltaC,
    direction: Math.abs(tempDeltaC) < 0.5 ? "equal" : tempDeltaC > 0 ? "hot" : "cold",
    sampleTempBand: sampleTemperatureC < 0 || sampleTemperatureC > 100
      ? "out_of_range"
      : sampleTemperatureC > 60 ? "hot" : "ok"
  };
};

// ── Разбавление / уваривание: структурный вид для кастомной панели ────────────
// Плотности (текущая/целевая) хранятся в выбранной единице (state.gravityUnit) и здесь
// приводятся к SG — ядро работает только в SG. Отдаёт сырые числа, а не готовые строки,
// чтобы панель могла показать плотность крупно в основной единице + мелкие дубли в остальных.
export type DilutionView = {
  mode: string;
  operation: DilutionOperation;
  // "gravity" — крупный результат это итоговая плотность; "amount" — объём/масса/время.
  find: "gravity" | "amount";
  unit: CalculatorGravityUnit;
  resultingGravitySg: number;
  resultingVolumeL: number;
  waterToAddL: number;
  volumeToBoilOffL: number;
  extraBoilTimeMinutes: number;
  extractG: number;
  isSugar: boolean;
  warnings: Array<string | CalculatorResultWarning>;
};

export const computeDilutionView = (state: CalculatorState): DilutionView => {
  const mode = s(state.mode, "dilute_to_gravity");
  const unit = s(state.gravityUnit, "SG") as CalculatorGravityUnit;
  const result = calculateDilutionBoiloff({
    mode: mode as Parameters<typeof calculateDilutionBoiloff>[0]["mode"],
    currentVolumeL: n(state.currentVolumeL, 20),
    currentGravity: gravityToSg(n(state.currentGravity, 1.06), unit),
    // «Целевая плотность» скрыта вне DILUTION_GRAVITY_TARGET_MODES — не даём скрытому
    // (возможно устаревшему) значению тайно подставляться как фолбэк для объёма.
    targetGravity: DILUTION_GRAVITY_TARGET_MODES.has(mode) ? gravityToSg(n(state.targetGravity, 1.05), unit) : undefined,
    targetVolumeL: n(state.targetVolumeL, 0),
    boilOffRateLPerHour: n(state.boilOffRateLPerHour, 0),
    additionType: s(state.additionType, "dme") as Parameters<typeof calculateDilutionBoiloff>[0]["additionType"]
  });

  return {
    mode,
    operation: dilutionOperationOfMode(mode),
    find: mode === "gravity_after_water" || mode === "gravity_after_boiloff" ? "gravity" : "amount",
    unit,
    resultingGravitySg: result.resultingGravity,
    resultingVolumeL: result.resultingVolumeL,
    waterToAddL: result.waterToAddL,
    volumeToBoilOffL: result.volumeToBoilOffL,
    extraBoilTimeMinutes: result.extraBoilTimeMinutes,
    extractG: result.dmeToAddG || result.sugarToAddG,
    isSugar: s(state.additionType, "dme") === "sugar",
    warnings: translateCoreWarnings(result.warnings)
  };
};

// brewhouse-efficiency: русские подписи старых пресетов экстрактивности — нужны только для
// миграции сохранённых строк засыпи (localStorage/share-ссылки) в новую форму. С 2026-07
// засыпь выбирается из каталога ингредиентов через IngredientPicker (см. поле "name" ниже,
// kind: "ingredient"), пресетного select "Тип" в форме больше нет.
const fermentableTypeLabels: Record<string, string> = {
  base_malt: "Базовый солод",
  wheat_malt: "Пшеничный солод",
  munich: "Мюнхенский",
  crystal: "Карамельный",
  roasted: "Жжёный/шоколадный",
  flaked_adjunct: "Хлопья/несоложёнка",
  sugar: "Сахар",
  dme: "Сухой экстракт (DME)",
  lme: "Жидкий экстракт (LME)",
  honey: "Мёд",
  custom: "Другое (свой PPG)"
};

// mashed хранится строкой "1"/"0" (как и другие select-поля формы), но дефолты и мигрированные
// строки могут прийти булевым значением — читаем оба вида одним хелпером.
const readFermentableMashed = (value: unknown, fallback = true): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value !== "0" && value !== "false";
  }
  return fallback;
};

// Старая форма строки засыпи (до IngredientPicker) — {weightKg, type, ppg}, type — ключ
// пресета FERMENTABLE_PPG_PRESETS ("custom" — свой PPG). Переносит в новую форму
// {name, weightKg, ppg, mashed} для сохранённого localStorage/share-ссылок.
const migrateFermentableRow = (row: Record<string, unknown>): Record<string, unknown> => {
  if (typeof row.type !== "string") {
    // Уже новая форма (нет старого поля type) — не трогаем.
    return row;
  }

  const preset = FERMENTABLE_PPG_PRESETS.find((item) => item.key === row.type);
  const isCustom = row.type === "custom" || !preset;

  return {
    name: fermentableTypeLabels[row.type] ?? row.type,
    weightKg: row.weightKg,
    ppg: isCustom ? (row.ppg ?? "") : preset!.ppg,
    mashed: isCustom ? "1" : (preset!.appliesBrewhouseEfficiency ? "1" : "0")
  };
};

// Строки "Засыпи" → FermentableGrainBillItem для estimateBrewhouseEfficiency/predictOgAtEfficiency.
// Экстрактивность (PPG) — как ввёл пользователь (обычно подставлена из каталога при выборе
// ингредиента через onPick, но редактируема вручную); пустое/невалидное значение — 0
// (см. п.2 ТЗ), а не тихая оценка.
const readFermentables = (state: CalculatorState): FermentableGrainBillItem[] => (
  rows(state.fermentables)
    .map((row, index) => ({
      id: `fermentable-${index}`,
      name: s(row.name, `Позиция ${index + 1}`),
      weightKg: n(row.weightKg, 0),
      potentialPpg: n(row.ppg, 0),
      colorLovibond: 0,
      appliesBrewhouseEfficiency: readFermentableMashed(row.mashed, true)
    }))
    // Пустая строка (0 кг) не должна участвовать в расчёте эффективности/прогнозе НП.
    .filter((item) => item.weightKg > 0)
);

// Плотность в выбранной единице как строка с суффиксом (SG — без суффикса, 3 знака).
const formatGravityInUnit = (sg: number, unit: CalculatorGravityUnit): string => (
  unit === "SG"
    ? sg.toFixed(3)
    : `${(unit === "Brix" ? sgToBrix(sg) : sgToPlato(sg)).toFixed(1)} ${unit === "Brix" ? "°Bx" : "°P"}`
);

// beer-color: пересчёт цвета солода в строках засыпи при смене шкалы EBC/°L. Пустая или
// нераспаршенная строка остаётся как есть — не подставляем 0 вместо "не введено".
// convertBrewingUnitGroup("color", …) считает через SRM как общий знаменатель (тот же путь,
// что и в calculate() ниже через toLovibond), так что оба места согласованы.
const convertFermentablesColorUnit = (
  fermentables: unknown,
  fromUnit: "EBC" | "Lovibond",
  toUnit: "EBC" | "Lovibond"
): Array<Record<string, unknown>> => (
  rows(fermentables).map((row) => {
    const raw = row.colorLovibond;
    if (raw == null || String(raw).trim() === "") {
      return row;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return row;
    }
    const converted = convertBrewingUnitGroup("color", parsed, fromUnit)[toUnit];
    return { ...row, colorLovibond: String(converted) };
  })
);

// Конвертер единиц: группы и их единицы. Ключи единиц совпадают с выходом
// convertBrewingUnitGroup. Единый источник и для UI-карточек (CONVERTER_GROUPS
// в calculator-page-client), и для валидации from во входящих ссылках (applyQuery) —
// иначе списки разъезжались бы молча. ppm показываем один раз (mg/L численно равен ppm).
export const CONVERTER_GROUP_UNITS: Record<string, string[]> = {
  gravity: ["SG", "Plato", "Brix", "points"],
  color: ["SRM", "EBC", "Lovibond"],
  volume: ["ml", "L", "oz", "qt", "gal"],
  weight: ["g", "kg", "oz", "lb"],
  temperature: ["C", "F", "K"],
  pressure: ["PSI", "bar", "kPa"],
  concentration: ["ppm", "g/L"]
};

export const calculatorDefinitions: CalculatorDefinition[] = [
  calculator("dilution-boiloff", {
    defaults: {
      mode: "dilute_to_gravity",
      // gravityUnit — единица ввода/показа плотности; Plato-дефолт заменяется предпочтением
      // пользователя на клиенте (см. CalculatorPageClient), currentGravity/targetGravity
      // хранятся уже в этой единице.
      gravityUnit: "Plato",
      currentVolumeL: 20,
      // 14.7/12.4 °P — эквивалент прежних SG-дефолтов (1.060/1.050).
      currentGravity: 14.7,
      targetGravity: 12.4,
      targetVolumeL: 24,
      boilOffRateLPerHour: 4,
      additionType: "dme"
    },
    // "water" был прежним дефолтом additionType (опция убрана из select) — у прежних
    // посетителей он мог осесть в localStorage, и контрол рендерился бы без выбранного значения.
    // currentGravity/targetGravity, сохранённые до появления gravityUnit (или до смены
    // дефолта SG→Plato), хранят значения в SG без явного ключа шкалы.
    migrateStoredState: (stored) => {
      const withAdditionFix = stored.additionType === "water" ? { ...stored, additionType: "dme" } : stored;
      return (withAdditionFix.currentGravity != null || withAdditionFix.targetGravity != null) && withAdditionFix.gravityUnit == null
        ? { ...withAdditionFix, gravityUnit: "SG" }
        : withAdditionFix;
    },
    fields: [
      selectField("mode", "Режим", [
        { value: "dilute_to_gravity", label: "Разбавить до целевой плотности" },
        { value: "boil_to_gravity", label: "Уварить до целевой плотности" },
        { value: "gravity_after_water", label: "Новая плотность после добавления воды" },
        { value: "gravity_after_boiloff", label: "Новая плотность после испарения" },
        { value: "add_extract_to_gravity", label: "Добавить экстракт/сахар до цели" },
        { value: "extra_boil_time", label: "Дополнительное время кипячения" }
      ]),
      numberField("currentVolumeL", "Текущий объем", "л", { min: 0.1 }),
      numberField("currentGravity", "Текущая плотность", "SG", { min: 1, step: 0.001 }),
      numberField("targetGravity", "Целевая плотность", "SG", {
        min: 1,
        step: 0.001,
        visibleWhen: (state) => DILUTION_GRAVITY_TARGET_MODES.has(s(state.mode, "dilute_to_gravity"))
      }),
      numberField("targetVolumeL", "Целевой объем", "л", {
        min: 0.1,
        visibleWhen: (state) => DILUTION_VOLUME_TARGET_MODES.has(s(state.mode, "dilute_to_gravity"))
      }),
      numberField("boilOffRateLPerHour", "Испарение", "л/ч", {
        min: 0,
        visibleWhen: (state) => DILUTION_BOILOFF_RATE_MODES.has(s(state.mode, "dilute_to_gravity"))
      }),
      selectField("additionType", "Что добавляем", [
        { value: "dme", label: "Сухой экстракт" },
        { value: "sugar", label: "Сахар" }
      ], {
        visibleWhen: (state) => s(state.mode, "dilute_to_gravity") === "add_extract_to_gravity"
      })
    ],
    // Рендерится кастомной панелью (DilutionResultPanel), но calculate остаётся корректным
    // и unit-aware — через общий computeDilutionView, чтобы обе точки не разъезжались.
    calculate: (state) => {
      const view = computeDilutionView(state);
      const grav = formatGravityInUnit(view.resultingGravitySg, view.unit);
      const mode = view.mode;

      const primary: CalculatorResultStat = mode === "dilute_to_gravity"
        ? { label: "Долить воды", value: formatLiters(view.waterToAddL), helper: `Плотность станет ${grav}` }
        : mode === "gravity_after_water"
          ? { label: "Итоговая плотность", value: grav, helper: `Долить ${formatLiters(view.waterToAddL)} воды` }
          : mode === "boil_to_gravity"
            ? { label: "Выпарить", value: formatLiters(view.volumeToBoilOffL), helper: view.extraBoilTimeMinutes > 0 ? `≈ ${view.extraBoilTimeMinutes} мин при заданной скорости` : `Плотность станет ${grav}` }
            : mode === "gravity_after_boiloff"
              ? { label: "Итоговая плотность", value: grav, helper: `Выпарить ${formatLiters(view.volumeToBoilOffL)}` }
              : mode === "extra_boil_time"
                ? { label: "Кипятить ещё", value: `${view.extraBoilTimeMinutes} мин`, helper: `Выпарить ${formatLiters(view.volumeToBoilOffL)}` }
                : { label: view.isSugar ? "Добавить сахар" : "Добавить экстракт", value: formatGrams(view.extractG), helper: `Плотность станет ${grav}` };

      const stats: CalculatorResultStat[] = [
        { label: "Итоговый объём", value: formatLiters(view.resultingVolumeL) }
      ];
      if (view.find === "amount") {
        stats.push({ label: "Итоговая плотность", value: grav });
      }
      if (DILUTION_WATER_STAT_MODES.has(mode) && mode !== "dilute_to_gravity") {
        stats.push({ label: "Долить воды", value: formatLiters(view.waterToAddL) });
      }
      if (DILUTION_BOILOFF_STAT_MODES.has(mode) && mode !== "boil_to_gravity") {
        stats.push({ label: "Выпарить", value: formatLiters(view.volumeToBoilOffL) });
      }
      if (mode === "boil_to_gravity" && view.extraBoilTimeMinutes > 0) {
        stats.push({ label: "Доп. время", value: `${view.extraBoilTimeMinutes} мин` });
      }

      return {
        primary,
        stats,
        warnings: view.warnings,
        links: [
          { label: "Взять объём и плотность в IBU", href: buildCalculatorHref("ibu", { postBoilVolumeL: view.resultingVolumeL, wortGravity: view.resultingGravitySg }) },
          ...relatedLinks(["abv-attenuation", "brewing-water-volume", "unit-converter"])
        ]
      };
    }
  }),
  calculator("abv-attenuation", {
    defaults: {
      // 12.4/3.1 °P — эквивалент прежних SG-дефолтов (1.050/1.012), основная шкала теперь Plato.
      og: 12.4,
      fg: 3.1,
      gravityUnit: "Plato",
      abvFormula: "standard",
      servingSizeMl: 100
    },
    // Состояния, сохранённые до появления gravityUnit (или до смены дефолта SG→Plato),
    // хранят og/fg в SG без явного ключа шкалы — без миграции те же цифры (1.050) молча
    // прочитались бы как 12.4 °P.
    migrateStoredState: (stored) => (
      (stored.og != null || stored.fg != null) && stored.gravityUnit == null
        ? { ...stored, gravityUnit: "SG" }
        : stored
    ),
    // Межкалькуляторные ссылки (рефрактометр/ареометр) передают og/fg в SG — конвертируем
    // в текущую шкалу калькулятора вместо сырого копирования (иначе «1.048» читалось бы как
    // Плато); шкалу и gravityUnitTouched не трогаем, чтобы предпочтение продолжало действовать.
    // НО ссылка «Скопировать ссылку на расчёт» (serializeCalculatorStateToQuery) — самошаренная:
    // она пишет og/fg УЖЕ в текущей шкале калькулятора плюс сам параметр шкалы (gravityUnit).
    // initialCalculatorStateFromQuery копирует скалярные поля (в т.ч. gravityUnit и og/fg как
    // сырые строки) в state ДО вызова applyQuery — так что наличие params.gravityUnit значит
    // «это самошаренная ссылка, конвертировать НЕ нужно» (иначе получилась бы двойная
    // конверсия — см. регрессию с OG=180411 °P). Без gravityUnit в query — это межкалькуляторная
    // ссылка, og/fg в SG, конвертируем как раньше.
    applyQuery: (state, params) => {
      if (params.og == null && params.fg == null) {
        return state;
      }
      const isSelfSharedLink = params.gravityUnit != null;
      const unit = resolveGravityUnit(state);
      return {
        ...state,
        og: params.og != null ? (isSelfSharedLink ? params.og : convertGravityFieldValue(params.og, "SG", unit)) : state.og,
        fg: params.fg != null ? (isSelfSharedLink ? params.fg : convertGravityFieldValue(params.fg, "SG", unit)) : state.fg
      };
    },
    fields: [
      numberField("og", "Начальная плотность (OG)", undefined, { min: 0, step: 0.001 }),
      numberField("fg", "Конечная плотность (FG)", undefined, { min: 0, step: 0.001 }),
      selectField("gravityUnit", "Шкала плотности", abvGravityUnitOptions),
      selectField("abvFormula", "Формула крепости", [
        { value: "standard", label: "Стандартная" },
        { value: "alternate", label: "Альтернативная (крепкое пиво)" }
      ], { advanced: true }),
      numberField("servingSizeMl", "Размер порции", "мл", { min: 1, step: 50, advanced: true })
    ],
    calculate: (state) => {
      const view = computeAbvView(state);
      const attenuationTone: CalculatorResultStat["tone"] = view.fgAboveOg || view.ogTooLow
        ? "warning"
        : view.attenuationBand === "normal"
          ? "good"
          : "warning";

      return {
        primary: { label: "Крепость (ABV)", value: formatPercent(view.abv, 2), helper: `ABW ${formatPercent(view.abw, 2)}` },
        stats: [
          { label: "Видимое сбраживание", value: formatPercent(view.attenuation), tone: attenuationTone },
          { label: "Калории", value: `${view.calories} ккал`, helper: `${compactNumber(view.servingSizeMl, 0)} мл` },
          { label: "OG / FG", value: `${formatSg(view.ogSg)} / ${formatSg(view.fgSg)}` }
        ],
        warnings: view.ogTooLow
          ? ["Начальная плотность должна быть выше 1.000 (0 °P) — проверьте замер."]
          : view.fgAboveOg
            ? ["Конечная плотность выше начальной — проверьте замеры."]
            : undefined,
        links: relatedLinks(["priming-sugar", "keg-carbonation", "refractometer-correction", "hydrometer-correction"])
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
      // 12.4 °P — эквивалент прежнего SG-дефолта (1.050).
      reading: 12.4,
      readingUnit: "Plato",
      sampleTemperatureC: 30,
      calibrationTemperatureC: 20,
      offset: 0
    },
    migrateStoredState: (stored) => {
      // Состояния, сохранённые до появления readingUnit (или до смены дефолта SG→Plato),
      // хранят reading в SG без явного ключа шкалы.
      let next = stored.reading != null && stored.readingUnit == null
        ? { ...stored, readingUnit: "SG" }
        : stored;
      // Поправка прибора раньше хранилась всегда в SG (ключ instrumentOffset), теперь — в
      // шкале показания (ключ offset): для SG число то же, для °P/Brix конвертируем с
      // якорем на воде. Старый ключ выбрасываем, чтобы не пересохранялся вечно.
      if (next.instrumentOffset != null && next.offset == null) {
        const { instrumentOffset, ...rest } = next;
        next = {
          ...rest,
          offset: convertGravityOffsetValue(instrumentOffset, "SG", s(next.readingUnit, "SG") as CalculatorGravityUnit)
        };
      }
      return next;
    },
    fields: [
      numberField("reading", "Показание ареометра", undefined, { min: 0, step: 0.001 }),
      selectField("readingUnit", "Единицы измерения", gravityUnitOptions),
      numberField("sampleTemperatureC", "Температура пробы", "°C", { step: 0.5 }),
      numberField("calibrationTemperatureC", "Температура калибровки", "°C", { step: 0.5, advanced: true }),
      numberField("offset", "Поправка прибора", "SG", {
        step: 0.001,
        advanced: true,
        dynamicUnit: (state) => gravityScaleUnitLabel(resolveGravityUnit(state, "readingUnit")),
        dynamicStep: (state) => gravityScaleStep(resolveGravityUnit(state, "readingUnit"))
      })
    ],
    calculate: (state) => {
      const view = computeHydrometerView(state);
      const unitLabel = view.unit === "SG" ? "SG" : view.unit === "Brix" ? "Brix" : "°P";
      const decimals = view.unit === "SG" ? 3 : 1;
      const deltaDecimals = view.unit === "SG" ? 4 : 2;
      const signedDelta = `${view.deltaInUnit >= 0 ? "+" : "−"}${Math.abs(view.deltaInUnit).toFixed(deltaDecimals)} ${unitLabel}`;

      return {
        primary: {
          label: "Скорректированная плотность",
          value: `${view.correctedInUnit.toFixed(decimals)} ${unitLabel}`,
          helper: `Поправка ${signedDelta}`
        },
        stats: [
          { label: "SG", value: view.correctedSg.toFixed(3) },
          { label: "°P", value: `${view.correctedPlato.toFixed(1)} °P` },
          { label: "До поправки", value: `${view.rawInUnit.toFixed(decimals)} ${unitLabel}` }
        ],
        warnings: view.sampleTempBand === "out_of_range"
          ? ["Температура пробы вне диапазона 0–100 °C — проверьте значение."]
          : view.sampleTempBand === "hot"
            ? ["Выше ~60 °C показания ареометра ненадёжны даже с поправкой — охладите пробу ближе к температуре калибровки."]
            : undefined,
        links: [
          { label: "Использовать как OG в ABV", href: buildCalculatorHref("abv-attenuation", { og: view.correctedSg.toFixed(3) }) },
          ...relatedLinks(["refractometer-correction", "unit-converter"])
        ]
      };
    }
  }),
  calculator("ibu", {
    defaults: {
      postBoilVolumeL: 20,
      // 12.4 °P — эквивалент прежнего SG-дефолта (1.050).
      wortGravity: 12.4,
      gravityUnit: "Plato",
      formula: "tinseth_whirlpool_v2",
      boilTimeMinutes: 60,
      whirlpoolTimeMinutes: 15,
      whirlpoolTemperatureC: 85,
      additions: [
        { name: "Горечь", amountG: 20, alphaAcidPercent: 10, timeMinutes: 60, use: "boil", form: "pellet" },
        { name: "Аромат", amountG: 30, alphaAcidPercent: 8, timeMinutes: 15, use: "whirlpool", form: "pellet" }
      ]
    },
    // Состояния, сохранённые до появления gravityUnit (или до смены дефолта SG→Plato),
    // хранят wortGravity в SG без явного ключа шкалы.
    migrateStoredState: (stored) => (
      stored.wortGravity != null && stored.gravityUnit == null
        ? { ...stored, gravityUnit: "SG" }
        : stored
    ),
    applyQuery: (state, params) => {
      // Межкалькуляторные ссылки (напр. из dilution-boiloff) передают wortGravity в SG.
      // Раньше это жёстко перезаписывало шкалу на SG, стирая выбор пользователя/его
      // предпочтение из профиля — вместо этого конвертируем входящее значение в текущую
      // (уже выбранную) шкалу калькулятора и шкалу не трогаем; gravityUnitTouched тоже не
      // выставляем, чтобы следующая догрузка предпочтения продолжала действовать.
      // Самошаренная ссылка (см. abv-attenuation.applyQuery выше) несёт свой gravityUnit —
      // wortGravity в ней уже в этой шкале, повторно конвертировать из SG нельзя.
      const isSelfSharedLink = params.gravityUnit != null;
      const withGravity = params.wortGravity != null
        ? { ...state, wortGravity: isSelfSharedLink ? params.wortGravity : convertGravityFieldValue(params.wortGravity, "SG", resolveGravityUnit(state)) }
        : state;
      if (!params.aa) return withGravity;
      const currentRows = rows(withGravity.additions);
      const first = currentRows[0] ?? {};
      return { ...withGravity, additions: [{ ...first, alphaAcidPercent: params.aa }, ...currentRows.slice(1)] };
    },
    fields: [
      numberField("postBoilVolumeL", "Объем после кипячения", "л", { min: 0.1 }),
      numberField("wortGravity", "Плотность сусла", "SG", {
        min: 0,
        dynamicUnit: (state) => gravityScaleUnitLabel(resolveGravityUnit(state)),
        dynamicStep: (state) => gravityScaleStep(resolveGravityUnit(state)),
      }),
      gravityScaleField("gravityUnit", "wortGravity"),
      numberField("boilTimeMinutes", "Время кипячения", "мин", { min: 0, step: 5 }),
      selectField("formula", "Формула", [
        { value: "tinseth_whirlpool_v2", label: "Tinseth + вирпул" },
        { value: "tinseth_classic", label: "Tinseth (классическая)" },
        { value: "rager", label: "Rager" }
      ], { variant: "segmented" }),
      numberField("whirlpoolTimeMinutes", "Время вирпула", "мин", {
        min: 0,
        step: 1,
        integer: true,
        visibleWhen: (state) => ibuWhirlpoolActive(state)
      }),
      numberField("whirlpoolTemperatureC", "Темп. вирпула", "°C", {
        min: 0,
        step: 1,
        visibleWhen: (state) => ibuWhirlpoolActive(state)
      }),
      {
        kind: "array",
        name: "additions",
        label: "Внесения хмеля",
        rowLabel: "Хмель",
        addLabel: "Добавить хмель",
        minRows: 1,
        fields: [
          numberField("amountG", "Масса", "г", { min: 0 }),
          numberField("alphaAcidPercent", "AA", "%", { min: 0, step: 0.1 }),
          numberField("timeMinutes", "Время", "мин", {
            min: 0,
            step: 1,
            visibleWhen: (_state, row) => s(row?.use, "boil") !== "dry_hop" && s(row?.use, "boil") !== "first_wort_hop"
          }),
          selectField("use", "Тип", [
            { value: "boil", label: hopUseLabels.boil },
            { value: "first_wort_hop", label: hopUseLabels.first_wort_hop },
            { value: "whirlpool", label: hopUseLabels.whirlpool },
            { value: "dry_hop", label: hopUseLabels.dry_hop }
          ]),
          selectField("form", "Форма", [
            { value: "pellet", label: "Гранулы" },
            { value: "leaf", label: "Листовой" }
          ], { variant: "segmented" })
        ]
      }
    ],
    calculate: (state) => {
      const formula = resolveIbuFormula(state);
      const whirlpoolActive = formula === "tinseth_whirlpool_v2";
      const additions: HopAdditionInput[] = rows(state.additions)
        .map((row, index) => ({
          id: `hop-${index}`,
          name: s(row.name, `Hop ${index + 1}`),
          // Фолбэки — 0, а не "типовые" 20 г/8%/60 мин: пустая строка (ArrayFieldEditor
          // добавляет новую строку с пустыми полями) не должна тихо считаться как заполненная.
          alphaAcidPercent: n(row.alphaAcidPercent, 0),
          weightG: n(row.amountG, 0),
          boilTimeMinutes: n(row.timeMinutes, 0),
          use: s(row.use, "boil") as HopAdditionInput["use"],
          utilizationFactor: s(row.form, "pellet") === "leaf" ? 0.9 : 1,
          // Поле убрано из UI, но сохранённые с ним старые состояния должны продолжать
          // влиять — ядро само падает на глобальную whirlpoolTemperatureC через ?? context.
          temperatureC: nOrUndefined(row.whirlpoolTemperatureC)
        }))
        // Масса 0 — пустая строка, не внесение: не должна давать ни IBU, ни вклад в списке.
        .filter((addition) => addition.weightG > 0);
      const result = calculateBitterness({
        formula,
        og: gravityToSg(n(state.wortGravity, 1.05), resolveGravityUnit(state)),
        batchVolumeL: n(state.postBoilVolumeL, 20),
        postBoilVolumeL: n(state.postBoilVolumeL, 20),
        boilTimeMinutes: n(state.boilTimeMinutes, 60),
        whirlpoolTemperatureC: n(state.whirlpoolTemperatureC, 85),
        // Вирпул-модель есть только у формулы v2. Фолбэк — 0 (пустое поле = нет отстоя),
        // а не 15, чтобы очищенное поле не включало перенос горечи молча.
        whirlpoolTimeMinutes: whirlpoolActive ? n(state.whirlpoolTimeMinutes, 0) : 0,
        hopAdditions: additions
      });
      const bugu = result.ibu / Math.max(1, (result.resolvedOg - 1) * 1000);
      const profile = buguProfile(bugu);

      // Вклад подписываем массой/временем хмеля, а не порядковым номером: пустые и dry-hop
      // строки выпадают из contributions, и «1./2.» указывали бы не на те строки формы.
      const additionById = new Map(additions.map((addition) => [addition.id, addition]));
      const describeContribution = (item: (typeof result.contributions)[number]): CalculatorResultStat => {
        const source = additionById.get(item.hopAdditionId);
        const massTime = source
          ? `${compactNumber(source.weightG, 1)} г · ${compactNumber(source.boilTimeMinutes, 0)} мин`
          : undefined;
        const helper = item.isCarryover
          ? (massTime ? `${massTime} · перенос` : "перенос")
          : massTime;
        return {
          label: formatHopUse(item.use),
          value: `${compactNumber(item.ibu, 1)} IBU`,
          helper
        };
      };

      const maxRows = 6;
      const contributionStats: CalculatorResultStat[] = result.contributions.length <= maxRows
        ? result.contributions.map(describeContribution)
        : [
          ...result.contributions.slice(0, maxRows - 1).map(describeContribution),
          { label: "Ещё внесений", value: `+${result.contributions.length - (maxRows - 1)}` }
        ];

      return {
        primary: { label: "IBU всего", value: compactNumber(result.ibu, 1), helper: `BU:GU ${bugu.toFixed(2)} — ${profile.label}` },
        stats: [
          { label: "BU:GU", value: bugu.toFixed(2), tone: profile.tone, helper: profile.label },
          ...contributionStats
        ],
        warnings: translateCoreWarnings(result.warnings),
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
      bottleSizeL: 0.5,
      syrupWaterMl: ""
    },
    applyQuery: (state, params) => ({ ...state, beerVolumeL: params.volume ?? state.beerVolumeL }),
    altMethod: {
      title: "Карбонизируешь суслом, а не сахаром?",
      description: "Шпайзе или кройцен — расчёт натуральной карбонизации несброженным суслом.",
      href: (state) => buildCalculatorHref("speise-krausen", { volume: n(state.beerVolumeL, 20), targetCo2: n(state.targetCo2Volumes, 2.4) })
    },
    fields: [
      selectField("sugarType", "Праймер", sugarTypeOptions, { variant: "chips", fullWidth: true }),
      numberField("beerVolumeL", "Объем пива", "л", { min: 0.1 }),
      numberField("beerTemperatureC", "Температура пива", "°C", {
        step: 0.5,
        helper: "В конце брожения, даже если пиво уже охладили"
      }),
      numberField("targetCo2Volumes", "Целевой CO2", "об.", { min: 0, step: 0.1 }),
      numberField("bottleSizeL", "Размер бутылки", "л", { min: 0.1, step: 0.01 }),
      numberField("syrupWaterMl", "Вода для сиропа", "мл", {
        min: 0,
        step: 10,
        advanced: true,
        helper: "Если вносишь праймер сиропом: растворяешь весь сахар в этой воде и кипятишь. Покажем объём и крепость сиропа."
      })
    ],
    calculate: (state) => {
      const result = calculatePrimingSugar({
        beerVolumeL: n(state.beerVolumeL, 20),
        beerTemperatureC: n(state.beerTemperatureC, 20),
        targetCo2Volumes: n(state.targetCo2Volumes, 2.4),
        sugarType: s(state.sugarType, "dextrose") as "dextrose" | "sucrose" | "dme" | "honey",
        bottleSizeL: n(state.bottleSizeL, 0.5)
      });

      const stats: CalculatorResultStat[] = [
        { label: "На бутылку", value: formatGrams(result.gramsPerBottle) },
        { label: "Остаточный CO2", value: `${result.residualCo2.toFixed(2)} об.`, helper: "уже растворено в пиве" }
      ];

      // Сироп для розлива: растворяем весь рассчитанный сахар в заданной воде. Растворённый
      // сахар сам занимает объём (~0,63 мл/г — по плотности сахарозы ≈1,59 г/мл), поэтому
      // объём сиропа больше объёма воды. Крепость — сколько сахара в готовом сиропе.
      const syrupWaterMl = n(state.syrupWaterMl, 0);
      if (syrupWaterMl > 0 && result.totalSugarGrams > 0) {
        const syrupVolumeMl = syrupWaterMl + result.totalSugarGrams * 0.63;
        const gramsPerMl = result.totalSugarGrams / syrupVolumeMl;
        stats.push(
          { label: "Объём сиропа", value: `≈ ${Math.round(syrupVolumeMl)} мл`, helper: `${formatGrams(result.totalSugarGrams)} сахара + ${Math.round(syrupWaterMl)} мл воды` },
          { label: "Крепость сиропа", value: `≈ ${(gramsPerMl * 10).toFixed(1)} г/10 мл` }
        );
      }

      return {
        primary: { label: "Всего праймера", value: formatGrams(result.totalSugarGrams), helper: `${result.gramsPerLiter.toFixed(2)} г/л` },
        stats,
        warnings: translateCoreWarnings(result.warnings),
        links: [
          // netVolume (не volume!): объём прайминга уже чистый (нет отдельного поля потерь
          // здесь), а bottling иначе вычел бы свои "Потери при розливе" ещё раз поверх него.
          { label: "Посчитать бутылки", href: buildCalculatorHref("bottling", { netVolume: n(state.beerVolumeL, 20), sugarPerLiter: result.gramsPerLiter }) },
          { label: calculatorBySlug["speise-krausen"].shortTitle, href: buildCalculatorHref("speise-krausen", { volume: n(state.beerVolumeL, 20), targetCo2: n(state.targetCo2Volumes, 2.4) }) },
          ...relatedLinks(["keg-carbonation", "abv-attenuation"])
        ]
      };
    }
  }),
  calculator("water-ph", {
    defaults: {
      mode: "manual",
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
      targetProfilePreset: WATER_TARGET_PROFILE_PRESETS[0].id,
      mashWaterVolumeL: 15,
      spargeWaterVolumeL: 12,
      cacl2G: 0,
      caso4G: 0,
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
      selectField("mode", "Режим", [
        { value: "manual", label: "Вручную" },
        { value: "target", label: "Подобрать соли" }
      ], { variant: "segmented", fullWidth: true }),
      numberField("mashWaterVolumeL", "Заторная вода", "л", { min: 0.1, group: "Затор" }),
      numberField("totalGrainKg", "Зерно", "кг", { min: 0.1, group: "Затор" }),
      selectField("colorCategory", "Цвет засыпи", [
        { value: "pale", label: "Светлая" },
        { value: "amber", label: "Янтарная" },
        { value: "dark", label: "Темная" }
      ], { variant: "segmented", group: "Затор" }),
      numberField("spargeWaterVolumeL", "Промывочная вода", "л", { min: 0, advanced: true }),
      ...waterProfileFields("source", false, "Исходная вода"),
      selectField("targetProfilePreset", "Целевой профиль", WATER_TARGET_PROFILE_OPTIONS, {
        group: "Соли и кислота",
        fullWidth: true,
        visibleWhen: isWaterPhTargetMode,
        helper: "Ориентировочные ppm — солвер подберёт соли из вашей воды под этот профиль"
      }),
      numberField("cacl2G", "CaCl2", "г", { min: 0, step: 0.1, group: "Соли и кислота", helper: "Хлорид кальция", visibleWhen: isWaterPhManualMode }),
      numberField("caso4G", "CaSO4", "г", { min: 0, step: 0.1, group: "Соли и кислота", helper: "Гипс (сульфат кальция)", visibleWhen: isWaterPhManualMode }),
      numberField("mgso4G", "MgSO4", "г", { min: 0, step: 0.1, advanced: true, helper: "Английская соль (сульфат магния)", visibleWhen: isWaterPhManualMode }),
      numberField("naclG", "NaCl", "г", { min: 0, step: 0.1, advanced: true, helper: "Поваренная соль", visibleWhen: isWaterPhManualMode }),
      numberField("nahco3G", "NaHCO3", "г", { min: 0, step: 0.1, advanced: true, helper: "Питьевая сода", visibleWhen: isWaterPhManualMode }),
      selectField("acid", "Кислота", [
        { value: "lactic_acid", label: "Молочная" },
        { value: "phosphoric_acid", label: "Фосфорная" }
      ], { advanced: true, variant: "segmented" }),
      numberField("acidulatedMaltPercent", "Кислый солод", "%", { min: 0, step: 0.1, advanced: true })
    ],
    calculate: (state) => {
      const mode = isWaterPhTargetMode(state) ? "target" : "manual";
      const sourceProfile = buildProfile(state, "source");
      const mashWaterVolumeL = n(state.mashWaterVolumeL, 15);
      const spargeWaterVolumeL = n(state.spargeWaterVolumeL, 0);
      const acid = s(state.acid, "lactic_acid") as "lactic_acid" | "phosphoric_acid";
      const totalGrainKg = n(state.totalGrainKg, 5);
      const colorCategory = s(state.colorCategory, "pale") as "pale" | "amber" | "dark";
      const acidulatedMaltPercent = n(state.acidulatedMaltPercent, 0);

      let salts: SaltAddition[];
      let targetWaterProfile: ReturnType<typeof buildProfile>;
      let solverScore: number | null = null;
      let solverWarnings: string[] = [];

      if (mode === "target") {
        const preset = waterTargetProfileById(s(state.targetProfilePreset, WATER_TARGET_PROFILE_PRESETS[0].id));
        targetWaterProfile = preset.profile;
        const solved = solveWaterTargetProfile({
          sourceProfile,
          targetProfile: preset.profile,
          waterLiters: Math.max(1, mashWaterVolumeL + spargeWaterVolumeL),
          allowedSalts: WATER_SOLVER_ALLOWED_SALTS
        });
        salts = solved.additions;
        solverScore = solved.score;
        solverWarnings = solved.warnings;
      } else {
        targetWaterProfile = buildProfile(state, "target");
        salts = buildSalts(state);
      }

      const result = calculateWaterPh({
        sourceWaterProfile: sourceProfile,
        targetWaterProfile,
        mashWaterVolumeL,
        spargeWaterVolumeL,
        salts,
        acid,
        totalGrainKg,
        colorCategory,
        acidulatedMaltPercent
      });
      const acidLabel = acid === "lactic_acid" ? "молочная 88%" : "фосфорная 85%";
      const acidTargetReached = !result.warnings.includes("target_not_reached_within_max_acid");

      const stats: CalculatorResultStat[] = [];

      if (mode === "target") {
        if (salts.length > 0) {
          for (const addition of salts) {
            const info = WATER_SALT_RU_LABELS[addition.salt];
            if (!info) continue;
            stats.push({ label: `${info.name} (${info.formula})`, value: formatGrams(addition.grams) });
          }
        } else {
          stats.push({ label: "Соли", value: "не нужны", helper: "Вода уже близка к целевому профилю" });
        }
      }

      stats.push(
        { label: "Ca", value: `${compactNumber(result.finalProfile.ca, 0)} ppm` },
        { label: "Mg", value: `${compactNumber(result.finalProfile.mg, 0)} ppm` },
        { label: "Na", value: `${compactNumber(result.finalProfile.na, 0)} ppm` },
        { label: "Cl", value: `${compactNumber(result.finalProfile.cl, 0)} ppm` },
        { label: "SO4", value: `${compactNumber(result.finalProfile.so4, 0)} ppm` },
        { label: "HCO3", value: `${compactNumber(result.finalProfile.hco3, 0)} ppm` },
        {
          label: "SO4:Cl",
          value: result.sulfateChlorideRatio != null ? result.sulfateChlorideRatio.toFixed(2) : "—",
          helper: "<0.8 — солодовое · 0.8–1.5 — баланс · >1.5 — хмелевое"
        },
        { label: "Кислота", value: `${compactNumber(result.acidNeededMl, 2)} мл`, helper: acidLabel }
      );
      if (result.postAcidPh != null) {
        stats.push({
          label: "pH после кислоты",
          value: result.postAcidPh.toFixed(2),
          helper: "цель 5.35",
          tone: acidTargetReached ? "good" : "warning"
        });
      }

      const warnings: Array<string | CalculatorResultWarning> = translateCoreWarnings([
        ...result.warnings,
        ...solverWarnings
      ]);
      if (mode === "target" && solverScore != null && solverScore > WATER_SOLVER_SCORE_WARNING_THRESHOLD) {
        warnings.push({
          text: "Подобрать соли под этот профиль из вашей воды не получилось — слишком большая разница по некоторым ионам. Попробуйте другой профиль или скорректируйте исходную воду.",
          tone: "warning"
        });
      }

      const links: CalculatorResultLink[] = [];
      if (mode === "target") {
        const manualQuery: Record<string, string | number> = { mode: "manual" };
        for (const saltId of WATER_SOLVER_ALLOWED_SALTS) {
          const fieldName = WATER_SALT_FIELD_NAME[saltId];
          if (!fieldName) continue;
          const addition = salts.find((item) => item.salt === saltId);
          manualQuery[fieldName] = addition ? addition.grams : 0;
        }
        links.push({ label: "Подставить соли в ручной режим", href: buildCalculatorHref("water-ph", manualQuery) });
      }
      links.push(...relatedLinks(["brewing-water-volume", "unit-converter", "beer-color"]));

      return {
        primary: { label: "pH затора", value: result.estimatedMashPh.toFixed(2) },
        stats,
        warnings,
        links
      };
    }
  }),
  calculator("yeast-starter", {
    defaults: {
      wortVolumeL: 20,
      // 12.4 °P — эквивалент прежнего SG-дефолта (1.050).
      gravity: 12.4,
      gravityUnit: "Plato",
      fermentationType: "ale",
      yeastType: "liquid",
      packsCount: 1,
      cellsPerPackBillion: 100,
      manufactureDate: "",
      viabilityPercent: "",
      starterMode: "stirPlate"
    },
    // Состояния, сохранённые до появления gravityUnit (или до смены дефолта SG→Plato),
    // хранят gravity в SG без явного ключа шкалы.
    migrateStoredState: (stored) => (
      stored.gravity != null && stored.gravityUnit == null
        ? { ...stored, gravityUnit: "SG" }
        : stored
    ),
    fields: [
      numberField("wortVolumeL", "Объем сусла", "л", { min: 0.1 }),
      numberField("gravity", "Плотность", "SG", {
        min: 1,
        dynamicUnit: (state) => gravityScaleUnitLabel(resolveGravityUnit(state)),
        dynamicStep: (state) => gravityScaleStep(resolveGravityUnit(state))
      }),
      gravityScaleField("gravityUnit", "gravity"),
      selectField("fermentationType", "Тип брожения", [
        { value: "ale", label: "Эль" },
        { value: "lager", label: "Лагер" },
        { value: "hybrid", label: "Гибрид" }
      ], { variant: "segmented" }),
      selectField("yeastType", "Тип дрожжей", [
        { value: "dry", label: "Сухие" },
        { value: "liquid", label: "Жидкие" }
      ], { variant: "segmented" }),
      numberField("packsCount", "Пакеты", "шт", { min: 0, step: 1, integer: true }),
      numberField("cellsPerPackBillion", "Клеток в пакете", "млрд", { min: 0, step: 10 }),
      dateField("manufactureDate", "Дата производства"),
      selectField("starterMode", "Стартер", [
        { value: "none", label: "Без стартера" },
        { value: "simple", label: "Простой" },
        { value: "stirPlate", label: "Мешалка" }
      ], { variant: "segmented" }),
      numberField("viabilityPercent", "Жизнеспособность", "%", {
        min: 0,
        max: 100,
        step: 1,
        advanced: true,
        helper: "Пусто — считаем по дате производства или берем типовую"
      })
    ],
    calculate: (state) => {
      const starterMode = s(state.starterMode, "stirPlate") as "none" | "simple" | "stirPlate";
      const result = calculateYeastStarter({
        wortVolumeL: n(state.wortVolumeL, 20),
        gravity: gravityToSg(n(state.gravity, 1.05), resolveGravityUnit(state)),
        fermentationType: s(state.fermentationType, "ale") as "ale" | "lager" | "hybrid",
        yeastType: s(state.yeastType, "liquid") as "dry" | "liquid",
        packsCount: n(state.packsCount, 1),
        cellsPerPackBillion: n(state.cellsPerPackBillion, 100),
        manufactureDate: dateValue(state.manufactureDate),
        viabilityPercent: nOrUndefined(state.viabilityPercent),
        starterMode
      });

      const primaryHelper = result.starterVolumeL > 0
        ? `${formatLiters(result.starterVolumeL)} стартера`
        : starterMode === "none" && result.pitchStatus === "underpitch"
          ? "Дрожжей не хватает — добавьте пакет или сделайте стартер"
          : "Без стартера по расчету";

      const stats: CalculatorResultStat[] = [
        { label: "Нужно клеток", value: `${compactNumber(result.requiredCellsBillion, 0)} млрд` },
        { label: "Доступно", value: `${compactNumber(result.viableCellsBillion, 0)} млрд` },
        { label: "Жизнеспособность", value: formatPercent(result.viabilityPercent) }
      ];
      if (result.starterVolumeL > 0) {
        stats.push({ label: "Экстракт на стартер", value: formatGrams(result.dmeForStarterG) });
      }

      return {
        primary: {
          label: "Статус внесения",
          value: formatPitchStatus(result.pitchStatus),
          helper: primaryHelper,
          tone: result.pitchStatus === "ok" ? "good" : "warning"
        },
        stats,
        warnings: translateCoreWarnings(result.warnings),
        links: relatedLinks(["abv-attenuation", "unit-converter"])
      };
    }
  }),
  calculator("keg-carbonation", {
    defaults: {
      beerTemperatureC: 4,
      targetCo2Volumes: 2.4,
      pressureUnit: "PSI"
    },
    modeHint: () => "Равновесное давление одинаково для набора карбонизации и подачи; для шпунтования выставляйте его же на клапане.",
    fields: [
      numberField("beerTemperatureC", "Температура пива", "°C", { step: 0.5 }),
      numberField("targetCo2Volumes", "Целевой CO2", "об.", { min: 0, step: 0.1 }),
      selectField("pressureUnit", "Единицы измерения", [
        { value: "PSI", label: "PSI" },
        { value: "bar", label: "bar" },
        { value: "kPa", label: "kPa" }
      ], { variant: "segmented" })
    ],
    calculate: (state) => {
      const result = calculateKegCarbonationPressure({
        beerTemperatureC: n(state.beerTemperatureC, 4),
        targetCo2Volumes: n(state.targetCo2Volumes, 2.4)
      });
      const unit = s(state.pressureUnit, "PSI") as "PSI" | "bar" | "kPa";
      const pressureByUnit = {
        PSI: { value: compactNumber(result.psi, 1), numeric: result.psi },
        bar: { value: compactNumber(result.bar, 2), numeric: result.bar },
        kPa: { value: compactNumber(result.kpa, 0), numeric: result.kpa }
      };
      const chosen = pressureByUnit[unit] ?? pressureByUnit.PSI;
      const otherUnits = (["PSI", "bar", "kPa"] as const).filter((key) => key !== unit);

      return {
        primary: { label: "Давление", value: `${chosen.value} ${unit}`, helper: "Равновесное давление при температуре пива" },
        stats: otherUnits.map((key) => ({ label: key, value: pressureByUnit[key].value })),
        warnings: translateCoreWarnings(result.warnings),
        links: [
          { label: "Конвертер давления", href: buildCalculatorHref("unit-converter", { group: "pressure", value: chosen.numeric, from: unit }) },
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
      selectField("methodPreset", "Метод", [
        { value: "BIAB", label: "BIAB" },
        { value: "allInOne", label: "Система All-in-one" },
        { value: "mashTunWithSparge", label: "Заторник + промывка" },
        { value: "extract", label: "Экстракт" }
      ]),
      numberField("targetFermenterVolumeL", "В ферментер", "л", { min: 0.1 }),
      numberField("grainWeightKg", "Зерно", "кг", {
        min: 0,
        visibleWhen: (state) => s(state.methodPreset, "mashTunWithSparge") !== "extract"
      }),
      numberField("mashThicknessLPerKg", "Гидромодуль", "л/кг", {
        min: 0,
        step: 0.1,
        visibleWhen: (state) => !BREWING_WATER_NO_SPARGE_METHODS.has(s(state.methodPreset, "mashTunWithSparge"))
      }),
      numberField("boilTimeMinutes", "Время кипячения", "мин", { min: 0, step: 5 }),
      numberField("boilOffRateLPerHour", "Испарение", "л/ч", { min: 0, step: 0.1 }),
      numberField("grainAbsorptionLPerKg", "Впитывание зерна", "л/кг", {
        min: 0,
        step: 0.05,
        advanced: true,
        visibleWhen: (state) => s(state.methodPreset, "mashTunWithSparge") !== "extract"
      }),
      numberField("kettleLossL", "Потери в котле", "л", { min: 0, advanced: true, helper: "Мертвый объем котла/фильтра — что не сливается" }),
      numberField("trubChillerLossL", "Осадок/чиллер", "л", { min: 0, advanced: true, helper: "Остается с хмелевым осадком и в чиллере после кипячения" }),
      numberField("coolingShrinkagePercent", "Усадка при охлаждении", "%", { min: 0, advanced: true })
    ],
    calculate: (state) => {
      const methodPreset = s(state.methodPreset, "mashTunWithSparge") as "BIAB" | "allInOne" | "mashTunWithSparge" | "extract";
      const isExtract = methodPreset === "extract";
      const isNoSparge = BREWING_WATER_NO_SPARGE_METHODS.has(methodPreset);
      const result = calculateBrewingWaterVolume({
        targetFermenterVolumeL: n(state.targetFermenterVolumeL, 20),
        grainWeightKg: isExtract ? 0 : n(state.grainWeightKg, 5),
        mashThicknessLPerKg: n(state.mashThicknessLPerKg, 3),
        boilTimeMinutes: n(state.boilTimeMinutes, 60),
        boilOffRateLPerHour: n(state.boilOffRateLPerHour, 4),
        grainAbsorptionLPerKg: isExtract ? 0 : n(state.grainAbsorptionLPerKg, 0.8),
        kettleLossL: n(state.kettleLossL, 0.5),
        trubChillerLossL: n(state.trubChillerLossL, 1),
        coolingShrinkagePercent: n(state.coolingShrinkagePercent, 4),
        methodPreset
      });

      const stats: CalculatorResultStat[] = [
        { label: "Затор", value: formatLiters(result.mashWaterL) }
      ];
      if (!isNoSparge) {
        stats.push({ label: "Промывка", value: formatLiters(result.spargeWaterL) });
      }
      stats.push(
        { label: "До кипячения", value: formatLiters(result.preBoilVolumeL) },
        { label: "После кипячения", value: formatLiters(result.postBoilHotVolumeL) },
        { label: "Холодный объем", value: formatLiters(result.postBoilCoolVolumeL) }
      );

      return {
        primary: {
          label: "Всего воды",
          value: formatLiters(result.totalWaterNeededL),
          helper: isNoSparge ? `Вся вода в затор: ${formatLiters(result.mashWaterL)}` : `Затор ${formatLiters(result.mashWaterL)} · промывка ${formatLiters(result.spargeWaterL)}`
        },
        stats,
        warnings: translateCoreWarnings(result.warnings),
        links: [
          { label: "Использовать объемы в воде и pH", href: buildCalculatorHref("water-ph", { mashWater: result.mashWaterL, spargeWater: result.spargeWaterL }) },
          ...relatedLinks(["dilution-boiloff", "ibu", "unit-converter"])
        ]
      };
    }
  }),
  calculator("mash-infusion", {
    defaults: {
      mode: "strike",
      grainKg: 5,
      mashWaterL: 15,
      grainTempC: 20,
      targetTempC: 66,
      tunThermalMassL: 0,
      currentMashWaterL: 15,
      currentTempC: 63,
      nextPauseTempC: 72,
      infusionWaterTempC: 98
    },
    fields: [
      selectField("mode", "Режим", [
        { value: "strike", label: "Начало затирания" },
        { value: "infusion", label: "Долив кипятка" }
      ], { variant: "segmented" }),
      numberField("grainKg", "Зерно", "кг", { min: 0, step: 0.1 }),
      numberField("mashWaterL", "Объем воды", "л", {
        min: 0.1,
        visibleWhen: (state) => s(state.mode, "strike") === "strike"
      }),
      numberField("grainTempC", "Температура зерна", "°C", {
        step: 0.5,
        visibleWhen: (state) => s(state.mode, "strike") === "strike"
      }),
      numberField("targetTempC", "Температура затора", "°C", {
        step: 0.5,
        visibleWhen: (state) => s(state.mode, "strike") === "strike"
      }),
      numberField("tunThermalMassL", "Термомасса котла", "экв. л", {
        min: 0,
        step: 0.1,
        advanced: true,
        visibleWhen: (state) => s(state.mode, "strike") === "strike",
        helper: "Сколько тепла заберет холодный котел, в эквиваленте литров воды. Прогреваете заранее — оставьте 0"
      }),
      numberField("currentMashWaterL", "Воды в заторе", "л", {
        min: 0.1,
        visibleWhen: (state) => s(state.mode, "strike") === "infusion"
      }),
      numberField("currentTempC", "Текущая пауза", "°C", {
        step: 0.5,
        visibleWhen: (state) => s(state.mode, "strike") === "infusion"
      }),
      numberField("nextPauseTempC", "Следующая пауза", "°C", {
        step: 0.5,
        visibleWhen: (state) => s(state.mode, "strike") === "infusion"
      }),
      numberField("infusionWaterTempC", "Температура долива", "°C", {
        step: 0.5,
        visibleWhen: (state) => s(state.mode, "strike") === "infusion"
      })
    ],
    calculate: (state) => {
      const mode = s(state.mode, "strike");
      const grainKg = n(state.grainKg, 5);

      if (mode === "infusion") {
        const result = calculateInfusionStep({
          grainKg,
          currentMashWaterL: n(state.currentMashWaterL, 15),
          currentTempC: n(state.currentTempC, 63),
          targetTempC: n(state.nextPauseTempC, 72),
          infusionWaterTempC: n(state.infusionWaterTempC, 98)
        });

        return {
          primary: { label: "Долить", value: formatLiters(result.infusionVolumeL) },
          stats: [
            { label: "Всего воды", value: formatLiters(result.newTotalWaterL) },
            { label: "Новый гидромодуль", value: `${result.newThicknessLPerKg.toFixed(2)} л/кг` }
          ],
          warnings: translateCoreWarnings(result.warnings),
          links: [
            { label: "Учесть объем в воде на варку", href: buildCalculatorHref("brewing-water-volume", { grainWeightKg: grainKg, mashThicknessLPerKg: result.newThicknessLPerKg }) },
            ...relatedLinks(["water-ph", "brewhouse-efficiency", "unit-converter"])
          ]
        };
      }

      const result = calculateStrikeWater({
        grainKg,
        mashWaterL: n(state.mashWaterL, 15),
        grainTempC: n(state.grainTempC, 20),
        targetTempC: n(state.targetTempC, 66),
        tunThermalMassL: n(state.tunThermalMassL, 0)
      });
      const boilingWarning = result.warnings.includes("strike_temp_above_boiling") || result.warnings.includes("strike_temp_near_boiling");
      // Невалидный вход (объём воды <= 0) — ядро само не даёт Infinity (см. calculateStrikeWater),
      // но результат всё равно не про что показывать числом: primary «—», как у пустого/
      // невозможного состояния в других калькуляторах (напр. SO4:Cl в water-ph).
      const invalidStrike = !Number.isFinite(result.strikeTempC) || result.warnings.includes("mash_water_required");

      return {
        primary: {
          label: "Температура воды",
          value: invalidStrike ? "—" : `${result.strikeTempC.toFixed(1)} °C`,
          tone: invalidStrike ? undefined : (boilingWarning ? "warning" : undefined)
        },
        stats: [
          { label: "Гидромодуль", value: invalidStrike ? "—" : `${result.mashThicknessLPerKg.toFixed(2)} л/кг` }
        ],
        warnings: translateCoreWarnings(result.warnings),
        links: [
          { label: "Учесть объем в воде на варку", href: buildCalculatorHref("brewing-water-volume", { grainWeightKg: grainKg, mashThicknessLPerKg: result.mashThicknessLPerKg }) },
          ...relatedLinks(["water-ph", "brewhouse-efficiency", "unit-converter"])
        ]
      };
    }
  }),
  calculator("beer-color", {
    defaults: {
      batchVolumeL: 20,
      colorUnit: "EBC",
      // В Lovibond это 2°L (светлый солод) и 40°L (карамельный) — то же самое в EBC (дефолт шкалы).
      fermentables: [
        { weightKg: 4.5, colorLovibond: 3.8 },
        { weightKg: 0.3, colorLovibond: 105.2 }
      ]
    },
    // Дефолт шкалы стал EBC, но состояния, сохранённые до появления ключа colorUnit,
    // вводились в Lovibond — без миграции те же цифры молча читались бы как EBC (~2× занижение).
    migrateStoredState: (stored) => (
      stored.fermentables != null && stored.colorUnit == null
        ? { ...stored, colorUnit: "Lovibond" }
        : stored
    ),
    fields: [
      numberField("batchVolumeL", "Объем партии", "л", { min: 0.1 }),
      selectField("colorUnit", "Шкала цвета", [
        { value: "EBC", label: "EBC" },
        { value: "Lovibond", label: "°L" }
      ], {
        variant: "segmented",
        // По образцу gravityScaleField: смена шкалы пересчитывает уже введённый цвет солода
        // во ВСЕХ строках засыпи (EBC↔Lovibond через convertBrewingUnitGroup, тот же путь через
        // SRM, что и в calculate() ниже) — вместо того чтобы держать значения буквально, но
        // молча под неверной шкалой.
        transformOnChange: (nextUnit, state) => {
          const fromUnit = s(state.colorUnit, "EBC") === "Lovibond" ? "Lovibond" : "EBC";
          const toUnit = nextUnit === "Lovibond" ? "Lovibond" : "EBC";
          if (fromUnit === toUnit) {
            return [];
          }
          return [["fermentables", convertFermentablesColorUnit(state.fermentables, fromUnit, toUnit)]];
        }
      }),
      {
        kind: "array",
        name: "fermentables",
        label: "Засыпь",
        rowLabel: "Солод",
        addLabel: "Добавить солод",
        minRows: 1,
        fields: [
          numberField("weightKg", "Вес", "кг", { min: 0, step: 0.1 }),
          numberField("colorLovibond", "Цвет", "EBC | °L", { min: 0, step: 0.5 })
        ]
      }
    ],
    calculate: (state) => {
      const colorUnit = s(state.colorUnit, "EBC") === "Lovibond" ? "Lovibond" : "EBC";
      const toLovibond = (raw: number) => (
        colorUnit === "EBC" ? convertBrewingUnitGroup("color", raw, "EBC").Lovibond : raw
      );
      const result = calculateBeerColorSimple({
        batchVolumeL: n(state.batchVolumeL, 20),
        fermentables: rows(state.fermentables).map((row) => ({
          weightKg: n(row.weightKg, 0),
          colorLovibond: toLovibond(n(row.colorLovibond, 0))
        }))
      });
      const shade = beerColorFromSrm(result.srm);

      return {
        primary: {
          label: "Цвет пива",
          value: `${result.srm.toFixed(1)} SRM / ${result.ebc.toFixed(0)} EBC`,
          helper: `${shade.label} · MCU ${result.mcu.toFixed(1)}`,
          swatchColor: shade.hex
        },
        stats: [
          { label: "SRM", value: result.srm.toFixed(1) },
          { label: "EBC", value: result.ebc.toFixed(1) },
          { label: "MCU", value: result.mcu.toFixed(2) },
          ...result.contributions.slice(0, 6).map((item, index) => ({
            label: `Солод ${index + 1}`,
            value: result.mcu > 0 ? `${compactNumber((item.mcu / result.mcu) * 100, 0)}% цвета` : "—",
            helper: `MCU ${item.mcu.toFixed(2)}`
          }))
        ],
        links: relatedLinks(["ibu", "water-ph", "unit-converter"])
      };
    }
  }),
  calculator("brewhouse-efficiency", {
    defaults: {
      mode: "measure",
      batchVolumeL: 20,
      // Одна осмысленная позиция — сразу даёт живой пример-результат; остальную засыпь
      // пользователь добавляет сам. Второй произвольный солод в дефолте только путал.
      fermentables: [
        { name: "Светлый базовый солод", weightKg: 4.5, ppg: 37, mashed: "1" }
      ],
      // 12.4 °P — эквивалент прежнего SG-дефолта (1.050).
      measuredOg: 12.4,
      gravityUnit: "Plato",
      brewhouseEfficiencyPercent: 75
    },
    // Состояния, сохранённые до появления gravityUnit (или до смены дефолта SG→Plato),
    // хранят measuredOg в SG без явного ключа шкалы. Старые строки засыпи (пресетный select
    // "Тип" — до IngredientPicker) переносим в новую форму {name, weightKg, ppg, mashed}.
    migrateStoredState: (stored) => {
      const withGravityFix = stored.measuredOg != null && stored.gravityUnit == null
        ? { ...stored, gravityUnit: "SG" }
        : stored;
      const fermentableRows = rows(withGravityFix.fermentables);
      const hasLegacyRows = fermentableRows.some((row) => typeof row.type === "string");
      return hasLegacyRows
        ? { ...withGravityFix, fermentables: fermentableRows.map(migrateFermentableRow) }
        : withGravityFix;
    },
    fields: [
      selectField("mode", "Режим", [
        { value: "measure", label: "Узнать эффективность" },
        { value: "predict", label: "Прогноз НП" }
      ], { variant: "segmented" }),
      numberField("batchVolumeL", "Объем сусла", "л", {
        min: 0.1,
        helper: "В который замеряете плотность — обычно в ферментере"
      }),
      {
        kind: "array",
        name: "fermentables",
        label: "Засыпь",
        rowLabel: "Позиция",
        addLabel: "Добавить в засыпь",
        minRows: 1,
        fields: [
          {
            kind: "ingredient",
            name: "name",
            label: "Ингредиент",
            fullWidth: true,
            ingredientCategory: "fermentable",
            placeholder: "Солод из базы или впишите своё название",
            onPick: (item) => [
              ["name", item.primaryLabelRu ?? item.displayName],
              ["ppg", getIngredientPotentialPpg({ technicalData: item.technicalData }, 36)],
              ["mashed", fermentableAppliesMashEfficiency(item.technicalData, true) ? "1" : "0"]
            ]
          },
          numberField("weightKg", "Вес", "кг", { min: 0, step: 0.1 }),
          numberField("ppg", "Экстрактивность (PPG)", undefined, { min: 0, step: 1 }),
          selectField("mashed", "Тип", [
            { value: "1", label: "Солод и зерно" },
            { value: "0", label: "Сахар и экстракт" }
          ], { variant: "segmented", fullWidth: true })
        ]
      },
      numberField("measuredOg", "Замеренная НП", "SG", {
        min: 0,
        dynamicUnit: (state) => gravityScaleUnitLabel(resolveGravityUnit(state)),
        dynamicStep: (state) => gravityScaleStep(resolveGravityUnit(state)),
        visibleWhen: (state) => s(state.mode, "measure") === "measure"
      }),
      // Видим в обоих режимах: в predict шкала задаёт единицу вывода прогноза, а не только
      // ввода замера — но transformOnChange всё равно конвертирует скрытую measuredOg, чтобы
      // при возврате в "Узнать эффективность" значение осталось согласованным с выбором.
      gravityScaleField("gravityUnit", "measuredOg"),
      numberField("brewhouseEfficiencyPercent", "Эффективность", "%", {
        min: 0,
        step: 1,
        helper: "75% — типично; возьмите свою из прошлых варок",
        visibleWhen: (state) => s(state.mode, "measure") === "predict"
      })
    ],
    calculate: (state) => {
      const mode = s(state.mode, "measure");
      const batchVolumeL = n(state.batchVolumeL, 20);
      const fermentables = readFermentables(state);
      const unit = resolveGravityUnit(state, "gravityUnit");
      const prefUnit = fromCalculatorGravityUnit(unit);

      if (mode === "predict") {
        const brewhouseEfficiencyPercent = n(state.brewhouseEfficiencyPercent, 75);
        const predictedOg = predictOgAtEfficiency({ fermentables, batchVolumeL, brewhouseEfficiencyPercent });
        const ogAt65 = predictOgAtEfficiency({ fermentables, batchVolumeL, brewhouseEfficiencyPercent: 65 });
        const ogAt85 = predictOgAtEfficiency({ fermentables, batchVolumeL, brewhouseEfficiencyPercent: 85 });

        return {
          primary: {
            label: "Прогноз НП",
            value: formatGravity(predictedOg, prefUnit),
            helper: formatGravitySecondary(predictedOg, prefUnit) ?? undefined
          },
          stats: [
            { label: "При 65%", value: formatGravity(ogAt65, prefUnit) },
            { label: "При 85%", value: formatGravity(ogAt85, prefUnit) }
          ],
          links: [
            { label: "Посчитать крепость по этой НП", href: buildCalculatorHref("abv-attenuation", { og: predictedOg.toFixed(3) }) },
            ...relatedLinks(["dilution-boiloff", "mash-infusion", "beer-color"])
          ]
        };
      }

      const measuredOgSg = gravityToSg(n(state.measuredOg, 1.05), unit);
      const result = estimateBrewhouseEfficiency({ fermentables, batchVolumeL, measuredOg: measuredOgSg });
      const ogAt100 = predictOgAtEfficiency({ fermentables, batchVolumeL, brewhouseEfficiencyPercent: 100 });
      const efficiencyTone: CalculatorResultStat["tone"] = result.efficiencyPercent >= 60 && result.efficiencyPercent <= 85 ? "good" : "warning";
      // Ядро больше не отдаёт Infinity/NaN (см. estimateBrewhouseEfficiency), но когда считать
      // было не из чего (пустая/беспотенциальная засыпь, НП не выше 1.000 SG) — 0% выглядел бы
      // как реальный результат, а не как «не посчитано». Показываем «—», как в п.2 у mash-infusion.
      const invalidEfficiency = !Number.isFinite(result.efficiencyPercent)
        || result.warnings.includes("no_grain_bill")
        || result.warnings.includes("no_grain_potential")
        || result.warnings.includes("no_measured_points");

      return {
        primary: {
          label: "Эффективность варки",
          value: invalidEfficiency ? "—" : `${result.efficiencyPercent.toFixed(1)}%`,
          tone: invalidEfficiency ? undefined : efficiencyTone
        },
        stats: [
          { label: "Потенциал засыпи", value: `${result.grainPotentialPoints.toFixed(1)} пунктов` },
          { label: "НП при 100%", value: formatGravity(ogAt100, prefUnit) }
        ],
        warnings: translateCoreWarnings(result.warnings),
        links: [
          { label: "Посчитать крепость по этой НП", href: buildCalculatorHref("abv-attenuation", { og: measuredOgSg.toFixed(3) }) },
          ...relatedLinks(["dilution-boiloff", "mash-infusion", "beer-color"])
        ]
      };
    }
  }),
  calculator("bottling", {
    defaults: {
      beerVolumeL: 20,
      packagingLossL: 0.5,
      bottleSizeL: 0.5,
      sugarPerLiter: 0
    },
    applyQuery: (state, params) => ({
      ...state,
      // netVolume — объём уже ЧИСТЫЙ (без потерь при розливе, напр. из прайминга): обнуляем
      // packagingLossL, иначе потери вычлись бы дважды. Старый "volume" оставлен как есть —
      // совместимость со входящими ссылками, где объём ещё не чистый.
      beerVolumeL: params.netVolume ?? params.volume ?? state.beerVolumeL,
      packagingLossL: params.netVolume != null ? 0 : state.packagingLossL,
      sugarPerLiter: params.sugarPerLiter ?? state.sugarPerLiter
    }),
    fields: [
      numberField("beerVolumeL", "Объем пива", "л", { min: 0.1 }),
      numberField("packagingLossL", "Потери при розливе", "л", { min: 0 }),
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
      const sugarPerLiter = n(state.sugarPerLiter, 0);
      const result = calculateBottling({
        beerVolumeL: n(state.beerVolumeL, 20),
        packagingLossL: n(state.packagingLossL, 0.5),
        bottleSizesL: [n(state.bottleSizeL, 0.5)],
        sugarPerLiter
      });

      const stats: CalculatorResultStat[] = [
        { label: "Объем розлива", value: formatLiters(result.packageVolumeL) }
      ];
      if (sugarPerLiter > 0) {
        stats.push({ label: "Сахар на бутылку", value: formatGrams(result.sugarPerBottleG) });
      }

      return {
        primary: { label: "Бутылок нужно", value: `${result.bottlesNeeded} шт`, helper: `Остаток ${formatLiters(result.remainingVolumeL)}` },
        stats,
        links: [
          { label: "Посчитать сахар", href: buildCalculatorHref("priming-sugar", { volume: result.packageVolumeL }) },
          { label: calculatorBySlug["speise-krausen"].shortTitle, href: buildCalculatorHref("speise-krausen", { volume: result.packageVolumeL }) },
          ...relatedLinks(["unit-converter"])
        ]
      };
    }
  }),
  calculator("speise-krausen", {
    defaults: {
      mode: "speise",
      beerVolumeL: 20,
      targetCo2: 2.4,
      residualCo2: "",
      // 12.4 °P — эквивалент прежнего SG-дефолта (1.050).
      speiseGravity: 12.4,
      gravityUnit: "Plato",
      temperatureC: 20
    },
    modeHint: () => "Шпайзе — несброженное сусло; кройцен — активно бродящее молодое пиво.",
    // "gyle" был прежним значением mode (select теперь предлагает только speise/krausen) —
    // у прежних посетителей он мог осесть в localStorage, контрол рендерился бы без выбора.
    // speiseGravity, сохранённая до появления gravityUnit (или до смены дефолта SG→Plato),
    // хранит значение в SG без явного ключа шкалы.
    migrateStoredState: (stored) => {
      const withModeFix = stored.mode === "gyle" ? { ...stored, mode: "speise" } : stored;
      return withModeFix.speiseGravity != null && withModeFix.gravityUnit == null
        ? { ...withModeFix, gravityUnit: "SG" }
        : withModeFix;
    },
    applyQuery: (state, params) => ({
      ...state,
      // "mode" — обычное скалярное поле, initialCalculatorStateFromQuery уже скопировала его
      // из query как есть до вызова applyQuery — старые ссылки с ?mode=gyle нормализуем здесь же.
      mode: state.mode === "gyle" ? "speise" : state.mode,
      beerVolumeL: params.volume ?? state.beerVolumeL,
      targetCo2: params.targetCo2 ?? state.targetCo2,
      residualCo2: params.residualCo2 ?? state.residualCo2
    }),
    fields: [
      selectField("mode", "Режим", [
        { value: "speise", label: "Шпайзе / гайл" },
        { value: "krausen", label: "Кройцен" }
      ], { variant: "segmented" }),
      numberField("beerVolumeL", "Объем пива", "л", { min: 0.1 }),
      numberField("targetCo2", "Целевой CO2", "об.", { min: 0, step: 0.1 }),
      numberField("speiseGravity", "Плотность сусла", "SG", {
        min: 1,
        dynamicUnit: (state) => gravityScaleUnitLabel(resolveGravityUnit(state)),
        dynamicStep: (state) => gravityScaleStep(resolveGravityUnit(state))
      }),
      gravityScaleField("gravityUnit", "speiseGravity"),
      numberField("temperatureC", "Температура", "°C", { step: 0.5 }),
      numberField("residualCo2", "Остаточный CO2", "об.", {
        min: 0,
        step: 0.01,
        advanced: true,
        helper: "Пусто — считаем по температуре пива"
      })
    ],
    calculate: (state) => {
      const result = calculateSpeiseKrausen({
        mode: s(state.mode, "speise") as "speise" | "krausen" | "gyle",
        beerVolumeL: n(state.beerVolumeL, 20),
        targetCo2: n(state.targetCo2, 2.4),
        residualCo2: nOrUndefined(state.residualCo2),
        speiseGravity: gravityToSg(n(state.speiseGravity, 1.05), resolveGravityUnit(state)),
        temperatureC: n(state.temperatureC, 20)
      });

      return {
        primary: { label: "Добавить сусло", value: formatLiters(result.speiseVolumeToAddL), helper: `Финальный объем ${formatLiters(result.finalVolumeL)}` },
        stats: [
          { label: "Финальный объем", value: formatLiters(result.finalVolumeL) },
          { label: "Изменение ABV", value: formatPercent(result.approximateAbvChange, 2), helper: "дображивание в бутылке" },
          { label: "Остаточный CO2", value: `${result.residualCo2.toFixed(2)} об.`, helper: "по температуре пива" }
        ],
        links: relatedLinks(["priming-sugar", "bottling", "keg-carbonation", "unit-converter"])
      };
    }
  }),
  calculator("hop-freshness", {
    defaults: {
      originalAlphaAcidPercent: 10,
      packageDate: "",
      openedDate: "",
      storageTemperatureC: 4,
      packaging: "vacuum",
      form: "pellet",
      hsi: "",
      targetAmountG: 50
    },
    fields: [
      numberField("originalAlphaAcidPercent", "Исходный AA", "%", { min: 0, step: 0.1 }),
      dateField("packageDate", "Дата упаковки", { helper: "Указана на пачке. Пусто — считаем хмель свежим" }),
      dateField("openedDate", "Дата вскрытия", { advanced: true }),
      numberField("storageTemperatureC", "Температура хранения", "°C", { step: 1 }),
      selectField("packaging", "Упаковка", [
        { value: "vacuum", label: "Вакуум" },
        { value: "nitrogen", label: "Азот" },
        { value: "opened", label: "Вскрытая" },
        { value: "loose", label: "Россыпью" }
      ], { variant: "segmented" }),
      selectField("form", "Форма", [
        { value: "pellet", label: "Гранулы" },
        { value: "leaf", label: "Листовой" }
      ], { variant: "segmented" }),
      numberField("hsi", "HSI", undefined, { min: 0, step: 0.01, advanced: true, helper: "Пусто — типовой для формы хмеля" }),
      numberField("targetAmountG", "Навеска по рецепту", "г", { min: 0, step: 1, helper: "Сколько этого хмеля требует рецепт" })
    ],
    calculate: (state) => {
      const targetAmountG = n(state.targetAmountG, 0);
      const result = calculateHopFreshness({
        originalAlphaAcidPercent: n(state.originalAlphaAcidPercent, 10),
        packageDate: dateValue(state.packageDate) ?? new Date(),
        openedDate: dateValue(state.openedDate),
        storageTemperatureC: n(state.storageTemperatureC, 4),
        packaging: s(state.packaging, "vacuum") as "vacuum" | "nitrogen" | "opened" | "loose",
        form: s(state.form, "pellet") as "pellet" | "leaf",
        hsi: nOrUndefined(state.hsi),
        targetAmountG
      });

      const lostBitternessPercent = Math.round((1 - result.freshnessFactor) * 100);
      const stats: CalculatorResultStat[] = [];
      if (targetAmountG > 0) {
        stats.push({
          label: "Масса для той же IBU",
          value: formatGrams(result.suggestedAmountForSameIbuG),
          helper: "вместо навески по рецепту"
        });
      }

      return {
        primary: {
          label: "Текущий AA",
          value: formatPercent(result.estimatedCurrentAA, 2),
          helper: `Потеряно ~${lostBitternessPercent}% горечи`,
          tone: result.freshnessFactor >= 0.85 ? "good" : "warning"
        },
        stats,
        warnings: translateCoreWarnings(result.warnings),
        links: [
          { label: "Использовать новый AA% в IBU", href: buildCalculatorHref("ibu", { aa: result.estimatedCurrentAA }) },
          ...relatedLinks(["unit-converter"])
        ]
      };
    }
  }),
  calculator("unit-converter", {
    // Состояние — по одной паре {from, value} на каждую группу: страница показывает
    // все мини-конвертеры сразу, каждый живёт отдельно.
    defaults: {
      activeGroup: "gravity",
      // 12.4 °P — эквивалент прежнего SG-дефолта (1.05).
      gravityFrom: "Plato", gravityValue: "12.4",
      colorFrom: "SRM", colorValue: "6",
      volumeFrom: "L", volumeValue: "20",
      weightFrom: "kg", weightValue: "1",
      temperatureFrom: "C", temperatureValue: "20",
      pressureFrom: "PSI", pressureValue: "14.5",
      concentrationFrom: "ppm", concentrationValue: "100"
    },
    // Состояния, сохранённые до появления gravityFrom (или до смены дефолта SG→Plato),
    // хранят gravityValue в SG без явного ключа шкалы.
    migrateStoredState: (stored) => (
      stored.gravityValue != null && stored.gravityFrom == null
        ? { ...stored, gravityFrom: "SG" }
        : stored
    ),
    // Входящие ссылки (напр. из кеговой карбонизации) передают group/value/from —
    // раскладываем их в per-group ключи. psi оставлен для обратной совместимости старых ссылок.
    applyQuery: (state, params) => {
      if (params.group && params.group in CONVERTER_GROUP_UNITS && params.value != null) {
        // from вне списка единиц группы игнорируем: иначе цепочки конверсий в core молча
        // трактуют неизвестную единицу как последнюю ветку (gal/lb/Brix/kPa).
        const fromIsValid = params.from != null && CONVERTER_GROUP_UNITS[params.group].includes(params.from);
        return {
          ...state,
          activeGroup: params.group,
          [`${params.group}From`]: fromIsValid ? params.from : state[`${params.group}From`],
          [`${params.group}Value`]: params.value
        };
      }
      if (params.psi) {
        return { ...state, activeGroup: "pressure", pressureFrom: "PSI", pressureValue: params.psi };
      }
      return state;
    },
    // Рендерится собственным блоком (UnitConverterBlock), без generic-полей и правой панели.
    fields: [],
    calculate: () => ({
      primary: { label: "Конвертер", value: "—" },
      stats: [],
      links: relatedLinks(["abv-attenuation", "ibu", "water-ph", "keg-carbonation"])
    })
  })
];

export const calculatorDefinitionBySlug = Object.fromEntries(
  calculatorDefinitions.map((definition) => [definition.catalog.slug, definition])
) as Record<CalculatorSlug, CalculatorDefinition>;

export const getCalculatorDefinition = (slug: string): CalculatorDefinition | null => (
  slug in calculatorDefinitionBySlug ? calculatorDefinitionBySlug[slug as CalculatorSlug] : null
);

// keg-carbonation и unit-converter рендерятся собственными блоками без generic-состояния/
// результата (см. showResultActions в CalculatorPageClient) — у них нет ни липкого
// мобильного бара результата, ни резервного отступа под него. Признак живёт здесь, а не
// как отдельный список строк в page.tsx, чтобы серверная страница и клиентский компонент
// не расходились при добавлении нового калькулятора без generic-панели.
const CALCULATORS_WITHOUT_STICKY_RESULT_BAR = new Set<CalculatorSlug>(["keg-carbonation", "unit-converter"]);

export const calculatorHasStickyResultBar = (slug: CalculatorSlug): boolean => (
  !CALCULATORS_WITHOUT_STICKY_RESULT_BAR.has(slug)
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

// В dev логируем query-ключи, которые не совпали ни с одним полем и не были прочитаны
// applyQuery — так ловится рассинхрон межкалькуляторных ссылок (buildCalculatorHref
// с опечаткой в имени параметра), которые иначе молча теряются без единого сигнала.
const warnUnhandledQueryKeys = (
  definition: CalculatorDefinition,
  query: Record<string, string>,
  knownFieldNames: Set<string>,
  accessedKeys: Set<string>
) => {
  for (const key of Object.keys(query)) {
    if (!knownFieldNames.has(key) && !accessedKeys.has(key)) {
      console.warn(`[calculators:${definition.catalog.slug}] query-параметр "${key}" не совпал ни с одним полем и не обработан applyQuery`);
    }
  }
};

// Сериализация array-полей в ссылку "на расчет": один query-ключ на поле, строки через ";",
// подполя внутри строки — через "~", в порядке объявления field.fields. Пример:
// "20~10~60~boil~pellet;30~8~15~whirlpool~pellet". Разделители — служебные символы, которых
// нет ни в одном значении select-опций у существующих array-полей (проверено вручную).
const ARRAY_FIELD_ROW_SEPARATOR = ";";
const ARRAY_FIELD_SUBFIELD_SEPARATOR = "~";

// Значения подполей (свободный текст, напр. "Ингредиент" у brewhouse-efficiency) могут
// содержать сами разделители или кириллицу — без экранирования это сломало бы разбор
// "~"/";"-строки. encodeURIComponent не трогает "~" (он не входит в набор символов, которые
// эта функция экранирует), поэтому дополнительно заменяем его на %7E вручную.
const encodeArrayFieldSubfieldValue = (value: string): string => (
  encodeURIComponent(value).replaceAll("~", "%7E")
);

// Битая %-последовательность (руками собранная/обрезанная ссылка) — возвращаем как есть,
// а не рушим разбор всей строки исключением.
const decodeArrayFieldSubfieldValue = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// Разбирает одну "~"-строку в объект строки таблицы по порядку field.fields. null — строка
// битая (число частей не совпало с числом подполей) и должна быть тихо отброшена целиком,
// а не превращена в мусорную полузаполненную строку формы.
const parseArrayFieldQueryRow = (
  field: ArrayCalculatorField,
  rawRow: string
): Record<string, unknown> | null => {
  const parts = rawRow.split(ARRAY_FIELD_SUBFIELD_SEPARATOR);
  if (parts.length !== field.fields.length) {
    return null;
  }

  const row: Record<string, unknown> = {};
  field.fields.forEach((subfield, index) => {
    const raw = decodeArrayFieldSubfieldValue(parts[index] ?? "");
    if (subfield.kind === "number") {
      // Нечисловое значение в числовом подполе — как и везде в форме, не 0, а "не указано".
      row[subfield.name] = raw === "" || Number.isFinite(Number(raw)) ? raw : "";
      return;
    }
    if (subfield.kind === "select" && subfield.options) {
      const isKnownOption = subfield.options.some((option) => option.value === raw);
      row[subfield.name] = isKnownOption ? raw : (subfield.options[0]?.value ?? "");
      return;
    }
    row[subfield.name] = raw;
  });

  return row;
};

const parseArrayFieldQueryValue = (
  field: ArrayCalculatorField,
  raw: string
): Array<Record<string, unknown>> | null => {
  const parsedRows = raw
    .split(ARRAY_FIELD_ROW_SEPARATOR)
    .map((rawRow) => parseArrayFieldQueryRow(field, rawRow))
    .filter((row): row is Record<string, unknown> => row != null);

  return parsedRows.length > 0 ? parsedRows : null;
};

export const initialCalculatorStateFromQuery = (
  definition: CalculatorDefinition,
  query: Record<string, string>,
  baseState: CalculatorState = definition.defaults
): CalculatorState => {
  const scalarFieldNames = new Set(
    definition.fields.flatMap((field) => field.kind === "array" ? [] : [field.name])
  );
  const arrayFields = definition.fields.filter((field): field is ArrayCalculatorField => field.kind === "array");
  const knownFieldNames = new Set([...scalarFieldNames, ...arrayFields.map((field) => field.name)]);
  const next: CalculatorState = { ...baseState };

  for (const [key, value] of Object.entries(query)) {
    if (scalarFieldNames.has(key)) {
      next[key] = value;
      continue;
    }

    const arrayField = arrayFields.find((field) => field.name === key);
    if (arrayField) {
      const parsedRows = parseArrayFieldQueryValue(arrayField, value);
      // Битая строка (parsedRows === null) — тихо игнорируем весь ключ, оставляя baseState.
      if (parsedRows) {
        next[key] = parsedRows;
      }
    }
  }

  if (!definition.applyQuery) {
    if (process.env.NODE_ENV !== "production") {
      warnUnhandledQueryKeys(definition, query, knownFieldNames, new Set());
    }
    return next;
  }

  if (process.env.NODE_ENV !== "production") {
    // Проксируем query, чтобы отследить, какие ключи applyQuery реально прочитал
    // (обращения через query.foo), и предупредить только про действительно потерянные.
    const accessedKeys = new Set<string>();
    const queryProxy = new Proxy(query, {
      get(target, prop, receiver) {
        if (typeof prop === "string") {
          accessedKeys.add(prop);
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    const result = definition.applyQuery(next, queryProxy);
    warnUnhandledQueryKeys(definition, query, knownFieldNames, accessedKeys);
    return result;
  }

  return definition.applyQuery(next, query);
};

export const serializeCalculatorStateToQuery = (
  definition: CalculatorDefinition,
  state: CalculatorState
): URLSearchParams => {
  const params = new URLSearchParams();

  for (const field of definition.fields) {
    if (field.kind === "array") {
      const rowsValue = rows(state[field.name]);
      if (rowsValue.length === 0) {
        continue;
      }

      const serialized = rowsValue
        .map((row) => field.fields
          .map((subfield) => {
            const raw = row[subfield.name];
            return raw == null ? "" : encodeArrayFieldSubfieldValue(String(raw));
          })
          .join(ARRAY_FIELD_SUBFIELD_SEPARATOR))
        .join(ARRAY_FIELD_ROW_SEPARATOR);

      // Все строки пустые (например, свежедобавленная незаполненная строка) — сериализовать
      // голые разделители незачем, тот же случай, что пустое скалярное поле, ниже.
      const hasContent = serialized
        .replaceAll(ARRAY_FIELD_SUBFIELD_SEPARATOR, "")
        .replaceAll(ARRAY_FIELD_ROW_SEPARATOR, "")
        .trim() !== "";
      if (hasContent) {
        params.set(field.name, serialized);
      }
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
