import type { IngredientDisplayMode, IngredientTechnicalData } from "./contracts";
import { formatConsumableFormLabel } from "./consumables";
import { inventoryUnitShortLabels } from "../inventory/units";
import { normalizeSearchText } from "./normalization";
import { formatHopFormLabel, resolveIngredientTechnicalDataColorRangeEbc } from "./technical-fields";
import type { IngredientCategory, IngredientSubtype, LegacyIngredientType as IngredientType } from "./taxonomy";

// Единый публичный API enum-лейблов каталога (этап 4.2): переиспользуем
// таблицы из technical-fields.ts/consumables.ts, а не заводим отдельные копии.
export { formatHopFormLabel } from "./technical-fields";
export { formatConsumableFormLabel } from "./consumables";

/** Единица измерения ингредиента (г/кг/шт и т.п.) — по словарю склада, единому для всего приложения. */
export const resolveIngredientUnitLabel = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return (inventoryUnitShortLabels as Record<string, string>)[trimmed.toLowerCase()] ?? trimmed;
};

type IngredientPresentationSource = {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  type?: IngredientType | null;
  itemKind?: string | null;
  primaryLabelRu?: string | null;
  secondaryLabelRu?: string | null;
  displayName?: string | null;
  displayNameRu?: string | null;
  displayNameEn?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
  displayModeRu?: IngredientDisplayMode | null;
  displayNameOverrideRu?: string | null;
  secondaryNameOverrideRu?: string | null;
  hideSecondaryNameRu?: boolean | null;
  brand?: string | null;
  producer?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  country?: string | null;
  familyDisplayName?: string | null;
  familyCanonicalName?: string | null;
  technicalData?: IngredientTechnicalData | Record<string, unknown> | null;
  unitPreferred?: string | null;
};

// Имя категории целиком. У consumable оно слитное («Расходники и добавки»):
// само слово «Расходники» закреплено за узкой группой inventory_supplies
// (санитайзеры/мойка/тара/газы), а специи и добавки — это inventory_additives.
// Где показывается конкретный ингредиент, а не вся категория, лейбл берётся по
// broad group — resolveConsumableInventoryBroadGroupLabel в consumables.ts.
export const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  consumable: "Расходники и добавки",
  water_treatment: "Водоподготовка"
};

const subtypeLabels: Record<string, string> = {
  malt: "солод",
  fermentable: "другое ферментируемое",
  hop: "хмель",
  yeast: "дрожжи",
  technical_additives: "техдобавка",
  lauter_aid: "фильтрация затора",
  spice: "специя",
  citrus_zest: "цедра и цитрус",
  herb_flower: "травы и цветы",
  coffee_cacao: "кофе/какао",
  wood_aging: "дерево/выдержка",
  flavoring: "ароматизатор",
  process_aid: "техдобавка",
  nutrient: "техдобавка",
  enzyme: "техдобавка",
  antioxidant: "техдобавка",
  fining: "техдобавка",
  sanitizer: "санитайзер",
  cleaner: "моющее средство",
  packaging: "тара и укупорка",
  gas: "газ",
  water_source: "исходная вода",
  salt: "соль",
  acid: "кислота",
  base: "щелочь",
  dechlorination: "дехлорирование",
  other: "другое"
};

const fermentableItemKindLabels: Record<string, string> = {
  raw_adjunct: "Несоложёнка",
  flaked_adjunct: "Хлопья",
  flour_adjunct: "Мука",
  torrefied_adjunct: "Торрефицированное сырьё",
  sugar: "Сахар",
  syrup: "Сироп",
  honey: "Мёд",
  molasses: "Меласса",
  fruit_or_vegetable: "Фрукты и овощи",
  fruit_puree: "Фруктовое пюре",
  juice: "Сок",
  juice_concentrate: "Концентрированный сок",
  dried_fruit: "Сухофрукты",
  kvass_concentrate: "Концентрат квасного сусла",
  body_builder: "Телообразователь",
  sour_wort: "Кислое сусло",
  process_adjunct: "Техническая добавка",
  coloring_extract: "Красящий экстракт",
  coloring_sugar: "Сахарный колер",
  malt_corn_concentrate: "Солодовый концентрат",
  extract: "Экстракт"
};

const formatNumber = (value: number) => value.toLocaleString("en-US", {
  maximumFractionDigits: value % 1 === 0 ? 0 : 1
});

