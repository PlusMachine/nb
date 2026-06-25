/**
 * Dev-only seed: наполняет аккаунт разработчика тестовыми данными —
 * склад (инвентарь), профили оборудования и набор рецептов разных стилей
 * и статусов публикации. Нужен для ручного тестирования продуктового
 * workflow (Каталог → Склад → Рецепты → Public recipes).
 *
 * Идемпотентность: всё, что создаёт скрипт, помечается seedSource="sample-data";
 * при повторном запуске прежние помеченные строки удаляются и пересоздаются.
 * Пользовательские (ручные) данные не трогаются.
 *
 * Запуск:  npm run seed:sample            (из корня; цель — DEV_AUTH_EMAIL или дефолт)
 *          npm run seed:sample -- --email you@example.com
 *
 * Жёстко заблокирован в production / на нелокальной БД.
 */
import {
  and,
  db,
  eq,
  equipmentProfiles,
  inArray,
  ingredients,
  inventoryTransactions,
  recipeInventoryAllocations,
  recipes,
  sql,
  userIngredients,
  users
} from "@nb/db";
import { parseServerEnv } from "@nb/shared";

import { createEquipmentProfile } from "../features/equipment-profiles/service";
import { createRecipe } from "../features/recipes/service";

const SAMPLE_TAG = "sample-data";
const DEFAULT_EMAIL = "artyom.movchan@gmail.com";

// ---------------------------------------------------------------------------
// Dev guard
// ---------------------------------------------------------------------------
const assertDevOnly = () => {
  const env = parseServerEnv(process.env);
  if (env.NODE_ENV === "production") {
    throw new Error("seed:sample заблокирован в production.");
  }
  const url = env.DATABASE_URL;
  if (!(url.includes("localhost") || url.includes("127.0.0.1") || url.includes("postgres"))) {
    throw new Error("seed:sample допускает только локальную БД (localhost/127.0.0.1/postgres).");
  }
};

const parseEmailArg = (argv: string[]): string => {
  const index = argv.indexOf("--email");
  if (index !== -1 && typeof argv[index + 1] === "string" && argv[index + 1]!.trim()) {
    return argv[index + 1]!.trim();
  }
  return (process.env.DEV_AUTH_EMAIL?.trim() || DEFAULT_EMAIL).toLowerCase();
};

// ---------------------------------------------------------------------------
// Каталожные ID (проверены против сидового каталога)
// ---------------------------------------------------------------------------
const C = {
  // base / specialty malts
  pilsner: "beerex-pilsner-cz-base",
  paleAle: "bestmalz-best-pale-ale-malt",
  maris: "pauls-malt-maris-otter-gb-base",
  munich: "bestmalz-best-munich-malt",
  vienna: "big-barley-vienna-ua-base",
  wheat: "avangard-malz-wheat-malt-de-base",
  caramel: "bestmalz-best-caramel-amber",
  caramelDark: "viking-malt-caramel-malt-100",
  chocolate: "castle-malting--chocolat-malt",
  roasted: "bestmalz-best-roasted-barley",
  // hops
  cascade: "us-cascade-standard",
  citra: "us-citra-beervingem-standard",
  saaz: "cz-saaz-beervingem-standard",
  magnum: "cn-magnum-beervingem-standard",
  hallertau: "de-hallertau-mittelfruh-beervingem-standard",
  // yeast
  us05: "fermentis-us-05",
  s04: "fermentis-s-04",
  lager: "fermentis-w-34-70",
  wheatYeast: "fermentis-wb-06",
  saison: "lallemand-belle-saison",
  // consumables
  starSan: "star-san-acid-no-rinse-sanitizer",
  irishMoss: "kettle-fining-irish-moss",
  lacticAcid: "lactic-acid"
} as const;

// ---------------------------------------------------------------------------
// Инвентарь
// ---------------------------------------------------------------------------
type InvItem = { id: string; qty: number; unit: string; norm: number; normUnit: string; notes?: string };

