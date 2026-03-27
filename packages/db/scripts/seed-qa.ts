import {
  db,
  eq,
  inArray,
  ingredientCatalogItems,
  pool,
  userIngredients,
  users
} from "../src";
import { assertDevOnlyExecution } from "./_dev-utils";
import { seedCatalogItems } from "./catalog-seed-data";
import { seedUsers } from "./seed-users";
import { syncCatalogSnapshot } from "./sync-catalog";

const getRequiredUser = (
  dbUsers: Array<typeof users.$inferSelect>,
  email: string
) => {
  const user = dbUsers.find((item) => item.email === email);
  if (!user) {
    throw new Error(`Failed to load seeded user ${email}.`);
  }

  return user;
};

const getSeedCatalogRow = (
  seededRowsBySourceKey: Map<string, typeof ingredientCatalogItems.$inferSelect>,
  predicate: (item: (typeof seedCatalogItems)[number]) => boolean,
  label: string
) => {
  const seedItem = seedCatalogItems.find(predicate);
  if (!seedItem) {
    throw new Error(`Failed to resolve seed catalog item: ${label}.`);
  }

  const row = seededRowsBySourceKey.get(seedItem.sourceKey);
  if (!row) {
    throw new Error(`Seeded row missing for ${label} (${seedItem.sourceKey}).`);
  }

  return row;
};

const toCompactSearchKey = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^a-zа-я0-9]+/gi, "");

const hasAlias = (item: (typeof seedCatalogItems)[number], alias: string) => {
  const needle = toCompactSearchKey(alias);
  return item.searchAliasesNorm.some((candidate) => toCompactSearchKey(candidate) === needle);
};

const hasAliasFragment = (item: (typeof seedCatalogItems)[number], fragment: string) => {
  const needle = toCompactSearchKey(fragment);
  return item.searchAliasesNorm.some((candidate) => toCompactSearchKey(candidate).includes(needle));
};

