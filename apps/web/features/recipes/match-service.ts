import { and, db, eq, inArray, ingredients, recipeImages, recipeIngredients, recipes } from "@nb/db";
import { getBeerStyleById, getBjcpArticleHrefByStyleId, roundTo } from "@nb/brewing-core";
import { getBjcpStyleHeroImageByBjcpId } from "@nb/content";

import {
  resolveIngredientMatchKey,
  type IngredientMatchKey,
  type IngredientMatchProfile
} from "../ingredients/match-group";
import type { IngredientCategory } from "../ingredients/taxonomy";
import type { IngredientType } from "../ingredients/contracts";
import { extractIngredientTechnicalData } from "../ingredients/technical-fields";
import type { IngredientSubtype } from "../ingredients/contracts";
import { resolveInventoryMeasurementForDisplay } from "../inventory/display";
import {
  getInventoryUnitDimension,
  parseInventoryUnit,
  type InventoryUnit,
  type InventoryUnitDimension
} from "../inventory/units";
import { listInventoryForUser } from "../inventory/service";
import type { InventoryListItemDto } from "../inventory/contracts";
import { listEquipmentProfiles } from "../equipment-profiles/service";
import { getRecipeById } from "./service";
import { resolveBrewabilityBadge } from "./brewability-badge";
import { toBatchVolumeLiters } from "./units";
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

const FALLBACK_BATCH_VOLUME_L = 20;

export type MatchLineInput = {
  id: string;
  persistentKey: string;
  displayOrder: number;
  displayName: string | null;
  profile: IngredientMatchProfile;
  requiredNormalizedQuantity: number;
  normalizedUnit: InventoryUnit | null;
};

export type InventoryMatchEntry = {
  itemId: string;
  key: IngredientMatchKey;
  available: number;
  normalizedUnit: InventoryUnit | null;
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

const buildInventoryEntries = (items: InventoryListItemDto[]): InventoryMatchEntry[] => (
  items
    .filter((item) => item.normalizedQuantity > 0 && !item.archivedAt)
    .map((item) => ({
      itemId: item.id,
      key: resolveIngredientMatchKey(profileFromInventoryItem(item)),
      available: item.normalizedQuantity,
      normalizedUnit: parseInventoryUnit(item.normalizedUnit)
    }))
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

const resolveMatchLabel = (matchPercent: number): RecipeMatchLabel => {
  if (matchPercent >= 100) return "ready";
  if (matchPercent >= 70) return "almost";
  if (matchPercent >= 1) return "partial";
  return "none";
};

export const summarizeMatch = (recipeId: string, lines: RecipeMatchLineDto[], context: {
  targetBatchVolumeL: number;
  recipeBatchVolumeL: number;
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
    scaledToInventory: Math.abs(context.targetBatchVolumeL - context.recipeBatchVolumeL) > 0.001
  };
};

// --- объём партии ---------------------------------------------------------

const safeRecipeBatchVolumeL = (normalizedQuantity: number, normalizedUnit: string): number => {
  try {
    const volume = toBatchVolumeLiters(normalizedQuantity, normalizedUnit);
    return volume > 0 ? volume : FALLBACK_BATCH_VOLUME_L;
  } catch {
    return FALLBACK_BATCH_VOLUME_L;
  }
};

const resolveDefaultBatchVolumeL = async (userId: string): Promise<number | null> => {
  const profiles = await listEquipmentProfiles(userId);
  const target = profiles[0]?.targetBatchVolumeL;
  return typeof target === "number" && target > 0 ? target : null;
};

// Масштаб партии под склад: объём рецепта, целевой объём (явный → equipment-
// дефолт → объём рецепта) и фактор пересчёта количеств. Общий для одиночного и
// батчевых матчей, чтобы математика не расходилась.
const resolveMatchFactor = (
  recipe: { batchSizeNormalizedQuantity: number; batchSizeNormalizedUnit: string },
  options: { targetBatchVolumeL?: number | null; defaultBatchVolumeL: number | null }
): { recipeBatchVolumeL: number; targetBatchVolumeL: number; factor: number } => {
  const recipeBatchVolumeL = safeRecipeBatchVolumeL(
    recipe.batchSizeNormalizedQuantity,
    recipe.batchSizeNormalizedUnit
  );
  const targetBatchVolumeL = options.targetBatchVolumeL && options.targetBatchVolumeL > 0
    ? options.targetBatchVolumeL
    : options.defaultBatchVolumeL ?? recipeBatchVolumeL;
  const factor = recipeBatchVolumeL > 0 ? targetBatchVolumeL / recipeBatchVolumeL : 1;
  return { recipeBatchVolumeL, targetBatchVolumeL, factor };
};

// --- публичный API: рецепт → % по складу ----------------------------------

export const computeRecipeMatch = async (input: {
  userId: string;
  recipeId: string;
  targetBatchVolumeL?: number | null;
}): Promise<RecipeMatchDto> => {
  const [recipe, inventoryItems, defaultBatchVolumeL] = await Promise.all([
    getRecipeById(input.userId, input.recipeId),
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL ? Promise.resolve(null) : resolveDefaultBatchVolumeL(input.userId)
  ]);

  const { recipeBatchVolumeL, targetBatchVolumeL, factor } = resolveMatchFactor(recipe, {
    targetBatchVolumeL: input.targetBatchVolumeL,
    defaultBatchVolumeL
  });

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems));

  const lines = recipe.ingredients.map((ingredient): RecipeMatchLineDto => matchLineAgainstInventory(
    {
      id: ingredient.id,
      persistentKey: ingredient.persistentKey,
      displayOrder: ingredient.displayOrder,
      displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? null,
      profile: profileFromRecipeIngredientDto(ingredient),
      requiredNormalizedQuantity: ingredient.amountNormalizedQuantity,
      normalizedUnit: parseInventoryUnit(ingredient.amountNormalizedUnit)
    },
    index,
    factor
  ));

  return summarizeMatch(recipe.id, lines, { targetBatchVolumeL, recipeBatchVolumeL });
};