const INVENTORY: InvItem[] = [
  // солод (kg → g)
  { id: C.pilsner, qty: 6, unit: "kg", norm: 6000, normUnit: "g", notes: "База для лагеров и пшеничных." },
  { id: C.paleAle, qty: 5, unit: "kg", norm: 5000, normUnit: "g", notes: "База для элей и IPA." },
  { id: C.maris, qty: 3, unit: "kg", norm: 3000, normUnit: "g", notes: "База для британских элей и стаутов." },
  { id: C.munich, qty: 1, unit: "kg", norm: 1000, normUnit: "g" },
  { id: C.vienna, qty: 1, unit: "kg", norm: 1000, normUnit: "g" },
  { id: C.wheat, qty: 2.5, unit: "kg", norm: 2500, normUnit: "g" },
  { id: C.caramel, qty: 0.5, unit: "kg", norm: 500, normUnit: "g" },
  { id: C.caramelDark, qty: 0.4, unit: "kg", norm: 400, normUnit: "g" },
  { id: C.chocolate, qty: 0.3, unit: "kg", norm: 300, normUnit: "g" },
  { id: C.roasted, qty: 0.25, unit: "kg", norm: 250, normUnit: "g" },
  // хмель (g)
  { id: C.cascade, qty: 100, unit: "g", norm: 100, normUnit: "g" },
  { id: C.citra, qty: 200, unit: "g", norm: 200, normUnit: "g", notes: "Ароматический хмель для IPA/APA." },
  { id: C.saaz, qty: 100, unit: "g", norm: 100, normUnit: "g" },
  { id: C.magnum, qty: 50, unit: "g", norm: 50, normUnit: "g", notes: "Горький хмель на старт кипячения." },
  { id: C.hallertau, qty: 80, unit: "g", norm: 80, normUnit: "g" },
  // дрожжи (pack → g, ~11 г/пакет)
  { id: C.us05, qty: 2, unit: "pack", norm: 22, normUnit: "g", notes: "Универсальные элевые дрожжи." },
  { id: C.s04, qty: 1, unit: "pack", norm: 11, normUnit: "g" },
  { id: C.lager, qty: 1, unit: "pack", norm: 11, normUnit: "g" },
  { id: C.wheatYeast, qty: 1, unit: "pack", norm: 11, normUnit: "g" },
  { id: C.saison, qty: 1, unit: "pack", norm: 11, normUnit: "g" },
  // расходники
  { id: C.starSan, qty: 500, unit: "ml", norm: 500, normUnit: "ml", notes: "Кислотный no-rinse санитайзер." },
  { id: C.irishMoss, qty: 4, unit: "pack", norm: 4, normUnit: "pack" },
  { id: C.lacticAcid, qty: 250, unit: "ml", norm: 250, normUnit: "ml", notes: "Коррекция pH затора." }
];

const dimensionOf = (unit: string): "weight" | "volume" | "count" => {
  if (["g", "kg", "mg", "oz", "lb"].includes(unit)) return "weight";
  if (["ml", "l", "gal"].includes(unit)) return "volume";
  return "count";
};

const categoryOf = (type: string): "fermentable" | "hop" | "yeast" | "water_treatment" | "consumable" => {
  if (type === "malt" || type === "fermentable") return "fermentable";
  if (type === "hop") return "hop";
  if (type === "yeast") return "yeast";
  if (type === "water_treatment") return "water_treatment";
  return "consumable";
};

const displayUnitOf = (type: string): string => {
  if (type === "malt" || type === "fermentable") return "kg";
  if (type === "hop") return "g";
  if (type === "yeast") return "pack";
  return "g";
};

