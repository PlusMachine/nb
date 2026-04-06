import type { IngredientDisplayMode, IngredientTechnicalData } from "./contracts";
import { normalizeSearchText } from "./normalization";
import { resolveIngredientTechnicalDataColorRangeEbc } from "./technical-fields";
import type { IngredientCategory, IngredientSubtype, LegacyIngredientType as IngredientType } from "./taxonomy";

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

export const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  consumable: "Расходники",
  water_treatment: "Водоподготовка"
};

const subtypeLabels: Record<string, string> = {
  malt: "солод",
  fermentable: "другое ферментируемое",
  hop: "хмель",
  yeast: "дрожжи",
  process_aid: "технологическая добавка",
  nutrient: "питательная добавка",
  sanitizer: "санитайзер",
  cleaner: "моющее средство",
  antioxidant: "антиоксидант",
  fining: "осветлитель",
  water_source: "исходная вода",
  salt: "соль",
  acid: "кислота",
  base: "щелочь",
  dechlorination: "дехлорирование",
  other: "другое"
};

const fermentableItemKindLabels: Record<string, string> = {
  raw_adjunct: "Несоложенка",
  flaked_adjunct: "Хлопья",
  flour_adjunct: "Мука",
  torrefied_adjunct: "Торрефицированное сырье",
  sugar: "Сахар",
  syrup: "Сироп",
  honey: "Мёд",
  molasses: "Меласса",
  fruit_or_vegetable: "Фрукты и овощи",
  fruit_puree: "Фруктовое пюре",
  juice: "Сок",
  juice_concentrate: "Концентрат сока",
  dried_fruit: "Сухофрукты",
  kvass_concentrate: "Концентрат квасного сусла",
  body_builder: "Телообразователь",
  sour_wort: "Кислое сусло",
  process_adjunct: "Технологическая добавка",
  coloring_extract: "Красящий экстракт",
  coloring_sugar: "Красящий сахар",
  malt_corn_concentrate: "Солодово-кукурузный концентрат",
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

export const resolveIngredientFermentableKindLabel = (source: Pick<
  IngredientPresentationSource,
  | "category"
  | "subtype"
  | "type"
  | "itemKind"
  | "technicalData"
  | "primaryLabelRu"
  | "secondaryLabelRu"
  | "displayName"
  | "displayNameRu"
  | "displayNameEn"
  | "nameRu"
  | "nameEn"
>) => {
  const itemKind = normalizeOptionalName(source.itemKind)?.toLowerCase();
  if (!itemKind) {
    return null;
  }

  const isFermentable = source.subtype === "fermentable"
    || source.type === "fermentable"
    || (source.category === "fermentable" && source.subtype !== "malt");
  if (!isFermentable) {
    return null;
  }

  if (itemKind === "malt_extract") {
    const technicalData = source.technicalData && typeof source.technicalData === "object"
      ? source.technicalData as IngredientTechnicalData
      : null;
    const extractForm = technicalData?.type === "fermentable"
      && (technicalData.extractForm === "dry" || technicalData.extractForm === "liquid")
      ? technicalData.extractForm
      : null;

    if (extractForm === "dry") {
      return "Сухой солодовый экстракт";
    }

    if (extractForm === "liquid") {
      return "Жидкий солодовый экстракт";
    }

    const context = normalizeSearchText([
      source.primaryLabelRu,
      source.secondaryLabelRu,
      source.displayName,
      source.displayNameRu,
      source.displayNameEn,
      source.nameRu,
      source.nameEn
    ].filter(Boolean).join(" "));

    if (context.includes("dme") || context.includes("spraymalt") || context.includes("сух")) {
      return "Сухой солодовый экстракт";
    }

    if (context.includes("lme") || context.includes("liquid") || context.includes("жидк")) {
      return "Жидкий солодовый экстракт";
    }

    return "Солодовый экстракт";
  }

  return fermentableItemKindLabels[itemKind] ?? itemKind.replaceAll("_", " ");
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
    technicalData.hopForm && technicalData.hopForm !== "standard" ? technicalData.hopForm : null
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
    technicalData.form,
    technicalData.attenuationPctTypical != null
      ? `${formatNumber(technicalData.attenuationPctTypical)}% attenuation`
      : null,
    technicalData.fermentationTempCMin != null && technicalData.fermentationTempCMax != null
      ? `${formatNumber(technicalData.fermentationTempCMin)}-${formatNumber(technicalData.fermentationTempCMax)}C`
      : null
  ].filter(Boolean).join(" • ")
);

const buildConsumableSummary = (
  technicalData: Extract<IngredientTechnicalData, { type: "consumable" }>,
  subtype?: IngredientSubtype | null
) => (
  [
    subtype ? formatIngredientSubtypeLabel("consumable", subtype) : null,
    technicalData.commonForms?.[0] ?? null
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
