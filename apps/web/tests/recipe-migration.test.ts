import { buildRecipeWaterPlanResult } from '../features/recipes/water-plan';
import { cloneRecipeWaterPlanMeta } from '../components/recipes/recipe-designer/helpers';
import { describe, expect, it } from 'vitest';
import { exportRecipeToBeerXml, importBeerXmlToCanonicalRecipe, importBeerXmlToCanonicalRecipes } from '../features/recipes/interop/beerxml';
import { importBrewfatherJsonToCanonicalRecipe, importBrewfatherJsonToCanonicalRecipes } from '../features/recipes/interop/brewfather-json';
import { buildImportRecipeSummary } from '../components/recipes/import-export-modal';
import { scaleRecipeDetailForBrew, scaleRecipeWaterPlan } from '../features/recipes/scale';

const ingredient = (changes: Record<string, unknown> = {}) => ({
  id:'line-1', type:'hop', ingredientCategory:'hop', ingredientDisplayName:'Citra',
  ingredientDisplayNameSnapshot:'Citra', ingredientTechnicalData:{type:'hop',alphaAcidPctTypical:12,hopForm:'pellet'},
  amountEnteredQuantity:50, amountEnteredUnit:'g', stage:'boil', timeOffset:60,
  stepMeta:{useType:'boil',timeMinutes:60}, externalImportMeta:null, ...changes
});
const recipe = (changes: Record<string, unknown> = {}) => ({
  title:'QA IPA', styleId:'21a-american-ipa', batchSizeNormalizedQuantity:20000,batchSizeNormalizedUnit:'ml',
  boilTimeMinutes:60,efficiency:75,description:'Public description',authorNotes:'Private note',
  og:1.05,fg:1.01,abv:5.2,ibu:40,color:6,
  processMeta:{mashProfile:{steps:[{id:'m1',name:'Mash',temperatureC:66,durationMinutes:60}]},
    fermentationProfile:{primaryTemperatureC:19,primaryDurationDays:12,extraSteps:[],coldCrash:{enabled:true,temperatureC:2,durationDays:3},conditioning:{enabled:false,temperatureC:12,durationDays:14}}},
  calculationMeta:{bitternessFormula:'tinseth_whirlpool_v2',bitternessSettings:{}},
  waterPlanMeta:{setupEnabled:true,targetMashPh:5.4}, ingredients:[ingredient()], ...changes
}) as any;
const roundtrip = (changes: Record<string,unknown> = {}) => importBeerXmlToCanonicalRecipe(exportRecipeToBeerXml(recipe(changes)));

