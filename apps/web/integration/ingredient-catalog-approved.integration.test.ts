import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeEmailSignIn } from "@nb/auth";
import { db, pool, users, ingredients, userIngredients, userIngredientPreferences, userIngredientPurchaseLinks, eq, inArray } from "@nb/db";
import { seedCatalogFromSources } from "../../../packages/db/scripts/catalog-seed";
import { createIngredient, updateIngredient, getIngredientById, mergeDuplicateIngredients } from "../features/ingredients/service";
import { addCatalogIngredientToInventory, addCustomIngredientToInventory, createUserCustomIngredient, listInventoryForUser, updateInventoryItem, updateInventoryQuantity } from "../features/inventory/service";
import { createRecipe, getRecipeById, previewRecipeDraft } from "../features/recipes/service";
import { allocateRecipeIngredientFromInventory, reserveRecipeInventoryAllocations, consumeRecipeInventoryAllocations, buildBrewBatchConsumeLinePlanEntries } from "../features/recipes/inventory-service";

const ownedUsers: string[] = [], ownedCatalog: string[] = [];
const temp = mkdtempSync("/tmp/nb-catalog-integration-");
const account = async () => {
  const user=await completeEmailSignIn({email:`qa.catalog.${randomUUID()}@localhost`});
  ownedUsers.push(user.id);return user.id;
};
const catalog = async (type: string, attributes: Record<string,unknown>, extra: Record<string,unknown> = {}) => {
  const id=`qa-catalog-${randomUUID()}`;ownedCatalog.push(id);
  return (await createIngredient({id,type,nameRu:"Проверка каталога",attributes,...extra},"catalog-integration"))!;
};
const variant = (id: string, amount: number) => ({id,packageAmount:amount,packageUnit:"pcs",stockContentAmount:amount,stockContentUnit:"item",isDefaultForStock:false});
const recipeInput = (rows: any[], volume=20) => ({title:"Проверка согласованных правок",publicationState:"private",batchSizeEnteredQuantity:volume,batchSizeEnteredUnit:"l",efficiency:75,boilTimeMinutes:60,calculationMeta:{bitternessFormula:"tinseth_classic"},ingredients:rows});
const recipeLine = (id: string,type: string,quantity:number,unit:string,extra:Record<string,unknown>={}) => ({ingredientCatalogItemId:id,type,amountEnteredQuantity:quantity,amountEnteredUnit:unit,stage:type==="hop"?"boil":type==="consumable"?"packaging":"mash",timeOffset:type==="hop"?60:null,...extra});

