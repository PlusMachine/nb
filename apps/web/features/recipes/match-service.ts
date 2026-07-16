import { and, db, eq, inArray, ingredients, recipeImages, recipeIngredients, recipes, userCustomIngredients } from "@nb/db";
import { getBeerStyleById, getBjcpArticleHrefByStyleId, roundTo } from "@nb/brewing-core";
import { getBjcpStyleHeroImageByBjcpId } from "@nb/content";

import {
  resolveIngredientMatchKey,
  type IngredientMatchKey,
  type IngredientMatchProfile
} from "../ingredients/match-group";
import type { IngredientCategory } from "../ingredients/taxonomy";
import type { IngredientType, IngredientTechnicalData } from "../ingredients/contracts";
import {
  extractIngredientTechnicalData,
  resolveIngredientTechnicalDataColorRangeEbc,
  resolveIngredientTechnicalDataHopAlphaAcidPct
} from "../ingredients/technical-fields";
import type { IngredientSubtype } from "../ingredients/contracts";
import { resolveInventoryMeasurementForDisplay } from "../inventory/display";
import {
  getInventoryUnitDimension,
  parseInventoryUnit,
  type InventoryUnit
} from "../inventory/units";
import { listInventoryForUser } from "../inventory/service";
import {
  getBrewBatchInventoryCredits,
  getBrewBatchInventoryCreditsForBatches,
  type InventoryCreditMap
} from "../inventory/brew-batch-credits";
import type { InventoryListItemDto } from "../inventory/contracts";
import { listEquipmentProfiles } from "../equipment-profiles/service";
import { getRecipeById } from "./service";
import {
  getBrewBatchScale,
  getBrewBatchScales,
  resolveBatchScaleFactor,
  safeRecipeBatchVolumeL,
  type BrewBatchScale
} from "./batch-scale";
import { resolveEfficiencyFactor, resolveLineScaleFactor } from "./scale";
import { resolveBrewabilityBadge } from "./brewability-badge";
import { publiclyVisibleRecipeConditions } from "./visibility";
import type {
  BrewableRecipeDto,
  RecipeIngredientDto,
  RecipeMatchDto,
  RecipeMatchLabel,
  RecipeMatchLineDto,
  RecipeMatchLineStatus
} from "./contracts";

// Значимость строки в итоговом %: отсутствие базового солода/дрожжей бьёт
// сильнее, чем недостача щепотки соли.
const categoryWeight: Record<string, number> = {
  fermentable: 5,
  yeast: 4,
  hop: 3,
  water_treatment: 1,
  consumable: 1
};

const weightForCategory = (category: string | null | undefined): number => (
  category ? categoryWeight[category] ?? 2 : 2
);

// Raw-строки рецепта несут DB-enum категории (7 значений); резолвер работает с
// taxonomy-категориями (5). Приводим, water_prep → water_treatment.
const toMatchCategory = (value: string | null | undefined): IngredientCategory | null => {
  switch (value) {
    case "fermentable":
    case "hop":
    case "yeast":
    case "consumable":
    case "water_treatment":
      return value;
    case "water_prep":
      return "water_treatment";
    default:
      return null;
  }
};

const toMatchType = (value: string | null | undefined): IngredientType | null => {
  switch (value) {
    case "malt":
    case "fermentable":
    case "hop":
    case "yeast":
    case "consumable":
    case "water_treatment":
      return value;
    default:
      return null;
  }
};

export type MatchLineInput = {
  id: string;
  persistentKey: string;
  displayOrder: number;
  displayName: string | null;
  profile: IngredientMatchProfile;
  requiredNormalizedQuantity: number;
  normalizedUnit: InventoryUnit | null;
  /** Ф23: бренд строки — показывается подписью под именем в строках нехватки панели матча. */
  brand?: string | null;
};

export type InventoryMatchEntry = {
  itemId: string;
  key: IngredientMatchKey;
  available: number;
  normalizedUnit: InventoryUnit | null;
  /** Техданные позиции (для сравнения кандидатов замены по EBC/альфе, Ф2). */
  technicalData?: IngredientTechnicalData | null;
};

// --- профили для резолвера ------------------------------------------------

const profileFromRecipeIngredientDto = (line: RecipeIngredientDto): IngredientMatchProfile => ({
  category: line.ingredientCategory ?? null,
  type: line.type ?? null,
  name: line.ingredientDisplayName ?? line.ingredientDisplayNameSnapshot ?? null,
  nameEn: line.ingredientDisplayNameEn ?? null,
  subtype: line.ingredientSubtype ?? null,
  technicalData: line.ingredientTechnicalData ?? null,
  catalogItemId: line.ingredientCatalogItemId ?? null,
  customId: line.userCustomIngredientId ?? null,
  dimension: parseInventoryUnit(line.amountNormalizedUnit)
    ? getInventoryUnitDimension(line.amountNormalizedUnit)
    : null
});

const profileFromInventoryItem = (item: InventoryListItemDto): IngredientMatchProfile => ({
  category: item.source.category ?? item.ingredientCategory ?? null,
  type: item.source.type ?? null,
  name: item.source.displayName ?? item.source.nameRu ?? item.ingredientDisplayNameSnapshot ?? null,
  nameEn: item.source.nameEn ?? item.source.displayNameEn ?? null,
  subtype: item.source.subtype ?? item.ingredientSubtype ?? null,
  technicalData: item.source.technicalData ?? null,
  catalogItemId: item.ingredientCatalogItemId ?? null,
  customId: item.userCustomIngredientId ?? null,
  dimension: item.unitDimension ?? getInventoryUnitDimension(item.normalizedUnit)
});

// --- инвентарь как индекс -------------------------------------------------