describe('Additional audit: intended preservation during import/export',()=>{
 it('preserves basic amount, gravity and mash step',()=>{
  const out=roundtrip(); expect(out.ingredients[0].amount).toBe(50);
  expect(out.importMeta?.importedStats).toMatchObject({og:1.05,fg:1.01});
  expect(out.processMeta).toMatchObject({mashProfile:{steps:[{temperatureC:66,durationMinutes:60}]}});
 });
 it('preserves BJCP style in exported BeerXML',()=>{
  expect(exportRecipeToBeerXml(recipe())).toContain('<STYLE>');
 });
 it('preserves dry hop duration of four days',()=>{
  const out=roundtrip({ingredients:[ingredient({stage:'fermentation',timeOffset:null,stepMeta:{useType:'dry_hop',durationDays:4}})]});
  expect(out.ingredients[0].stepMeta?.durationDays).toBe(4);
 });
 it('preserves whirlpool temperature of 80 C',()=>{
  const out=roundtrip({ingredients:[ingredient({stage:'whirlpool',timeOffset:20,stepMeta:{useType:'whirlpool',timeMinutes:20,temperatureC:80}})]});
  expect(out.ingredients[0].stepMeta?.temperatureC).toBe(80);
 });
 it('preserves water treatment classification',()=>{
  const out=roundtrip({ingredients:[ingredient({type:'water_treatment',ingredientCategory:'water_treatment',ingredientDisplayName:'Gypsum',amountEnteredQuantity:5,stage:'mash',stepMeta:null})]});
  expect(out.ingredients[0].category).toBe('water_treatment');
 });
 it('preserves liquid additive volume 10 ml',()=>{
  const out=roundtrip({ingredients:[ingredient({type:'consumable',ingredientCategory:'consumable',ingredientDisplayName:'Liquid additive',amountEnteredQuantity:10,amountEnteredUnit:'ml',stage:'boil',stepMeta:null})]});
  const item=out.ingredients[0]; expect(item.unit).toBe('ml'); expect(item.amount).toBe(10);
 });
 it('preserves liquid yeast volume 100 ml',()=>{
  const out=roundtrip({ingredients:[ingredient({type:'yeast',ingredientCategory:'yeast',ingredientDisplayName:'Liquid yeast',ingredientTechnicalData:{type:'yeast',form:'liquid'},amountEnteredQuantity:100,amountEnteredUnit:'ml',stage:'fermentation',stepMeta:null})]});
  const item=out.ingredients[0]; expect(item.unit).toBe('ml'); expect(item.amount).toBe(100);
 });
 it('preserves recipe title with quotes and apostrophe',()=>{
  expect(roundtrip({title:'QA "IPA" & Brewer\'s <test>'}).title).toBe('QA "IPA" & Brewer\'s <test>');
 });
 it('keeps private notes separate from public description',()=>{
  expect(roundtrip().description).toBe('Public description');
 });
 it('preserves fermentation profile',()=>{
  expect(roundtrip().processMeta).toHaveProperty('fermentationProfile');
 });
 it('preserves water plan',()=>{
  expect(roundtrip().waterPlanMeta).toMatchObject({setupEnabled:true,targetMashPh:5.4});
 });
 it('rejects broken XML instead of reading it as a recipe',()=>{
  expect(()=>importBeerXmlToCanonicalRecipe('<RECIPES><RECIPE><NAME>Broken</NAME><HOPS><HOP><NAME>Citra</NAME><AMOUNT>0.05</AMOUNT></HOP></HOPS>')).toThrow();
 });
 it('preserves volume of standard BeerXML liquid yeast',()=>{
  const out=importBeerXmlToCanonicalRecipe('<RECIPES><RECIPE><NAME>Liquid yeast</NAME><YEASTS><YEAST><NAME>Liquid</NAME><AMOUNT>0.1</AMOUNT><AMOUNT_IS_WEIGHT>FALSE</AMOUNT_IS_WEIGHT><FORM>Liquid</FORM></YEAST></YEASTS></RECIPE></RECIPES>');
  expect(out.ingredients[0]).toMatchObject({amount:0.1,unit:'l'});
 });
 it('uses Brewfather fallback for null batchSize',()=>{
  const out=importBrewfatherJsonToCanonicalRecipe({name:'BF',batchSize:null,batchSizeL:20,fermentables:[{name:'Pale',amount:4,type:'Grain'}]});
  expect(out.batchSizeL).toBe(20);
 });
 it('shows absent stats as missing instead of negative gravity',()=>{
  const summary=buildImportRecipeSummary('beerxml','<RECIPES><RECIPE><NAME>QA Missing stats</NAME><FERMENTABLES><FERMENTABLE><NAME>Malt</NAME><TYPE>Grain</TYPE><AMOUNT>4</AMOUNT></FERMENTABLE></FERMENTABLES></RECIPE></RECIPES>','plato');
  expect(summary?.ok).toBe(true);
  if(summary?.ok) expect(summary.summary.stats).toBe('расчётные показатели в файле не указаны');
 });
 it('preserves fermentation steps from Brewfather',()=>{
  const out=importBrewfatherJsonToCanonicalRecipe({name:'BF',batchSize:20,fermentables:[{name:'Pale',amount:4,type:'Grain'}],fermentation:{steps:[{name:'Primary',stepTemp:18,stepTime:7}]}});
  expect(out.processMeta).toHaveProperty('fermentationProfile');
 });
 it('scales manual water salt doses along with brew volume',()=>{
  const base=recipe({batchSizeEnteredQuantity:20,batchSizeEnteredUnit:'l',waterPlanMeta:{setupEnabled:true,engine:'advanced_manual',manualSaltAdditions:[{salt:'gypsum',grams:5,target:'all'}]},ingredients:[ingredient({amountNormalizedQuantity:50,amountNormalizedUnit:'g'})]});
  const scaled=scaleRecipeDetailForBrew(base,{targetLitres:40});
  expect(scaled.ingredients[0].amountEnteredQuantity).toBe(100);
  expect(scaled.waterPlanMeta?.manualSaltAdditions[0].grams).toBe(10);
 });
});

const bfRecipe = (name = "Migration IPA") => ({ name, batchSize: 20, fermentables: [{ name: "Pale", type: "Grain", amount: 4, color: 3, potential: 1.037 }], hops: [{ name: "Citra", amount: 50, use: "Dry Hop", time: 2.5, timeUnit: "day", alpha: 12 }], yeasts: [{name: "Liquid", amount: 100, unit: "ml", form: "Liquid"}] });