// --- публичный API: склад → подходящие рецепты ----------------------------

type CandidateRecipeRow = typeof recipes.$inferSelect & {
  ingredients: (typeof recipeIngredients.$inferSelect)[];
};

const profileFromRecipeIngredientRow = (
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
  volume: { recipeBatchVolumeL: number; targetBatchVolumeL: number; factor: number }
): RecipeMatchDto => {
  const lines = recipe.ingredients.map((row) => matchLineAgainstInventory(
    {
      id: row.id,
      persistentKey: row.persistentKey,
      displayOrder: row.displayOrder,
      displayName: row.ingredientDisplayNameSnapshot ?? null,
      profile: profileFromRecipeIngredientRow(row, catalogById.get(row.ingredientCatalogItemId ?? "")),
      requiredNormalizedQuantity: row.amountNormalizedQuantity,
      normalizedUnit: parseInventoryUnit(row.amountNormalizedUnit)
    },
    index,
    volume.factor
  ));

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

  const [inventoryItems, defaultBatchVolumeL] = await Promise.all([
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL ? Promise.resolve(null) : resolveDefaultBatchVolumeL(input.userId)
  ]);

  const index = indexInventoryEntries(buildInventoryEntries(inventoryItems));
  if (index.byExact.size === 0 && index.byGroup.size === 0) {
    return [];
  }

  const candidates = await db.query.recipes.findMany({
    where: eq(recipes.publicationState, "published"),
    with: { ingredients: true },
    orderBy: (table, { desc }) => [desc(table.saveCount), desc(table.updatedAt)],
    limit: candidatePoolSize
  }) as CandidateRecipeRow[];

  const catalogById = await loadCatalogForRecipes(candidates);

  const ranked = candidates
    .filter((recipe) => recipe.ingredients.length > 0)
    .map((recipe) => {
      const volume = resolveMatchFactor(recipe, {
        targetBatchVolumeL: input.targetBatchVolumeL,
        defaultBatchVolumeL
      });
      return { recipe, summary: computeMatchForRecipeRow(recipe, index, catalogById, volume) };
    })
    .filter(({ summary }) => summary.matchPercent >= minMatchPercent)
    .sort((a, b) => b.summary.matchPercent - a.summary.matchPercent || b.summary.coveredLines - a.summary.coveredLines)
    .slice(0, limit);

  return toBrewableRecipeDtos(ranked);
};

// --- публичный API: свои рецепты, которые можно сварить прямо сейчас (дашборд) ---

// «Можно сварить сейчас» для дашборда: СВОИ рецепты (любой статус публикации),
// схлопнутые до последней версии в семействе, у которых на складе есть ВСЕ типы
// ингредиентов (tier "ready" из resolveBrewabilityBadge — та же семантика, что у
// бейджа на карточках). Пустой склад → пусто. Сортировка по количественному
// matchPercent (затем по числу покрытых строк), сверху самые «полные».
export const findBrewableOwnRecipesForUser = async (input: {
  userId: string;
  limit?: number;
  targetBatchVolumeL?: number | null;
}): Promise<BrewableRecipeDto[]> => {
  const limit = input.limit ?? 6;

  const [inventoryItems, defaultBatchVolumeL] = await Promise.all([
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL ? Promise.resolve(null) : resolveDefaultBatchVolumeL(input.userId)
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

  const ranked = candidates
    .map((recipe) => {
      const volume = resolveMatchFactor(recipe, {
        targetBatchVolumeL: input.targetBatchVolumeL,
        defaultBatchVolumeL
      });
      return { recipe, summary: computeMatchForRecipeRow(recipe, index, catalogById, volume) };
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

  const [inventoryItems, defaultBatchVolumeL] = await Promise.all([
    listInventoryForUser(input.userId),
    input.targetBatchVolumeL ? Promise.resolve(null) : resolveDefaultBatchVolumeL(input.userId)
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
        defaultBatchVolumeL
      });
      result[recipe.id] = computeMatchForRecipeRow(recipe, index, catalogById, volume);
    } catch (error) {
      console.error("[recipes] computeRecipeMatchesForUser: skipping recipe after match error", {
        recipeId: recipe.id,
        error
      });
    }
  }

  return result;
};
