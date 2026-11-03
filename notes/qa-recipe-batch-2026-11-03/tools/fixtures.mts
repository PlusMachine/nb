import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { db, pool, eq, users, brewBatches, recipes, userIngredients, inventoryTransactions, recipeInventoryAllocations } from "../../../packages/db/src/index.ts";
import { completeEmailSignIn, createSession } from "../../../packages/auth/src/index.ts";
import { createRecipe } from "../../../apps/web/features/recipes/service";
import { addCatalogIngredientToInventory } from "../../../apps/web/features/inventory/service";
import { createEquipmentProfile } from "../../../apps/web/features/equipment-profiles/service";
import { buildStarterEquipmentProfileDefaults } from "../../../apps/web/features/equipment/defaults";
import { createBrewBatchFromRecipe } from "../../../apps/web/features/brew-batches/service";

const secretPath = "/tmp/nb-qa-flow-20261103.json";
const out = new URL("../", import.meta.url);
const database = new URL(process.env.DATABASE_URL ?? "");
if (database.hostname !== "127.0.0.1" || database.port !== "55434" || database.pathname !== "/nb_qa_20261103") throw new Error("ISOLATED_QA_DB_REQUIRED");
const command = process.argv[2] ?? "create";

try {
  if (command === "create") {
    const user = await completeEmailSignIn({ email: `qa.flow.${randomUUID()}@localhost` });
    const stranger = await completeEmailSignIn({ email: `qa.stranger.${randomUUID()}@localhost` });
    const session = await createSession({ userId: user.id, userAgent: "QA recipe batch November 3" });
    const equipment = await createEquipmentProfile(user.id, { ...buildStarterEquipmentProfileDefaults(), name: "QA оборудование 10 л", targetBatchVolumeL: 10, brewhouseEfficiencyPct: 70 });
    const malt = "bestmalz-best-pale-ale-malt", hop = "us-cascade-beervingem-standard";
    const yeast = (await db.query.ingredients.findMany()).find(item => item.type === "yeast" && /US.?05/i.test(item.nameRu + " " + item.nameEn));
    if (!yeast) throw new Error("US05_REQUIRED");
    const recipe = await createRecipe(user.id, {
      title: "QA рецепт 20 л", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", efficiency: 70, boilTimeMinutes: 60,
      ingredients: [
        { persistentKey: randomUUID(), ingredientCatalogItemId: malt, type: "malt", amountEnteredQuantity: 4, amountEnteredUnit: "kg", stage: "mash", displayOrder: 0 },
        { persistentKey: randomUUID(), ingredientCatalogItemId: hop, type: "hop", amountEnteredQuantity: 20, amountEnteredUnit: "g", stage: "boil", timeOffset: 60, displayOrder: 1 },
        { persistentKey: randomUUID(), ingredientCatalogItemId: hop, type: "hop", amountEnteredQuantity: 20, amountEnteredUnit: "g", stage: "boil", timeOffset: 10, displayOrder: 2 },
        { persistentKey: randomUUID(), ingredientCatalogItemId: yeast.id, type: "yeast", amountEnteredQuantity: 1, amountEnteredUnit: "pack", stage: "fermentation", displayOrder: 3 }
      ]
    });
    const stocks = [];
    for (const item of [{ id:malt,quantity:5,unit:"kg" }, { id:hop,quantity:12,unit:"g" }, { id:hop,quantity:10,unit:"g" }, { id:yeast.id,quantity:2,unit:"pack" }]) {
      const stock = await addCatalogIngredientToInventory(user.id, { ingredientCatalogItemId:item.id, enteredQuantity:item.quantity, enteredUnit:item.unit as any });
      stocks.push({ id:stock.id, catalog:item.id, entered:item.quantity, unit:item.unit });
    }
    const data = { userId:user.id, strangerId:stranger.id, recipeId:recipe.id, equipmentId:equipment.id, stocks, token:session.rawToken };
    writeFileSync(secretPath, JSON.stringify(data,null,2), {mode:0o600});
    writeFileSync(new URL("fixture-manifest.json",out), JSON.stringify({...data,token:undefined},null,2));
    console.log(JSON.stringify({...data,token:undefined},null,2));
  } else {
    const fixture = JSON.parse(readFileSync(secretPath,"utf8"));
    if (command === "batch") {
      const batch = await createBrewBatchFromRecipe(fixture.userId,fixture.recipeId,{targetBatchVolumeL:10,equipmentProfileId:fixture.equipmentId});
      console.log(JSON.stringify({id:batch.id,status:batch.status},null,2));
    } else if (command === "state") {
      const state = {
        recipes:await db.query.recipes.findMany({where:eq(recipes.authorId,fixture.userId)}),
        batches:await db.query.brewBatches.findMany({where:eq(brewBatches.userId,fixture.userId)}),
        stocks:await db.query.userIngredients.findMany({where:eq(userIngredients.userId,fixture.userId)}),
        transactions:await db.query.inventoryTransactions.findMany({where:eq(inventoryTransactions.userId,fixture.userId)}),
        allocations:await db.query.recipeInventoryAllocations.findMany({where:eq(recipeInventoryAllocations.userId,fixture.userId)})
      };
      const name = process.argv[3] ?? "database-state";
      writeFileSync(new URL(`${name}.json`,out),JSON.stringify(state,null,2));
      console.log(JSON.stringify({stocks:state.stocks.map(row=>({id:row.id,entered:row.enteredQuantity,enteredUnit:row.enteredUnit,normalized:row.normalizedQuantity,unit:row.normalizedUnit})),batches:state.batches.map(row=>({id:row.id,status:row.status,volume:(row.brewPlanSnapshot as any)?.batchSizeL})),transactionCount:state.transactions.length},null,2));
    } else if (command === "cleanup") {
      await db.delete(users).where(eq(users.id,fixture.userId));
      await db.delete(users).where(eq(users.id,fixture.strangerId));
      console.log("QA accounts removed");
    }
  }
} finally { await pool.end(); }