// credits (опционально) — то, что УЖЕ списано со склада под конкретную партию:
// в её контексте это не «потрачено», а «отложено под эту варку», иначе списание
// само рождает нехватку и требование докупить (см. inventory/brew-batch-credits).
// Кредит прибавляется ДО отсечки «>0»: позиция, списанная в ноль, обязана остаться
// в индексе, иначе строка станет "missing" — хуже, чем нынешний "partial".
export const buildInventoryEntries = (
  items: InventoryListItemDto[],
  credits?: InventoryCreditMap
): InventoryMatchEntry[] => (
  items
    .filter((item) => !item.archivedAt)
    .map((item) => {
      const credit = credits?.get(item.id);
      // Единица позиции могла смениться после списания — тогда кредит не сводится
      // и мы его не применяем (та же защита, что в restoreBrewBatchInventory).
      const available = credit && credit.normalizedUnit === item.normalizedUnit
        ? roundTo(item.normalizedQuantity + credit.quantityNormalized, 3)
        : item.normalizedQuantity;
      return { item, available };
    })
    .filter((entry) => entry.available > 0)
    .map(({ item, available }) => {
      const profile = profileFromInventoryItem(item);
      return {
        itemId: item.id,
        key: resolveIngredientMatchKey(profile),
        available,
        normalizedUnit: parseInventoryUnit(item.normalizedUnit),
        technicalData: profile.technicalData ?? null
      };
    })
);

export const indexInventoryEntries = (entries: InventoryMatchEntry[]) => {
  const byExact = new Map<string, InventoryMatchEntry[]>();
  const byGroup = new Map<string, InventoryMatchEntry[]>();

  for (const entry of entries) {
    if (entry.key.exactKey) {
      const list = byExact.get(entry.key.exactKey) ?? [];
      list.push(entry);
      byExact.set(entry.key.exactKey, list);
    }
    if (entry.key.groupKey) {
      const list = byGroup.get(entry.key.groupKey) ?? [];
      list.push(entry);
      byGroup.set(entry.key.groupKey, list);
    }
  }

  return { byExact, byGroup };
};

const dimensionMatches = (
  lineKey: IngredientMatchKey,
  lineUnit: InventoryUnit | null,
  entry: InventoryMatchEntry
): boolean => {
  if (!lineKey.dimension || !entry.key.dimension || lineKey.dimension !== entry.key.dimension) {
    return false;
  }

  // Вес→g и объём→ml всегда сводятся к одной канонической единице, count (item/
  // pack) — нет, поэтому для count требуем точного совпадения единицы.
  if (lineKey.dimension === "count") {
    return Boolean(lineUnit && entry.normalizedUnit && lineUnit === entry.normalizedUnit);
  }

  return true;
};

// Числовая характеристика для сравнения кандидатов замены (Ф2): EBC у солода
// (средняя по диапазону), альфа-кислота у хмеля. Для остального — null (замена
// у дрожжей вообще не считается, у воды/расходников сортировка по характеристике
// не нужна — там ключ уже формула/подтип).
export const resolveIngredientMatchComparisonValue = (
  category: IngredientCategory | null | undefined,
  technicalData: IngredientTechnicalData | null | undefined
): number | null => {
  if (category === "fermentable") {
    return resolveIngredientTechnicalDataColorRangeEbc(technicalData ?? null)?.average ?? null;
  }
  if (category === "hop" && technicalData?.type === "hop") {
    return resolveIngredientTechnicalDataHopAlphaAcidPct(technicalData);
  }
  return null;
};

export type SubstituteInventoryCandidate = InventoryMatchEntry & { comparisonValue: number | null };

/**
 * Кандидаты на ЗАМЕНУ (Ф2, списание) для строки рецепта: та же группа
 * (groupKey), политика "family_compatible" (дрожжи и неизвестная категория —
 * exact_only, замен не получают вовсе), другой конкретный продукт (exactKey),
 * совместимая размерность и остаток > 0 (buildInventoryEntries это уже
 * гарантирует). Сортировка: ближе по числовой характеристике (EBC/альфа) —
 * выше; без характеристики — в конец; при равенстве — больший остаток раньше.
 *
 * Переиспользует ядро резолвера (resolveIngredientMatchKey, index.byGroup,
 * dimensionMatches) — та же логика бакетов, что и у матча "склад ↔ рецепт".
 */
export const findSubstituteCandidatesForLine = (
  lineProfile: IngredientMatchProfile,
  lineUnit: InventoryUnit | null,
  index: ReturnType<typeof indexInventoryEntries>
): SubstituteInventoryCandidate[] => {
  const lineKey = resolveIngredientMatchKey(lineProfile);
  if (lineKey.matchPolicy !== "family_compatible" || !lineKey.groupKey) {
    return [];
  }

  const lineComparisonValue = resolveIngredientMatchComparisonValue(lineProfile.category, lineProfile.technicalData);

  const candidates = (index.byGroup.get(lineKey.groupKey) ?? [])
    .filter((candidateEntry) => !lineKey.exactKey || candidateEntry.key.exactKey !== lineKey.exactKey)
    .filter((candidateEntry) => dimensionMatches(lineKey, lineUnit, candidateEntry))
    .map((candidateEntry) => ({
      ...candidateEntry,
      comparisonValue: resolveIngredientMatchComparisonValue(lineProfile.category, candidateEntry.technicalData)
    }));

  return candidates.sort((left, right) => {
    const leftDistance = lineComparisonValue != null && left.comparisonValue != null
      ? Math.abs(left.comparisonValue - lineComparisonValue)
      : null;
    const rightDistance = lineComparisonValue != null && right.comparisonValue != null
      ? Math.abs(right.comparisonValue - lineComparisonValue)
      : null;

    if (leftDistance == null && rightDistance == null) {
      return right.available - left.available;
    }
    if (leftDistance == null) {
      return 1;
    }
    if (rightDistance == null) {
      return -1;
    }
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return right.available - left.available;
  });
};

// --- ядро матчинга --------------------------------------------------------

const resolveLineStatus = (input: {
  hasCandidates: boolean;
  required: number;
  availableExact: number;
  availableTotal: number;
}): RecipeMatchLineStatus => {
  if (!input.hasCandidates || input.availableTotal <= 0) {
    return "missing";
  }
  if (input.required <= 0 || input.availableExact >= input.required) {
    return "covered";
  }
  if (input.availableTotal >= input.required) {
    return "substitute";
  }
  return "partial";
};

// Округление ВВЕРХ до 3 знаков: иначе перевод нехватки вниз (413.4 г → 0.413 кг →
// 413 г) оставит строку partial после добавления, и «не хватает» не исчезнет.
const ceilTo3 = (value: number): number => Math.ceil(value * 1000 - 1e-6) / 1000;