// ---------------------------------------------------------------------------
// Профили оборудования
// ---------------------------------------------------------------------------
const EQUIPMENT_PROFILES = [
  {
    name: "BIAB 20 л",
    targetBatchVolumeL: 20,
    brewhouseEfficiencyPct: 68,
    evaporationRateLPerHr: 2.5,
    trubChillerLossL: 1.5,
    fermenterLossL: 1,
    grainAbsorptionLPerKg: 0.8,
    coolingShrinkagePct: 4,
    mashThicknessLPerKg: 5,
    hopUtilizationFactor: 1,
    altitudeM: 0,
    notes: "Brew-in-a-bag, один котёл. Высокий mash thickness (full volume)."
  },
  {
    name: "Классическая 3-посудная 23 л",
    targetBatchVolumeL: 23,
    brewhouseEfficiencyPct: 75,
    evaporationRateLPerHr: 3.5,
    trubChillerLossL: 2,
    fermenterLossL: 1.5,
    grainAbsorptionLPerKg: 0.9,
    coolingShrinkagePct: 4,
    mashThicknessLPerKg: 3,
    hopUtilizationFactor: 1,
    altitudeM: 0,
    notes: "MLT + котёл + HLT, классическая промывка."
  }
] as const;

// ---------------------------------------------------------------------------
// Рецепты
// ---------------------------------------------------------------------------
type Ing = {
  id: string;
  type: "malt" | "hop" | "yeast";
  qty: number;
  unit: string;
  stage: "mash" | "boil" | "whirlpool" | "fermentation";
  timeOffset?: number;
};

const malt = (id: string, qtyKg: number): Ing => ({ id, type: "malt", qty: qtyKg, unit: "kg", stage: "mash" });
const boilHop = (id: string, g: number, min: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "boil", timeOffset: min });
const whirlpoolHop = (id: string, g: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "whirlpool", timeOffset: 0 });
const dryHop = (id: string, g: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "fermentation" });
const yeast = (id: string, g = 11): Ing => ({ id, type: "yeast", qty: g, unit: "g", stage: "fermentation" });

const mash = (tempC: number, min = 60) => ({
  mashProfile: { steps: [{ id: "mash-1", name: "Осахаривание", temperatureC: tempC, durationMinutes: min }] }
});
const ferment = (tempC: number, days: number) => ({
  fermentationProfile: { primaryTemperatureC: tempC, primaryDurationDays: days }
});

type RecipeSpec = {
  title: string;
  styleId: string;
  state: "draft" | "private" | "published";
  batchL: number;
  efficiency: number;
  boil: number;
  description: string;
  mashTempC: number;
  fermTempC: number;
  fermDays: number;
  ingredients: Ing[];
};