describe("Brewfather migration libraries", () => {
 it.each([
   [bfRecipe(), 1], [[bfRecipe("One"), bfRecipe("Two")], 2],
   [{recipes: [bfRecipe("One"), bfRecipe("Two")], inventory: {}}, 2],
   [{data: {recipes: {a: bfRecipe("One"), b: bfRecipe("Two")}}}, 2],
 ])("reads supported JSON containers", (input, count) => {
   const recipes = importBrewfatherJsonToCanonicalRecipes(input);
   expect(recipes).toHaveLength(count);
   expect(recipes.every((recipe) => recipe.ingredients.length === 3)).toBe(true);
 });
 it("does not silently take the first recipe in the single-recipe API", () => {
   expect(() => importBrewfatherJsonToCanonicalRecipe([bfRecipe(), bfRecipe()])).toThrow("IMPORT_MULTIPLE_RECIPES");
 });
 it("rejects a malformed entry and identifies its position", () => {
   expect(() => importBrewfatherJsonToCanonicalRecipes([bfRecipe(), null])).toThrow("IMPORT_RECIPE_ERROR: 2");
 });
 it("rejects unknown units rather than changing cell counts into packages", () => {
   expect(() => importBrewfatherJsonToCanonicalRecipes({...bfRecipe(), yeasts: [{ name: "Cells", amount: 100, unit: "billion cells" }]})).toThrow("UNSUPPORTED_IMPORT_UNIT");
 });
 it("limits the library size", () => {
   expect(() => importBrewfatherJsonToCanonicalRecipes(Array.from({length: 101}, () => bfRecipe()))).toThrow("IMPORT_TOO_MANY_RECIPES");
 });
 it("converts SRM color and SG extract potential using documented source units", () => {
   const malt = importBrewfatherJsonToCanonicalRecipe(bfRecipe()).ingredients[0]!;
   expect(malt.fermentableColorEbc).toBeCloseTo(5.91);
   expect(malt.fermentableExtractYieldPct).toBeCloseTo(80.06, 1);
 });
 it("preserves fractional dry hop days, volume yeast, and fermentation order", () => {
   const out = importBrewfatherJsonToCanonicalRecipe({...bfRecipe(), fermentation:{steps:[
     {name: "Primary", stepTemp: 18, stepTime: 7}, {name: "Conditioning", stepTemp: 20, stepTime: 0.5},
     {name: "Dry Hop", stepTemp: 18, stepTime: 3}, {name: "Cold Crash", stepTemp: 3, stepTime: 2}
   ]}});
   expect(out.ingredients.find((line) => line.category === "yeast")).toMatchObject({amount: 100, unit: "ml"});
   expect(out.ingredients.find((line) => line.category === "hop")?.stepMeta?.durationDays).toBe(2.5);
   expect(out.processMeta).toMatchObject({fermentationProfile:{primaryTemperatureC:18,primaryDurationDays:7,
     extraSteps:[{name:"Conditioning",durationDays:0.5},{name:"Dry Hop",durationDays:3}],coldCrash:{enabled:true,temperatureC:3,durationDays:2}}});
 });
 it("imports water profiles, stage salt doses, acid dose and equipment", () => {
   const out = importBrewfatherJsonToCanonicalRecipe({...bfRecipe(), equipment:{name:"Kettle",grainAbsorptionRate:0.8, waterGrainRatio:3.2, mashTunDeadSpace:1,hopUtilization:100},
    water:{source:{calcium:30,magnesium:5,sodium:10,chloride:20,sulfate:50,bicarbonate:40,ph:7}, target:{calcium:100,sulfate:150},mashWaterAmount:16,spargeWaterAmount:12,
     mashAdjustments:{calciumSulfate:3,calciumChloride:2,acids:[{type:"lactic",amount:1.5,concentration:80}]},spargeAdjustments:{calciumSulfate:1},totalAdjustments:{calciumSulfate:4,calciumChloride:2}}
   });
   expect(out.equipmentProfileSnapshot).toMatchObject({grainAbsorptionLPerKg:0.8,mashThicknessLPerKg:3.2,mashTunDeadspaceL:1,hopUtilizationFactor:1});
   expect(out.waterPlanMeta).toMatchObject({engine:"advanced_manual",mashWaterVolumeL:16,spargeWaterVolumeL:12,totalWaterVolumeL:28,sourceProfile:{ca:30,so4:50},manualSaltAdditions:[{salt:"gypsum",grams:3,target:"mash"},{salt:"calcium_chloride",grams:2,target:"mash"},{salt:"gypsum",grams:1,target:"sparge"}]});
   expect(out.ingredients.at(-1)).toMatchObject({category:"water_treatment",unit:"ml",amount:1.5});
   expect(out.importMeta?.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Кислоты")]));
 });
 it("keeps imported acid doses without silently calculating an extra acid dose", () => {
   const out = importBrewfatherJsonToCanonicalRecipe({...bfRecipe(),mash:{ph:5.4},water:{source:{calcium:30,bicarbonate:100,ph:7},mashWaterAmount:16,spargeWaterAmount:12,mashAdjustments:{calciumSulfate:3,acids:[{type:"lactic",amount:2,concentration:80}]}}});
   const water = cloneRecipeWaterPlanMeta(out.waterPlanMeta as any);
   expect(water.mashAcidificationEnabled).toBe(false);
   const result = buildRecipeWaterPlanResult({waterPlanMeta:water,grainKg:4,fallbackBatchVolumeL:20});
   expect(result.mashAcidAddition).toBeNull();
   expect(out.ingredients.at(-1)).toMatchObject({amount:2,unit:"ml"});
 });
 it("keeps original recipe fields available to the owner for unsupported features", () => {
   const source = {...bfRecipe(), carbonation:2.4, fermentation:{steps:[{name:"Primary",stepTemp:18,stepTime:7,pressure:10,ramp:0.5}]}};
   const out = importBrewfatherJsonToCanonicalRecipe(source);
   expect(out.importMeta?.originalRecipe).toEqual(source);
   expect(out.importMeta?.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Давление"), expect.stringContaining("карбонизация")]));
 });
 it("previews a collection and its warnings before saving", () => {
   const out = buildImportRecipeSummary("brewfather_json", JSON.stringify({recipes:[bfRecipe("One"),{...bfRecipe("Two"),carbonation:2.4}]}));
   expect(out?.ok).toBe(true);
   if (out?.ok) {expect(out.summary.recipes).toHaveLength(2);expect(out.summary.warnings.join(" ")).toContain("Two:");}
 });
 it("exports manual water salts for other programs without duplicating on native import", () => {
   const xml = exportRecipeToBeerXml(recipe({waterPlanMeta:{setupEnabled:true,engine:"advanced_manual",sourceProfileMode:"ro_distilled",manualSaltAdditions:[{salt:"gypsum",grams:5,target:"mash"}],mashWaterVolumeL:15,spargeWaterVolumeL:12}}));
   expect(xml).toContain("<NB_FROM_WATER_PLAN>TRUE</NB_FROM_WATER_PLAN>");expect(xml).toContain("<TYPE>Water Agent</TYPE>");
   const native = importBeerXmlToCanonicalRecipe(xml);
   expect(native.ingredients).toHaveLength(1);
   expect(native.waterPlanMeta).toMatchObject({manualSaltAdditions:[{salt:"gypsum",grams:5,target:"mash"}]});
   const standard = importBeerXmlToCanonicalRecipe(xml.replace(/<NB_WATER_PLAN>[\s\S]*?<\/NB_WATER_PLAN>/g,""));
   expect(standard.ingredients.find((line) => line.category === "water_treatment")).toMatchObject({amount:5,unit:"g"});
 });
 it("scales water volumes and salts while preserving concentrations", () => {
   const meta:any = {mashWaterVolumeL:15,spargeWaterVolumeL:12,totalWaterVolumeL:27,targetMashPh:5.4,sourceProfile:{ca:30},manualSaltAdditions:[{salt:"gypsum",grams:5,target:"mash"}]};
   expect(scaleRecipeWaterPlan(meta,2)).toMatchObject({mashWaterVolumeL:30,spargeWaterVolumeL:24,totalWaterVolumeL:54,targetMashPh:5.4,sourceProfile:{ca:30},manualSaltAdditions:[{grams:10}]});
   expect(meta.manualSaltAdditions[0].grams).toBe(5);
 });
});
describe("BeerXML structural parsing", () => {
 const xml = '<RECIPE><NAME><![CDATA[Brewer & <IPA>]]></NAME><HOPS><HOP><NAME>Citr&#97;</NAME><AMOUNT>0.05</AMOUNT><USE>Dry Hop</USE><TIME>3600</TIME></HOP></HOPS></RECIPE>';
 it("reads complete collections without silently dropping recipes", () => {
   const all = `<RECIPES>${xml}${xml}</RECIPES>`;
   expect(importBeerXmlToCanonicalRecipes(all)).toHaveLength(2);
   expect(() => importBeerXmlToCanonicalRecipe(all)).toThrow("IMPORT_MULTIPLE_RECIPES");
 });
 it("decodes CDATA and numeric entities", () => {
   const out = importBeerXmlToCanonicalRecipe(xml);
   expect(out.title).toBe("Brewer & <IPA>");expect(out.ingredients[0]?.name).toBe("Citra");
   expect(out.ingredients[0]?.stepMeta?.durationDays).toBe(2.5);
 });
 it.each(['<!DOCTYPE RECIPES [<!ENTITY secret "private">]><RECIPES/>', '<RECIPES><RECIPE></RECIPES>', '<RECIPES/>trailing', '<RECIPES/><RECIPES/>'])("rejects unsafe or malformed XML", (input) => {
   expect(() => importBeerXmlToCanonicalRecipes(input)).toThrow();
 });
});