// Предложение «добавить на склад» под недостающую/частичную строку: переводим
// shortfall (нормализованные g/ml/pack) в человеческую единицу ингредиента
// (солод → кг, хмель → г, дрожжи → пак), чтобы поле в панели было предзаполнено.
// Количество считаем из точной нехватки (не из округлённого display) и округляем
// вверх — чтобы добавленного гарантированно хватило строке на covered.
// Нет нехватки / нет единицы / перевод не удался → null (кнопки «+ на склад» нет).
const resolveAddSuggestion = (
  line: MatchLineInput,
  shortfall: number
): { suggestedAddQuantity: number | null; suggestedAddUnit: InventoryUnit | null } => {
  if (shortfall <= 0 || !line.normalizedUnit) {
    return { suggestedAddQuantity: null, suggestedAddUnit: null };
  }
  try {
    const display = resolveInventoryMeasurementForDisplay({
      enteredQuantity: shortfall,
      enteredUnit: line.normalizedUnit,
      normalizedQuantity: shortfall,
      normalizedUnit: line.normalizedUnit,
      type: line.profile.type,
      category: line.profile.category,
      subtype: (line.profile.subtype ?? null) as IngredientSubtype | null,
      technicalData: line.profile.technicalData ?? null
    });
    // resolveHumanFacingInventoryUnitProfile отдаёт только kg/g/ml/l/pack, поэтому
    // перевод нехватки в единицу подсказки — это либо ×1, либо ÷1000 (g→kg, ml→l).
    // Считаем вручную из ТОЧНОЙ нехватки: convertWeight/Volume сами округляют до 3
    // знаков и «съели» бы остаток (413.333 г → 0.413 кг → строка осталась бы partial).
    const unit = display.unit;
    let exact: number;
    if (unit === line.normalizedUnit) {
      exact = shortfall;
    } else if ((line.normalizedUnit === "g" && unit === "kg") || (line.normalizedUnit === "ml" && unit === "l")) {
      exact = shortfall / 1000;
    } else {
      exact = display.quantity;
    }
    return { suggestedAddQuantity: ceilTo3(exact), suggestedAddUnit: unit };
  } catch {
    return { suggestedAddQuantity: null, suggestedAddUnit: null };
  }
};

export const matchLineAgainstInventory = (
  line: MatchLineInput,
  index: ReturnType<typeof indexInventoryEntries>,
  factor: number
): RecipeMatchLineDto => {
  const lineKey = resolveIngredientMatchKey(line.profile);
  const required = roundTo(line.requiredNormalizedQuantity * factor, 3);

  // Дрожжи матчатся по НАЛИЧИЮ штамма, а не по количеству: 1 пакет ≈ 11 г, и
  // объём всё равно наращивается стартером, поэтому «пак vs грамм» (count vs
  // weight) не должен превращать имеющийся штамм в «нет». Если тот же штамм
  // (exactKey) есть на складе в любой единице/количестве — строка покрыта.
  // Штамм-специфичность сохраняется: другой штамм (другой exactKey) не подходит.
  const presenceBased = line.profile.category === "yeast" || line.profile.type === "yeast";

  const chosen = new Map<string, { entry: InventoryMatchEntry; tier: "exact" | "substitute" }>();

  if (lineKey.exactKey) {
    for (const entry of index.byExact.get(lineKey.exactKey) ?? []) {
      if (presenceBased ? entry.available > 0 : dimensionMatches(lineKey, line.normalizedUnit, entry)) {
        chosen.set(entry.itemId, { entry, tier: "exact" });
      }
    }
  }

  if (!presenceBased && lineKey.matchPolicy === "family_compatible" && lineKey.groupKey) {
    for (const entry of index.byGroup.get(lineKey.groupKey) ?? []) {
      if (chosen.has(entry.itemId)) {
        continue;
      }
      if (dimensionMatches(lineKey, line.normalizedUnit, entry)) {
        chosen.set(entry.itemId, { entry, tier: "substitute" });
      }
    }
  }

  let availableExact = 0;
  let availableTotal = 0;
  for (const { entry, tier } of chosen.values()) {
    availableTotal += entry.available;
    if (tier === "exact") {
      availableExact += entry.available;
    }
  }
  availableExact = roundTo(availableExact, 3);
  availableTotal = roundTo(availableTotal, 3);

  // Наличие штамма = полное покрытие; количество/единицы не сравниваем (иначе
  // паки и граммы дают ложный shortfall). Числа выравниваем под required, чтобы
  // деталь в панели не показывала «33 г / 1 пакет».
  if (presenceBased) {
    const present = chosen.size > 0;
    const shortfall = present ? 0 : required;
    return {
      recipeIngredientId: line.id,
      persistentKey: line.persistentKey,
      displayOrder: line.displayOrder,
      ingredientDisplayName: line.displayName,
      category: line.profile.category ?? null,
      brand: line.brand ?? null,
      status: present ? "covered" : "missing",
      coveragePercent: present ? 100 : 0,
      requiredQuantityNormalized: required,
      availableQuantityNormalized: present ? required : 0,
      shortfallNormalized: shortfall,
      normalizedUnit: line.normalizedUnit,
      viaSubstitute: false,
      ingredientCatalogItemId: line.profile.catalogItemId ?? null,
      userCustomIngredientId: line.profile.customId ?? null,
      ...resolveAddSuggestion(line, shortfall)
    };
  }

  const status = resolveLineStatus({
    hasCandidates: chosen.size > 0,
    required,
    availableExact,
    availableTotal
  });

  const coverage = required > 0 ? Math.min(availableTotal / required, 1) : (chosen.size > 0 ? 1 : 0);
  const shortfall = roundTo(Math.max(required - availableTotal, 0), 3);

  return {
    recipeIngredientId: line.id,
    persistentKey: line.persistentKey,
    displayOrder: line.displayOrder,
    ingredientDisplayName: line.displayName,
    category: line.profile.category ?? null,
    brand: line.brand ?? null,
    status,
    coveragePercent: Math.round(coverage * 100),
    requiredQuantityNormalized: required,
    availableQuantityNormalized: availableTotal,
    shortfallNormalized: shortfall,
    normalizedUnit: line.normalizedUnit,
    viaSubstitute: availableExact < required && availableTotal > availableExact,
    ingredientCatalogItemId: line.profile.catalogItemId ?? null,
    userCustomIngredientId: line.profile.customId ?? null,
    ...resolveAddSuggestion(line, shortfall)
  };
};

