import { db, inArray, ingredientCatalogItems, pool, userIngredients, users } from "../src";
import { assertDevOnlyExecution } from "./_dev-utils";

type SeedUser = {
  email: string;
  displayName: string;
  role: "user" | "editor" | "moderator" | "admin";
};

type SeedCatalogItem = {
  type: "fermentable" | "hop" | "yeast" | "sugar" | "adjunct" | "fining" | "misc";
  subtype?: string;
  displayName: string;
  normalizedName: string;
  aliases?: string[];
  manufacturer?: string;
  country?: string;
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
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Pilsner Malt",
    normalizedName: "pilsner malt",
    aliases: ["pilsner", "pils", "lager malt"],
    manufacturer: "BESTMALZ",
    country: "DE",
    defaultUnit: "g",
    properties: { colorEbc: 3.5, extractFgdbPct: 80 }
  },
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Pale Ale Malt",
    normalizedName: "pale ale malt",
    aliases: ["pale malt", "pale ale", "2 row"],
    manufacturer: "Crisp",
    country: "GB",
    defaultUnit: "g",
    properties: { colorEbc: 6, extractFgdbPct: 79 }
  },
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Wheat Malt",
    normalizedName: "wheat malt",
    aliases: ["wheat", "malted wheat"],
    manufacturer: "Weyermann",
    country: "DE",
    defaultUnit: "g",
    properties: { colorEbc: 4, extractFgdbPct: 84 }
  },
  {
    type: "fermentable",
    subtype: "specialty-malt",
    displayName: "Munich Malt",
    normalizedName: "munich malt",
    aliases: ["munich"],
    manufacturer: "Weyermann",
    country: "DE",
    defaultUnit: "g",
    properties: { colorEbc: 18, extractFgdbPct: 78 }
  },
  {
    type: "hop",
    displayName: "Citra",
    normalizedName: "citra",
    manufacturer: "Yakima Chief",
    country: "US",
    defaultUnit: "g",
    properties: { alphaAcid: 12 }
  },
  {
    type: "hop",
    displayName: "Mosaic",
    normalizedName: "mosaic",
    manufacturer: "Yakima Chief",
    country: "US",
    defaultUnit: "g",
    properties: { alphaAcid: 11.5 }
  },
  {
    type: "hop",
    displayName: "Saaz",
    normalizedName: "saaz",
    manufacturer: "Bohemia Hop",
    country: "CZ",
    defaultUnit: "g",
    properties: { alphaAcid: 4 }
  },
  {
    type: "yeast",
    displayName: "SafAle US-05",
    normalizedName: "safale us-05",
    aliases: ["us-05", "us05", "safale 05"],
    manufacturer: "Fermentis",
    country: "FR",
    defaultUnit: "pack",
    properties: { form: "dry", styles: ["american ale", "pale ale", "ipa"] }
  },
  {
    type: "yeast",
    displayName: "Mangrove Jack's M21 Belgian Wit",
    normalizedName: "mangrove jacks m21 belgian wit",
    aliases: ["m21", "m21 belgian wit", "mangrove jacks m21"],
    manufacturer: "Mangrove Jack's",
    country: "NZ",
    defaultUnit: "pack",
    properties: { form: "dry", styles: ["witbier", "belgian ale"] }
  },
  {
    type: "yeast",
    displayName: "LalBrew Voss Kveik",
    normalizedName: "lalbrew voss kveik",
    aliases: ["voss kveik", "lalbrew voss"],
    manufacturer: "Lallemand",
    country: "CA",
    defaultUnit: "pack",
    properties: { form: "dry", styles: ["kveik", "farmhouse"] }
  },
  {
    type: "sugar",
    displayName: "Dextrose",
    normalizedName: "dextrose",
    aliases: ["corn sugar", "glucose"],
    defaultUnit: "g"
  },
  {
    type: "adjunct",
    displayName: "Flaked Oats",
    normalizedName: "flaked oats",
    aliases: ["oats", "rolled oats"],
    defaultUnit: "g",
    properties: { usage: "body and haze" }
  },
  {
    type: "fining",
    displayName: "Irish Moss",
    normalizedName: "irish moss",
    defaultUnit: "g",
    properties: { stage: "boil" }
  },
  {
    type: "misc",
    displayName: "Yeast Nutrient",
    normalizedName: "yeast nutrient",
    aliases: ["nutrient"],
    defaultUnit: "g",
    properties: { stage: "boil" }
  }
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
      subtype: item.subtype ?? null,
      aliases: item.aliases ?? [],
      manufacturer: item.manufacturer ?? null,
      country: item.country ?? null,
      status: "active",
      visibility: "public"
    }).onConflictDoUpdate({
      target: [ingredientCatalogItems.type, ingredientCatalogItems.normalizedName],
      set: {
        subtype: item.subtype ?? null,
        displayName: item.displayName,
        aliases: item.aliases ?? [],
        manufacturer: item.manufacturer ?? null,
        country: item.country ?? null,
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
  const pilsnerMalt = catalogByName.get("pilsner malt");
  const paleAleMalt = catalogByName.get("pale ale malt");
  const citra = catalogByName.get("citra");
  const us05 = catalogByName.get("safale us-05");
  const m21 = catalogByName.get("mangrove jacks m21 belgian wit");
  const saaz = catalogByName.get("saaz");

  if (!pilsnerMalt || !paleAleMalt || !citra || !us05 || !m21 || !saaz) {
    throw new Error("Failed to load seeded ingredient catalog items.");
  }

  await db.delete(userIngredients).where(inArray(userIngredients.userId, [qaUser.id, qaAdmin.id]));
  await db.insert(userIngredients).values([
    { userId: qaUser.id, ingredientCatalogItemId: pilsnerMalt.id, quantity: 6000, unit: "g", notes: "Base malt for lagers and Belgian styles" },
    { userId: qaUser.id, ingredientCatalogItemId: paleAleMalt.id, quantity: 5000, unit: "g", notes: "Base malt for pale ale" },
    { userId: qaUser.id, ingredientCatalogItemId: citra.id, quantity: 150, unit: "g", notes: "Aroma additions" },
    { userId: qaUser.id, ingredientCatalogItemId: us05.id, quantity: 2, unit: "pack" },
    { userId: qaAdmin.id, ingredientCatalogItemId: m21.id, quantity: 1, unit: "pack", notes: "Belgian wit QA sample" },
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
