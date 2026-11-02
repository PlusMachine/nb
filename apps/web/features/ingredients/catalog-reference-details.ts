import type {
  ConsumableTechnicalData,
  FermentableTechnicalData,
  HopTechnicalData,
  IngredientReferenceQuantity,
  IngredientTechnicalData,
  MaltTechnicalData,
  WaterTreatmentTechnicalData,
  YeastTechnicalData
} from "./contracts";

export type CatalogReferenceDetail = { label: string; value: string };

const formatNumber = (value: number) => String(Number(value.toFixed(4)));
const units: Record<string, string> = {
  g: "г", g_each: "г", g_co2: "г CO₂", kg: "кг",
  ml: "мл", ml_each: "мл", l: "л", L: "л", pcs: "шт.", item: "шт."
};

const formatQuantity = (quantity: IngredientReferenceQuantity) => (
  `${formatNumber(quantity.amount)} ${units[quantity.unit] ?? quantity.unit}`
);

const formatIons = (ions: Record<string, number> | null | undefined) => (
  Object.entries(ions ?? {}).map(([ion, value]) => (
    `${({ SO4: "SO₄", HCO3: "HCO₃" } as Record<string, string>)[ion] ?? ion}: ${formatNumber(value)}`
  )).join("; ")
);

// These rows are reference information. They never supply recipe, water-plan,
// calculator or inventory quantity inputs.
export const buildCatalogReferenceRows = (data: IngredientTechnicalData | null | undefined): CatalogReferenceDetail[] => {
  const rows: CatalogReferenceDetail[] = [];
  if (data?.type === "hop") {
    const hop = data as HopTechnicalData;
    if (hop.oilMl100gTypical != null) rows.push({ label: "Масла", value: `${formatNumber(hop.oilMl100gTypical)} мл/100 г` });
    if (hop.cohumulonePctTypical != null) rows.push({ label: "Когумулон", value: `${formatNumber(hop.cohumulonePctTypical)}%` });
    if (hop.aromaDescriptorsEn?.length) rows.push({ label: "Аромат", value: hop.aromaDescriptorsEn.join(", ") });
  }
  if (data?.type === "malt" || data?.type === "fermentable") {
    const fermentable = data as MaltTechnicalData | FermentableTechnicalData;
    const maxUsage = fermentable.type === "malt" ? fermentable.maxUsagePct : fermentable.recommendedMaxPct;
    if (maxUsage != null) rows.push({ label: "Максимальная доля в засыпи", value: `${formatNumber(maxUsage)}%` });
    if (fermentable.type === "fermentable") {
      if (fermentable.proteinPct != null) rows.push({ label: "Белок", value: `${formatNumber(fermentable.proteinPct)}%` });
      if (fermentable.colorEbcExact != null) rows.push({ label: "Цвет из источника", value: `${formatNumber(fermentable.colorEbcExact)} EBC` });
    }
  }
  if (data?.type === "consumable") {
    const consumable = data as ConsumableTechnicalData;
    if (consumable.capacityPerPiece) rows.push({ label: "Вместимость единицы", value: formatQuantity(consumable.capacityPerPiece) });
    if (consumable.closureStandard) rows.push({ label: "Стандарт укупорки", value: consumable.closureStandard });
    if (consumable.flavorTagsRu?.length) rows.push({ label: "Вкус и аромат", value: consumable.flavorTagsRu.join(", ") });
    if (consumable.typicalStylesRu?.length) rows.push({ label: "Подходящие стили", value: consumable.typicalStylesRu.join(", ") });
  }
  if (data?.type === "water_treatment") {
    const water = data as WaterTreatmentTechnicalData;
    const perLitre = formatIons(water.ionContributionsPpmPerGPerL);
    const perGallon = formatIons(water.ionContributionsPpmPerGPerGal);
    if (perLitre) rows.push({ label: "Добавка ионов при дозировке 1 г/л", value: `${perLitre} ppm` });
    if (perGallon) rows.push({ label: "Добавка ионов при дозировке 1 г/галлон", value: `${perGallon} ppm` });
  }
  return rows;
};

