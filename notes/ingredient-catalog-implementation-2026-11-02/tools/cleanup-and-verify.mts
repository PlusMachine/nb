import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {db,pool,users,eq,and} from '../../../packages/db/src/index';
const root='/home/dopefish/projects/nb/notes/ingredient-catalog-implementation-2026-11-02';
if(process.env.NODE_ENV==='production'||!['localhost','127.0.0.1','postgres'].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error('LOCAL_DATABASE_REQUIRED');
const auth=JSON.parse(readFileSync(root+'/private/browser-auth.json','utf8'));
const user=await db.query.users.findFirst({where:eq(users.id,auth.userId)});
if(user){assert.ok(user.email?.startsWith('qa.catalog.browser.'));await db.delete(users).where(and(eq(users.id,user.id),eq(users.email,user.email!)))}
const before=JSON.parse(readFileSync(root+'/private/before-package-model/userIngredients.json','utf8')).filter((row:any)=>row.userId!==auth.userId);
const after=await db.query.userIngredients.findMany();const byId=new Map(after.map(row=>[row.id,row]));
const fields=['enteredQuantity','enteredUnit','normalizedQuantity','normalizedUnit','packageVariantId','purchasePriceMinor','purchaseCurrency','purchaseQuantity','purchaseQuantityUnit','purchaseQuantityNormalized','purchaseQuantityNormalizedUnit','normalizedUnitCostMinorRub'] as const;
for(const row of before)for(const field of fields)assert.deepEqual(byId.get(row.id)?.[field],row[field]);
const catalog=await db.query.ingredients.findMany();const old='weyermann-dark-wheat-de-base';
assert.equal(after.filter(row=>row.ingredientCatalogItemId===old).length,0);
const recipeRows=await db.query.recipeIngredients.findMany();assert.equal(recipeRows.filter(row=>row.ingredientCatalogItemId===old).length,0);
const catalogById=new Map(catalog.map(row=>[row.id,row]));
const legacyNonmaterial=after.filter(row=>row.ingredientCatalogItemId&&catalogById.get(row.ingredientCatalogItemId)?.inventoryEnabled===false);
const result={testAccountRemoved:!(await db.query.users.findFirst({where:eq(users.id,auth.userId)})),originalStockChecked:before.length,originalQuantitiesPackagesAndCostsUnchanged:true,currentStock:after.length,catalog:catalog.length,activeCatalog:catalog.filter(row=>row.isActive).length,packages:(await db.query.ingredientPackageVariants.findMany()).length,recipes:(await db.query.recipes.findMany()).length,oldWheatStockReferences:0,oldWheatRecipeReferences:0,legacyNonmaterialStockCount:legacyNonmaterial.length};
writeFileSync(root+'/final-database-verification.json',JSON.stringify(result,null,2));unlinkSync(root+'/private/browser-auth.json');console.log(JSON.stringify(result));await pool.end();