beforeAll(()=>{
  if(process.env.NODE_ENV==="production" || !["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
});
afterAll(async()=>{
  if(ownedUsers.length) await db.delete(users).where(inArray(users.id,ownedUsers));
  if(ownedCatalog.length) await db.delete(ingredients).where(inArray(ingredients.id,ownedCatalog));
  rmSync(temp,{recursive:true,force:true});
  await pool.end();
});

describe("approved ingredient changes in PostgreSQL",()=>{
  it("adds a selected package, prices each piece, reserves and consumes the same quantity",async()=>{
    const userId=await account();
    const package100=`qa-pack-${randomUUID()}`,package1000=`qa-pack-${randomUUID()}`;
    const caps=await catalog("consumable",{picker_group:"packaging",family_key:"crown_caps_26mm",closure_standard:"26mm crown"},{category:"consumable",itemKind:"packaging_item",sourceCategory:"packaging",quantityDefaults:{quantity_model:"pieces",stock_unit_default:"item",recipe_unit_default:"item",stock_modes_supported:["package","pieces"]},packageVariants:[variant(package100,100),variant(package1000,1000)]});
    const stock=await addCatalogIngredientToInventory(userId,{ingredientCatalogItemId:caps.id,packageVariantId:package1000,enteredQuantity:1,enteredUnit:"pack",priceInputMode:"total",priceInputAmountMinor:10000,priceInputCurrency:"RUB"},{skipCreationGate:true});
    expect(stock).toMatchObject({packageVariantId:package1000,normalizedQuantity:1000,normalizedUnit:"item",purchaseQuantityNormalized:1000,purchaseQuantityNormalizedUnit:"item",normalizedUnitCostMinorRub:10});
    const recipe=await createRecipe(userId,recipeInput([recipeLine(caps.id,"consumable",100,"item")]));
    await allocateRecipeIngredientFromInventory({userId,recipeId:recipe.id,recipeIngredientPersistentKey:recipe.ingredients[0].persistentKey,inventoryItemId:stock.id});
    await reserveRecipeInventoryAllocations(userId,recipe.id);
    await consumeRecipeInventoryAllocations(userId,recipe.id);
    const consumed=(await db.query.userIngredients.findFirst({where:eq(userIngredients.id,stock.id)}))!;
    expect(consumed).toMatchObject({normalizedQuantity:900,normalizedUnit:"item",normalizedUnitCostMinorRub:10,packageVariantId:package1000});
    const edited=await updateInventoryItem(userId,stock.id,{ingredientCatalogItemId:caps.id,enteredQuantity:900,enteredUnit:"item",priceInputMode:"total",priceInputAmountMinor:10000,priceInputCurrency:"RUB",notes:"Изменено только примечание"});
    expect(edited).toMatchObject({purchaseQuantityNormalized:1000,normalizedUnitCostMinorRub:10,normalizedQuantity:900,packageVariantId:package1000});
    await updateIngredient(caps.id,{descriptionRu:"Новое описание"},"catalog-integration");
    expect((await getIngredientById(caps.id))?.packageVariants.map(v=>v.id)).toEqual([package100,package1000]);
    expect((await db.query.userIngredients.findFirst({where:eq(userIngredients.id,stock.id)}))?.packageVariantId).toBe(package1000);
    await expect(updateIngredient(caps.id,{packageVariants:[]},"catalog-integration")).rejects.toThrow("PACKAGE_VARIANT_IN_USE");
    const other = await catalog("consumable", {});
    await expect(updateIngredient(other.id, { packageVariants: [variant(package1000, 1000)] }, "catalog-integration")).rejects.toThrow("PACKAGE_VARIANT_OWNERSHIP");
    expect((await db.query.userIngredients.findFirst({where:eq(userIngredients.id,stock.id)}))?.packageVariantId).toBe(package1000);
  });

  it("keeps package coefficients on old stock when the source changes, using the new size for new stock",async()=>{
    const userId=await account(),packageId=`qa-pack-${randomUUID()}`;
    const item=await catalog("consumable",{picker_group:"packaging",family_key:"test_caps",closure_standard:"26mm crown"},{category:"consumable",itemKind:"packaging_item",sourceCategory:"packaging",quantityDefaults:{stock_unit_default:"item",stock_modes_supported:["package","pieces"]},packageVariants:[variant(packageId,1000)]});
    const old=await addCatalogIngredientToInventory(userId,{ingredientCatalogItemId:item.id,packageVariantId:packageId,enteredQuantity:1,enteredUnit:"pack"},{skipCreationGate:true});
    await updateIngredient(item.id,{packageVariants:[variant(packageId,100)]},"catalog-integration");
    const added=await addCatalogIngredientToInventory(userId,{ingredientCatalogItemId:item.id,packageVariantId:packageId,enteredQuantity:1,enteredUnit:"pack"},{skipCreationGate:true});
    const inventory=await listInventoryForUser(userId);
    expect(inventory.find(row=>row.id===old.id)?.source.packageVariant?.stockContentAmount).toBe(1000);
    expect(inventory.find(row=>row.id===old.id)?.source.packageVariants?.find(variant => variant.id === packageId)?.stockContentAmount).toBe(1000);
    expect(inventory.find(row=>row.id===added.id)?.source.packageVariant?.stockContentAmount).toBe(100);
    await updateInventoryQuantity(userId,old.id,{enteredQuantity:0.5,enteredUnit:"pack"});
    expect((await db.query.userIngredients.findFirst({where:eq(userIngredients.id,old.id)}))?.normalizedQuantity).toBe(500);
  });

  it("round-trips milligrams through editing, reservation, and actual consumption",async()=>{
    const userId=await account();
    const salt=await catalog("water_treatment",{formula:"NaCl",calculation_formula:"NaCl",unit_preferred:"g"},{itemKind:"chemical",sourceCategory:"mineral_salt"});
    const stock=await addCatalogIngredientToInventory(userId,{ingredientCatalogItemId:salt.id,enteredQuantity:40,enteredUnit:"mg"},{skipCreationGate:true});
    expect(stock.normalizedQuantity).toBe(0.04);
    const recipe=await createRecipe(userId,recipeInput([recipeLine(salt.id,"water_treatment",10,"mg")]));
    await allocateRecipeIngredientFromInventory({userId,recipeId:recipe.id,recipeIngredientPersistentKey:recipe.ingredients[0].persistentKey,inventoryItemId:stock.id});
    await reserveRecipeInventoryAllocations(userId,recipe.id);
    await consumeRecipeInventoryAllocations(userId,recipe.id);
    expect((await db.query.userIngredients.findFirst({where:eq(userIngredients.id,stock.id)}))?.normalizedQuantity).toBe(0.03);
    const edited=await updateInventoryItem(userId,stock.id,{ingredientCatalogItemId:salt.id,enteredQuantity:30,enteredUnit:"mg",notes:"Малая масса сохранена"});
    expect(edited).toMatchObject({normalizedQuantity:0.03,normalizedUnit:"g",enteredQuantity:30,enteredUnit:"mg"});
    const other=await account();
    await expect(updateInventoryQuantity(other,stock.id,{enteredQuantity:100,enteredUnit:"g"})).rejects.toThrow("NOT_FOUND");
  });

  it("uses identical physics in wizard preview, saving, reopening, and volume scaling",async()=>{
    const userId=await account();
    const base=await catalog("malt",{extract_pct_dry_basis:81.5,color_ebc_min:4,color_ebc_max:7,malt_type:"base"});
    const yeast=await catalog("yeast",{attenuation_pct_typical:15,yeast_family:"low_no_alcohol",form:"dry"});
    const hulls=await catalog("fermentable",{extract_pct_dry_basis:0.1,color_lovibond:0.1,gravity_calc_mode:"excluded",functional_role:"process_only"});
    const hop=await catalog("hop",{alpha_acid_pct_typical:null,hop_form:"standard"});
    const rows=[recipeLine(base.id,"malt",5,"kg"),recipeLine(yeast.id,"yeast",11.5,"g"),recipeLine(hulls.id,"fermentable",500,"g"),recipeLine(hop.id,"hop",25,"g")];
    const preview=await previewRecipeDraft(userId,recipeInput(rows));
    const saved=await createRecipe(userId,recipeInput(rows));
    const reopened=await getRecipeById(userId,saved.id);
    for(const key of ["og","fg","color","ibu"] as const) expect(reopened[key]).toBe(preview[key]);
    expect(reopened).toMatchObject({og:1.059,fg:1.05,color:5,ibu:null,bitternessEstimate:{status:"unavailable",missing:[{reason:"hop_alpha"}]}});
    const scaled=await previewRecipeDraft(userId,recipeInput(rows.map(row=>({...row,amountEnteredQuantity:row.amountEnteredQuantity*2})),40));
    expect(scaled).toMatchObject({og:preview.og,fg:preview.fg,color:preview.color,ibu:preview.ibu});
    const known=await previewRecipeDraft(userId,recipeInput(rows.map(row=>row.ingredientCatalogItemId===hop.id?{...row,stepMeta:{alphaAcidPct:10}}:row)));
    expect(known.ibu).toBeGreaterThan(0);expect(known.bitternessEstimate?.missing).toEqual([]);
  });

  it("preserves editor fields, disabled aliases, sources, archive status and IDs on repeated sync",async()=>{
    const id=`qa-catalog-${randomUUID()}`;ownedCatalog.push(id);
    const sourcePath=temp+"/malt.json";
    let source={id,name_ru:"Первое имя",type:"malt",malt_type:"base",color_ebc_min:4,color_ebc_max:6,protein_pct:10,aliases_en:["Seed alias"],sources:[{kind:"official",label:"Seed source",url:"https://source.example/spec"}]};
    writeFileSync(sourcePath,JSON.stringify([source]));
    const manifest=[{fileName:relative("/home/dopefish/projects/nb/ingredients/new",sourcePath),type:"malt" as const}];
    await seedCatalogFromSources(manifest);
    const first=(await getIngredientById(id))!;
    await updateIngredient(id,{isActive:false,attributes:{...first.attributes,protein_pct:12,_catalog_status:"archived"},aliases:[...first.aliases.map(a=>({...a,isEnabled:false})),{locale:"ru",alias:"Ручное название",source:"manual",isEnabled:true}],sources:[...first.sources,{kind:"manual",label:"Ручной источник",url:"https://editor.example/spec",sourceBasis:"manual"}]},"catalog-integration");
    source={...source,name_ru:"Обновлённое имя",color_ebc_min:7,color_ebc_max:8,protein_pct:11};writeFileSync(sourcePath,JSON.stringify([source]));
    const result=await seedCatalogFromSources(manifest);await seedCatalogFromSources(manifest);
    const after=(await getIngredientById(id))!;
    expect(after).toMatchObject({isActive:false,nameRu:"Обновлённое имя",attributes:{protein_pct:12,color_ebc_min:7,color_ebc_max:8,_catalog_status:"archived"}});
    expect(after.aliases.find(alias=>alias.alias==="Seed alias")?.isEnabled).toBe(false);
    expect(after.aliases.some(alias=>alias.alias==="Ручное название")).toBe(true);
    expect(after.sources.some(source=>source.url==="https://editor.example/spec")).toBe(true);
    expect(result.conflicts.map(conflict=>conflict.field)).toContain("attributes.protein_pct");
  });

  it("rejects water processing methods at the server boundary",async()=>{
    const userId=await account();
    const method=await catalog("water_treatment",{calculation_support:"not_an_additive"},{inventoryEnabled:false,itemKind:"method"});
    await expect(addCatalogIngredientToInventory(userId,{ingredientCatalogItemId:method.id,enteredQuantity:10,enteredUnit:"g"},{skipCreationGate:true})).rejects.toThrow("INGREDIENT_NOT_STOCKABLE");
    await expect(createRecipe(userId, recipeInput([recipeLine(method.id, "water_treatment", 10, "g")]))).rejects.toThrow("INGREDIENT_NOT_STOCKABLE");
    const copy = await createUserCustomIngredient(userId, { type: "water_treatment", category: "water_treatment", displayName: "Моя копия метода", derivedFromIngredientId: method.id, unitPreferred: "g" });
    await expect(addCustomIngredientToInventory(userId, { userCustomIngredientId: copy.id, enteredQuantity: 10, enteredUnit: "g" }, { skipCreationGate: true })).rejects.toThrow("INGREDIENT_NOT_STOCKABLE");
    await expect(createRecipe(userId, recipeInput([{ userCustomIngredientId: copy.id, type: "water_treatment", amountEnteredQuantity: 10, amountEnteredUnit: "g", stage: "mash" }]))).rejects.toThrow("INGREDIENT_NOT_STOCKABLE");
  });
  it("moves duplicate references and favorites without changing physical stock or purchase cost", async () => {
    const userId = await account();
    const source = await catalog("malt", { color_ebc_min: 15, color_ebc_max: 20, extract_pct_dry_basis: 81 }, { nameEn: "Dark Wheat" });
    const target = await catalog("malt", { color_ebc_min: 15, color_ebc_max: 20, extract_pct_dry_basis: 81 }, { nameEn: "Wheat Malt Dark" });
    const stock = await addCatalogIngredientToInventory(userId, { ingredientCatalogItemId: source.id, enteredQuantity: 1, enteredUnit: "kg", priceInputMode: "total", priceInputAmountMinor: 10000, priceInputCurrency: "RUB" }, { skipCreationGate: true });
    const recipe = await createRecipe(userId, recipeInput([recipeLine(source.id, "malt", 100, "g")]));
    await db.insert(userIngredientPreferences).values([
      { userId, ingredientCatalogItemId: source.id, isFavorite: true },
      { userId, ingredientCatalogItemId: target.id, isFavorite: false }
    ]);
    const [link] = await db.insert(userIngredientPurchaseLinks).values({ userId, ingredientCatalogItemId: source.id, url: "https://shop.example/wheat", normalizedUrl: "https://shop.example/wheat" }).returning();
    await mergeDuplicateIngredients(source.id, target.id, "catalog-integration");
    const after = (await db.query.userIngredients.findFirst({ where: eq(userIngredients.id, stock.id) }))!;
    expect(after).toMatchObject({ ingredientCatalogItemId: target.id, normalizedQuantity: stock.normalizedQuantity, normalizedUnit: stock.normalizedUnit, purchasePriceMinor: stock.purchasePriceMinor, purchaseQuantityNormalized: stock.purchaseQuantityNormalized, normalizedUnitCostMinorRub: stock.normalizedUnitCostMinorRub });
    expect((await getRecipeById(userId, recipe.id)).ingredients[0].ingredientCatalogItemId).toBe(target.id);
    expect(await db.query.userIngredientPreferences.findMany({ where: eq(userIngredientPreferences.userId, userId) })).toMatchObject([{ ingredientCatalogItemId: target.id, isFavorite: true }]);
    expect(await db.query.userIngredientPurchaseLinks.findFirst({ where: eq(userIngredientPurchaseLinks.id, link.id) })).toMatchObject({ ingredientCatalogItemId: target.id });
    expect(await getIngredientById(source.id)).toMatchObject({ isActive: false, attributes: { _merged_into_id: target.id } });
    expect((await getIngredientById(target.id))?.aliases.some(alias => alias.alias === "Dark Wheat")).toBe(true);
  });

  it("never proposes different spices, closures or calcium chloride hydrates as substitutes", async () => {
    const userId = await account();
    const pairs = [
      ["consumable", { picker_group: "spices", product_identity: "coriander", physical_form: "seed" }, { picker_group: "spices", product_identity: "cinnamon", physical_form: "ground" }, "g"],
      ["consumable", { picker_group: "packaging", family_key: "crown_caps", closure_standard: "26mm crown" }, { picker_group: "packaging", family_key: "crown_caps", closure_standard: "29mm crown" }, "item"],
      ["water_treatment", { formula: "CaCl2", calculation_formula: "CaCl2" }, { formula: "CaCl2", calculation_formula: "CaCl2·2H2O" }, "g"]
    ] as const;
    for (const [type, required, other, unit] of pairs) {
      const recipeItem = await catalog(type, required, type === "consumable" ? { category: "consumable", itemKind: unit === "item" ? "packaging_item" : "spice", quantityDefaults: { stock_unit_default: unit, recipe_unit_default: unit } } : { itemKind: "chemical" });
      const stockItem = await catalog(type, other, type === "consumable" ? { category: "consumable", itemKind: unit === "item" ? "packaging_item" : "spice", quantityDefaults: { stock_unit_default: unit, recipe_unit_default: unit } } : { itemKind: "chemical" });
      const stock = await addCatalogIngredientToInventory(userId, { ingredientCatalogItemId: stockItem.id, enteredQuantity: 100, enteredUnit: unit }, { skipCreationGate: true });
      const recipe = await createRecipe(userId, recipeInput([recipeLine(recipeItem.id, type, 10, unit)]));
      const plan = await buildBrewBatchConsumeLinePlanEntries(userId, recipe.id);
      expect(plan.entries[0].substitutes.map(item => item.itemId)).not.toContain(stock.id);
      await expect(allocateRecipeIngredientFromInventory({ userId, recipeId: recipe.id, recipeIngredientPersistentKey: recipe.ingredients[0].persistentKey, inventoryItemId: stock.id })).rejects.toThrow("INCOMPATIBLE_INVENTORY_SOURCE");
      expect((await db.query.userIngredients.findFirst({ where: eq(userIngredients.id, stock.id) }))?.normalizedQuantity).toBe(100);
    }
  });

  it("keeps an unknown dry yeast package as a package and resolves a single declared package by its ID", async () => {
    const userId = await account();
    const unknown = await catalog("yeast", { form: "dry", attenuation_pct_typical: 75 });
    const stock = await addCatalogIngredientToInventory(userId, { ingredientCatalogItemId: unknown.id, enteredQuantity: 1, enteredUnit: "pack" }, { skipCreationGate: true });
    expect(stock).toMatchObject({ enteredQuantity: 1, enteredUnit: "pack", normalizedQuantity: 1, normalizedUnit: "pack" });
    const packageId = `qa-pack-${randomUUID()}`;
    const declared = await catalog("yeast", { form: "dry" }, { packageVariants: [{ id: packageId, packageAmount: 11.5, packageUnit: "g", stockContentAmount: 11.5, stockContentUnit: "g", isDefaultForStock: true }] });
    const known = await addCatalogIngredientToInventory(userId, { ingredientCatalogItemId: declared.id, enteredQuantity: 1, enteredUnit: "pack" }, { skipCreationGate: true });
    expect(known).toMatchObject({ packageVariantId: packageId, normalizedQuantity: 11.5, normalizedUnit: "g" });
  });

  it("preserves an old unlinked package coefficient when the current source has a different size", async () => {
    const userId = await account();
    const yeast = await catalog("yeast", { form: "dry", package_size: 12, package_unit: "g" });
    const stock = await addCatalogIngredientToInventory(userId, { ingredientCatalogItemId: yeast.id, enteredQuantity: 11, enteredUnit: "g" }, { skipCreationGate: true });
    await db.update(userIngredients).set({ enteredQuantity: 1, enteredUnit: "pack", properties: { _legacy_pack_content_snapshot: { stockContentAmount: 11, stockContentUnit: "g" } } }).where(eq(userIngredients.id, stock.id));
    const listed = (await listInventoryForUser(userId)).find(row => row.id === stock.id)!;
    expect(listed.source.technicalData).toMatchObject({ packageSize: 11, packageUnit: "g" });
    await updateInventoryQuantity(userId, stock.id, { enteredQuantity: 0.5, enteredUnit: "pack" });
    expect((await db.query.userIngredients.findFirst({ where: eq(userIngredients.id, stock.id) }))?.normalizedQuantity).toBe(5.5);
    const edited = await updateInventoryItem(userId, stock.id, { ingredientCatalogItemId: yeast.id, enteredQuantity: 0.5, enteredUnit: "pack", notes: "Историческая фасовка сохранена" });
    expect(edited).toMatchObject({ normalizedQuantity: 5.5, normalizedUnit: "g", enteredQuantity: 0.5, enteredUnit: "pack" });
  });

});