// Ф6 (P0): userCustomIngredientId в match-DTO — сырой FK кастомного ингредиента
// АВТОРА строки рецепта, а матч всегда считается ДЛЯ СМОТРЯЩЕГО (input.userId
// может отличаться от автора рецепта — просмотр чужого публичного рецепта).
// Отдавать зрителю чужой id нельзя: инлайн-форма «На склад» шлёт его в
// addRecipeIngredientToInventory → addCustomIngredientToInventory, а эта
// операция для зрителя невозможна (валидируется владением на сервере) — но
// сама ссылка/форма при этом не должна даже появляться. Батч-проверка
// владения: id ∈ встреченным в строках, userId = именно смотрящий.
const resolveOwnedCustomIngredientIds = async (
  userId: string,
  candidateIds: (string | null | undefined)[]
): Promise<Set<string>> => {
  const ids = [...new Set(candidateIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) {
    return new Set();
  }
  const rows = await db.query.userCustomIngredients.findMany({
    where: and(inArray(userCustomIngredients.id, ids), eq(userCustomIngredients.userId, userId)),
    columns: { id: true }
  });
  return new Set(rows.map((row) => row.id));
};

// Внутреннюю логику матчинга (exactKey/groupKey, matchLineAgainstInventory) не
// трогаем — гейт применяется ровно в момент сборки итогового DTO, чужой id
// точечно заменяется на null (строка автоматически становится name-only и
// получает П3-ссылки «Найти в каталоге»/«Добавить свой»).
const withOwnedCustomIngredientId = (
  line: RecipeMatchLineDto,
  ownedCustomIngredientIds: Set<string>
): RecipeMatchLineDto => (
  line.userCustomIngredientId && !ownedCustomIngredientIds.has(line.userCustomIngredientId)
    ? { ...line, userCustomIngredientId: null }
    : line
);

const collectCustomIngredientIds = (candidates: CandidateRecipeRow[]): (string | null)[] =>
  candidates.flatMap((recipe) => recipe.ingredients.map((row) => row.userCustomIngredientId));

const resolveMatchLabel = (matchPercent: number): RecipeMatchLabel => {
  if (matchPercent >= 100) return "ready";
  if (matchPercent >= 70) return "almost";
  if (matchPercent >= 1) return "partial";
  return "none";
};

export const summarizeMatch = (recipeId: string, lines: RecipeMatchLineDto[], context: {
  targetBatchVolumeL: number;
  recipeBatchVolumeL: number;
  // Ф28: null везде, кроме витринного пути БЕЗ явного объёма/партии (см.
  // computeRecipeMatch) — там true/false говорит панели, есть ли у смотрящего
  // профиль оборудования, чтобы показать подсказку «задайте оборудование».
  hasEquipmentProfile?: boolean | null;
}): RecipeMatchDto => {
  let weightSum = 0;
  let weightedCoverage = 0;
  for (const line of lines) {
    const weight = weightForCategory(line.category);
    weightSum += weight;
    weightedCoverage += weight * (line.coveragePercent / 100);
  }

  const matchPercent = weightSum > 0 ? Math.round((weightedCoverage / weightSum) * 100) : 0;
  const coveredLines = lines.filter((line) => line.status === "covered" || line.status === "substitute").length;
  const missingCount = lines.filter((line) => line.status === "missing").length;

  return {
    recipeId,
    matchPercent,
    label: resolveMatchLabel(matchPercent),
    totalLines: lines.length,
    coveredLines,
    missingCount,
    lines: lines.sort((a, b) => a.displayOrder - b.displayOrder),
    targetBatchVolumeL: roundTo(context.targetBatchVolumeL, 2),
    recipeBatchVolumeL: roundTo(context.recipeBatchVolumeL, 2),
    scaledToInventory: Math.abs(context.targetBatchVolumeL - context.recipeBatchVolumeL) > 0.001,
    hasEquipmentProfile: context.hasEquipmentProfile ?? null
  };
};

// --- объём партии ---------------------------------------------------------

/**
 * Дефолтное оборудование пользователя: объём И эффективность. Эффективность нужна
 * ровно затем же, зачем объём, — чтобы «сколько нужно» на витрине совпало с тем,
 * что реально спишется при варке на этом оборудовании (засыпь дожимается под свою
 * эффективность, см. features/recipes/scale.ts). Без неё карточка снова обещала бы
 * «хватает», а варка требовала больше солода.
 */
const resolveDefaultEquipment = async (userId: string): Promise<{
  targetBatchVolumeL: number | null;
  brewhouseEfficiencyPct: number | null;
  /** Ф28: есть ли у пользователя хотя бы один профиль оборудования (отличает
   * «профиля нет → расчёт молча под объём рецепта» от «профиль есть»). */
  hasProfile: boolean;
}> => {
  const profiles = await listEquipmentProfiles(userId);
  const profile = profiles[0];
  const volume = profile?.targetBatchVolumeL;
  const efficiency = profile?.brewhouseEfficiencyPct;
  return {
    targetBatchVolumeL: typeof volume === "number" && volume > 0 ? volume : null,
    brewhouseEfficiencyPct: typeof efficiency === "number" && efficiency > 0 ? efficiency : null,
    hasProfile: profiles.length > 0
  };
};

const NO_DEFAULT_EQUIPMENT = { targetBatchVolumeL: null, brewhouseEfficiencyPct: null, hasProfile: false };

// Масштаб рецепта под целевой объём: объём рецепта, целевой объём (явный →
// дефолтный профиль оборудования → объём рецепта) и фактор пересчёта количеств.
// Общий для одиночного и батчевых матчей, чтобы математика не расходилась.
//
// ВАЖНО (см. features/recipes/batch-scale.ts): для МАТЧА ПАРТИИ дефолтом
// приезжает не профиль оборудования, а объём самой партии — списание считает
// потребность от него же, и разъехаться они больше не могут.
type MatchScale = {
  recipeBatchVolumeL: number;
  targetBatchVolumeL: number;
  factor: number;
  /** Дожим засыпи под эффективность оборудования (1 = нет). */
  efficiencyFactor: number;
};

const resolveMatchFactor = (
  recipe: {
    batchSizeNormalizedQuantity: number;
    batchSizeNormalizedUnit: string;
    efficiency?: number | null;
  },
  options: {
    targetBatchVolumeL?: number | null;
    defaultBatchVolumeL: number | null;
    /** Дожим ПАРТИИ — из её плана (зафиксирован на старте, живой рецепт не спросишь). */
    efficiencyFactor?: number | null;
    /** Эффективность дефолтного профиля — вне партии (витрина, дашборд). */
    defaultEfficiencyPct?: number | null;
  }
): MatchScale => {
  const recipeBatchVolumeL = safeRecipeBatchVolumeL(
    recipe.batchSizeNormalizedQuantity,
    recipe.batchSizeNormalizedUnit
  );
  const targetBatchVolumeL = options.targetBatchVolumeL && options.targetBatchVolumeL > 0
    ? options.targetBatchVolumeL
    : options.defaultBatchVolumeL ?? recipeBatchVolumeL;
  const efficiencyFactor = options.efficiencyFactor != null && options.efficiencyFactor > 0
    ? options.efficiencyFactor
    : resolveEfficiencyFactor(recipe.efficiency, options.defaultEfficiencyPct);
  return {
    recipeBatchVolumeL,
    targetBatchVolumeL,
    factor: resolveBatchScaleFactor(recipeBatchVolumeL, targetBatchVolumeL),
    efficiencyFactor
  };
};

// --- публичный API: рецепт → % по складу ----------------------------------

export const computeRecipeMatch = async (input: {
  userId: string;
  recipeId: string;
  targetBatchVolumeL?: number | null;
  // Матч В КОНТЕКСТЕ ПАРТИИ: то, что эта партия уже списала со склада, считается
  // покрытием её же строк (иначе списание порождает нехватку у самой варки), а
  // потребность считается от ОБЪЁМА ЭТОЙ ПАРТИИ — от него же её считает списание.
  // Без brewBatchId матч смотрит на фактический склад и на дефолтный профиль
  // оборудования — так и должно быть на витрине, дашборде и странице стиля.
  brewBatchId?: string | null;
}): Promise<RecipeMatchDto> => {
  const [recipe, inventoryItems, batchScale, defaultEquipment, credits] = await Promise.all([
    getRecipeById(input.userId, input.recipeId),
    // includeEmpty — обязателен для кредита партии: позицию, списанную В НОЛЬ под эту
    // же варку, склад по умолчанию не отдаёт, и прибавлять кредит становится не к чему
    // (позиция уходит в missing — то самое «списал и сразу не хватает»). Пустые
    // позиции без кредита отсекает buildInventoryEntries по available > 0.
    listInventoryForUser(input.userId, { includeEmpty: true }),
    // У ПАРТИИ свой масштаб — объём и дожим засыпи из её плана: списание считает
    // потребность ровно от них, и разъехаться они больше не могут.
    input.brewBatchId
      ? getBrewBatchScale(input.userId, input.brewBatchId)
      : Promise.resolve(null),
    // Профиль оборудования — дефолт только ВНЕ партии: у партии есть свой объём,
    // и подмена его «моим оборудованием» разводила матч со списанием.
    input.targetBatchVolumeL || input.brewBatchId
      ? Promise.resolve(NO_DEFAULT_EQUIPMENT)
      : resolveDefaultEquipment(input.userId),
    input.brewBatchId
      ? getBrewBatchInventoryCredits(input.userId, input.brewBatchId)
      : Promise.resolve(undefined)
  ]);

  const { recipeBatchVolumeL, targetBatchVolumeL, factor, efficiencyFactor } = resolveMatchFactor(recipe, {
    targetBatchVolumeL: input.targetBatchVolumeL ?? batchScale?.targetBatchVolumeL ?? null,
    defaultBatchVolumeL: defaultEquipment.targetBatchVolumeL,
    efficiencyFactor: batchScale?.efficiencyFactor ?? null,
    defaultEfficiencyPct: defaultEquipment.brewhouseEfficiencyPct
  });

  // Ф28: тот же предикат, что выше выбирает resolveDefaultEquipment vs
  // NO_DEFAULT_EQUIPMENT — только на этом пути (витрина/дашборд, без явного
  // объёма и вне партии) уместно подсказывать «нет профиля оборудования».
  const usedDefaultEquipment = !(input.targetBatchVolumeL || input.brewBatchId);
  const hasEquipmentProfile = usedDefaultEquipment ? defaultEquipment.hasProfile : null;

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems, credits));

  // Ф6: строки рецепта могут нести userCustomIngredientId АВТОРА рецепта (когда
  // input.userId — не автор, а зритель чужого публичного рецепта) — гейт по
  // владению применяется ниже, при сборке каждой строки.
  const ownedCustomIngredientIds = await resolveOwnedCustomIngredientIds(
    input.userId,
    recipe.ingredients.map((ingredient) => ingredient.userCustomIngredientId)
  );

  const lines = recipe.ingredients.map((ingredient): RecipeMatchLineDto => {
    const profile = profileFromRecipeIngredientDto(ingredient);
    const matched = matchLineAgainstInventory(
      {
        id: ingredient.id,
        persistentKey: ingredient.persistentKey,
        displayOrder: ingredient.displayOrder,
        displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? null,
        profile,
        requiredNormalizedQuantity: ingredient.amountNormalizedQuantity,
        normalizedUnit: parseInventoryUnit(ingredient.amountNormalizedUnit),
        brand: ingredient.ingredientBrand ?? ingredient.ingredientBrandName ?? null
      },
      index,
      // Дожим — только засыпи: хмель и дрожжи от эффективности затирания не зависят.
      resolveLineScaleFactor(profile, factor, efficiencyFactor)
    );
    return withOwnedCustomIngredientId(matched, ownedCustomIngredientIds);
  });

  return summarizeMatch(recipe.id, lines, { targetBatchVolumeL, recipeBatchVolumeL, hasEquipmentProfile });
};