const RECIPES: RecipeSpec[] = [
  {
    title: "Sample · American IPA",
    styleId: "21A",
    state: "published",
    batchL: 21,
    efficiency: 68,
    boil: 60,
    description:
      "Сбалансированный американский IPA с цитрусово-тропическим ароматом Citra. Хорошая горечь и сухое тело. Тестовый публичный рецепт.",
    mashTempC: 66,
    fermTempC: 19,
    fermDays: 12,
    ingredients: [
      malt(C.paleAle, 5),
      malt(C.munich, 0.4),
      malt(C.caramel, 0.3),
      boilHop(C.magnum, 22, 60),
      boilHop(C.citra, 25, 10),
      whirlpoolHop(C.citra, 40),
      dryHop(C.citra, 60),
      yeast(C.us05)
    ]
  },
  {
    title: "Sample · Czech Premium Pale Lager",
    styleId: "3B",
    state: "private",
    batchL: 20,
    efficiency: 72,
    boil: 90,
    description: "Чешский лагер с богатым солодовым телом и благородной горечью жатецкого хмеля.",
    mashTempC: 65,
    fermTempC: 11,
    fermDays: 21,
    ingredients: [
      malt(C.pilsner, 4.5),
      malt(C.munich, 0.3),
      boilHop(C.saaz, 30, 60),
      boilHop(C.saaz, 20, 15),
      boilHop(C.saaz, 20, 5),
      yeast(C.lager)
    ]
  },
  {
    title: "Sample · American Stout",
    styleId: "20B",
    state: "published",
    batchL: 20,
    efficiency: 70,
    boil: 60,
    description:
      "Плотный американский стаут: кофе, тёмный шоколад и поджаренный солод, поддержанные умеренной хмелевой горечью.",
    mashTempC: 67,
    fermTempC: 19,
    fermDays: 14,
    ingredients: [
      malt(C.maris, 4.5),
      malt(C.caramelDark, 0.4),
      malt(C.chocolate, 0.3),
      malt(C.roasted, 0.25),
      boilHop(C.magnum, 30, 60),
      boilHop(C.cascade, 25, 10),
      yeast(C.us05)
    ]
  },
  {
    title: "Sample · Hefeweizen",
    styleId: "10A",
    state: "private",
    batchL: 20,
    efficiency: 70,
    boil: 60,
    description: "Классическое баварское пшеничное с бананово-гвоздичным профилем дрожжей WB-06.",
    mashTempC: 66,
    fermTempC: 18,
    fermDays: 10,
    ingredients: [
      malt(C.wheat, 2.5),
      malt(C.pilsner, 2.0),
      boilHop(C.hallertau, 15, 60),
      yeast(C.wheatYeast)
    ]
  },
  {
    title: "Sample · Saison",
    styleId: "25B",
    state: "published",
    batchL: 20,
    efficiency: 75,
    boil: 60,
    description:
      "Сухой фермерский эль с перечной фенольностью и высоким сбраживанием Belle Saison. Лёгкое тело, освежающий финиш.",
    mashTempC: 64,
    fermTempC: 24,
    fermDays: 16,
    ingredients: [
      malt(C.pilsner, 4),
      malt(C.vienna, 0.5),
      malt(C.wheat, 0.4),
      boilHop(C.magnum, 18, 60),
      boilHop(C.saaz, 20, 10),
      whirlpoolHop(C.saaz, 25),
      yeast(C.saison)
    ]
  },
  {
    title: "Sample · American Pale Ale (черновик)",
    styleId: "18B",
    state: "draft",
    batchL: 20,
    efficiency: 68,
    boil: 60,
    description: "Лёгкая сессионная APA на Cascade — черновик для проверки расчётов и редактора.",
    mashTempC: 66,
    fermTempC: 19,
    fermDays: 10,
    ingredients: [
      malt(C.paleAle, 4.2),
      malt(C.caramel, 0.3),
      boilHop(C.cascade, 20, 60),
      boilHop(C.cascade, 25, 15),
      whirlpoolHop(C.cascade, 30),
      dryHop(C.cascade, 30),
      yeast(C.us05)
    ]
  }
];

