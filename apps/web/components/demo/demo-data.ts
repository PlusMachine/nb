import {
  evaluateStyleFit,
  getBeerStyleById,
  getBjcpArticleHrefByStyleId,
  getStyleRangeById
} from "@nb/brewing-core";
import { STAGE_NUM } from "@nb/brewforge-protocol";

import type {
  ActiveBrewProgressItem,
  BrewDayProgress,
  BrewDayStageGroup,
  BrewDayStep,
  BrewMeasurementDto,
  TelemetryHistoryPoint
} from "@/features/brew-batches/contracts";
import type { DeviceDto } from "@/features/devices/contracts";
import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientTechnicalData
} from "@/features/ingredients/contracts";
import type { InventoryListItemDto, InventorySummaryDto } from "@/features/inventory/contracts";
import type { InventoryUnit, InventoryUnitDimension } from "@/features/inventory/units";
import type { OwnerRecipeCardDto, RecipePublicationState } from "@/features/recipes/contracts";
import { defaultSystemCurrencyRates, type SystemCurrency, type SystemCurrencyRateMap } from "@/features/system/currency";

/**
 * Единственный источник фикстур для `/demo`. Никакой БД/сессии: страница
 * показывает «обжитой» аккаунт без логина, поэтому все сущности собираются
 * здесь как честные литералы под настоящие DTO продукта (см. docs/demo-page.md).
 * Все даты — ОТНОСИТЕЛЬНЫЕ к `now`, который передаёт вызывающий серверный
 * компонент; внутри модуля НЕТ `Date.now()`/`new Date()` без аргумента —
 * иначе демо «протухнет» на скриншотах и разъедется рассинхроном пульт↔история.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * MINUTE_MS);
const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * HOUR_MS);
const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

// Ближайшая суббота от `now` (для варки «на ближайшую субботу»): если сегодня
// суббота — берём следующую, чтобы дата планирования всегда была в будущем.
const nextSaturday = (now: Date): Date => {
  const result = new Date(now.getTime());
  const daysUntilSaturday = ((6 - result.getDay()) + 7) % 7 || 7;
  result.setDate(result.getDate() + daysUntilSaturday);
  result.setHours(11, 0, 0, 0);
  return result;
};

// Гладкая псевдослучайная «дрожь» без Math.random — детерминированный шум,
// одинаковый при каждом рендере и на сервере, и на клиенте (без hydration
// mismatch), но выглядящий как настоящий шум датчика.
const wobble = (index: number, amplitude: number) =>
  amplitude * (Math.sin(index * 1.7) * 0.6 + Math.sin(index * 0.63 + 1.1) * 0.4);

// --- 1. Рецепты («моя полка») ------------------------------------------------

type RecipeFixture = {
  id: string;
  slug: string;
  title: string;
  publicationState: RecipePublicationState;
  styleId: string;
  og: number;
  fg: number;
  ibu: number;
  abv: number;
  srm: number;
  updatedAtDaysAgo: number;
};

const RECIPE_FIXTURES: RecipeFixture[] = [
  {
    id: "demo-recipe-ipa",
    slug: "demo-american-ipa",
    title: "American IPA",
    publicationState: "published",
    styleId: "21A",
    og: 1.062,
    fg: 1.011,
    ibu: 58,
    abv: 6.7,
    srm: 9,
    updatedAtDaysAgo: 2
  },
  {
    id: "demo-recipe-stout",
    slug: "demo-american-stout",
    title: "American Stout",
    publicationState: "published",
    styleId: "20B",
    og: 1.062,
    fg: 1.016,
    ibu: 45,
    abv: 6.0,
    srm: 35,
    updatedAtDaysAgo: 11
  },
  {
    id: "demo-recipe-apa",
    slug: "demo-american-pale-ale",
    title: "American Pale Ale",
    publicationState: "draft",
    styleId: "18B",
    og: 1.052,
    fg: 1.012,
    ibu: 38,
    abv: 5.2,
    srm: 7,
    updatedAtDaysAgo: 0
  }
];

// Стиль/style-fit считаем через реальный движок BJCP (@nb/brewing-core), а не
// вписываем вручную — так строки/попадание в стиль не разъедутся с реальным
// поведением редактора рецептов при том же наборе og/fg/ibu/abv/srm.
const buildOwnerRecipe = (fixture: RecipeFixture, now: Date): OwnerRecipeCardDto => {
  const style = getBeerStyleById(fixture.styleId);
  const styleRange = getStyleRangeById(fixture.styleId);
  const fit = styleRange
    ? evaluateStyleFit(styleRange, {
        og: fixture.og,
        fg: fixture.fg,
        abv: fixture.abv,
        ibu: fixture.ibu,
        srm: fixture.srm
      })
    : null;

  return {
    id: fixture.id,
    slug: fixture.slug,
    title: fixture.title,
    publicationState: fixture.publicationState,
    versionNumber: 1,
    versionCount: 1,
    updatedAt: daysAgo(now, fixture.updatedAtDaysAgo),
    styleName: style ? style.nameRu ?? style.name : null,
    styleCode: style ? style.bjcpId : null,
    styleHref: getBjcpArticleHrefByStyleId(fixture.styleId),
    og: fixture.og,
    abv: fixture.abv,
    ibu: fixture.ibu,
    colorSrm: fixture.srm,
    // Нет ни своего фото, ни фото стиля — обложка карточки падает на заливку по
    // SRM (это делает сам RecipeThumb через srmToHex, не мы).
    heroImage: null,
    styleImageUrl: null,
    styleFit: fit ? (fit.overallFit ? "in_style" : "deviations") : null
  };
};

// --- 2. Склад -----------------------------------------------------------------

type InventoryFixture = {
  id: string;
  ingredientCatalogItemId: string;
  displayName: string;
  category: IngredientCategory;
  subtype: IngredientSubtype;
  enteredQuantity: number;
  enteredUnit: InventoryUnit;
  normalizedQuantity: number;
  normalizedUnit: InventoryUnit;
  unitDimension: InventoryUnitDimension;
  technicalData: IngredientTechnicalData;
  brand?: string;
  countryName?: string;
  notes?: string;
  freshnessDays?: number; // относительно now; отрицательное — «скоро истекает»
};

// ingredientCatalogItemId — реальные id из системного каталога (те же, что
// использует apps/web/scripts/seed-sample-data.ts), поэтому detailHref карточки
// ведёт на существующую страницу `/catalog/system/<id>`, а не в 404 — хотя клики
// всё равно заглушены обёрткой pointer-events-none (ловушка §5 демо-спеки).
const INVENTORY_FIXTURES: InventoryFixture[] = [
  {
    id: "demo-inv-pilsner",
    ingredientCatalogItemId: "beerex-pilsner-cz-base",
    displayName: "Pilsner CZ",
    category: "fermentable",
    subtype: "malt",
    enteredQuantity: 6,
    enteredUnit: "kg",
    normalizedQuantity: 6000,
    normalizedUnit: "g",
    unitDimension: "weight",
    countryName: "Чехия",
    notes: "База для лагеров и пшеничных.",
    technicalData: { type: "malt", maltType: "base", extractPctDryBasis: 81, colorEbcMin: 3, colorEbcMax: 4 }
  },
  {
    id: "demo-inv-pale-ale-malt",
    ingredientCatalogItemId: "bestmalz-best-pale-ale-malt",
    displayName: "Pale Ale Malt",
    category: "fermentable",
    subtype: "malt",
    enteredQuantity: 5,
    enteredUnit: "kg",
    normalizedQuantity: 5000,
    normalizedUnit: "g",
    unitDimension: "weight",
    brand: "BestMalz",
    countryName: "Германия",
    notes: "База для элей и IPA.",
    technicalData: { type: "malt", maltType: "base", extractPctDryBasis: 81, colorEbcMin: 5, colorEbcMax: 7 }
  },
  {
    id: "demo-inv-maris-otter",
    ingredientCatalogItemId: "pauls-malt-maris-otter-gb-base",
    displayName: "Maris Otter",
    category: "fermentable",
    subtype: "malt",
    enteredQuantity: 3,
    enteredUnit: "kg",
    normalizedQuantity: 3000,
    normalizedUnit: "g",
    unitDimension: "weight",
    brand: "Paul's Malt",
    countryName: "Великобритания",
    notes: "База для британских элей и стаутов.",
    technicalData: { type: "malt", maltType: "base", extractPctDryBasis: 82, colorEbcMin: 5, colorEbcMax: 7 }
  },
  {
    id: "demo-inv-chocolate",
    ingredientCatalogItemId: "castle-malting--chocolat-malt",
    displayName: "Chocolate Malt",
    category: "fermentable",
    subtype: "malt",
    enteredQuantity: 0.3,
    enteredUnit: "kg",
    normalizedQuantity: 300,
    normalizedUnit: "g",
    unitDimension: "weight",
    brand: "Castle Malting",
    countryName: "Бельгия",
    technicalData: { type: "malt", maltType: "specialty", extractPctDryBasis: 55, colorEbcMin: 900, colorEbcMax: 1050 }
  },
  {
    id: "demo-inv-cascade",
    ingredientCatalogItemId: "us-cascade-standard",
    displayName: "Cascade",
    category: "hop",
    subtype: "hop",
    enteredQuantity: 100,
    enteredUnit: "g",
    normalizedQuantity: 100,
    normalizedUnit: "g",
    unitDimension: "weight",
    countryName: "США",
    technicalData: { type: "hop", alphaAcidPctTypical: 6.5, hopForm: "pellet" }
  },
  {
    id: "demo-inv-citra",
    ingredientCatalogItemId: "us-citra-beervingem-standard",
    displayName: "Citra",
    category: "hop",
    subtype: "hop",
    // 65 г — согласовано со строкой-связкой склада и списком покупок: IPA просит
    // 125 г Citra (25 кипячение + 40 вирпул + 60 сухое охмеление, спека §1),
    // значит не хватает ровно 60 г.
    enteredQuantity: 65,
    enteredUnit: "g",
    normalizedQuantity: 65,
    normalizedUnit: "g",
    unitDimension: "weight",
    countryName: "США",
    notes: "Ароматический хмель для IPA/APA.",
    // Единственный near-expiry в фикстурах — реалистичный штрих, не «всё идеально».
    freshnessDays: 20,
    technicalData: { type: "hop", alphaAcidPctTypical: 12, hopForm: "pellet" }
  },
  {
    id: "demo-inv-us05",
    ingredientCatalogItemId: "fermentis-us-05",
    displayName: "Fermentis US-05",
    category: "yeast",
    subtype: "yeast",
    enteredQuantity: 2,
    enteredUnit: "pack",
    normalizedQuantity: 22,
    normalizedUnit: "g",
    unitDimension: "weight",
    brand: "Fermentis",
    notes: "Универсальные элевые дрожжи.",
    technicalData: {
      type: "yeast",
      form: "dry",
      attenuationPctTypical: 81,
      flocculation: "medium-low",
      fermentationTempCMin: 15,
      fermentationTempCMax: 22
    }
  },
  {
    id: "demo-inv-w3470",
    ingredientCatalogItemId: "fermentis-w-34-70",
    displayName: "Fermentis W-34/70",
    category: "yeast",
    subtype: "yeast",
    enteredQuantity: 1,
    enteredUnit: "pack",
    normalizedQuantity: 11,
    normalizedUnit: "g",
    unitDimension: "weight",
    brand: "Fermentis",
    technicalData: {
      type: "yeast",
      form: "dry",
      attenuationPctTypical: 82,
      flocculation: "medium",
      fermentationTempCMin: 9,
      fermentationTempCMax: 15
    }
  }
];

const buildInventoryItem = (fixture: InventoryFixture, now: Date): InventoryListItemDto => ({
  id: fixture.id,
  ingredientCatalogItemId: fixture.ingredientCatalogItemId,
  userCustomIngredientId: null,
  packageVariantId: null,
  ingredientFamilyId: null,
  ingredientCategory: fixture.category,
  ingredientSubtype: fixture.subtype,
  ingredientDisplayNameSnapshot: fixture.displayName,
  ingredientDefaultDisplayUnitSnapshot: fixture.enteredUnit,
  ingredientMeasurementDimension: fixture.unitDimension,
  enteredQuantity: fixture.enteredQuantity,
  enteredUnit: fixture.enteredUnit,
  normalizedQuantity: fixture.normalizedQuantity,
  normalizedUnit: fixture.normalizedUnit,
  unitDimension: fixture.unitDimension,
  reservedQuantityNormalized: null,
  priceInputMode: null,
  priceInputAmountMinor: null,
  priceInputCurrency: null,
  purchasePriceMinor: null,
  purchaseCurrency: null,
  purchaseQuantity: null,
  purchaseQuantityUnit: null,
  purchaseQuantityNormalized: null,
  purchaseQuantityNormalizedUnit: null,
  normalizedUnitCostMinorRub: null,
  properties: {},
  purchasedAt: daysAgo(now, 45),
  freshnessDate: fixture.freshnessDays != null ? daysAgo(now, -fixture.freshnessDays) : daysAgo(now, -180),
  notes: fixture.notes ?? null,
  archivedAt: null,
  createdAt: daysAgo(now, 45),
  updatedAt: daysAgo(now, 3),
  source: {
    sourceKind: "catalog",
    sourceId: fixture.ingredientCatalogItemId,
    type: fixture.subtype === "malt" ? "malt" : fixture.category === "fermentable" ? "fermentable" : fixture.category,
    category: fixture.category,
    subtype: fixture.subtype,
    primaryLabelRu: fixture.displayName,
    displayName: fixture.displayName,
    normalizedName: fixture.displayName.toLowerCase(),
    brand: fixture.brand ?? null,
    countryName: fixture.countryName ?? null,
    technicalData: fixture.technicalData,
    defaultDisplayUnit: fixture.enteredUnit,
    measurementDimension: fixture.unitDimension
  }
});

// --- 3. Помощник варочного дня (IPA, 21 л) ------------------------------------

// Порядок групп = brewDayStages ("Затор" сейчас завершён, "Кипячение" идёт).
const buildBrewAssistant = (now: Date): { groups: BrewDayStageGroup[]; progress: BrewDayProgress } => {
  const mashSteps: BrewDayStep[] = [
    {
      id: "mash:add:grain",
      stage: "mash",
      kind: "task",
      title: "Засыпь",
      detail: "5,7 кг",
      durationSeconds: null,
      temperatureC: null
    },
    {
      id: "mash:mash-1",
      stage: "mash",
      kind: "timer",
      title: "Затирание",
      detail: "66 °C",
      durationSeconds: 3600,
      temperatureC: 66
    },
    {
      id: "mash:sparge",
      stage: "mash",
      kind: "task",
      title: "Промывка",
      detail: null,
      durationSeconds: null,
      temperatureC: null
    }
  ];

  const boilSteps: BrewDayStep[] = [
    {
      id: "boil:main",
      stage: "boil",
      kind: "timer",
      title: "Кипячение",
      detail: "60 мин",
      durationSeconds: 3600,
      temperatureC: null
    },
    {
      id: "boil:add:citra-10",
      stage: "boil",
      kind: "addition",
      title: "Citra",
      // 25 г — та же добавка «за 10 минут до конца», что в DEMO_RECIPE пульта
      // (demo-pult.tsx) и в спеке §1: помощник и автоматика варят один рецепт.
      detail: "25 г",
      durationSeconds: null,
      temperatureC: null,
      boilSecondsBeforeEnd: 600
    }
  ];

  const whirlpoolSteps: BrewDayStep[] = [
    {
      id: "whirlpool:citra",
      stage: "whirlpool",
      kind: "addition",
      title: "Citra на вирпул",
      detail: "40 г",
      durationSeconds: null,
      temperatureC: null
    }
  ];

  const chillSteps: BrewDayStep[] = [
    {
      id: "chill:main",
      stage: "chill",
      kind: "task",
      title: "Охлаждение",
      detail: null,
      durationSeconds: null,
      temperatureC: null
    }
  ];

  const fermentationSteps: BrewDayStep[] = [
    {
      id: "ferment:pitch",
      stage: "fermentation",
      kind: "task",
      title: "Внести дрожжи",
      detail: "US-05",
      durationSeconds: null,
      temperatureC: 19
    }
  ];

  const packagingSteps: BrewDayStep[] = [
    {
      id: "packaging:bottle",
      stage: "packaging",
      kind: "task",
      title: "Розлив",
      detail: null,
      durationSeconds: null,
      temperatureC: null
    }
  ];

  const groups: BrewDayStageGroup[] = [
    { stage: "mash", label: "Затор", steps: mashSteps },
    { stage: "boil", label: "Кипячение", steps: boilSteps },
    { stage: "whirlpool", label: "Вирпул", steps: whirlpoolSteps },
    { stage: "chill", label: "Охлаждение", steps: chillSteps },
    { stage: "fermentation", label: "Брожение", steps: fermentationSteps },
    { stage: "packaging", label: "Розлив", steps: packagingSteps }
  ];

  // Кипячение началось ~8 минут назад — таймер шага уже тикает; сам обратный
  // отсчёт рисует клиентский DemoBrewAssistantSection, здесь только факт старта.
  const progress: BrewDayProgress = {
    steps: {
      "mash:add:grain": { done: true, timerStartedAt: null },
      "mash:mash-1": { done: true, timerStartedAt: null },
      "mash:sparge": { done: true, timerStartedAt: null },
      "boil:main": { done: false, timerStartedAt: minutesAgo(now, 8).toISOString() }
    },
    updatedAt: minutesAgo(now, 8).toISOString()
  };

  return { groups, progress };
};

// --- 4. Телеметрия ------------------------------------------------------------

/**
 * Профиль затирания IPA за последние ~40 минут: разогрев котла с 21 °C → выход на
 * паузу осахаривания 66 °C (единственная пауза сюжетного рецепта, см. DEMO_RECIPE
 * в demo-pult.tsx) → удержание полки «сейчас». СОГЛАСОВАН с точкой, в которой
 * стартует клиентская симуляция пульта (warmUpToMashRest: ~15 минут в глубь
 * паузы) — график и живой герой рассказывают одну и ту же варку. Используется и
 * стартовым `initialHistory` пульта, и статичным API-роутом истории устройства —
 * оба должны давать один и тот же ряд для одного `now`.
 */