// --- публичный API: склад → подходящие рецепты ----------------------------

type CandidateRecipeRow = typeof recipes.$inferSelect & {
  ingredients: (typeof recipeIngredients.$inferSelect)[];
};

// Экспортируется для переиспользования вне матча: список замен на списании
// (features/recipes/inventory-service.ts) строит профиль строки рецепта тем же
// способом, что и матч "склад ↔ рецепт" — не дублируя приведение raw-enum'ов.
export const profileFromRecipeIngredientRow = (
  row: typeof recipeIngredients.$inferSelect,
  catalog: typeof ingredients.$inferSelect | undefined
): IngredientMatchProfile => {
  const technicalData = catalog
    ? extractIngredientTechnicalData({ type: catalog.type, attributes: catalog.attributes })
    : null;

  return {
    category: toMatchCategory(row.ingredientCategory),
    type: toMatchType(row.type),
    name: catalog?.nameRu ?? row.ingredientDisplayNameSnapshot ?? null,
    nameEn: catalog?.nameEn ?? null,
    subtype: row.ingredientSubtype ?? null,
    technicalData,
    catalogItemId: row.ingredientCatalogItemId ?? null,
    customId: row.userCustomIngredientId ?? null,
    dimension: parseInventoryUnit(row.amountNormalizedUnit)
      ? getInventoryUnitDimension(row.amountNormalizedUnit as InventoryUnit)
      : null
  };
};

