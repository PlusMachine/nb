import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { db, pool, userIngredients, eq, sql } from '../../../packages/db/src/index';
import { extractIngredientTechnicalData } from '../../../apps/web/features/ingredients/technical-fields';
import { resolveInventoryPackEquivalent } from '../../../apps/web/features/inventory/pack';
if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1','postgres'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error('LOCAL_DATABASE_REQUIRED');
const root='/home/dopefish/projects/nb/notes/ingredient-catalog-implementation-2026-11-02';
const dir=root+'/private/before-package-model';mkdirSync(dir,{recursive:true,mode:0o700});
const catalog=await db.query.ingredients.findMany(),customs=await db.query.userCustomIngredients.findMany(),stock=await db.query.userIngredients.findMany();
for(const [name,rows] of Object.entries({ingredients:catalog,userCustomIngredients:customs,userIngredients:stock,recipes:await db.query.recipes.findMany()}))writeFileSync(dir+'/'+name+'.json',JSON.stringify(rows),{mode:0o600});
const byCatalog=new Map(catalog.map(row=>[row.id,row])),byCustom=new Map(customs.map(row=>[row.id,row]));let frozen=0;
for(const row of stock){
 if(row.packageVariantId || row.enteredUnit!=='pack' || row.normalizedUnit!=='g' || row.properties._legacy_pack_content_snapshot)continue;
 const source=row.ingredientCatalogItemId?byCatalog.get(row.ingredientCatalogItemId):byCustom.get(row.userCustomIngredientId!);
 const technical=source?extractIngredientTechnicalData(source):null;
 if(technical?.type!=='yeast' || technical.form!=='dry')continue;
 const equivalent=resolveInventoryPackEquivalent({...technical,packageSelectionRequired:false});
 if(!equivalent)continue;
 const snapshot=JSON.stringify({_legacy_pack_content_snapshot:{stockContentAmount:equivalent.normalizedQuantity,stockContentUnit:equivalent.normalizedUnit}});
 await db.update(userIngredients).set({properties:sql`${userIngredients.properties} || ${snapshot}::jsonb`}).where(eq(userIngredients.id,row.id));frozen++;
}
const path=root+'/database-result.json',report=JSON.parse(readFileSync(path,'utf8'));
report.stock.legacyUnlinkedPackageCoefficientsFrozen=frozen;report.packageModelBackupDir=dir;writeFileSync(path,JSON.stringify(report,null,2));
console.log(JSON.stringify({legacyPackagesFrozen:frozen,stock:stock.length}));await pool.end();