const normalizeOptionalName = (value?: string | null) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const areNameVariantsEqual = (left?: string, right?: string) => {
  if (!left || !right) {
    return false;
  }

  return normalizeSearchText(left) === normalizeSearchText(right);
};

const normalizeOptionalKey = (value?: string | null) => normalizeOptionalName(value)?.toLowerCase() ?? null;

const capitalizeFirst = (value: string) => value
  ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`
  : value;

const countryCodeAliases: Record<string, string> = {
  UK: "GB",
  GBR: "GB",
  USA: "US",
  RUS: "RU",
  BLR: "BY",
  DEU: "DE",
  GER: "DE",
  FRA: "FR",
  BEL: "BE",
  NLD: "NL",
  AUT: "AT",
  AUS: "AU",
  ARG: "AR",
  BRA: "BR",
  CHN: "CN",
  DNK: "DK",
  EGY: "EG",
  GEO: "GE",
  GRC: "GR",
  IDN: "ID",
  IND: "IN",
  IRN: "IR",
  LVA: "LV",
  MAR: "MA",
  NZL: "NZ",
  POL: "PL",
  THA: "TH",
  UZB: "UZ",
  VNM: "VN",
  CZE: "CZ",
  SVK: "SK",
  FIN: "FI",
  KAZ: "KZ",
  UKR: "UA"
};

const countryNameToCode: Record<string, string> = {
  "россия": "RU",
  "russia": "RU",
  "российская федерация": "RU",
  "russian federation": "RU",
  "сша": "US",
  "usa": "US",
  "united states": "US",
  "united states of america": "US",
  "америка": "US",
  "беларусь": "BY",
  "belarus": "BY",
  "германия": "DE",
  "germany": "DE",
  "немецкая": "DE",
  "франция": "FR",
  "france": "FR",
  "бельгия": "BE",
  "belgium": "BE",
  "великобритания": "GB",
  "great britain": "GB",
  "united kingdom": "GB",
  "england": "GB",
  "австралия": "AU",
  "australia": "AU",
  "аргентина": "AR",
  "argentina": "AR",
  "бразилия": "BR",
  "brazil": "BR",
  "китай": "CN",
  "china": "CN",
  "дания": "DK",
  "denmark": "DK",
  "египет": "EG",
  "egypt": "EG",
  "грузия": "GE",
  "georgia": "GE",
  "греция": "GR",
  "greece": "GR",
  "индонезия": "ID",
  "indonesia": "ID",
  "индия": "IN",
  "india": "IN",
  "иран": "IR",
  "iran": "IR",
  "латвия": "LV",
  "latvia": "LV",
  "марокко": "MA",
  "morocco": "MA",
  "нидерланды": "NL",
  "netherlands": "NL",
  "голландия": "NL",
  "н зеландия": "NZ",
  "новая зеландия": "NZ",
  "new zealand": "NZ",
  "австрия": "AT",
  "austria": "AT",
  "польша": "PL",
  "poland": "PL",
  "таиланд": "TH",
  "thailand": "TH",
  "чехия": "CZ",
  "czech republic": "CZ",
  "czechia": "CZ",
  "словакия": "SK",
  "slovakia": "SK",
  "финляндия": "FI",
  "finland": "FI",
  "узбекистан": "UZ",
  "uzbekistan": "UZ",
  "украина": "UA",
  "ukraine": "UA",
  "казахстан": "KZ",
  "kazakhstan": "KZ",
  "вьетнам": "VN",
  "vietnam": "VN"
};

export type ResolvedIngredientCountry = {
  code: string | null;
  label: string;
};

const resolveCountryCode = (source: Pick<IngredientPresentationSource, "countryCode"> & {
  countryName?: string | null;
  country?: string | null;
}) => {
  const code = normalizeOptionalName(source.countryCode)?.toUpperCase();
  if (code) {
    if (/^[A-Z]{2}$/.test(code)) {
      return code;
    }

    if (countryCodeAliases[code]) {
      return countryCodeAliases[code];
    }
  }

  const nameCandidate = normalizeOptionalName(source.countryName) ?? normalizeOptionalName(source.country);
  if (!nameCandidate) {
    return null;
  }

  const normalizedName = normalizeSearchText(nameCandidate);
  if (countryNameToCode[normalizedName]) {
    return countryNameToCode[normalizedName];
  }

  const uppercaseName = nameCandidate.toUpperCase();
  if (/^[A-Z]{2}$/.test(uppercaseName)) {
    return uppercaseName;
  }

  if (countryCodeAliases[uppercaseName]) {
    return countryCodeAliases[uppercaseName];
  }

  return null;
};

export const resolveIngredientCountry = (source: Pick<IngredientPresentationSource, "countryCode"> & {
  countryName?: string | null;
  country?: string | null;
}): ResolvedIngredientCountry | null => {
  const label = normalizeOptionalName(source.countryName) ?? normalizeOptionalName(source.country);
  const code = resolveCountryCode(source);

  if (!label && !code) {
    return null;
  }

  return {
    code,
    label: label ?? code ?? ""
  };
};

export const resolveIngredientBrandLabel = (
  source: Pick<IngredientPresentationSource, "brand" | "producer" | "brandName" | "manufacturer">
) => normalizeOptionalName(source.brand)
  ?? normalizeOptionalName(source.producer)
  ?? normalizeOptionalName(source.brandName)
  ?? normalizeOptionalName(source.manufacturer)
  ?? null;

type FermentableTypeBadgeInput = {
  displayTypeRu?: string | null;
  productFamily?: string | null;
  subtypeKey?: string | null;
  functionalRole?: string | null;
  extractForm?: "dry" | "liquid" | null;
  physicalForm?: string | null;
  baseMaterialFamily?: string | null;
  hoppingState?: "hopped" | "unhopped" | "unknown" | "not_applicable" | null;
};

const resolveFermentableBadgeForm = (input: Pick<FermentableTypeBadgeInput, "extractForm" | "physicalForm">) => {
  if (input.extractForm === "dry" || input.extractForm === "liquid") {
    return input.extractForm;
  }

  const normalizedPhysicalForm = normalizeOptionalKey(input.physicalForm);
  return normalizedPhysicalForm === "dry" || normalizedPhysicalForm === "liquid"
    ? normalizedPhysicalForm
    : null;
};

export const resolveFermentableTypeBadgeRu = (input: FermentableTypeBadgeInput): string | null => {
  const displayTypeRu = normalizeOptionalName(input.displayTypeRu);
  if (displayTypeRu) {
    return displayTypeRu;
  }

  const functionalRole = normalizeOptionalKey(input.functionalRole);
  const subtypeKey = normalizeOptionalKey(input.subtypeKey);
  const productFamily = normalizeOptionalKey(input.productFamily);
  const baseMaterialFamily = normalizeOptionalKey(input.baseMaterialFamily);
  const hoppingState = normalizeOptionalKey(input.hoppingState) as FermentableTypeBadgeInput["hoppingState"];

  if (functionalRole === "color_only" || functionalRole === "color_adjustment" || subtypeKey === "coloring_extract") {
    return "Красящий экстракт";
  }

  if (subtypeKey === "sour_wort" || functionalRole === "acidification") {
    return "Кислое сусло";
  }

  if (subtypeKey === "kvass_concentrate") {
    return "Концентрат квасного сусла";
  }

  if (subtypeKey === "body_builder") {
    return "Добавка для тела";
  }

  if (subtypeKey === "malt_extract") {
    const form = resolveFermentableBadgeForm(input);
    const base = baseMaterialFamily === "wheat"
      ? "пшеничный "
      : baseMaterialFamily === "rye"
        ? "ржаной "
        : "";

    if (hoppingState === "hopped") {
      return `Охмелённый ${base}солодовый экстракт`.replace(/\s+/g, " ").trim();
    }

    if (form === "dry") {
      return `Сухой ${base}солодовый экстракт`.replace(/\s+/g, " ").trim();
    }

    if (form === "liquid") {
      return `Жидкий ${base}солодовый экстракт`.replace(/\s+/g, " ").trim();
    }

    return capitalizeFirst(`${base}солодовый экстракт`.replace(/\s+/g, " ").trim());
  }

  if (subtypeKey) {
    const subtypeLabel = fermentableItemKindLabels[subtypeKey];
    if (subtypeLabel) {
      return subtypeLabel;
    }

    if (subtypeKey === "whole_fruit_or_vegetable") {
      return "Фрукты и овощи";
    }

    if (subtypeKey === "special_extract") {
      return "Экстракт";
    }
  }

  switch (productFamily) {
    case "extract":
    case "extract_concentrate":
      return "Экстракт";
    case "adjunct_grain":
      return "Несоложёнка";
    case "sugar":
    case "sugar_syrup_honey":
      return "Сахар";
    case "fruit":
    case "fruit_vegetable":
      return "Фруктовая добавка";
    default:
      return null;
  }
};

export const resolveIngredientFermentableKindLabel = (source: Pick<
  IngredientPresentationSource,
  | "category"
  | "subtype"
  | "type"
  | "itemKind"
  | "technicalData"
>) => {
  const isFermentable = source.subtype === "fermentable"
    || source.type === "fermentable"
    || (source.category === "fermentable" && source.subtype !== "malt");
  if (!isFermentable) {
    return null;
  }

  const technicalData = source.technicalData && typeof source.technicalData === "object"
    ? source.technicalData as IngredientTechnicalData
    : null;
  const fermentableTechnicalData = technicalData?.type === "fermentable"
    ? technicalData as Extract<IngredientTechnicalData, { type: "fermentable" }>
    : null;

  return resolveFermentableTypeBadgeRu({
    displayTypeRu: fermentableTechnicalData?.displayTypeRu,
    productFamily: fermentableTechnicalData?.productFamily,
    subtypeKey: fermentableTechnicalData?.subtypeKey ?? source.itemKind ?? null,
    functionalRole: fermentableTechnicalData?.functionalRole,
    extractForm: fermentableTechnicalData?.extractForm,
    physicalForm: fermentableTechnicalData?.physicalForm,
    baseMaterialFamily: fermentableTechnicalData?.baseMaterialFamily,
    hoppingState: fermentableTechnicalData?.hoppingState
  });
};

export const formatIngredientCountry = (source: Pick<IngredientPresentationSource, "countryCode"> & {
  countryName?: string | null;
  country?: string | null;
}) => resolveIngredientCountry(source)?.label ?? null;

const autoLocalizedFirstCountryCodes = new Set(["RU", "BY", "UA", "KZ"]);

const shouldUseLocalizedFirstInAutoMode = (
  source: Pick<IngredientPresentationSource, "countryCode" | "countryName" | "country" | "nameRu">
) => {
  if (!normalizeOptionalName(source.nameRu)) {
    return false;
  }

  const countryCode = resolveCountryCode(source);
  return countryCode ? autoLocalizedFirstCountryCodes.has(countryCode) : false;
};

export const resolveEffectiveDisplayMode = (
  source: Pick<IngredientPresentationSource, "type" | "countryCode" | "countryName" | "country" | "nameRu" | "displayModeRu">
): Exclude<IngredientDisplayMode, "auto"> => {
  if (source.displayModeRu === "localized_first" || source.displayModeRu === "source_first") {
    return source.displayModeRu;
  }

  if (source.type === "hop" || source.type === "malt" || source.type === "yeast") {
    return shouldUseLocalizedFirstInAutoMode(source)
      ? "localized_first"
      : "source_first";
  }

  return "localized_first";
};

export const resolveIngredientPrimaryDisplayName = (source: Pick<
  IngredientPresentationSource,
  | "type"
  | "countryCode"
  | "primaryLabelRu"
  | "displayName"
  | "displayNameRu"
  | "displayNameEn"
  | "nameRu"
  | "nameEn"
  | "countryName"
  | "country"
  | "displayModeRu"
  | "displayNameOverrideRu"
>) => {
  const directPrimary = normalizeOptionalName(source.primaryLabelRu)
    ?? normalizeOptionalName(source.displayName);
  if (directPrimary) {
    return directPrimary;
  }

  const override = normalizeOptionalName(source.displayNameOverrideRu);
  if (override) {
    return override;
  }

  const nameRu = normalizeOptionalName(source.nameRu) ?? normalizeOptionalName(source.displayNameRu);
  const nameEn = normalizeOptionalName(source.nameEn) ?? normalizeOptionalName(source.displayNameEn);
  const mode = resolveEffectiveDisplayMode(source);

  if (mode === "localized_first") {
    return nameRu ?? nameEn ?? "";
  }

  return nameEn ?? nameRu ?? "";
};

export const resolveIngredientSecondaryDisplayName = (source: Pick<
  IngredientPresentationSource,
  | "type"
  | "countryCode"
  | "secondaryLabelRu"
  | "displayNameRu"
  | "displayNameEn"
  | "nameRu"
  | "nameEn"
  | "countryName"
  | "country"
  | "displayModeRu"
  | "displayNameOverrideRu"
  | "secondaryNameOverrideRu"
  | "hideSecondaryNameRu"
>) => {
  if (source.hideSecondaryNameRu) {
    return undefined;
  }

  const directSecondary = normalizeOptionalName(source.secondaryLabelRu);
  if (directSecondary) {
    return directSecondary;
  }

  const override = normalizeOptionalName(source.secondaryNameOverrideRu);
  if (override) {
    return override;
  }

  const primaryName = resolveIngredientPrimaryDisplayName(source);
  const nameRu = normalizeOptionalName(source.nameRu) ?? normalizeOptionalName(source.displayNameRu);
  const nameEn = normalizeOptionalName(source.nameEn) ?? normalizeOptionalName(source.displayNameEn);
  const mode = resolveEffectiveDisplayMode(source);
  const secondary = mode === "localized_first" ? nameEn : nameRu;

  if (!secondary || areNameVariantsEqual(primaryName, secondary)) {
    return undefined;
  }

  return secondary;
};

export const resolveIngredientDisplayNames = (source: Pick<
  IngredientPresentationSource,
  | "type"
  | "countryCode"
  | "primaryLabelRu"
  | "secondaryLabelRu"
  | "displayName"
  | "displayNameRu"
  | "displayNameEn"
  | "nameRu"
  | "nameEn"
  | "countryName"
  | "country"
  | "displayModeRu"
  | "displayNameOverrideRu"
  | "secondaryNameOverrideRu"
  | "hideSecondaryNameRu"
>) => ({
  primaryName: resolveIngredientPrimaryDisplayName(source),
  secondaryName: resolveIngredientSecondaryDisplayName(source)
});

export const formatIngredientSubtypeLabel = (
  category: IngredientCategory,
  subtype?: IngredientSubtype | null
) => {
  if (!subtype) {
    return ingredientCategoryLabels[category];
  }

  return subtypeLabels[subtype] ?? subtype.replaceAll("_", " ");
};

const yeastFlocculationLabelsRu: Record<string, string> = {
  low: "низкая",
  medium: "средняя",
  high: "высокая",
  "very high": "очень высокая",
  "very-high": "очень высокая",
  "low-medium": "низкая-средняя",
  "medium-low": "низкая-средняя",
  "medium-high": "средняя-высокая",
  "high-medium": "средняя-высокая"
};

export const resolveYeastFlocculationLabelRu = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return yeastFlocculationLabelsRu[normalized] ?? normalized;
};

const yeastFormLabelsRu: Record<string, string> = {
  dry: "сухие",
  liquid: "жидкие",
  slurry: "суспензия",
  culture: "культура"
};

/** Форма дрожжей для бейджа рядом с названием в каталоге (сухие/жидкие и т.п.). */
export const resolveYeastFormLabelRu = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return yeastFormLabelsRu[normalized] ?? normalized.replaceAll("_", " ");
};

// Стандартная форма хмеля (T-90 гранулы) — подавляющее большинство каталога,
// бейдж у названия показываем только для нестандартных форм.
const standardHopForms = new Set(["standard", "pellet"]);

/** Форма хмеля для бейджа рядом с названием — только для нестандартных форм (крио, лупулиновый концентрат…). */
export const resolveHopFormBadgeLabel = (value?: string | null): string | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || standardHopForms.has(normalized)) {
    return null;
  }

  return formatHopFormLabel(normalized);
};

export const resolveIngredientFamilyDisplayName = (
  source: Pick<IngredientPresentationSource, "familyDisplayName" | "familyCanonicalName"> & {
    displayName?: string | null;
    familyDisplayNameRu?: string | null;
    familyDisplayNameEn?: string | null;
  }
) => source.familyDisplayName
  ?? source.familyDisplayNameEn
  ?? source.familyDisplayNameRu
  ?? source.familyCanonicalName
  ?? source.displayName
  ?? undefined;

const buildHopSummary = (technicalData: Extract<IngredientTechnicalData, { type: "hop" }>) => (
  [
    technicalData.alphaAcidPctTypical != null
      ? `${formatNumber(technicalData.alphaAcidPctTypical)}% AA`
      : null,
    formatHopFormLabel(technicalData.hopForm)
  ].filter(Boolean).join(" • ")
);

const resolveMaltColorSummary = (technicalData: Extract<IngredientTechnicalData, { type: "malt" }>) => {
  const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
  if (range && (technicalData.colorEbcMin != null || technicalData.colorEbcMax != null)) {
    return range.min === range.max
      ? `${formatNumber(range.min)} EBC`
      : `${formatNumber(range.min)}-${formatNumber(range.max)} EBC`;
  }

  if (range) {
    return `${formatNumber(range.average)} EBC`;
  }

  return null;
};

const buildMaltSummary = (technicalData: Extract<IngredientTechnicalData, { type: "malt" }>) => (
  [
    resolveMaltColorSummary(technicalData),
    technicalData.extractPctDryBasis != null ? `Экст-ть ${formatNumber(technicalData.extractPctDryBasis)}%` : null
  ].filter(Boolean).join(" • ")
);

const buildFermentableSummary = (technicalData: Extract<IngredientTechnicalData, { type: "fermentable" }>) => {
  const colorRange = resolveIngredientTechnicalDataColorRangeEbc(technicalData);

  return [
    colorRange ? `${formatNumber(colorRange.average)} EBC` : null,
    technicalData.extractPctDryBasis != null ? `Экст-ть ${formatNumber(technicalData.extractPctDryBasis)}%` : null
  ].filter(Boolean).join(" • ");
};

const buildYeastSummary = (technicalData: Extract<IngredientTechnicalData, { type: "yeast" }>) => (
  [
    resolveYeastFormLabelRu(technicalData.form),
    technicalData.attenuationPctTypical != null
      ? `Атт. ${formatNumber(technicalData.attenuationPctTypical)}%`
      : null,
    technicalData.fermentationTempCMin != null && technicalData.fermentationTempCMax != null
      ? `${formatNumber(technicalData.fermentationTempCMin)}-${formatNumber(technicalData.fermentationTempCMax)}°C`
      : null
  ].filter(Boolean).join(" • ")
);

const buildConsumableSummary = (
  technicalData: Extract<IngredientTechnicalData, { type: "consumable" }>,
  subtype?: IngredientSubtype | null
) => (
  [
    subtype ? formatIngredientSubtypeLabel("consumable", subtype) : null,
    formatConsumableFormLabel(technicalData.commonForms?.[0])
  ].filter(Boolean).join(" • ")
);

const buildWaterTreatmentSummary = (
  technicalData: Extract<IngredientTechnicalData, { type: "water_treatment" }>,
  unitPreferred?: string | null,
  subtype?: IngredientSubtype | null
) => (
  [
    subtype ? formatIngredientSubtypeLabel("water_treatment", subtype) : null,
    technicalData.unitPreferred ?? unitPreferred ?? null
  ].filter(Boolean).join(" • ")
);

export const buildIngredientTypedSummary = (source: IngredientPresentationSource) => {
  const technicalData = source.technicalData as IngredientTechnicalData | null | undefined;
  if (!technicalData) {
    if (source.category && source.subtype) {
      return formatIngredientSubtypeLabel(source.category, source.subtype);
    }

    return undefined;
  }

  if (technicalData.type === "hop") {
    return buildHopSummary(technicalData as Extract<IngredientTechnicalData, { type: "hop" }>);
  }

  if (technicalData.type === "malt") {
    return buildMaltSummary(technicalData as Extract<IngredientTechnicalData, { type: "malt" }>);
  }

  if (technicalData.type === "fermentable") {
    return buildFermentableSummary(technicalData as Extract<IngredientTechnicalData, { type: "fermentable" }>);
  }

  if (technicalData.type === "yeast") {
    return buildYeastSummary(technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>);
  }

  if (technicalData.type === "consumable") {
    return buildConsumableSummary(technicalData as Extract<IngredientTechnicalData, { type: "consumable" }>, source.subtype);
  }

  if (technicalData.type === "water_treatment") {
    return buildWaterTreatmentSummary(
      technicalData as Extract<IngredientTechnicalData, { type: "water_treatment" }>,
      source.unitPreferred,
      source.subtype
    );
  }

  return undefined;
};

export const buildIngredientSuggestionMetaLine = (source: IngredientPresentationSource) => {
  const typedSummary = buildIngredientTypedSummary(source);
  return typedSummary || undefined;
};
