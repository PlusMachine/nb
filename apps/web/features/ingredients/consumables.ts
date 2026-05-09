import type {
  ConsumableTechnicalData,
  IngredientPackageVariantDto,
  IngredientTechnicalData
} from "./contracts";

const normalizeKey = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
const normalizeGroupKey = (value: string | null | undefined) => normalizeKey(value)
  .replaceAll("ё", "е")
  .replace(/[\s,/|+&-]+/g, "_")
  .replace(/[^a-zа-я0-9_]+/g, "")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "");

const consumablePickerGroupAliases: Record<string, string> = {
  tech_additives: "technical_additives",
  technical_additives: "technical_additives",
  technical: "technical_additives",
  process_aid: "technical_additives",
  process_aids: "technical_additives",
  fining: "technical_additives",
  finings: "technical_additives",
  enzyme: "technical_additives",
  enzymes: "technical_additives",
  nutrient: "technical_additives",
  nutrients: "technical_additives",
  antioxidant: "technical_additives",
  antioxidants: "technical_additives",
  defoamer: "technical_additives",
  defoamers: "technical_additives",
  preservative: "technical_additives",
  preservatives: "technical_additives",
  техдобавки: "technical_additives",
  технические_добавки: "technical_additives",
  технологические_добавки: "technical_additives",
  осветление: "technical_additives",
  ферменты: "technical_additives",
  подкормки: "technical_additives",
  антиоксиданты: "technical_additives",
  пеногасители: "technical_additives",
  консерванты: "technical_additives",

  lauter_aid: "lauter_aid",
  lauter_aids: "lauter_aid",
  filter_aid: "lauter_aid",
  filter_aids: "lauter_aid",
  фильтрация_затора: "lauter_aid",
  фильтрующая_добавка: "lauter_aid",

  spice: "spice",
  spices: "spice",
  специи: "spice",

  citrus_zest: "citrus_zest",
  citrus: "citrus_zest",
  zest: "citrus_zest",
  peel: "citrus_zest",
  цедра: "citrus_zest",
  цедра_и_цитрус: "citrus_zest",
  цитрус: "citrus_zest",

  herb_flower: "herb_flower",
  herbs_flowers: "herb_flower",
  herbs_and_flowers: "herb_flower",
  herb: "herb_flower",
  herbs: "herb_flower",
  flower: "herb_flower",
  flowers: "herb_flower",
  травы_и_цветы: "herb_flower",
  травы: "herb_flower",
  цветы: "herb_flower",
  чай: "herb_flower",

  coffee_cacao: "coffee_cacao",
  coffee_cocoa: "coffee_cacao",
  coffee: "coffee_cacao",
  cacao: "coffee_cacao",
  cocoa: "coffee_cacao",
  кофе_какао: "coffee_cacao",
  кофе_какао_и_десертные_добавки: "coffee_cacao",
  кофе: "coffee_cacao",
  какао: "coffee_cacao",

  wood_aging: "wood_aging",
  wood: "wood_aging",
  aging: "wood_aging",
  oak: "wood_aging",
  дерево_выдержка: "wood_aging",
  дерево_и_выдержка: "wood_aging",
  выдержка: "wood_aging",
  древесина: "wood_aging",

  flavoring: "flavoring",
  flavorings: "flavoring",
  flavor: "flavoring",
  flavour: "flavoring",
  extract: "flavoring",
  extracts: "flavoring",
  ароматизаторы: "flavoring",
  ароматизаторы_и_экстракты: "flavoring",
  экстракты: "flavoring",

  sanitizer: "sanitizer",
  sanitizers: "sanitizer",
  санитайзер: "sanitizer",
  санитайзеры: "sanitizer",
  cleaner: "cleaner",
  cleaners: "cleaner",
  мойка: "cleaner",
  packaging: "packaging",
  package: "packaging",
  closure: "packaging",
  closures: "packaging",
  tara: "packaging",
  tara_i_ukuporka: "packaging",
  tara_ukuporka: "packaging",
  тара: "packaging",
  тара_и_укупорка: "packaging",
  тара_укупорка: "packaging",
  укупорка: "packaging",
  gas: "gas",
  gases: "gas",
  co2: "gas",
  carbon_dioxide: "gas",
  газ: "gas",
  газы: "gas",
  other: "other",
  другое: "other"
};