// Батч-загрузка каталога для набора рецептов: один inArray-запрос по всем
// linked catalog id, чтобы не делать N+1 на ингредиентах.
const loadCatalogForRecipes = async (
  candidates: CandidateRecipeRow[]
): Promise<Map<string, typeof ingredients.$inferSelect>> => {
  const catalogIds = [...new Set(
    candidates.flatMap((recipe) => recipe.ingredients
      .map((line) => line.ingredientCatalogItemId)
      .filter((id): id is string => Boolean(id)))
  )];
  const catalogRows = catalogIds.length
    ? await db.query.ingredients.findMany({ where: inArray(ingredients.id, catalogIds) })
    : [];
  return new Map(catalogRows.map((row) => [row.id, row]));
};

// Один рецепт (raw-строки) → RecipeMatchDto. Общее тело для findBrewable... и
// computeRecipeMatchesForUser: профиль строки + matchLineAgainstInventory +
// summarizeMatch.
const computeMatchForRecipeRow = (
  recipe: CandidateRecipeRow,
  index: ReturnType<typeof indexInventoryEntries>,
  catalogById: Map<string, typeof ingredients.$inferSelect>,
  volume: MatchScale,
  // Ф6: батчи здесь матчат рецепты произвольных авторов (чужие избранные/
  // публичные) для одного смотрящего — customId строки принадлежит владельцу
  // строки в БД (не обязательно смотрящему), гейт сужает его до владения.
  ownedCustomIngredientIds: Set<string>
): RecipeMatchDto => {
  const lines = recipe.ingredients.map((row) => {
    const catalog = catalogById.get(row.ingredientCatalogItemId ?? "");
    const profile = profileFromRecipeIngredientRow(row, catalog);
    const matched = matchLineAgainstInventory(
      {
        id: row.id,
        persistentKey: row.persistentKey,
        displayOrder: row.displayOrder,
        displayName: row.ingredientDisplayNameSnapshot ?? null,
        profile,
        requiredNormalizedQuantity: row.amountNormalizedQuantity,
        normalizedUnit: parseInventoryUnit(row.amountNormalizedUnit),
        // Ф23/бэклог: каталог для этих строк уже загружен батчем (loadCatalogForRecipes)
        // — раньше brand не прокидывался сюда, из-за чего lines[].brand оставался
        // null во всех батч-путях (рецепты под склад/shopping/матч партии).
        brand: catalog?.brand ?? null
      },
      index,
      resolveLineScaleFactor(profile, volume.factor, volume.efficiencyFactor)
    );
    return withOwnedCustomIngredientId(matched, ownedCustomIngredientIds);
  });

  return summarizeMatch(recipe.id, lines, {
    targetBatchVolumeL: volume.targetBatchVolumeL,
    recipeBatchVolumeL: volume.recipeBatchVolumeL
  });
};

// Отранжированные строки матча → BrewableRecipeDto с презентацией карточки в
// языке витрины /recipes: обложка (фото рецепта → фото BJCP-стиля → заливка по
// SRM), стиль и ссылка на BJCP — тем же способом, что listAuthorRecipeCards.
// Hero-фото тянем ОДНИМ батч-запросом по уже отобранным (top-N) рецептам, а не
// по всему пулу кандидатов, — так это не превращается в N+1 и не грузит фото
// того, что не покажем.
const toBrewableRecipeDtos = async (
  entries: { recipe: CandidateRecipeRow; summary: RecipeMatchDto }[]
): Promise<BrewableRecipeDto[]> => {
  const heroImageIds = [...new Set(
    entries.map((entry) => entry.recipe.heroImageId).filter((id): id is string => Boolean(id))
  )];
  const heroRows = heroImageIds.length
    ? await db
        .select({ id: recipeImages.id, thumbKey: recipeImages.storageKeyThumb, blurDataUrl: recipeImages.blurDataUrl })
        .from(recipeImages)
        .where(inArray(recipeImages.id, heroImageIds))
    : [];
  const heroById = new Map(heroRows.map((row) => [row.id, row]));
  const styleHeroImageByBjcpId = await getBjcpStyleHeroImageByBjcpId();

  return entries.map(({ recipe, summary }) => {
    const style = getBeerStyleById(recipe.styleId);
    const heroRow = recipe.heroImageId ? heroById.get(recipe.heroImageId) : undefined;
    const heroImage =
      heroRow?.thumbKey
        ? { thumbUrl: `/api/recipe-images/${recipe.heroImageId}/thumb`, blurDataUrl: heroRow.blurDataUrl ?? null }
        : null;
    // Фото BJCP-стиля показываем только когда у рецепта нет своего фото.
    const styleImageUrl = !heroImage && style ? styleHeroImageByBjcpId.get(style.bjcpId) ?? null : null;

    return {
      recipeId: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      matchPercent: summary.matchPercent,
      label: summary.label,
      totalLines: summary.totalLines,
      coveredLines: summary.coveredLines,
      missingCount: summary.missingCount,
      missingNames: summary.lines
        .filter((line) => line.status === "missing")
        .map((line) => line.ingredientDisplayName)
        .filter((name): name is string => Boolean(name)),
      styleName: style ? style.nameRu ?? style.name : null,
      styleCode: style ? style.bjcpId : null,
      styleHref: getBjcpArticleHrefByStyleId(recipe.styleId),
      colorSrm: recipe.color,
      heroImage,
      styleImageUrl
    } satisfies BrewableRecipeDto;
  });
};