const reviewFlagLabels: Record<string, string> = {
  hopping_state_not_confirmed: "Охмелённость продукта не подтверждена источником.",
  ambiguous_hopping_state: "Данные об охмелённости неоднозначны.",
  market_has_both_hopped_and_unhopped_variants: "Продукт продаётся в охмелённом и неохмелённом вариантах.",
  consider_split_into_two_catalog_entries: "Перед использованием уточните вариант продукта.",
  "physical_form_inferred_from_category_and producer site": "Форма продукта определена по категории и сайту производителя."
};

const formatDosage = (reference: Record<string, unknown> | null | undefined) => {
  const parts = [reference?.common_ratio, reference?.example_reference, reference?.hint_ru]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  if (typeof reference?.mg_per_l === "number" && Number.isFinite(reference.mg_per_l)) {
    parts.push(`${formatNumber(reference.mg_per_l)} мг/л`);
  }
  if (typeof reference?.approx_tablet_per_l === "number" && Number.isFinite(reference.approx_tablet_per_l)) {
    parts.push(`≈ ${formatNumber(reference.approx_tablet_per_l)} табл./л`);
  }
  return [...new Set(parts)].join("\n\n");
};

export const buildCatalogReferenceSections = (data: IngredientTechnicalData | null | undefined): CatalogReferenceDetail[] => {
  const sections: CatalogReferenceDetail[] = [];
  const add = (label: string, value?: string | null) => {
    if (value?.trim()) sections.push({ label, value: value.trim() });
  };
  if (data?.type === "hop") {
    const hop = data as HopTechnicalData;
    add("Примечания", hop.notes);
    if (hop.oilValueUnitWarning) {
      add("Уточнения к данным", hop.oilValueUnitWarning === "source anomaly / likely mg vs mL mismatch"
        ? "В источнике отмечено возможное несоответствие единиц измерения масел (мг и мл)."
        : hop.oilValueUnitWarning);
    }
  }
  if (data?.type === "fermentable") {
    const fermentable = data as FermentableTechnicalData;
    add("Уточнения по продукту", [...new Set((fermentable.normalizationReviewFlags ?? [])
      .map((flag) => reviewFlagLabels[flag] ?? "Сведения о продукте требуют уточнения по источнику."))].join("\n\n"));
  }
  if (data?.type === "yeast") add("Примечания", (data as YeastTechnicalData).notes);
  if (data?.type === "consumable") {
    const consumable = data as ConsumableTechnicalData;
    add("Применение", consumable.typicalUseRu);
    add("Дозировка из источника", formatDosage(consumable.dosageReference));
    add("Примечания", consumable.notesRu);
    add("Хранение", consumable.storageNotesRu);
  }
  if (data?.type === "water_treatment") {
    const water = data as WaterTreatmentTechnicalData;
    add("Применение", water.typicalUseRu);
    add("Дозировка из источника", formatDosage(water.typicalDoseReference));
    add("Особенности применения", water.cautionsRu);
    add("Хранение", water.storageNotesRu);
  }
  return sections;
};

export const buildCatalogPackageContentRows = (
  data: IngredientTechnicalData | null | undefined,
  packageVariantId: string
): CatalogReferenceDetail[] => {
  if (data?.type !== "consumable") return [];
  const detail = (data as ConsumableTechnicalData).packageContentDetails
    ?.find((item) => item.packageVariantId === packageVariantId);
  const rows: CatalogReferenceDetail[] = [];
  if (detail?.contentPerPiece) rows.push({ label: "На единицу", value: formatQuantity(detail.contentPerPiece) });
  if (detail?.contentPerPackage) rows.push({ label: "В упаковке", value: formatQuantity(detail.contentPerPackage) });
  return rows;
};

export const resolveCatalogSourcePageLabel = (
  data: IngredientTechnicalData | null | undefined,
  url: string | null | undefined,
  position?: number
) => {
  if (data?.type !== "hop" && data?.type !== "malt") return null;
  const page = (data as HopTechnicalData | MaltTechnicalData).sourceMetadata?.find((source) => (
    url ? source.url === url : position != null && source.position === position
  ))?.page;
  return page != null ? `Страница ${page}` : null;
};