export const canonicalizeConsumablePickerGroup = (value?: string | null) => {
  const normalized = normalizeGroupKey(value);
  if (!normalized) {
    return null;
  }

  const mapped = consumablePickerGroupAliases[normalized];
  if (mapped) {
    return mapped;
  }

  if (
    normalized.includes("sanitize")
    || normalized.includes("sanit")
    || normalized.includes("дезинф")
  ) {
    return "sanitizer";
  }

  if (
    normalized.includes("clean")
    || normalized.includes("wash")
    || normalized.includes("cip")
    || normalized.startsWith("моющ")
    || normalized.includes("очист")
  ) {
    return "cleaner";
  }

  if (
    normalized.includes("rice_hull")
    || normalized.includes("rice_husk")
    || normalized.includes("лузг")
    || normalized.includes("шелух")
  ) {
    return "lauter_aid";
  }

  if (
    normalized.includes("filter")
    || normalized.includes("lauter")
    || normalized.includes("фильтр")
  ) {
    return "lauter_aid";
  }

  if (normalized.includes("цедр") || normalized.includes("цитрус") || normalized.includes("zest") || normalized.includes("peel")) {
    return "citrus_zest";
  }

  if (normalized.includes("спец") || normalized.includes("spice")) {
    return "spice";
  }

  if (normalized.includes("трав") || normalized.includes("цвет") || normalized.includes("herb") || normalized.includes("flower")) {
    return "herb_flower";
  }

  if (normalized.includes("кофе") || normalized.includes("какао") || normalized.includes("coffee") || normalized.includes("cacao") || normalized.includes("cocoa")) {
    return "coffee_cacao";
  }

  if (normalized.includes("дерев") || normalized.includes("дуб") || normalized.includes("wood") || normalized.includes("oak")) {
    return "wood_aging";
  }

  if (normalized.includes("аромат") || normalized.includes("экстракт") || normalized.includes("flavor") || normalized.includes("extract")) {
    return "flavoring";
  }

  if (
    normalized.includes("process")
    || normalized.startsWith("тех")
    || normalized.includes("fining")
    || normalized.includes("clarif")
    || normalized.startsWith("освет")
    || normalized.startsWith("клариф")
    || normalized.includes("enzyme")
    || normalized.includes("enzym")
    || normalized.startsWith("фермент")
    || normalized.includes("nutrient")
    || normalized.includes("yeast_food")
    || normalized.startsWith("подкорм")
    || normalized.includes("питат")
    || normalized.includes("antioxid")
    || normalized.startsWith("антиокс")
    || normalized.includes("defoam")
    || normalized.includes("пено")
    || normalized.includes("preserv")
    || normalized.includes("консерв")
  ) {
    return "technical_additives";
  }

  if (
    normalized.includes("bottle")
    || normalized.includes("cap")
    || normalized.includes("crown")
    || normalized.includes("cork")
    || normalized.includes("keg")
    || normalized.includes("тара")
    || normalized.includes("укупор")
    || normalized.includes("крыш")
    || normalized.includes("пробк")
    || normalized.includes("бутыл")
  ) {
    return "packaging";
  }

  if (
    normalized.includes("углекисл")
  ) {
    return "gas";
  }

  return normalized in consumablePickerGroupLabels ? normalized : null;
};

const dedupeStrings = (values: Array<string | null | undefined>) => {
  const seen = new Map<string, number>();
  const result: string[] = [];

  const scoreDisplayValue = (value: string) => {
    let score = 0;
    if (!value.includes(" / ")) score += 4;
    if (/[A-ZА-ЯЁ]/.test(value)) score += 2;
    if (/[a-zа-яё]/.test(value) && value === value.toLowerCase()) score -= 2;
    if (value.length <= 42) score += 1;
    return score;
  };

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    const key = normalizeKey(trimmed);
    if (!trimmed || !key) {
      continue;
    }

    const existingIndex = seen.get(key);
    if (existingIndex != null) {
      if (scoreDisplayValue(trimmed) > scoreDisplayValue(result[existingIndex] ?? "")) {
        result[existingIndex] = trimmed;
      }
      continue;
    }

    seen.set(key, result.length);
    result.push(trimmed);
  }

  return result;
};