export function buildMashHistory(now: Date): TelemetryHistoryPoint[] {
  type Phase = { fromAgo: number; toAgo: number; fromC: number; toC: number; setpointC: number; stage: number; duty: number };

  // Полка факта — 64.6 при уставке 66: ровно так держит котёл тепловая модель
  // SimDevice, к чьему живому снапшоту этот ряд пришивается на графике пульта.
  const phases: Phase[] = [
    { fromAgo: 40, toAgo: 16, fromC: 21, toC: 64.6, setpointC: 66, stage: STAGE_NUM.MASH_STEP, duty: 95 },
    { fromAgo: 16, toAgo: 0, fromC: 64.6, toC: 64.6, setpointC: 66, stage: STAGE_NUM.MASH_STEP, duty: 22 }
  ];

  const points: TelemetryHistoryPoint[] = [];
  let index = 0;
  for (let minutesBack = 40; minutesBack >= 0; minutesBack -= 2, index += 1) {
    const phase = phases.find((candidate) => minutesBack <= candidate.fromAgo && minutesBack >= candidate.toAgo) ?? phases[phases.length - 1]!;
    const span = phase.fromAgo - phase.toAgo || 1;
    const progress = Math.min(Math.max((phase.fromAgo - minutesBack) / span, 0), 1);
    const primaryC = phase.fromC + (phase.toC - phase.fromC) * progress + wobble(index, 0.25);
    const heatDutyPct = Math.min(Math.max(phase.duty + wobble(index, 4), 0), 100);

    points.push({
      ts: minutesAgo(now, minutesBack).getTime(),
      primaryC: Math.round(primaryC * 10) / 10,
      setpointC: phase.setpointC,
      heatDutyPct: Math.round(heatDutyPct),
      stage: phase.stage
    });
  }

  return points;
}

