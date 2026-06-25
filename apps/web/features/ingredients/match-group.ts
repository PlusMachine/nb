import type { IngredientCategory, IngredientMatchPolicy } from "./taxonomy";
import type { IngredientType, IngredientTechnicalData } from "./contracts";
import { resolveIngredientTechnicalDataColorRangeEbc } from "./technical-fields";
import { canonicalIngredientFamilyGroups, normalizeSearchText } from "./normalization";
import type { InventoryUnitDimension } from "../inventory/units";

// «Мозг» сопоставления склад ↔ рецепт. Чистый резолвер: по ингредиенту (строка
// рецепта или позиция склада) считает два ключа взаимозаменяемости —
// `exactKey` (тот же продукт) и `groupKey` (тот же подтип/сорт через бренды) —
// и политику замен. Логика держится внутри; наружу отдаётся только результат
// матчинга (см. features/recipes/match-service.ts). Никакого хранения familyId.

export type IngredientMatchProfile = {
  category: IngredientCategory | null;
  type: IngredientType | null;
  name?: string | null;
  nameEn?: string | null;
  subtype?: string | null;
  aliases?: readonly string[] | null;
  technicalData?: IngredientTechnicalData | null;
  catalogItemId?: string | null;
  customId?: string | null;
  dimension?: InventoryUnitDimension | null;
};

export type IngredientMatchKey = {
  exactKey: string | null;
  groupKey: string | null;
  matchPolicy: IngredientMatchPolicy;
  category: IngredientCategory | null;
  dimension: InventoryUnitDimension | null;
};

const canonicalBucketGroups = canonicalIngredientFamilyGroups;

// Базовые солода (подтип задаётся именем, цвет подразумевается) — группируем по
// бакету целиком. Цветные солода (карамельный/жжёный) — добавляем полосу EBC,
// чтобы Caramel 40 не считался заменой Caramel 150.
const colorGradedBuckets = new Set(["caramel", "roasted"]);

const resolveColorBandEbc = (ebc: number | null): string | null => {
  if (ebc == null || !Number.isFinite(ebc)) {
    return null;
  }

  if (ebc < 5) return "c0";
  if (ebc < 15) return "c1";
  if (ebc < 40) return "c2";
  if (ebc < 100) return "c3";
  if (ebc < 300) return "c4";
  return "c5";
};

const tokenMatchesGroupTerm = (token: string, term: string) => (
  term === token
  || (token.length >= 3 && term.startsWith(token))
  || (term.length >= 4 && token.startsWith(term))
);

// Канонический бакет солода (pilsner/pale_ale/munich/vienna/wheat/caramel/
// roasted/acidulated) по имени и алиасам. Переиспользует тот же словарь, что и
// поиск по каталогу, чтобы группировка и поиск не расходились.
export const resolveCanonicalFamilyBucket = (
  values: Array<string | null | undefined>
): string | null => {
  const tokens = new Set<string>();
  for (const value of values) {
    const normalized = value ? normalizeSearchText(value) : "";
    if (!normalized) {
      continue;
    }

    tokens.add(normalized);
    for (const word of normalized.split(" ")) {
      if (word) {
        tokens.add(word);
      }
    }
  }

  for (const group of canonicalBucketGroups) {
    for (const token of tokens) {
      if (group.terms.some((term) => tokenMatchesGroupTerm(token, term))) {
        return group.key;
      }
    }
  }

  return null;
};

const resolveFermentableColorEbc = (technicalData: IngredientTechnicalData | null | undefined): number | null => {
  const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData ?? null);
  return range ? range.average : null;
};

// Безопасное чтение строкового поля technicalData нужного типа (union содержит
// индекс-сигнатуры, поэтому прямой доступ к полю даёт `{}`).
const techStringField = (
  technicalData: IngredientTechnicalData | null | undefined,
  type: IngredientTechnicalData["type"],
  ...keys: string[]
): string => {
  if (!technicalData || technicalData.type !== type) {
    return "";
  }

  const record = technicalData as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
};

const resolveFermentableGroupKey = (profile: IngredientMatchProfile): string | null => {
  const bucket = resolveCanonicalFamilyBucket([profile.name, profile.nameEn, ...(profile.aliases ?? [])]);
  const ebc = resolveFermentableColorEbc(profile.technicalData);

  if (bucket) {
    return colorGradedBuckets.has(bucket)
      ? `fermentable:${bucket}:${resolveColorBandEbc(ebc) ?? "cx"}`
      : `fermentable:${bucket}`;
  }

  const maltType = normalizeSearchText(techStringField(profile.technicalData, "malt", "maltType"));
  if (maltType) {
    return `fermentable:class:${maltType}:${resolveColorBandEbc(ebc) ?? "cx"}`;
  }

  const band = resolveColorBandEbc(ebc);
  return band ? `fermentable:ebc:${band}` : null;
};

const resolveHopGroupKey = (profile: IngredientMatchProfile): string | null => {
  // Сорт хмеля = канонический токен названия. Cascade у любого производителя
  // даёт `hop:cascade`; бренд/страна на ключ не влияют.
  const variety = normalizeSearchText(profile.nameEn ?? profile.name ?? "");
  return variety ? `hop:${variety}` : null;
};

const resolveYeastGroupKey = (profile: IngredientMatchProfile): string | null => {
  const family = normalizeSearchText(techStringField(profile.technicalData, "yeast", "yeastFamily"));
  return family ? `yeast:${family}` : null;
};

const resolveWaterTreatmentGroupKey = (profile: IngredientMatchProfile): string | null => {
  const formula = normalizeSearchText(
    techStringField(profile.technicalData, "water_treatment", "formula", "displayFormula")
  );
  if (formula) {
    return `water:${formula}`;
  }

  const subtype = normalizeSearchText(profile.subtype ?? "");
  return subtype ? `water:${subtype}` : null;
};

const resolveConsumableGroupKey = (profile: IngredientMatchProfile): string | null => {
  const subtype = normalizeSearchText(profile.subtype ?? "");
  return subtype ? `consumable:${subtype}` : null;
};

// Дрожжи штамм-специфичны: замена меняет пиво, поэтому только точное совпадение.
// Солод/хмель/вода/расходники — взаимозаменяемы по подтипу/сорту/формуле.
const resolveMatchPolicy = (category: IngredientCategory | null): IngredientMatchPolicy => (
  category === "yeast" || category == null ? "exact_only" : "family_compatible"
);

const resolveGroupKey = (profile: IngredientMatchProfile): string | null => {
  switch (profile.category) {
    case "fermentable":
      return resolveFermentableGroupKey(profile);
    case "hop":
      return resolveHopGroupKey(profile);
    case "yeast":
      return resolveYeastGroupKey(profile);
    case "water_treatment":
      return resolveWaterTreatmentGroupKey(profile);
    case "consumable":
      return resolveConsumableGroupKey(profile);
    default:
      return null;
  }
};

export const resolveIngredientMatchKey = (profile: IngredientMatchProfile): IngredientMatchKey => {
  const exactKey = profile.catalogItemId
    ? `catalog:${profile.catalogItemId}`
    : profile.customId
      ? `custom:${profile.customId}`
      : null;

  return {
    exactKey,
    groupKey: resolveGroupKey(profile),
    matchPolicy: resolveMatchPolicy(profile.category ?? null),
    category: profile.category ?? null,
    dimension: profile.dimension ?? null
  };
};
