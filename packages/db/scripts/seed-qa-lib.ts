import {
  db,
  inArray,
  ingredientPackageVariants,
  ingredients,
  inventoryTransactions,
  recipeInventoryAllocations,
  userIngredients,
  users
} from "../src";
import { assertDevOnlyExecution } from "./_dev-utils";
import { seedCatalogFromSources } from "./catalog-seed";
import { seedUsers } from "./seed-users";

type IngredientRow = typeof ingredients.$inferSelect & {
  packageVariants: Array<typeof ingredientPackageVariants.$inferSelect>;
};

type InventorySeedItem = {
  ingredientId: string;
  enteredQuantity: number;
  enteredUnit: string;
  normalizedQuantity: number;
  normalizedUnit: string;
  ingredientSubtype?: string | null;
  notes?: string;
  packageVariantId?: string | null;
};

const qaAdminInventorySeedItems: InventorySeedItem[] = [
  { ingredientId: "castle-malting--cara-cafe", enteredQuantity: 0.9, enteredUnit: "kg", normalizedQuantity: 900, normalizedUnit: "g" },
  { ingredientId: "castle-malting--cara-clair", enteredQuantity: 2.2, enteredUnit: "kg", normalizedQuantity: 2200, normalizedUnit: "g" },
  { ingredientId: "kurskiy-solod--caramel-150", enteredQuantity: 1.2, enteredUnit: "kg", normalizedQuantity: 1200, normalizedUnit: "g" },
  { ingredientId: "kurskiy-solod--munich-type-2", enteredQuantity: 0, enteredUnit: "kg", normalizedQuantity: 0, normalizedUnit: "g" },
  { ingredientId: "kurskiy-solod--pilsner", enteredQuantity: 0, enteredUnit: "kg", normalizedQuantity: 0, normalizedUnit: "g" },
  { ingredientId: "castle-malting-pilsen-2rs-be-base", enteredQuantity: 5, enteredUnit: "kg", normalizedQuantity: 5000, normalizedUnit: "g" },
  { ingredientId: "kurskiy-solod--wheat", enteredQuantity: 1, enteredUnit: "kg", normalizedQuantity: 1000, normalizedUnit: "g" },
  { ingredientId: "kurskiy-solod--pale-ale", enteredQuantity: 5, enteredUnit: "kg", normalizedQuantity: 5000, normalizedUnit: "g" },
  { ingredientId: "rice-hulls-nesolozhenka", enteredQuantity: 0.5, enteredUnit: "kg", normalizedQuantity: 500, normalizedUnit: "g" },
  { ingredientId: "kurskiy-solod--chocolate-900", enteredQuantity: 0.4, enteredUnit: "kg", normalizedQuantity: 400, normalizedUnit: "g" },
  { ingredientId: "au-galaxy-beervingem-standard", enteredQuantity: 100, enteredUnit: "g", normalizedQuantity: 100, normalizedUnit: "g", ingredientSubtype: "hop" },
  { ingredientId: "cz-saaz-beervingem-standard", enteredQuantity: 80, enteredUnit: "g", normalizedQuantity: 80, normalizedUnit: "g", notes: "Хмель для QA-аккаунта." },
  { ingredientId: "us-cascade-beervingem-standard", enteredQuantity: 100, enteredUnit: "g", normalizedQuantity: 100, normalizedUnit: "g", ingredientSubtype: "hop" },
  { ingredientId: "us-lupulin-citra-lupulin-concentrate", enteredQuantity: 20, enteredUnit: "g", normalizedQuantity: 20, normalizedUnit: "g", ingredientSubtype: "hop" },
  { ingredientId: "de-hallertaur-magnum-standard", enteredQuantity: 50, enteredUnit: "g", normalizedQuantity: 50, normalizedUnit: "g", ingredientSubtype: "hop" },
  { ingredientId: "us-mosaic-beervingem-standard", enteredQuantity: 100, enteredUnit: "g", normalizedQuantity: 100, normalizedUnit: "g", ingredientSubtype: "hop" },
  { ingredientId: "us-citra-beervingem-standard", enteredQuantity: 200, enteredUnit: "g", normalizedQuantity: 200, normalizedUnit: "g", ingredientSubtype: "hop" },
  { ingredientId: "fermentis-t-58", enteredQuantity: 0, enteredUnit: "pack", normalizedQuantity: 0, normalizedUnit: "g", ingredientSubtype: "yeast" },
  { ingredientId: "fermentis-us-05", enteredQuantity: 1, enteredUnit: "pack", normalizedQuantity: 11, normalizedUnit: "g", ingredientSubtype: "yeast" },
  { ingredientId: "lallemand-pomona", enteredQuantity: 1, enteredUnit: "pack", normalizedQuantity: 11, normalizedUnit: "g", ingredientSubtype: "yeast" },
  { ingredientId: "lallemand-philly-sour", enteredQuantity: 1, enteredUnit: "pack", normalizedQuantity: 11, normalizedUnit: "g", ingredientSubtype: "yeast" },
  { ingredientId: "star-san-acid-no-rinse-sanitizer", enteredQuantity: 300, enteredUnit: "ml", normalizedQuantity: 300, normalizedUnit: "ml" },
  { ingredientId: "kettle-fining-irish-moss", enteredQuantity: 4, enteredUnit: "pack", normalizedQuantity: 4, normalizedUnit: "pack" },
  { ingredientId: "lactic-acid", enteredQuantity: 200, enteredUnit: "ml", normalizedQuantity: 200, normalizedUnit: "ml", ingredientSubtype: "other" }
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const normalizeText = (value: string | null | undefined) => value
  ?.normalize("NFKC")
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(/[‐‑‒–—―]/g, "-")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim() ?? "";

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

const resolveInventoryCategory = (item: IngredientRow) => {
  if (item.type === "malt" || item.type === "fermentable") {
    return "fermentable" as const;
  }

  if (item.type === "hop") {
    return "hop" as const;
  }

  if (item.type === "yeast") {
    return "yeast" as const;
  }

  if (item.type === "water_treatment") {
    return "water_treatment" as const;
  }

  return "consumable" as const;
};

const resolveInventorySubtype = (item: IngredientRow) => {
  if (item.type === "malt") {
    return "malt";
  }

  if (item.type === "fermentable") {
    return "fermentable";
  }

  return item.itemKind;
};

const resolveDisplayNameSnapshot = (item: IngredientRow) => item.nameRu ?? item.nameEn ?? item.id;

const resolveDefaultDisplayUnitSnapshot = (item: IngredientRow) => {
  if (item.type === "malt" || item.type === "fermentable") {
    return "kg";
  }

  if (item.type === "hop") {
    return "g";
  }

  if (item.type === "yeast") {
    return "pack";
  }

  if (item.type === "water_treatment") {
    const attributes = isRecord(item.attributes) ? item.attributes : {};
    const unitPreferred = typeof attributes.unit_preferred === "string" ? attributes.unit_preferred.trim().toLowerCase() : "";
    return unitPreferred === "ml" || unitPreferred === "l" || unitPreferred === "g" || unitPreferred === "mg"
      ? unitPreferred
      : "g";
  }

  const quantityDefaults = isRecord(item.quantityDefaults) ? item.quantityDefaults : {};
  const defaultUnit = String(quantityDefaults.stock_unit_default ?? quantityDefaults.recipe_unit_default ?? "").trim().toLowerCase();
  return defaultUnit || (item.packageVariants.length ? "pack" : "item");
};

const resolveMeasurementDimension = (unit: string) => {
  if (["g", "kg", "oz", "lb", "mg"].includes(unit)) {
    return "weight" as const;
  }

  if (["ml", "l", "gal"].includes(unit)) {
    return "volume" as const;
  }

  return "count" as const;
};

const hasText = (item: IngredientRow, needle: string) => {
  const normalizedNeedle = normalizeText(needle);
  return [
    item.id,
    item.nameRu,
    item.nameEn,
    item.brand,
    item.producer,
    item.productCode
  ].some((value) => normalizeText(value).includes(normalizedNeedle));
};

const hasAnyText = (item: IngredientRow, needles: string[]) => (
  needles.some((needle) => hasText(item, needle))
);

const getSeedIngredient = (
  items: IngredientRow[],
  label: string,
  predicate: (item: IngredientRow) => boolean
) => {
  const item = items.find(predicate);
  if (!item) {
    throw new Error(`Failed to resolve seeded ingredient ${label}.`);
  }

  return item;
};

const getSeedIngredientById = (
  items: IngredientRow[],
  ingredientId: string
) => getSeedIngredient(items, ingredientId, (item) => item.id === ingredientId);

const createInventorySeedRow = (
  userId: string,
  item: IngredientRow,
  enteredQuantity: number,
  enteredUnit: string,
  normalizedQuantity: number,
  normalizedUnit: string,
  notes?: string,
  packageVariantId?: string | null
) => ({
  userId,
  ingredientCatalogItemId: item.id,
  packageVariantId: packageVariantId ?? null,
  ingredientFamilyId: null,
  ingredientCategory: resolveInventoryCategory(item),
  ingredientSubtype: resolveInventorySubtype(item),
  ingredientDisplayNameSnapshot: resolveDisplayNameSnapshot(item),
  ingredientDefaultDisplayUnitSnapshot: resolveDefaultDisplayUnitSnapshot(item),
  ingredientMeasurementDimension: resolveMeasurementDimension(resolveDefaultDisplayUnitSnapshot(item)),
  enteredQuantity,
  enteredUnit,
  normalizedQuantity,
  normalizedUnit,
  unitDimension: resolveMeasurementDimension(normalizedUnit),
  notes: notes ?? null
});

const createInventorySeedRows = (
  userId: string,
  catalogItems: IngredientRow[],
  seedItems: InventorySeedItem[]
) => seedItems.map((seedItem) => {
  const row = createInventorySeedRow(
    userId,
    getSeedIngredientById(catalogItems, seedItem.ingredientId),
    seedItem.enteredQuantity,
    seedItem.enteredUnit,
    seedItem.normalizedQuantity,
    seedItem.normalizedUnit,
    seedItem.notes,
    seedItem.packageVariantId
  );

  return {
    ...row,
    ingredientSubtype: seedItem.ingredientSubtype ?? row.ingredientSubtype
  };
});

export const seedQaFixtures = async (): Promise<{
  usersSeeded: number;
  catalog: Awaited<ReturnType<typeof seedCatalogFromSources>>;
}> => {
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

  const seedResult = await seedCatalogFromSources();
  const dbUsers = await db.select().from(users).where(inArray(users.email, seedUsers.map((user) => user.email)));
  const qaUser = getRequiredUser(dbUsers, "qa.user@localhost");
  const qaAdmin = getRequiredUser(dbUsers, "qa.admin@localhost");

  const catalogItems = await db.query.ingredients.findMany({
    with: {
      packageVariants: true
    }
  }) as IngredientRow[];

  const pilsnerMalt = getSeedIngredient(catalogItems, "Pilsner malt", (item) => (
    item.type === "malt"
    && hasAnyText(item, ["pilsner", "пилснер", "пильзнер", "пильзен"])
  ));
  const paleAleMalt = getSeedIngredient(catalogItems, "Pale Ale malt", (item) => (
    item.type === "malt"
    && hasAnyText(item, ["pale ale", "пэйл эль"])
  ));
  const citra = getSeedIngredient(catalogItems, "Citra", (item) => item.type === "hop" && hasText(item, "citra"));
  const us05 = getSeedIngredient(catalogItems, "US-05", (item) => item.type === "yeast" && hasText(item, "us-05"));
  const dextrose = getSeedIngredient(catalogItems, "Dextrose", (item) => item.type === "fermentable" && hasText(item, "dextrose"));
  const riceHulls = getSeedIngredient(catalogItems, "Rice hulls", (item) => (
    item.type === "fermentable"
    && hasAnyText(item, ["rice hulls", "рисовая лузга", "рисовые оболочки"])
  ));
  const yeastNutrient = getSeedIngredient(catalogItems, "Yeast nutrient", (item) => (
    item.type === "consumable"
    && hasAnyText(item, ["подкормка", "дрожжевая подкормка", "yeast nutrient"])
  ));
  const whirlfloc = getSeedIngredient(catalogItems, "Whirlfloc", (item) => item.type === "consumable" && hasText(item, "whirlfloc"));

  const whirlflocVariant = whirlfloc.packageVariants[0];
  if (!whirlflocVariant) {
    throw new Error("Expected Whirlfloc package variant for QA seed.");
  }

  const qaUserIds = [qaUser.id, qaAdmin.id];

  await db.delete(inventoryTransactions).where(inArray(inventoryTransactions.userId, qaUserIds));
  await db.delete(recipeInventoryAllocations).where(inArray(recipeInventoryAllocations.userId, qaUserIds));
  await db.delete(userIngredients).where(inArray(userIngredients.userId, qaUserIds));

  await db.insert(userIngredients).values([
    createInventorySeedRow(qaUser.id, pilsnerMalt, 6, "kg", 6000, "g", "Базовый солод для лагеров."),
    createInventorySeedRow(qaUser.id, paleAleMalt, 5, "kg", 5000, "g", "База для элей и IPA."),
    createInventorySeedRow(qaUser.id, citra, 150, "g", 150, "g", "Ароматические закладки."),
    createInventorySeedRow(qaUser.id, us05, 2, "pack", 22, "g", "Универсальные сухие дрожжи."),
    createInventorySeedRow(qaUser.id, dextrose, 1000, "g", 1000, "g", "Сахар для прайминга."),
    createInventorySeedRow(qaUser.id, riceHulls, 500, "g", 500, "g", "Помощь при фильтрации затора."),
    createInventorySeedRow(qaUser.id, yeastNutrient, 100, "g", 100, "g", "Подкормка дрожжей."),
    createInventorySeedRow(
      qaUser.id,
      whirlfloc,
      1,
      "pack",
      whirlflocVariant.stockContentAmount ?? 1,
      whirlflocVariant.stockContentUnit ?? "pack",
      "Пакетная фасовка для кипячения.",
      whirlflocVariant.id
    ),
    ...createInventorySeedRows(qaAdmin.id, catalogItems, qaAdminInventorySeedItems)
  ]);

  console.log(`QA seed complete: ${dbUsers.length} users, ${seedResult.processed} catalog items, inventory reset for qa.user/qa.admin.`);

  return {
    usersSeeded: dbUsers.length,
    catalog: seedResult
  };
};