const run = async () => {
  assertDevOnlyExecution();

  for (const user of seedUsers) {
    await db.insert(users).values({
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: true
    }).onConflictDoUpdate({
      target: users.email,
      set: {
        displayName: user.displayName,
        role: user.role,
        emailVerified: true,
        updatedAt: new Date()
      }
    });
  }

  const { rowsBySourceKey: seededRowsBySourceKey } = await syncCatalogSnapshot();

  const dbUsers = await db.select().from(users).where(inArray(users.email, seedUsers.map((user) => user.email)));

  const qaUser = getRequiredUser(dbUsers, "qa.user@localhost");
  const qaAdmin = getRequiredUser(dbUsers, "qa.admin@localhost");

  const pilsnerMalt = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "fermentable"
    && item.family.normalizedCanonicalName === "пилснер"
    && /weyermann/i.test(item.manufacturer ?? "")
  ), "Пильзнер");
  const paleAleMalt = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "fermentable"
    && item.family.normalizedCanonicalName === "пэйл эль"
    && /bestmalz/i.test(item.manufacturer ?? "")
  ), "Пэйл Эль");
  const citra = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "hop"
    && item.family.normalizedCanonicalName === "цитра"
    && /yakima chief/i.test(item.manufacturer ?? "")
    && item.subtype === "standard"
  ), "Цитра");
  const mosaic = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "hop"
    && item.family.normalizedCanonicalName === "мозаика"
    && /yakima chief/i.test(item.manufacturer ?? "")
    && item.subtype === "standard"
  ), "Мозаика");
  const us05 = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "yeast"
    && hasAliasFragment(item, "us05")
  ), "US-05");
  const m21 = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "yeast"
    && /mangrove/i.test(item.manufacturer ?? "")
    && hasAlias(item, "m21")
  ), "M21");
  const saaz = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "hop"
    && item.family.normalizedCanonicalName === "сааз"
    && item.subtype === "standard"
  ), "Сааз");
  const dextrose = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "sugar"
    && (item.family.normalizedCanonicalName === "декстроза" || hasAlias(item, "dextrose"))
  ), "Декстроза");
  const honey = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "sugar"
    && (item.family.normalizedCanonicalName === "мед" || hasAlias(item, "honey"))
  ), "Мёд");
  const flakedOats = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "adjunct"
    && hasAlias(item, "flaked oats")
  ), "Овсяные хлопья");
  const riceHulls = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "adjunct"
    && hasAlias(item, "rice hulls")
  ), "Рисовая шелуха");
  const irishMoss = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "fining"
    && hasAlias(item, "irish moss")
  ), "Irish Moss");
  const gelatin = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "fining"
    && (item.family.normalizedCanonicalName === "желатин" || hasAlias(item, "gelatin"))
  ), "Gelatin");
  const yeastNutrient = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.type === "misc"
    && (item.family.normalizedCanonicalName.includes("дрожж") || hasAlias(item, "yeast nutrient"))
  ), "Yeast Nutrient");
  const calciumChloride = getSeedCatalogRow(seededRowsBySourceKey, (item) => (
    item.category === "water_prep"
    && (item.family.normalizedCanonicalName.includes("хлорид кальция") || hasAlias(item, "calcium chloride"))
  ), "Calcium Chloride");

  await db.delete(userIngredients).where(inArray(userIngredients.userId, [qaUser.id, qaAdmin.id]));

  const createInventorySeedRow = (
    userId: string,
    item: typeof ingredientCatalogItems.$inferSelect,
    enteredQuantity: number,
    enteredUnit: string,
    normalizedQuantity: number,
    normalizedUnit: string,
    unitDimension: "weight" | "volume" | "count",
    notes?: string
  ) => ({
    userId,
    ingredientCatalogItemId: item.id,
    ingredientFamilyId: item.familyId,
    ingredientCategory: item.category,
    ingredientSubtype: item.subtype,
    ingredientDisplayNameSnapshot: item.displayName,
    ingredientDefaultDisplayUnitSnapshot: item.defaultDisplayUnit,
    ingredientMeasurementDimension: item.measurementDimension,
    enteredQuantity,
    enteredUnit,
    normalizedQuantity,
    normalizedUnit,
    unitDimension,
    notes: notes ?? null
  });

  await db.insert(userIngredients).values([
    createInventorySeedRow(qaUser.id, pilsnerMalt, 6, "kg", 6000, "g", "weight", "Базовый солод для светлых лагеров."),
    createInventorySeedRow(qaUser.id, paleAleMalt, 5, "kg", 5000, "g", "weight", "База для элей и IPA."),
    createInventorySeedRow(qaUser.id, citra, 150, "g", 150, "g", "weight", "Ароматические закладки."),
    createInventorySeedRow(qaUser.id, mosaic, 100, "g", 100, "g", "weight", "Пробная партия на dry hop."),
    createInventorySeedRow(qaUser.id, us05, 2, "pack", 2, "pack", "count", "Универсальные сухие дрожжи."),
    createInventorySeedRow(qaUser.id, dextrose, 1000, "g", 1000, "g", "weight", "Сахар для прайминга."),
    createInventorySeedRow(qaUser.id, flakedOats, 750, "g", 750, "g", "weight", "Для тела и мутности."),
    createInventorySeedRow(qaUser.id, irishMoss, 50, "g", 50, "g", "weight", "Осветление в кипячении."),
    createInventorySeedRow(qaUser.id, yeastNutrient, 100, "g", 100, "g", "weight", "Подкормка дрожжей."),
    createInventorySeedRow(qaUser.id, calciumChloride, 250, "g", 250, "g", "weight", "Коррекция профиля воды."),
    createInventorySeedRow(qaAdmin.id, m21, 1, "pack", 1, "pack", "count", "Позиция для QA сценариев."),
    createInventorySeedRow(qaAdmin.id, saaz, 80, "g", 80, "g", "weight", "Хмель для QA-аккаунта."),
    createInventorySeedRow(qaAdmin.id, honey, 1500, "g", 1500, "g", "weight", "Спецферментируемое для тестов."),
    createInventorySeedRow(qaAdmin.id, riceHulls, 500, "g", 500, "g", "weight", "Помощь при фильтрации затора."),
    createInventorySeedRow(qaAdmin.id, gelatin, 100, "g", 100, "g", "weight", "Осветление при cold crash.")
  ]);

  console.log(`QA seed complete: ${dbUsers.length} users, ${seedCatalogItems.length} catalog items, inventory reset for qa.user/qa.admin.`);
};

run()
  .catch((error) => {
    console.error("seed-qa failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