export const consumablePickerGroupOrder = [
  "technical_additives",
  "lauter_aid",
  "spice",
  "citrus_zest",
  "herb_flower",
  "coffee_cacao",
  "wood_aging",
  "flavoring",
  "sanitizer",
  "cleaner",
  "packaging",
  "gas"
] as const;

export const consumablePickerGroupLabels: Record<string, string> = {
  technical_additives: "Техдобавки",
  lauter_aid: "Фильтрация затора",
  spice: "Специи",
  citrus_zest: "Цедра и цитрус",
  herb_flower: "Травы и цветы",
  coffee_cacao: "Кофе/какао",
  wood_aging: "Дерево/выдержка",
  flavoring: "Ароматизаторы",
  sanitizer: "Санитайзеры",
  cleaner: "Мойка",
  packaging: "Тара и укупорка",
  gas: "Газы",
  other: "Другое"
};

export const consumablePickerGroupDescriptions: Record<string, string> = {
  technical_additives: "Осветлители, ферменты, подкормки, антиоксиданты, пеногасители и консерванты",
  lauter_aid: "Рисовая, овсяная и другая лузга для фильтрации затора",
  spice: "Кориандр, перец, ваниль, корни, семена и смеси специй",
  citrus_zest: "Цедра и цитрусовые добавки",
  herb_flower: "Травы, цветы, чай и хвойные добавки",
  coffee_cacao: "Кофе, какао, кокос, ореховые и десертные добавки",
  wood_aging: "Дубовая щепа, кубики, спирали и древесина для выдержки",
  flavoring: "Фруктовые, десертные, бочковые и хмелевые ароматизаторы",
  sanitizer: "No-rinse, йодофор и CIP-санитайзеры",
  cleaner: "Щелочная, кислородная и кислотная мойка",
  packaging: "Тара, крышки, пробки и расходка для розлива",
  gas: "CO2 и газовая расходка",
  other: "Прочие добавки"
};

const consumableFormLabels: Record<string, string> = {
  bean: "Бобы",
  crystal: "Кристаллы",
  dried_berries: "Сушеные ягоды",
  dried_chili: "Сушеный чили",
  dried_flowers: "Сушеные цветы",
  dried_fruit: "Сухофрукты",
  dried_or_fresh: "Свежие/сушеные",
  dried_peel: "Сушеная цедра",
  dried_root: "Сушеный корень",
  dried_tips: "Сушеные побеги",
  extract: "Экстракт",
  flakes: "Хлопья",
  fresh_or_dried: "Свежие/сушеные",
  fresh_or_dried_zest: "Цедра",
  fresh_root: "Свежий корень",
  fresh_zest: "Свежая цедра",
  granule: "Гранулы",
  granules: "Гранулы",
  ground: "Молотый",
  husk: "Лузга",
  liquid: "Жидкость",
  nibs: "Нибсы",
  peppercorns: "Горошины",
  pods: "Стручки",
  powder: "Порошок",
  seed: "Семена",
  solid: "Твердое",
  solution: "Раствор",
  spice_blend: "Смесь специй",
  stick: "Палочки",
  tablet: "Таблетки",
  tablets: "Таблетки",
  tea: "Чай",
  whole: "Цельные",
  whole_beans: "Цельные зерна",
  whole_or_flakes: "Цельные/хлопья",
  whole_or_ground: "Цельные/молотые",
  wood_chips: "Щепа",
  wood_cubes: "Кубики",
  wood_spiral: "Спираль"
};