export const findBrewableRecipesForUser = async (input: {
  userId: string;
  targetBatchVolumeL?: number | null;
  minMatchPercent?: number;
  limit?: number;
  candidatePoolSize?: number;
}): Promise<BrewableRecipeDto[]> => {
  const minMatchPercent = input.minMatchPercent ?? 1;
  const limit = input.limit ?? 12;
  const candidatePoolSize = input.candidatePoolSize ?? 80;

  const [inventoryItems, defaultEquipment] = await Promise.all([
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL
      ? Promise.resolve(NO_DEFAULT_EQUIPMENT)
      : resolveDefaultEquipment(input.userId)
  ]);

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems));
  if (index.byExact.size === 0 && index.byGroup.size === 0) {
    return [];
  }

  const candidates = await db.query.recipes.findMany({
    where: and(...publiclyVisibleRecipeConditions()),
    with: { ingredients: true },
    orderBy: (table, { desc }) => [desc(table.saveCount), desc(table.updatedAt)],
    limit: candidatePoolSize
  }) as CandidateRecipeRow[];

  const catalogById = await loadCatalogForRecipes(candidates);
  // Ф6: этот пул — чужие публичные рецепты (склад→рецепты); customId строк
  // почти всегда не смотрящего, гейт сузит владение до реально совпавших.
  const ownedCustomIngredientIds = await resolveOwnedCustomIngredientIds(
    input.userId,
    collectCustomIngredientIds(candidates)
  );

  const ranked = candidates
    .filter((recipe) => recipe.ingredients.length > 0)
    .map((recipe) => {
      const volume = resolveMatchFactor(recipe, {
        targetBatchVolumeL: input.targetBatchVolumeL,
        defaultBatchVolumeL: defaultEquipment.targetBatchVolumeL,
        defaultEfficiencyPct: defaultEquipment.brewhouseEfficiencyPct
      });
      return { recipe, summary: computeMatchForRecipeRow(recipe, index, catalogById, volume, ownedCustomIngredientIds) };
    })
    .filter(({ summary }) => summary.matchPercent >= minMatchPercent)
    .sort((a, b) => b.summary.matchPercent - a.summary.matchPercent || b.summary.coveredLines - a.summary.coveredLines)
    .slice(0, limit);

  return toBrewableRecipeDtos(ranked);
};

// --- публичный API: свои рецепты под склад (секция «Рецепты под ваш склад») ---

// Секция «Рецепты под ваш склад» (дашборд): СВОИ рецепты (любой статус публикации),
// схлопнутые до последней версии в семействе, у которых на складе есть ВСЕ типы
// ингредиентов (tier "ready" из resolveBrewabilityBadge — та же семантика, что у
// бейджа на карточках). Пустой склад → пусто. Сортировка по количественному
// matchPercent (затем по числу покрытых строк), сверху самые «полные».
//
// Внутрь попадают и рецепты с бейджем «Почти хватает» (типы есть, количества
// местами впритык) — поэтому секция называется «под ваш склад», а не «можно
// сварить сейчас»: обещать варку прямо сейчас она не вправе.
export const findBrewableOwnRecipesForUser = async (input: {
  userId: string;
  limit?: number;
  targetBatchVolumeL?: number | null;
}): Promise<BrewableRecipeDto[]> => {
  const limit = input.limit ?? 6;

  const [inventoryItems, defaultEquipment] = await Promise.all([
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL
      ? Promise.resolve(NO_DEFAULT_EQUIPMENT)
      : resolveDefaultEquipment(input.userId)
  ]);

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems));
  if (index.byExact.size === 0 && index.byGroup.size === 0) {
    return [];
  }

  const rows = await db.query.recipes.findMany({
    where: eq(recipes.authorId, input.userId),
    with: { ingredients: true }
  }) as CandidateRecipeRow[];

  // Схлопываем до последней версии в семействе (макс. versionNumber), чтобы на
  // дашборде не было дублей «IPA v1 / IPA v2».
  const latestByFamily = new Map<string, CandidateRecipeRow>();
  for (const row of rows) {
    const previous = latestByFamily.get(row.recipeFamilyId);
    if (!previous || row.versionNumber > previous.versionNumber) {
      latestByFamily.set(row.recipeFamilyId, row);
    }
  }
  const candidates = [...latestByFamily.values()].filter((recipe) => recipe.ingredients.length > 0);
  if (candidates.length === 0) {
    return [];
  }

  const catalogById = await loadCatalogForRecipes(candidates);
  // Ф6: рецепты здесь — свои же (authorId = input.userId), поэтому customId уже
  // принадлежит смотрящему; гейт применяем всё равно — единый путь без исключений.
  const ownedCustomIngredientIds = await resolveOwnedCustomIngredientIds(
    input.userId,
    collectCustomIngredientIds(candidates)
  );

  const ranked = candidates
    .map((recipe) => {
      const volume = resolveMatchFactor(recipe, {
        targetBatchVolumeL: input.targetBatchVolumeL,
        defaultBatchVolumeL: defaultEquipment.targetBatchVolumeL,
        defaultEfficiencyPct: defaultEquipment.brewhouseEfficiencyPct
      });
      return { recipe, summary: computeMatchForRecipeRow(recipe, index, catalogById, volume, ownedCustomIngredientIds) };
    })
    .filter(({ summary }) => resolveBrewabilityBadge(summary).tier === "ready")
    .sort((a, b) => b.summary.matchPercent - a.summary.matchPercent || b.summary.coveredLines - a.summary.coveredLines)
    .slice(0, limit);

  return toBrewableRecipeDtos(ranked);
};

// --- публичный API: батч матча для заданных рецептов (для бейджей на карточках) ---