/**
 * История брожения чешского лагера за 9 суток, шаг 6 часов: полка 19.5 °C с
 * лёгким шумом 19.2–19.8 °C. Используется и в `fermentation.history`, и статичным
 * API-роутом истории партии — тот же ряд для одного `now`.
 */
export function buildFermentHistory(now: Date): TelemetryHistoryPoint[] {
  const points: TelemetryHistoryPoint[] = [];
  let index = 0;
  for (let hoursBack = 9 * 24; hoursBack >= 0; hoursBack -= 6, index += 1) {
    const primaryC = Math.min(Math.max(19.5 + wobble(index, 0.28), 19.2), 19.8);
    const heatDutyPct = Math.min(Math.max(12 + wobble(index, 6), 0), 100);

    points.push({
      ts: hoursAgo(now, hoursBack).getTime(),
      primaryC: Math.round(primaryC * 100) / 100,
      setpointC: 19.5,
      heatDutyPct: Math.round(heatDutyPct),
      stage: STAGE_NUM.FERMENT
    });
  }

  return points;
}

// --- 5. Дашборд ----------------------------------------------------------------

/** Минимальная форма строки «Чего не хватает» — под демо-реплику виджета, полноценный DTO не нужен. */
export type DemoShoppingLine = {
  id: string;
  label: string;
  quantity: string;
};

