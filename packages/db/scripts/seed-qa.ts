import { db, inArray, ingredientCatalogItems, pool, userIngredients, users } from "../src";
import { assertDevOnlyExecution } from "./_dev-utils";
import { seedCatalogItems, seedUsers } from "./qa-seed-data";

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
  const mosaic = catalogByName.get("mosaic");
  const citra = catalogByName.get("citra");
  const us05 = catalogByName.get("safale us-05");
  const m21 = catalogByName.get("mangrove jacks m21 belgian wit");
  const saaz = catalogByName.get("saaz");
  const dextrose = catalogByName.get("dextrose");
  const honey = catalogByName.get("honey");
  const flakedOats = catalogByName.get("flaked oats");
  const riceHulls = catalogByName.get("rice hulls");
  const irishMoss = catalogByName.get("irish moss");
  const gelatin = catalogByName.get("gelatin");
  const yeastNutrient = catalogByName.get("yeast nutrient");
  const calciumChloride = catalogByName.get("calcium chloride");

  if (
    !pilsnerMalt
    || !paleAleMalt
    || !mosaic
    || !citra
    || !us05
    || !m21
    || !saaz
    || !dextrose
    || !honey
    || !flakedOats
    || !riceHulls
    || !irishMoss
    || !gelatin
    || !yeastNutrient
    || !calciumChloride
  ) {
    throw new Error("Failed to load seeded ingredient catalog items.");
  }

  await db.delete(userIngredients).where(inArray(userIngredients.userId, [qaUser.id, qaAdmin.id]));
  await db.insert(userIngredients).values([
    {
      userId: qaUser.id,
      ingredientCatalogItemId: pilsnerMalt.id,
      enteredQuantity: 6000,
      enteredUnit: "g",
      normalizedQuantity: 6000,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Base malt for lagers and Belgian styles"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: paleAleMalt.id,
      enteredQuantity: 5000,
      enteredUnit: "g",
      normalizedQuantity: 5000,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Base malt for pale ale"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: citra.id,
      enteredQuantity: 150,
      enteredUnit: "g",
      normalizedQuantity: 150,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Aroma additions"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: mosaic.id,
      enteredQuantity: 100,
      enteredUnit: "g",
      normalizedQuantity: 100,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Dry hop sample stock"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: us05.id,
      enteredQuantity: 2,
      enteredUnit: "pack",
      normalizedQuantity: 2,
      normalizedUnit: "pack",
      unitDimension: "count"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: dextrose.id,
      enteredQuantity: 1000,
      enteredUnit: "g",
      normalizedQuantity: 1000,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Priming sugar"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: flakedOats.id,
      enteredQuantity: 750,
      enteredUnit: "g",
      normalizedQuantity: 750,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Adjunct for haze and body"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: irishMoss.id,
      enteredQuantity: 50,
      enteredUnit: "g",
      normalizedQuantity: 50,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Kettle finings"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: yeastNutrient.id,
      enteredQuantity: 100,
      enteredUnit: "g",
      normalizedQuantity: 100,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Fermentation support"
    },
    {
      userId: qaUser.id,
      ingredientCatalogItemId: calciumChloride.id,
      enteredQuantity: 250,
      enteredUnit: "g",
      normalizedQuantity: 250,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Water profile adjustment"
    },
    {
      userId: qaAdmin.id,
      ingredientCatalogItemId: m21.id,
      enteredQuantity: 1,
      enteredUnit: "pack",
      normalizedQuantity: 1,
      normalizedUnit: "pack",
      unitDimension: "count",
      notes: "Belgian wit QA sample"
    },
    {
      userId: qaAdmin.id,
      ingredientCatalogItemId: saaz.id,
      enteredQuantity: 80,
      enteredUnit: "g",
      normalizedQuantity: 80,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Admin QA account stock"
    },
    {
      userId: qaAdmin.id,
      ingredientCatalogItemId: honey.id,
      enteredQuantity: 1500,
      enteredUnit: "g",
      normalizedQuantity: 1500,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Special fermentables sample"
    },
    {
      userId: qaAdmin.id,
      ingredientCatalogItemId: riceHulls.id,
      enteredQuantity: 500,
      enteredUnit: "g",
      normalizedQuantity: 500,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Lautering adjunct"
    },
    {
      userId: qaAdmin.id,
      ingredientCatalogItemId: gelatin.id,
      enteredQuantity: 100,
      enteredUnit: "g",
      normalizedQuantity: 100,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Cold crash finings"
    }
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
