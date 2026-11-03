import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db, pool, users, recipes, userIngredients, eq } from "../../../packages/db/src/index.ts";
import { completeEmailSignIn, createSession } from "../../../packages/auth/src/index.ts";
import { createRecipe, getRecipeById, updateRecipe, deleteRecipe } from "../../../apps/web/features/recipes/service";
import { addCatalogIngredientToInventory, updateInventoryQuantity } from "../../../apps/web/features/inventory/service";
import { createBrewBatchFromRecipe, getBrewBatchDetail } from "../../../apps/web/features/brew-batches/service";
import { consumeBrewBatchInventory, restoreBrewBatchInventory } from "../../../apps/web/features/brew-batches/inventory";
import { createEquipmentProfile, getEquipmentProfile } from "../../../apps/web/features/equipment-profiles/service";
import { buildStarterEquipmentProfileDefaults } from "../../../apps/web/features/equipment/defaults";
const url=new URL(process.env.DATABASE_URL??"");
if(url.hostname!=="127.0.0.1"||url.port!=="55434"||url.pathname!=="/nb_qa_20261103")throw new Error("ISOLATED_QA_DB_REQUIRED");
const out=new URL("../",import.meta.url),results:any[]=[];
const check=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
const run=async(id:string,fn:()=>Promise<any>)=>{
  try{results.push({id,status:"passed",evidence:await fn()});}catch(error){results.push({id,status:"failed",error:String(error)});}
  console.log(JSON.stringify(results.at(-1)));
  await writeFile(new URL("db-exploration.json",out),JSON.stringify(results,null,2));
};
const reject=async(fn:()=>Promise<unknown>)=>{let rejected=false;try{await fn();}catch{rejected=true;}check(rejected,"operation unexpectedly accepted");};
const payload=(extra:any={})=>({title:"QA проверка сохранения",publicationState:"private",batchSizeEnteredQuantity:20,batchSizeEnteredUnit:"l",efficiency:70,boilTimeMinutes:60,ingredients:[],...extra});
const line=(extra:any={})=>({persistentKey:randomUUID(),ingredientCatalogItemId:"us-cascade-beervingem-standard",type:"hop",amountEnteredQuantity:20,amountEnteredUnit:"g",stage:"boil",timeOffset:60,...extra});
try{
  const owner=await completeEmailSignIn({email:`qa.persistence.${randomUUID()}@localhost`});
  const stranger=await completeEmailSignIn({email:`qa.other.${randomUUID()}@localhost`});
  const creation=await completeEmailSignIn({email:`qa.creation.${randomUUID()}@localhost`});
  const recipe=await createRecipe(owner.id,payload({ingredients:[line()]}));
  const stock=await addCatalogIngredientToInventory(owner.id,{ingredientCatalogItemId:"us-cascade-beervingem-standard",enteredQuantity:40,enteredUnit:"mg"});
  const equipment=await createEquipmentProfile(owner.id,{...buildStarterEquipmentProfileDefaults(),name:"Private QA equipment"});
  const batch=await createBrewBatchFromRecipe(owner.id,recipe.id);
  const sessions=await Promise.all([owner,stranger,creation].map(user=>createSession({userId:user.id,userAgent:"QA persistence testing"})));
  const manifest={ownerId:owner.id,strangerId:stranger.id,creationId:creation.id,recipeId:recipe.id,batchId:batch.id,stockId:stock.id};
  await writeFile("/tmp/nb-qa-persistence-20261103.json",JSON.stringify({...manifest,tokens:sessions.map(s=>s.rawToken)}),{mode:0o600});
  await writeFile(new URL("fixture-manifest.json",out),JSON.stringify(manifest,null,2));
  await run("N01",async()=>{for(const value of [0,-1])await reject(()=>updateRecipe(owner.id,recipe.id,{batchSizeEnteredQuantity:value}));check((await getRecipeById(owner.id,recipe.id)).batchSizeEnteredQuantity===20,"volume changed");});
  await run("N02",async()=>{for(const value of [NaN,Infinity,-Infinity,1e308])await reject(()=>updateRecipe(owner.id,recipe.id,{batchSizeEnteredQuantity:value}));check((await getRecipeById(owner.id,recipe.id)).batchSizeEnteredQuantity===20,"volume changed");});
  await run("N03",async()=>{let created:any;try{created=await createRecipe(owner.id,payload({batchSizeEnteredQuantity:0.0004}));}catch{return {rejected:true};}check(created.batchSizeEnteredQuantity>0&&created.batchSizeNormalizedQuantity>0,JSON.stringify({entered:created.batchSizeEnteredQuantity,normalized:created.batchSizeNormalizedQuantity}));return {entered:created.batchSizeEnteredQuantity,normalized:created.batchSizeNormalizedQuantity};});
  await run("N04",()=>reject(()=>updateRecipe(owner.id,recipe.id,{batchSizeEnteredUnit:"g"})));
  await run("N05",async()=>{await updateInventoryQuantity(owner.id,stock.id,{enteredQuantity:0.00004,enteredUnit:"kg"});const row=await db.query.userIngredients.findFirst({where:eq(userIngredients.id,stock.id)});check(row?.normalizedQuantity===0.04,"40 mg lost");await updateInventoryQuantity(owner.id,stock.id,{enteredQuantity:40,enteredUnit:"mg"});return {normalizedGrams:row!.normalizedQuantity};});
  await run("N06",async()=>{await reject(()=>updateInventoryQuantity(owner.id,stock.id,{enteredQuantity:0.1,enteredUnit:"mg"}));await reject(()=>updateInventoryQuantity(owner.id,stock.id,{enteredQuantity:0.0000001,enteredUnit:"kg"}));});
  await run("N07",async()=>{const key=(await getRecipeById(owner.id,recipe.id)).ingredients[0].persistentKey;let accepted=false;try{await updateRecipe(owner.id,recipe.id,{ingredients:[line({persistentKey:key,amountEnteredQuantity:5}),line({persistentKey:key,amountEnteredQuantity:7})]});accepted=true;}catch{}const after=await getRecipeById(owner.id,recipe.id);check(!accepted&&after.ingredients.length===1&&after.ingredients[0].amountEnteredQuantity===20,JSON.stringify({accepted,amounts:after.ingredients.map(x=>x.amountEnteredQuantity)}));});
  await run("A01",()=>reject(()=>getRecipeById(stranger.id,recipe.id)));
  await run("A02",async()=>{const title=(await getRecipeById(owner.id,recipe.id)).title;await reject(()=>updateRecipe(stranger.id,recipe.id,{title:"HACKED"}));await reject(()=>deleteRecipe(stranger.id,recipe.id));check((await getRecipeById(owner.id,recipe.id)).title===title,"title changed");});
  await run("A03",async()=>{await reject(()=>updateInventoryQuantity(stranger.id,stock.id,{enteredQuantity:999,enteredUnit:"g"}));const row=await db.query.userIngredients.findFirst({where:eq(userIngredients.id,stock.id)});check(row?.normalizedQuantity===0.04,"stock changed");});
  await run("A04",async()=>{await reject(()=>getEquipmentProfile(stranger.id,equipment.id));check(await getBrewBatchDetail(stranger.id,batch.id)===null,"batch readable");await reject(()=>consumeBrewBatchInventory(stranger.id,batch.id,{allowPartial:true}));await reject(()=>restoreBrewBatchInventory(stranger.id,batch.id));});
  await run("A06",async()=>{const pub=await createRecipe(owner.id,payload({authorNotes:"PRIVATE QA NOTE",ingredients:[line()]}));await db.update(recipes).set({publicationState:"published"}).where(eq(recipes.id,pub.id));check((await getRecipeById(stranger.id,pub.id)).authorNotes==null,"personal notes leaked");check((await getRecipeById(owner.id,pub.id)).authorNotes==="PRIVATE QA NOTE","owner lost notes");});
}finally{await pool.end();}