const buildDashboardBrews = (now: Date): ActiveBrewProgressItem[] => [
  {
    id: "demo-batch-lager",
    name: "Czech Lager — весенняя партия",
    status: "fermenting",
    recipeId: "demo-recipe-lager",
    recipeTitle: "Czech Premium Pale Lager",
    hasDevice: true,
    plannedFor: null,
    // 8.5 суток: fermentationDayNumber дашборда = floor(8.5)+1 = 9 — «день 9»
    // и здесь, и в секции «Брожение» (dayIndex=9), без off-by-one.
    startedAt: daysAgo(now, 8.5),
    completedAt: null,
    createdAt: daysAgo(now, 10),
    updatedAt: hoursAgo(now, 6),
    lastMeasurementAt: hoursAgo(now, 12),
    measurementCount: 4
  },
  {
    id: "demo-batch-ipa-4",
    name: "American IPA — варка №4",
    status: "planned",
    recipeId: "demo-recipe-ipa",
    recipeTitle: "American IPA",
    hasDevice: false,
    plannedFor: nextSaturday(now),
    startedAt: null,
    completedAt: null,
    createdAt: daysAgo(now, 2),
    updatedAt: daysAgo(now, 2),
    lastMeasurementAt: null,
    measurementCount: 0
  }
];

