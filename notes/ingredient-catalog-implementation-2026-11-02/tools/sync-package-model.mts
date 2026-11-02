import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { db, pool } from '../../../packages/db/src/index';
import { seedCatalogFromSources } from '../../../packages/db/scripts/catalog-seed';
import { recomputeRecipeStats } from '../../../apps/web/features/recipes/service';
if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1','postgres'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error('LOCAL_DATABASE_REQUIRED');
const root='/home/dopefish/projects/nb/notes/ingredient-catalog-implementation-2026-11-02';
const before=await db.query.userIngredients.findMany();
const first=await seedCatalogFromSources(),second=await seedCatalogFromSources();
const after=new Map((await db.query.userIngredients.findMany()).map(row=>[row.id,row]));
const fields=['enteredQuantity','enteredUnit','normalizedQuantity','normalizedUnit','packageVariantId','purchasePriceMinor','purchaseCurrency','purchaseQuantity','purchaseQuantityUnit','purchaseQuantityNormalized','purchaseQuantityNormalizedUnit','normalizedUnitCostMinorRub'] as const;
for(const row of before)for(const field of fields)assert.deepEqual(after.get(row.id)?.[field],row[field]);
const recipes=await db.query.recipes.findMany();let changed=0;const failed:any[]=[];
for(const recipe of recipes){try{const stats=await recomputeRecipeStats(recipe.authorId,recipe.id);if(['og','fg','abv','ibu','color'].some(key=>(stats as any)[key]!== (recipe as any)[key]))changed++;}catch(error){failed.push({id:recipe.id,error:String(error)})}}
const path=root+'/database-result.json',report=JSON.parse(readFileSync(path,'utf8'));
report.packageModelSync={processed:first.processed,conflicts:first.conflicts,repeatConflicts:second.conflicts,stockChecked:before.length,quantitiesPackagesAndCostsUnchanged:true,recipesRecomputed:recipes.length,recipeStatsChanged:changed,failed};
writeFileSync(path,JSON.stringify(report,null,2));console.log(JSON.stringify(report.packageModelSync));await pool.end();if(failed.length)process.exitCode=1;