// ---------------------------------------------------------------------------
// Главный сценарий
// ---------------------------------------------------------------------------
const main = async () => {
  assertDevOnly();
  const email = parseEmailArg(process.argv.slice(2));

  // 1) Пользователь (upsert, чтобы работало и на свежей БД)
  const [user] = await db
    .insert(users)
    .values({ email, displayName: email.split("@")[0] ?? "Dev", emailVerified: true })
    .onConflictDoUpdate({ target: users.email, set: { emailVerified: true, updatedAt: new Date() } })
    .returning();
  if (!user) throw new Error(`Не удалось создать/найти пользователя ${email}.`);
  const userId = user.id;
  console.log(`👤  Пользователь: ${email} (${userId})`);

  // 2) Проверка наличия всех каталожных ID
  const neededIds = Array.from(new Set([...INVENTORY.map((i) => i.id), ...RECIPES.flatMap((r) => r.ingredients.map((i) => i.id))]));
  const present = await db.select({ id: ingredients.id, type: ingredients.type }).from(ingredients).where(inArray(ingredients.id, neededIds));
  const presentMap = new Map(present.map((p) => [p.id, p.type]));
  const missing = neededIds.filter((id) => !presentMap.has(id));
  if (missing.length) {
    throw new Error(`В каталоге нет ингредиентов: ${missing.join(", ")}.\nЗапусти 'npm run db:seed' (или 'npm run seed:qa') и повтори.`);
  }

  // 3) Идемпотентность: удаляем прежние sample-данные пользователя
  await db.delete(recipes).where(and(eq(recipes.authorId, userId), sql`${recipes.importMeta}->>'seedSource' = ${SAMPLE_TAG}`));

  const priorInv = await db
    .select({ id: userIngredients.id })
    .from(userIngredients)
    .where(and(eq(userIngredients.userId, userId), sql`${userIngredients.properties}->>'seedSource' = ${SAMPLE_TAG}`));
  if (priorInv.length) {
    const ids = priorInv.map((r) => r.id);
    await db.delete(inventoryTransactions).where(inArray(inventoryTransactions.inventoryItemId, ids));
    await db.delete(recipeInventoryAllocations).where(inArray(recipeInventoryAllocations.inventoryItemId, ids));
    await db.delete(userIngredients).where(inArray(userIngredients.id, ids));
  }

  await db.delete(equipmentProfiles).where(and(eq(equipmentProfiles.userId, userId), inArray(equipmentProfiles.name, EQUIPMENT_PROFILES.map((p) => p.name))));

  // 4) Инвентарь
  const invRows = INVENTORY.map((item) => {
    const type = presentMap.get(item.id)!;
    return {
      userId,
      ingredientCatalogItemId: item.id,
      ingredientCategory: categoryOf(type),
      ingredientSubtype: type === "malt" ? "malt" : type === "fermentable" ? "fermentable" : type,
      ingredientDefaultDisplayUnitSnapshot: displayUnitOf(type),
      ingredientMeasurementDimension: dimensionOf(displayUnitOf(type)),
      enteredQuantity: item.qty,
      enteredUnit: item.unit,
      normalizedQuantity: item.norm,
      normalizedUnit: item.normUnit,
      unitDimension: dimensionOf(item.normUnit),
      notes: item.notes ?? null,
      properties: { seedSource: SAMPLE_TAG }
    };
  });
  await db.insert(userIngredients).values(invRows);
  console.log(`📦  Склад: добавлено ${invRows.length} позиций.`);

  // 5) Профили оборудования
  for (const profile of EQUIPMENT_PROFILES) {
    await createEquipmentProfile(userId, profile);
  }
  console.log(`⚙️   Оборудование: создано ${EQUIPMENT_PROFILES.length} профиля.`);

  // 6) Рецепты
  const created: Array<{ title: string; state: string; og: number | null; ibu: number | null; abv: number | null; color: number | null }> = [];
  for (const spec of RECIPES) {
    const recipe = await createRecipe(userId, {
      publicationState: spec.state,
      title: spec.title,
      styleId: spec.styleId,
      batchSizeEnteredQuantity: spec.batchL,
      batchSizeEnteredUnit: "l",
      efficiency: spec.efficiency,
      boilTimeMinutes: spec.boil,
      description: spec.description,
      importMeta: { seedSource: SAMPLE_TAG },
      processMeta: { ...mash(spec.mashTempC), ...ferment(spec.fermTempC, spec.fermDays) },
      ingredients: spec.ingredients.map((ing) => ({
        ingredientCatalogItemId: ing.id,
        type: ing.type,
        category: ing.type === "malt" ? "fermentable" : ing.type,
        amountEnteredQuantity: ing.qty,
        amountEnteredUnit: ing.unit,
        stage: ing.stage,
        ...(ing.timeOffset != null ? { timeOffset: ing.timeOffset } : {})
      }))
    });
    created.push({ title: spec.title, state: spec.state, og: recipe.og, ibu: recipe.ibu, abv: recipe.abv, color: recipe.color });
  }

  console.log(`🍺  Рецепты: создано ${created.length}.`);
  for (const r of created) {
    console.log(
      `    • [${r.state.padEnd(9)}] ${r.title.padEnd(40)} OG ${r.og?.toFixed(3) ?? "—"}  IBU ${r.ibu?.toFixed(0) ?? "—"}  ABV ${r.abv?.toFixed(1) ?? "—"}%  SRM ${r.color?.toFixed(1) ?? "—"}`
    );
  }
  console.log("\n✅  Готово. Перезагрузи /app/recipes, /app/inventory и /app/equipment.");
  process.exit(0);
};

main().catch((error) => {
  console.error("❌  seed:sample упал:", error?.stack ?? error?.message ?? error);
  process.exit(1);
});