// 42 позиции: 18 солодов/сбраживаемого, 12 хмелей, 6 дрожжей, 4 расходника,
// 2 водоподготовки; 2 позиции (расходники) закончились — «прочее» из спеки.
const INVENTORY_SUMMARY: InventorySummaryDto = {
  totalItems: 42,
  inStockItems: 40,
  emptyItems: 2,
  byCategory: { fermentable: 18, hop: 12, yeast: 6, consumable: 4, water_treatment: 2 },
  inStockByCategory: { fermentable: 18, hop: 12, yeast: 6, consumable: 2, water_treatment: 2 },
  byPrimaryGroup: {
    fermentable: 18,
    hop: 12,
    yeast: 6,
    water_treatment: 2,
    consumable_supply: 2,
    consumable_additive: 2
  },
  inStockByPrimaryGroup: {
    fermentable: 18,
    hop: 12,
    yeast: 6,
    water_treatment: 2,
    consumable_supply: 2,
    consumable_additive: 0
  },
  byFermentableSubtype: { malt: 15, fermentable: 3 },
  inStockByFermentableSubtype: { malt: 15, fermentable: 3 }
} satisfies InventorySummaryDto;

const buildDashboardDevice = (now: Date): DeviceDto => ({
  id: "demo-device-1",
  userId: "demo-user",
  providerId: "brewforge",
  name: "BrewForge #1 — гараж",
  hardwareId: "BF-3F2A91",
  fw: "1.4.2",
  capabilities: ["telemetry", "manual_control", "recipe_push"],
  status: "online",
  localUrl: null,
  mqttPrefix: null,
  lastSeenAt: now,
  createdAt: daysAgo(now, 120),
  updatedAt: now
});

