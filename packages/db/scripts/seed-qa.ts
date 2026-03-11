import { db, inArray, ingredientCatalogItems, pool, userIngredients, users } from "../src";
import { assertDevOnlyExecution } from "./_dev-utils";

type SeedUser = {
  email: string;
  displayName: string;
  role: "user" | "editor" | "moderator" | "admin";
};

type SeedCatalogItem = {
  type: "fermentable" | "hop" | "yeast" | "sugar" | "adjunct" | "fining" | "misc";
  displayName: string;
  normalizedName: string;
  defaultUnit: string;
  description?: string;
  properties?: Record<string, unknown>;
};

const seedUsers: SeedUser[] = [
  { email: "qa.admin@localhost", displayName: "QA Admin", role: "admin" },
  { email: "qa.moderator@localhost", displayName: "QA Moderator", role: "moderator" },
  { email: "qa.editor@localhost", displayName: "QA Editor", role: "editor" },
  { email: "qa.user@localhost", displayName: "QA Brewer", role: "user" }
];

const seedCatalogItems: SeedCatalogItem[] = [
  { type: "fermentable", displayName: "Pale Ale Malt", normalizedName: "pale ale malt", defaultUnit: "g", properties: { colorEbc: 6 } },
  { type: "fermentable", displayName: "Munich Malt", normalizedName: "munich malt", defaultUnit: "g", properties: { colorEbc: 18 } },
  { type: "hop", displayName: "Citra", normalizedName: "citra", defaultUnit: "g", properties: { alphaAcid: 12 } },
  { type: "hop", displayName: "Saaz", normalizedName: "saaz", defaultUnit: "g", properties: { alphaAcid: 4 } },
  { type: "yeast", displayName: "SafAle US-05", normalizedName: "safale us-05", defaultUnit: "pack", properties: { form: "dry" } },
  { type: "sugar", displayName: "Dextrose", normalizedName: "dextrose", defaultUnit: "g" }
];

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

  for (const item of seedCatalogItems) {
    await db.insert(ingredientCatalogItems).values({
      ...item,
      status: "active",
      visibility: "public"
    }).onConflictDoUpdate({
      target: [ingredientCatalogItems.type, ingredientCatalogItems.normalizedName],
      set: {
        displayName: item.displayName,
        defaultUnit: item.defaultUnit,
        description: item.description ?? null,
        properties: item.properties ?? {},
        status: "active",
        visibility: "public",
        updatedAt: new Date()
      }
    });
  }

  const dbUsers = await db.select().from(users).where(inArray(users.email, seedUsers.map((user) => user.email)));
  const dbCatalogItems = await db.select().from(ingredientCatalogItems).where(inArray(ingredientCatalogItems.normalizedName, seedCatalogItems.map((item) => item.normalizedName)));

  const qaUser = dbUsers.find((user) => user.email === "qa.user@localhost");
  const qaAdmin = dbUsers.find((user) => user.email === "qa.admin@localhost");
  if (!qaUser || !qaAdmin) {
    throw new Error("Failed to load seeded QA users.");
  }

  const catalogByName = new Map(dbCatalogItems.map((item) => [item.normalizedName, item]));
  const paleAleMalt = catalogByName.get("pale ale malt");
  const citra = catalogByName.get("citra");
  const us05 = catalogByName.get("safale us-05");
  const saaz = catalogByName.get("saaz");

  if (!paleAleMalt || !citra || !us05 || !saaz) {
    throw new Error("Failed to load seeded ingredient catalog items.");
  }

  await db.delete(userIngredients).where(inArray(userIngredients.userId, [qaUser.id, qaAdmin.id]));
  await db.insert(userIngredients).values([
    { userId: qaUser.id, ingredientCatalogItemId: paleAleMalt.id, quantity: 5000, unit: "g", notes: "Base malt for pale ale" },
    { userId: qaUser.id, ingredientCatalogItemId: citra.id, quantity: 150, unit: "g", notes: "Aroma additions" },
    { userId: qaUser.id, ingredientCatalogItemId: us05.id, quantity: 2, unit: "pack" },
    { userId: qaAdmin.id, ingredientCatalogItemId: saaz.id, quantity: 80, unit: "g", notes: "Admin QA account stock" }
  ]);

  console.log(`QA seed complete: ${dbUsers.length} users, ${dbCatalogItems.length} catalog items, inventory reset for qa.user/qa.admin.`);
};

run()
  .catch((error) => {
    console.error("seed-qa failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