const consumableUsageStageLabels: Record<string, string> = {
  boil: "Кипячение",
  bottling: "Розлив",
  cold_crash: "Холодная выдержка",
  conditioning: "Созревание",
  fermentation: "Брожение",
  finished_beer: "Готовое пиво",
  flameout: "Вирпул",
  mash: "Затор",
  other: "Другое",
  packaging: "Розлив",
  post_fermentation: "После брожения",
  primary: "Брожение",
  sanitation: "Санитация",
  secondary: "Брожение",
  whirlpool: "Вирпул"
};

export const formatConsumableTechnicalLabel = (
  value?: string | null,
  labels: Record<string, string> = {}
) => {
  const normalized = normalizeGroupKey(value);
  if (!normalized) {
    return null;
  }

  return labels[normalized] ?? value?.trim().replaceAll("_", " ") ?? null;
};

export const formatConsumableFormLabel = (value?: string | null) => (
  formatConsumableTechnicalLabel(value, consumableFormLabels)
);

export const formatConsumableUsageStageLabel = (value?: string | null) => (
  formatConsumableTechnicalLabel(value, consumableUsageStageLabels)
);

export const formatConsumablePickerBrandLabel = (value?: string | null) => {
  const brand = value?.trim();
  if (!brand || normalizeGroupKey(brand) === "generic") {
    return null;
  }

  return brand;
};

export const resolveConsumableTechnicalData = (
  technicalData?: IngredientTechnicalData | null
): ConsumableTechnicalData | null => (
  technicalData?.type === "consumable"
    ? technicalData as ConsumableTechnicalData
    : null
);

export const resolveConsumablePickerGroup = (source: {
  technicalData?: IngredientTechnicalData | null;
  sourceCategory?: string | null;
  subcategory?: string | null;
  groupName?: string | null;
  subtype?: string | null;
  itemKind?: string | null;
}) => {
  const technicalData = resolveConsumableTechnicalData(source.technicalData);
  const candidates = [
    technicalData?.pickerGroup ?? null,
    source.sourceCategory ?? null,
    source.subcategory ?? null,
    source.groupName ?? null,
    source.subtype ?? null,
    source.itemKind ?? null
  ];
  let fallbackGroup: string | null = null;

  for (const candidate of candidates) {
    const explicitGroup = canonicalizeConsumablePickerGroup(candidate);
    if (!explicitGroup) {
      continue;
    }

    if (explicitGroup === "technical_additives") {
      fallbackGroup ??= explicitGroup;
      continue;
    }

    if (explicitGroup) {
      return explicitGroup;
    }
  }

  if ((technicalData?.usageStage ?? []).some((stage) => normalizeKey(stage) === "packaging")) {
    return "packaging";
  }

  return fallbackGroup;
};

export const consumableInventoryBroadGroupValues = [
  "inventory_supplies",
  "inventory_additives"
] as const;

export type ConsumableInventoryBroadGroupValue = (typeof consumableInventoryBroadGroupValues)[number];

export const consumableInventorySupplyGroups = [
  "sanitizer",
  "cleaner",
  "packaging",
  "gas"
] as const;

export const consumableInventoryAdditiveGroups = [
  "technical_additives",
  "lauter_aid",
  "spice",
  "citrus_zest",
  "herb_flower",
  "coffee_cacao",
  "wood_aging",
  "flavoring",
  "other"
] as const;

const consumableInventorySupplyGroupSet = new Set<string>(consumableInventorySupplyGroups);
const consumableInventoryAdditiveGroupSet = new Set<string>(consumableInventoryAdditiveGroups);

export const isConsumableInventoryBroadGroup = (
  value?: string | null
): value is ConsumableInventoryBroadGroupValue => (
  value === "inventory_supplies" || value === "inventory_additives"
);

export const resolveConsumableInventoryBroadGroupLabel = (
  value?: string | null
) => {
  if (value === "inventory_supplies") {
    return "Расходники";
  }

  if (value === "inventory_additives") {
    return "Другие добавки";
  }

  return null;
};

