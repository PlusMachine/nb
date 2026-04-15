import type {
  ConsumableTechnicalData,
  IngredientPackageVariantDto,
  IngredientTechnicalData
} from "./contracts";

const normalizeKey = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

export const canonicalizeConsumablePickerGroup = (value?: string | null) => {
  const normalized = normalizeKey(value).replace(/[\s-]+/g, "_");
  if (!normalized) {
    return null;
  }

  if (
    normalized === "sanitizer"
    || normalized === "sanitizers"
    || normalized.includes("sanitize")
    || normalized.includes("sanit")
    || normalized === "санитайзер"
    || normalized === "санитайзеры"
    || normalized.includes("дезинф")
  ) {
    return "sanitizer";
  }

  if (
    normalized === "cleaner"
    || normalized === "cleaners"
    || normalized.includes("clean")
    || normalized.includes("wash")
    || normalized.includes("cip")
    || normalized === "мойка"
    || normalized.startsWith("моющ")
    || normalized.includes("очист")
  ) {
    return "cleaner";
  }

  if (
    normalized === "process_aid"
    || normalized === "process_aids"
    || normalized === "filter_aid"
    || normalized === "filter_aids"
    || normalized.includes("process")
    || normalized.includes("rice_hull")
    || normalized.includes("rice_husk")
    || normalized.includes("лузг")
    || normalized.includes("шелух")
    || normalized.includes("filter")
    || normalized.startsWith("тех")
  ) {
    return "process_aid";
  }

  if (
    normalized === "fining"
    || normalized === "finings"
    || normalized.includes("clarif")
    || normalized.startsWith("освет")
    || normalized.startsWith("клариф")
  ) {
    return "fining";
  }

  if (
    normalized === "enzyme"
    || normalized === "enzymes"
    || normalized.includes("enzyme")
    || normalized.includes("enzym")
    || normalized.startsWith("фермент")
  ) {
    return "enzyme";
  }

  if (
    normalized === "nutrient"
    || normalized === "nutrients"
    || normalized.includes("nutrient")
    || normalized.includes("yeast_food")
    || normalized.startsWith("подкорм")
    || normalized.includes("питат")
  ) {
    return "nutrient";
  }

  if (
    normalized === "antioxidant"
    || normalized === "antioxidants"
    || normalized.includes("antioxid")
    || normalized.startsWith("антиокс")
  ) {
    return "antioxidant";
  }

  if (
    normalized === "packaging"
    || normalized === "package"
    || normalized === "closure"
    || normalized === "closures"
    || normalized.includes("bottle")
    || normalized.includes("cap")
    || normalized.includes("crown")
    || normalized.includes("cork")
    || normalized.includes("keg")
    || normalized === "tara"
    || normalized === "tara_i_ukuporka"
    || normalized === "ukuporka"
    || normalized.includes("тара")
    || normalized.includes("укупор")
    || normalized.includes("крыш")
    || normalized.includes("пробк")
    || normalized.includes("бутыл")
  ) {
    return "packaging";
  }

  if (
    normalized === "gas"
    || normalized === "gases"
    || normalized === "co2"
    || normalized === "carbon_dioxide"
    || normalized === "газ"
    || normalized === "газы"
    || normalized.includes("углекисл")
  ) {
    return "gas";
  }

  return normalized in consumablePickerGroupLabels ? normalized : null;
};

const dedupeStrings = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    const key = normalizeKey(trimmed);
    if (!trimmed || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
};

export const consumablePickerGroupOrder = [
  "process_aid",
  "sanitizer",
  "cleaner",
  "fining",
  "enzyme",
  "nutrient",
  "antioxidant",
  "packaging",
  "gas"
] as const;

export const consumablePickerGroupLabels: Record<string, string> = {
  process_aid: "Тех. добавки",
  sanitizer: "Санитайзеры",
  cleaner: "Мойка",
  fining: "Осветление",
  enzyme: "Ферменты",
  nutrient: "Подкормки",
  antioxidant: "Антиоксиданты",
  packaging: "Тара и укупорка",
  gas: "Газы"
};

export const consumablePickerGroupDescriptions: Record<string, string> = {
  process_aid: "Рисовая лузга, фильтрующие и процессные добавки",
  sanitizer: "No-rinse, йодофор и CIP-санитайзеры",
  cleaner: "Щелочная, кислородная и кислотная мойка",
  fining: "Киповое и постферментационное осветление",
  enzyme: "Ферменты для затора, ароматики и брожения",
  nutrient: "Подкормки, ре-гидратация и дрожжевые оболочки",
  antioxidant: "Стабилизация и защита от окисления",
  packaging: "Тара, крышки, пробки и расходка для розлива",
  gas: "CO2 и газовая расходка"
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

    if (explicitGroup === "process_aid") {
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
  "process_aid",
  "fining",
  "enzyme",
  "nutrient",
  "antioxidant",
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
  if (marketNames.length === 0) {
    return fallback?.trim() || null;
  }

  if (marketNames.length === 1) {
    return marketNames[0] ?? fallback?.trim() ?? null;
  }

  const topThree = marketNames.slice(0, 3);
  const joinedThree = topThree.join(" / ");
  if (joinedThree.length <= 42) {
    return joinedThree;
  }

  return marketNames.slice(0, 2).join(" / ");
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