const DEMO_SHOPPING: DemoShoppingLine[] = [
  { id: "demo-shopping-citra", label: "Citra", quantity: "60 г" },
  { id: "demo-shopping-w3470", label: "W-34/70", quantity: "1 пачка" },
  { id: "demo-shopping-chocolate", label: "Chocolate Malt", quantity: "0,5 кг" }
];

// --- Сборка -------------------------------------------------------------------

export type DemoData = {
  ownRecipes: OwnerRecipeCardDto[];
  inventory: {
    items: InventoryListItemDto[];
    preferredCurrency: SystemCurrency;
    currencyRates: SystemCurrencyRateMap;
  };
  brewAssistant: {
    groups: BrewDayStageGroup[];
    progress: BrewDayProgress;
  };
  fermentation: {
    history: TelemetryHistoryPoint[];
    planSteps: { tempC: number; hours: number }[];
    measurements: BrewMeasurementDto[];
    dayIndex: number;
    // Цель по рецепту-снапшоту (Czech Premium Pale Lager, №3 из сквозного
    // сюжета §1 спеки): OG 1.050 / FG 1.014 / ABV 5.0% — тот же рецепт, что
    // варится в этой партии, поэтому цель живёт здесь, а не отдельной
    // константой в секции.
    target: { og: number; fg: number; abv: number };
  };
  dashboard: {
    brews: ActiveBrewProgressItem[];
    inventorySummary: InventorySummaryDto;
    shopping: DemoShoppingLine[];
    device: DeviceDto;
  };
};