export const resolveConsumableInventoryBroadGroup = (
  source: Parameters<typeof resolveConsumablePickerGroup>[0]
) => {
  const resolvedGroup = resolveConsumablePickerGroup(source);

  if (resolvedGroup && consumableInventorySupplyGroupSet.has(resolvedGroup)) {
    return "inventory_supplies" as const;
  }

  if (resolvedGroup && consumableInventoryAdditiveGroupSet.has(resolvedGroup)) {
    return "inventory_additives" as const;
  }

  return "inventory_additives" as const;
};

export const resolveConsumablePickerGroupLabel = (value?: string | null) => {
  const normalized = canonicalizeConsumablePickerGroup(value);
  if (!normalized) {
    return null;
  }

  return consumablePickerGroupLabels[normalized] ?? value?.trim() ?? null;
};

export const resolveConsumablePickerGroupDescription = (value?: string | null) => {
  const normalized = canonicalizeConsumablePickerGroup(value);
  if (!normalized) {
    return null;
  }

  return consumablePickerGroupDescriptions[normalized] ?? null;
};

export const resolveConsumableMarketNames = (
  technicalData?: IngredientTechnicalData | null
) => {
  const consumable = resolveConsumableTechnicalData(technicalData);
  return dedupeStrings([
    ...(consumable?.marketNamesRu ?? []),
    ...(consumable?.marketNamesEn ?? [])
  ]);
};

export const resolveConsumablePriorityTerms = (
  technicalData?: IngredientTechnicalData | null
) => {
  const consumable = resolveConsumableTechnicalData(technicalData);
  return dedupeStrings([
    ...(consumable?.searchPriorityTermsRu ?? []),
    ...(consumable?.searchPriorityTermsEn ?? [])
  ]);
};

export const buildConsumableMarketPrimaryLabel = (
  technicalData?: IngredientTechnicalData | null,
  fallback?: string | null
) => {
  const marketNames = resolveConsumableMarketNames(technicalData);
  return marketNames.find((name) => !name.includes(" / "))?.trim()
    || marketNames[0]?.trim()
    || fallback?.trim()
    || null;
};

const normalizePackageUnit = (value?: string | null) => {
  const normalized = normalizeKey(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "item") {
    return "шт";
  }

  if (normalized === "l") {
    return "l";
  }

  return value?.trim() ?? null;
};

export const formatConsumablePackageLabel = (variant?: Pick<
  IngredientPackageVariantDto,
  "packageAmount" | "packageUnit"
> | null) => {
  if (!variant || variant.packageAmount == null) {
    return null;
  }

  const unit = normalizePackageUnit(variant.packageUnit);
  if (!unit) {
    return String(variant.packageAmount);
  }

  return `${variant.packageAmount} ${unit}`;
};

export const resolveConsumablePackageVariantName = (
  variant?: Pick<IngredientPackageVariantDto, "brand" | "productNameEn" | "productNameRu"> | null
) => {
  if (!variant) {
    return null;
  }

  const productName = variant.productNameEn?.trim() || variant.productNameRu?.trim() || null;
  if (productName && variant.brand?.trim()) {
    const normalizedProductName = normalizeKey(productName);
    const normalizedBrand = normalizeKey(variant.brand);
    if (normalizedProductName.includes(normalizedBrand)) {
      return productName;
    }

    return `${variant.brand.trim()} ${productName}`;
  }

  return productName || variant.brand?.trim() || null;
};

export const buildConsumablePackageSearchLabels = (
  variant: Pick<
    IngredientPackageVariantDto,
    "brand" | "productNameEn" | "productNameRu" | "packageAmount" | "packageUnit" | "stockContentAmount" | "stockContentUnit"
  >
) => {
  const labels = dedupeStrings([
    variant.productNameRu,
    variant.productNameEn,
    resolveConsumablePackageVariantName(variant),
    formatConsumablePackageLabel(variant),
    variant.stockContentAmount != null && variant.stockContentUnit
      ? `${variant.stockContentAmount} ${normalizePackageUnit(variant.stockContentUnit) ?? variant.stockContentUnit}`
      : null,
    variant.packageAmount != null && variant.packageUnit
      ? `${variant.packageAmount}${normalizePackageUnit(variant.packageUnit) ?? variant.packageUnit}`
      : null
  ]);

  return labels;
};