export const computeRecipeMatchesForUser = async (input: {
  userId: string;
  recipeIds: string[];
  targetBatchVolumeL?: number | null;
  // Пустой склад обычно означает «нечего матчить» — короткий выход без похода в
  // БД за рецептами (findBrewableRecipesForUser и т.п.). Раздел «Чего не хватает» —
  // другой случай: там нужны все строки как "missing" даже при пустом складе (иначе
  // список для пользователя без единого ингредиента на складе не соберётся).
  includeEmptyInventory?: boolean;
}): Promise<Record<string, RecipeMatchDto>> => {
  const ids = [...new Set(input.recipeIds)].filter(Boolean);
  if (ids.length === 0) {
    return {};
  }

  const [inventoryItems, defaultEquipment] = await Promise.all([
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL
      ? Promise.resolve(NO_DEFAULT_EQUIPMENT)
      : resolveDefaultEquipment(input.userId)
  ]);

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems));
  if (!input.includeEmptyInventory && index.byExact.size === 0 && index.byGroup.size === 0) {
    return {};
  }

  const candidates = await db.query.recipes.findMany({
    where: inArray(recipes.id, ids),
    with: { ingredients: true }
  }) as CandidateRecipeRow[];

  const catalogById = await loadCatalogForRecipes(candidates);
  // Ф6: computeRecipeMatchesForUser батчует и ЧУЖИЕ рецепты (избранные — см.
  // features/shopping/service.ts §3.3), поэтому customId строки не обязательно
  // принадлежит input.userId — гейт сужает до реально владеемых.
  const ownedCustomIngredientIds = await resolveOwnedCustomIngredientIds(
    input.userId,
    collectCustomIngredientIds(candidates)
  );

  const result: Record<string, RecipeMatchDto> = {};
  for (const recipe of candidates) {
    if (recipe.ingredients.length === 0) {
      continue;
    }
    // FIX-3: один рецепт с кривыми данными (например, повреждённая строка
    // ингредиента) не должен валить весь батч-матч — а с ним всю страницу
    // /app (дашборд, список покупок), которая матчит десятки рецептов разом.
    // Пропускаем только этот рецепт, остальные считаем как обычно.
    try {
      const volume = resolveMatchFactor(recipe, {
        targetBatchVolumeL: input.targetBatchVolumeL,
        defaultBatchVolumeL: defaultEquipment.targetBatchVolumeL,
        defaultEfficiencyPct: defaultEquipment.brewhouseEfficiencyPct
      });
      result[recipe.id] = computeMatchForRecipeRow(recipe, index, catalogById, volume, ownedCustomIngredientIds);
    } catch (error) {
      console.error("[recipes] computeRecipeMatchesForUser: skipping recipe after match error", {
        recipeId: recipe.id,
        error
      });
    }
  }

  return result;
};

// --- публичный API: батч матча ПО ПАРТИЯМ (для раздела «Чего не хватает») ---

// Ключ результата — brewBatchId, а не recipeId: у каждой партии свой кредит уже
// списанного и свой объём, и две партии на одном рецепте обязаны считаться порознь
// (иначе списание первой занизило бы нехватку второй). Отсюда же — отдельная
// функция, а не флаг у computeRecipeMatchesForUser, где Record ключуется рецептом.
//
// Объём — у КАЖДОЙ партии свой (её план), профиль оборудования здесь не при чём:
// список покупок должен требовать ровно то, что снимет со склада кнопка «Списать»
// на странице этой партии.
//
// Пустой склад НЕ повод для короткого выхода (как includeEmptyInventory): списку
// покупок нужны все missing-строки, иначе новичок без склада не увидит ничего.
export const computeRecipeMatchesForBrewBatches = async (input: {
  userId: string;
  batches: { brewBatchId: string; recipeId: string }[];
  targetBatchVolumeL?: number | null;
}): Promise<Record<string, RecipeMatchDto>> => {
  const batches = input.batches.filter((batch) => batch.brewBatchId && batch.recipeId);
  if (batches.length === 0) {
    return {};
  }

  const recipeIds = [...new Set(batches.map((batch) => batch.recipeId))];

  const [inventoryItems, batchScales, creditsByBatch] = await Promise.all([
    // includeEmpty — см. computeRecipeMatch: без пустых позиций кредит списанной в ноль
    // позиции теряется и «Чего не хватает» требует докупить то, что уже в заторе.
    listInventoryForUser(input.userId, { includeEmpty: true }),
    input.targetBatchVolumeL
      ? Promise.resolve(new Map<string, BrewBatchScale>())
      : getBrewBatchScales(input.userId, batches.map((batch) => batch.brewBatchId)),
    getBrewBatchInventoryCreditsForBatches(input.userId, batches.map((batch) => batch.brewBatchId))
  ]);

  const candidates = await db.query.recipes.findMany({
    where: inArray(recipes.id, recipeIds),
    with: { ingredients: true }
  }) as CandidateRecipeRow[];

  const catalogById = await loadCatalogForRecipes(candidates);
  const recipeById = new Map(candidates.map((recipe) => [recipe.id, recipe]));
  // Ф6: партия может стоять за чужим рецептом (варка без клона публичного
  // рецепта) — customId строки тогда принадлежит автору рецепта, не варящему.
  const ownedCustomIngredientIds = await resolveOwnedCustomIngredientIds(
    input.userId,
    collectCustomIngredientIds(candidates)
  );

  // Индекс без кредитов считаем один раз — он обслуживает все партии, которые
  // ещё ничего не списали. Партия с кредитом получает СВОЙ индекс: общий трогать
  // нельзя, иначе её кредит утечёт в матч соседней партии.
  const baseIndex = indexInventoryEntries(buildInventoryEntries(inventoryItems));

  const result: Record<string, RecipeMatchDto> = {};
  for (const batch of batches) {
    const recipe = recipeById.get(batch.recipeId);
    if (!recipe || recipe.ingredients.length === 0) {
      continue;
    }
    // Как в computeRecipeMatchesForUser: одна кривая строка рецепта не должна
    // ронять весь раздел «Чего не хватает».
    try {
      const credits = creditsByBatch.get(batch.brewBatchId);
      const index = credits && credits.size > 0
        ? indexInventoryEntries(buildInventoryEntries(inventoryItems, credits))
        : baseIndex;
      const batchScale = batchScales.get(batch.brewBatchId) ?? null;
      const volume = resolveMatchFactor(recipe, {
        targetBatchVolumeL: input.targetBatchVolumeL ?? batchScale?.targetBatchVolumeL ?? null,
        defaultBatchVolumeL: null,
        efficiencyFactor: batchScale?.efficiencyFactor ?? null
      });
      result[batch.brewBatchId] = computeMatchForRecipeRow(recipe, index, catalogById, volume, ownedCustomIngredientIds);
    } catch (error) {
      console.error("[recipes] computeRecipeMatchesForBrewBatches: skipping batch after match error", {
        brewBatchId: batch.brewBatchId,
        recipeId: batch.recipeId,
        error
      });
    }
  }

  return result;
};