export function makeDemoData(now: Date): DemoData {
  const { groups, progress } = buildBrewAssistant(now);

  // Дни замеров отсчитываются от старта партии (8.5 суток назад, см.
  // buildDashboardBrews) — последний замер «на дне 8», полсуток назад; сегодня
  // день 9, брожение идёт. Замер в будущем невозможен по построению.
  const measurementDays = [0, 3, 6, 8];
  const measurementGravity = [1.05, 1.032, 1.02, 1.016];
  const measurements: BrewMeasurementDto[] = measurementDays.map((dayIndex, index) => {
    const takenAt = daysAgo(now, 8.5 - dayIndex);
    return {
      id: `demo-measurement-${dayIndex}`,
      brewBatchId: "demo-batch-lager",
      gravitySg: measurementGravity[index]!,
      takenAt,
      // День 9 — последний замер, но брожение ещё идёт: финальный (FG) замер
      // не проставлен, поэтому summarizeBrewMeasurements честно вернёт fg=null.
      isFinal: false,
      note: dayIndex === 0 ? "OG на старте варки" : null,
      createdAt: takenAt
    };
  });

  return {
    ownRecipes: RECIPE_FIXTURES.map((fixture) => buildOwnerRecipe(fixture, now)),
    inventory: {
      items: INVENTORY_FIXTURES.map((fixture) => buildInventoryItem(fixture, now)),
      preferredCurrency: "RUB",
      currencyRates: defaultSystemCurrencyRates
    },
    brewAssistant: { groups, progress },
    fermentation: {
      history: buildFermentHistory(now),
      planSteps: [
        { tempC: 19.5, hours: 240 },
        { tempC: 4, hours: 96 }
      ],
      measurements,
      dayIndex: 9,
      // ABV из целевых OG/FG по формуле самого приложения (calculateAbv,
      // @nb/brewing-core: (og-fg)·131.25 = 4.7) — плитки цели не противоречат
      // друг другу на глазах у пивовара.
      target: { og: 1.05, fg: 1.014, abv: 4.7 }
    },
    dashboard: {
      brews: buildDashboardBrews(now),
      inventorySummary: INVENTORY_SUMMARY,
      shopping: DEMO_SHOPPING,
      device: buildDashboardDevice(now)
    }
  };
}
