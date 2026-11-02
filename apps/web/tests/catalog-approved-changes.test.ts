import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeStyleStatsBlock } from "../components/recipes/recipe-designer/recipe-style-stats-block";
import { describe, expect, it } from "vitest";
import { reconcileCatalogSeed, markCatalogEditorialOverrides } from "@nb/db";
import { defaultSystemCurrencyRates } from "../features/system/currency";
import { convertWeight } from "@nb/brewing-core";
import { catalogSeedManifest, prepareCatalogSeedFile } from "../../../packages/db/scripts/catalog-seed";
import { buildCatalogIngredientLinkage } from "../features/ingredients/source-linkage";
import { extractIngredientTechnicalData, getIngredientColorLovibond, getIngredientPotentialPpg } from "../features/ingredients/technical-fields";
import { formatCatalogColorEbc, visibleCatalogAliases, canonicalManufacturerLabel, translateHopAroma } from "../features/ingredients/catalog-display";
import { buildMaltBrowseOptions, groupConfirmedHopSuppliers, matchesMaltBrowseFilters } from "../features/ingredients/catalog-browse";
import { resolveIngredientMatchKey } from "../features/ingredients/match-group";
import { convertCalciumChlorideHydrationDose } from "../features/ingredients/water-treatment";
import { createIngredientRanker } from "../features/ingredients/ranking";
import { calculateRecipeDetailStats } from "../features/recipes/service";
import { calculateRecipeFgEstimate } from "../features/recipes/fg-estimate";
import { calculateVerifiedExtractIbu } from "../features/recipes/bitterness-completeness";
import { resolveHumanFacingInventoryUnitProfile, normalizeInventoryMeasurement, getInventoryUnitInputStep } from "../features/inventory/units";
import { formatInventoryQuantityInputValue, formatInventoryQuantityForDisplay, resolveInventoryMeasurementForDisplay } from "../features/inventory/display";
import { normalizeInventoryMeasurementWithPack, resolveInventoryItemPackEquivalent, convertInventoryNormalizedToUnit } from "../features/inventory/pack";
import { normalizeInventoryPurchaseContext } from "../features/inventory/purchase-cost";
import { buildCatalogIngredientPayload } from "../components/inventory/catalog-ingredient-form";
import { calculatorDefinitionBySlug } from "../features/calculators/definitions";
import { buildInitialPreview } from "../components/recipes/recipe-designer/helpers";

const prepared = catalogSeedManifest.flatMap(prepareCatalogSeedFile);
const ingredient = (id: string) => prepared.find((entry) => entry.ingredient.id === id)!.ingredient;
const card = (id: string): any => {
  const entry = prepared.find((row) => row.ingredient.id === id)!;
  const row = entry.ingredient;
  return { ...row, ...buildCatalogIngredientLinkage(row as any), id, source:"catalog", nameRu:row.nameRu, nameEn:row.nameEn,
    primaryLabelRu:row.nameRu ?? row.nameEn, secondaryLabelRu:row.nameEn,
    aliases:entry.aliases, packageVariants:entry.packageVariants, countryCode:row.countryCode };
};
const line = (id: string, grams: number, type = "malt", stepMeta: Record<string,unknown> = {}): any => ({
  id, type, ingredientCategory:type === "hop" ? "hop" : type === "yeast" ? "yeast" : "fermentable",
  ingredientTechnicalData:extractIngredientTechnicalData(ingredient(id)), ingredientDisplayName:id,
  amountNormalizedQuantity:grams, amountNormalizedUnit:"g", stage:type === "hop" ? "boil" : "mash", timeOffset:60, stepMeta
});
const recipeStats = (ingredients: any[], formula = "tinseth_classic") => calculateRecipeDetailStats({
  batchSizeNormalizedQuantity:20000,batchSizeNormalizedUnit:"ml",efficiency:75,boilTimeMinutes:60,
  calculationMeta:{bitternessFormula:formula},ingredients
} as any);
const malt = () => line("viking-malt-pale-ale-fi-base",5000);

describe("approved catalog source corrections", () => {
  it("translates every known source aroma without modifying the original descriptors", () => {
    const hops = prepared.filter((entry) => entry.ingredient.type === "hop");
    const descriptors = hops.flatMap((entry) => entry.ingredient.attributes?.aroma_descriptors_en as string[] ?? []);
    expect(descriptors.length).toBeGreaterThan(100);
    for (const descriptor of descriptors) expect(translateHopAroma(descriptor)).toMatch(/[а-яё]/i);
  });
  it("loads all seven sources without legacy manifests and keeps ingredient identities", () => {
    expect(prepared).toHaveLength(1403);
    expect(new Set(prepared.map((row)=>row.ingredient.id)).size).toBe(1403);
    expect(prepared.flatMap((row)=>row.packageVariants)).toHaveLength(706);
  });
  it("retains Heidelberg's one-sided bound and its explicitly labelled calculation value", () => {
    const data=extractIngredientTechnicalData(ingredient("bestmalz-best-heidelberg-malt"));
    expect(data).toMatchObject({colorEbcMin:null,colorEbcMax:2.9,colorEbcForCalculation:2.9,colorEbcCalculationBasis:"upper_bound"});
    expect(formatCatalogColorEbc(data)).toBe("до 2,9 EBC");
    expect(getIngredientColorLovibond({technicalData:data!})).toBe(1.47);
  });
  it("quarantines unsupported protein without guessing a replacement", () => {
    const row=ingredient("viking-malt-caramel-250-fi-special");
    expect(extractIngredientTechnicalData(row)).toMatchObject({proteinPct:null});
    expect(row.attributes?.data_review).toMatchObject({protein_pct:{original_value:75,status:"unverified"}});
  });
  it("keeps the merged wheat ID and makes both English names searchable on its target", () => {
    expect(ingredient("weyermann-dark-wheat-de-base")).toMatchObject({isActive:false,attributes:{_catalog_status:"merged",_merged_into_id:"weyermann--wheat-malt-dark"}});
    expect(prepared.find(row=>row.ingredient.id==="weyermann--wheat-malt-dark")!.aliases.some(alias=>alias.alias==="Dark Wheat")).toBe(true);
  });
  it("retains LA-01's old package and adds two source-backed sizes without guessing a default", () => {
    const variants=prepared.find(row=>row.ingredient.id==="fermentis-la-01")!.packageVariants;
    expect(variants.map(v=>v.stockContentAmount)).toEqual([11.5,500,10000]);
    expect(variants[0]).toMatchObject({id:"fermentis-la-01-pack-11p5g",sourceGroup:"unverified_package",isDefaultForStock:false});
    expect(variants.every(v=>!v.isDefaultForStock)).toBe(true);
    expect(resolveInventoryItemPackEquivalent({technicalData:card("fermentis-la-01").technicalData})).toBeNull();
  });
  it("keeps reference water methods out of physical stock", () => {
    for(const id of ["aeration-dechlorination","boiling-water-decarbonation","activated-carbon-filtration","acidulated-malt"])
      expect(ingredient(id).inventoryEnabled).toBe(false);
  });
});

describe("recipe calculations with corrected catalog values", () => {
  it("retains the missing-IBU explanation when an existing recipe is reopened", () => {
    const estimate = { status: "unavailable", knownIbu: null, missing: [{ ingredientId: "hop", name: "Вилламетт", reason: "hop_alpha" }] };
    const initial = buildInitialPreview({ og: 1.05, fg: 1.01, abv: 5, ibu: null, color: 5, styleId: "18B", calculationMeta: { bitternessEstimate: estimate } } as any);
    expect(initial?.bitternessEstimate).toEqual(estimate);
    expect(initial?.styleFit).toBeNull();
    const html = renderToStaticMarkup(React.createElement(RecipeStyleStatsBlock, { preview: initial, recalculating: false, previewError: null, preferredGravityUnit: "plato" }));
    expect(html).toContain("Не хватает данных");
  });
  it("uses confirmed malt colour ranges while preserving independent gravity", () => {
    const result=recipeStats([malt()]);
    expect(result.og).toBe(1.059);expect(result.color).toBe(5);
    expect(card("the-swaen-swaen-pilsner-nl-base").technicalData).toMatchObject({colorEbcMin:3,colorEbcMax:4.5});
  });
  it("does not count rice hulls as extract, colour, or fermentable sugars", () => {
    expect(recipeStats([malt(),line("rice-hulls-nesolozhenka",500,"fermentable")])).toEqual(recipeStats([malt()]));
    expect(recipeStats([malt(),line("rice-hulls-nesolozhenka",0.04,"fermentable")])).toEqual(recipeStats([malt()]));
    const hulls = { technicalData: card("rice-hulls-nesolozhenka").technicalData };
    expect(getIngredientPotentialPpg(hulls)).toBe(0);
    expect(getIngredientColorLovibond(hulls)).toBe(0);
  });
  it("respects low attenuation, manual overrides, and the specialty strain's sugar model", () => {
    const input={og:1.04,fermentables:[{name:"Pale",weightKg:5,potentialPpg:37,technicalData:{type:"malt" as const}}],yeasts:[{name:"LA-01",technicalData:extractIngredientTechnicalData(ingredient("fermentis-la-01"))}]};
    expect(calculateRecipeFgEstimate(input).predictedFg).toBe(1.034);
    expect(calculateRecipeFgEstimate({...input,calculationMeta:{manualAttenuationOverridePct:20} as any}).predictedFg).toBe(1.032);
    expect(calculateRecipeFgEstimate({...input,calculationMeta:{manualFgOverrideValue:1.012} as any}).predictedFg).toBe(1.012);
    const sugar={name:"Glucose",weightKg:1,potentialPpg:46,technicalData:{type:"fermentable" as const,functionalRole:"simple_sugar"}};
    expect(calculateRecipeFgEstimate({...input,fermentables:[...input.fermentables,sugar]}).fgEstimateDetails!.effectiveAttenuationPct).toBeGreaterThan(15);
  });
  it("keeps unknown alpha unknown and reports a known partial contribution separately", () => {
    const unknown=line("us-willamette-beervingem-standard",25,"hop");
    unknown.ingredientTechnicalData={type:"hop",alphaAcidPctMin:null,alphaAcidPctMax:null,alphaAcidPctTypical:null};
    const only=recipeStats([malt(),unknown]);
    expect(only.ibu).toBeNull();expect(only.og).toBe(1.059);expect(only.color).toBe(5);
    expect(only.bitternessEstimate).toMatchObject({status:"unavailable",missing:[{reason:"hop_alpha"}]});
    const known=line("us-citra-standard",25,"hop");
    const partial=recipeStats([malt(),unknown,known]);
    expect(partial.ibu).toBeNull();expect(partial.bitternessEstimate?.knownIbu).toBe(recipeStats([malt(),known]).ibu);
    expect(recipeStats([malt(),{...unknown,stepMeta:{alphaAcidPct:6}}]).ibu).toBeGreaterThan(0);
  });
  it("requires no alpha where the chosen IBU model ignores the addition", () => {
    const unknown={...line("us-citra-standard",20,"hop"),ingredientTechnicalData:{type:"hop"},stage:"fermentation",stepMeta:{useType:"dry_hop"}};
    expect(recipeStats([malt(),unknown]).bitternessEstimate?.missing).toEqual([]);
    const whirlpool={...unknown,stage:"whirlpool",stepMeta:{useType:"whirlpool",temperatureC:90}};
    expect(recipeStats([malt(),whirlpool],"tinseth_classic").bitternessEstimate?.missing).toEqual([]);
    expect(recipeStats([malt(),whirlpool],"tinseth_whirlpool_v2").bitternessEstimate?.missing).toHaveLength(1);
  });
  it("never claims a complete IBU for an unquantified hopped extract", () => {
    const extract={...malt(),id:"extract",type:"fermentable",ingredientTechnicalData:{type:"fermentable",extractPctDryBasis:80,isHoppedProduct:true,hoppingState:"hopped",colorLovibond:4}};
    expect(recipeStats([extract]).bitternessEstimate).toMatchObject({status:"unavailable",missing:[{reason:"hopped_extract"}]});
    expect(recipeStats([extract,line("us-citra-standard",25,"hop")]).bitternessEstimate?.status).toBe("partial");
    expect(recipeStats([{...extract,ingredientTechnicalData:{...extract.ingredientTechnicalData,isHoppedProduct:false,hoppingState:"unhopped"}}]).bitternessEstimate?.missing).toEqual([]);
    const spec={basis:"finished_beer",scalesLinearlyWithConcentration:true,sourceUrl:"https://manufacturer.example/spec",ibuAtReferenceDilution:20,referenceMassG:1500,referenceVolumeL:23};
    expect(calculateVerifiedExtractIbu(spec,3000,46)).toBe(20);
    expect(calculateVerifiedExtractIbu({...spec,basis:"concentrate"},3000,46)).toBeNull();
  });
});

describe("stock amounts, packaging, and compatibility", () => {
  it.each([1,9,40,60,150,999])("round-trips %i mg without changing its mass", (mg) => {
    const quantity=normalizeInventoryMeasurement("water_treatment",mg,"mg");
    expect(quantity.normalizedQuantity).toBe(mg/1000);
    expect(formatInventoryQuantityForDisplay({...quantity,type:"water_treatment"})).toBe(`${mg} мг`);
    expect(formatInventoryQuantityInputValue(quantity.normalizedQuantity,"g")).toBe(String(mg/1000));
  });
  it("rejects unsupported fractional milligrams and retains exact editor values", () => {
    expect(()=>normalizeInventoryMeasurement("water_treatment",0.5,"mg")).toThrow("INVALID_QUANTITY_PRECISION");
    expect(formatInventoryQuantityInputValue(0.925,"kg")).toBe("0.925");
    expect(formatInventoryQuantityInputValue(120.24,"g")).toBe("120.24");
  });
  it("uses one package coefficient for stock and purchase price", () => {
    const source=card("crown-caps-26mm"),variant=source.packageVariants.find((v:any)=>v.id==="crown-caps-26-1000");
    const profile=resolveHumanFacingInventoryUnitProfile(source);
    const equivalent=resolveInventoryItemPackEquivalent({packageVariant:variant,technicalData:source.technicalData});
    expect(normalizeInventoryMeasurementWithPack(profile,1,"pack",equivalent)).toMatchObject({normalizedQuantity:1000,normalizedUnit:"item"});
    expect(normalizeInventoryPurchaseContext(profile,{priceInputAmountMinor:10000,priceInputMode:"total"},defaultSystemCurrencyRates,{fallbackMeasurement:{quantity:1,unit:"pack"},packEquivalent:equivalent})).toMatchObject({purchaseQuantityNormalized:1000,purchaseQuantityNormalizedUnit:"item",normalizedUnitCostMinorRub:10});
    expect(buildCatalogIngredientPayload({...source,matchedPackageVariantId:variant.id},{enteredQuantity:"1",enteredUnit:"pack"} as any,{includeOptionalDetails:false})).toMatchObject({packageVariantId:variant.id});
  });
  it("uses declared iodophor volumes without redefining mass ounces", () => {
    const variants=prepared.find(row=>row.ingredient.id==="iodophor-sanitizer")!.packageVariants;
    expect(variants.map(v=>resolveInventoryItemPackEquivalent({packageVariant:v as any})?.normalizedQuantity)).toEqual([118.3,473,946]);
    expect(convertWeight({value:32,unit:"oz"},"g").value).toBe(907.185);
  });
  it("does not substitute unrelated spices, closure sizes, or salt hydration states", () => {
    const key=(id:string)=>{const c=card(id);return resolveIngredientMatchKey({catalogItemId:id,category:c.category,type:c.type,subtype:c.subtype,technicalData:c.technicalData,name:c.nameRu})};
    expect(key("coriander-seed").groupKey).toBeNull();expect(key("cinnamon-stick").groupKey).toBeNull();
    expect(key("crown-caps-26mm").groupKey).not.toBe(key("crown-caps-29mm").groupKey);
    const water=(formula:string)=>resolveIngredientMatchKey({category:"water_treatment",type:"water_treatment",technicalData:{type:"water_treatment",calculationFormula:formula}}).groupKey;
    expect(water("CaCl2")).not.toBe(water("CaCl2·2H2O"));
    expect(convertCalciumChlorideHydrationDose({massG:10,fromFormula:"CaCl2·2H2O",toFormula:"CaCl2",fromPurityPct:100,toPurityPct:100})).toBe(7.549);
  });
});

describe("catalog browsing and source ownership", () => {
  it("ranks exact brand, product, and numeric designation together", () => {
    const rank=createIngredientRanker("Viking Caramel 250");
    const candidates=prepared.filter(row=>row.ingredient.type==="malt").flatMap(row=>{const value=rank({nameRu:row.ingredient.nameRu,nameEn:row.ingredient.nameEn,brandName:row.ingredient.brand,aliases:row.aliases});return value?[{id:row.ingredient.id,...value}]:[]});
    candidates.sort((a,b)=>a.tier-b.tier||b.score-a.score);
    expect(candidates[0].id).toBe("viking-malt-caramel-250-fi-special");
  });
  it("filters the full catalog and groups only asserted hop identities", () => {
    const malts=prepared.filter(row=>row.ingredient.type==="malt").map(row=>card(row.ingredient.id));
    expect(buildMaltBrowseOptions(malts).manufacturers.length).toBeGreaterThan(6);
    expect(matchesMaltBrowseFilters(card("viking-malt-caramel-250-fi-special"),{manufacturer:"Viking Malt",maltType:"caramel",ebcMin:200,ebcMax:300})).toBe(true);
    const hops=["us-citra-standard","us-citra-beervingem-standard","us-citra-cryo-beervingem-cryo"].map(card);
    const grouped=groupConfirmedHopSuppliers(hops);
    expect(grouped.map(group=>group.variants.length)).toEqual([2,1]);
    expect(grouped.flatMap(group=>group.variants).map(row=>row.id)).toEqual(hops.map(row=>row.id));
  });
  it("keeps editor values and statuses through repeat imports, including JSONB key ordering", () => {
    const source={id:"owned",isActive:true,nameRu:"Source",attributes:{protein_pct:10,nested:{a:1,b:2}}};
    const first=reconcileCatalogSeed(source).values;
    expect(reconcileCatalogSeed(source,JSON.parse(JSON.stringify(first))).conflicts).toEqual([]);
    const attributes=markCatalogEditorialOverrides(first,{...first,attributes:{...first.attributes as any,protein_pct:12}});
    const manual={...first,isActive:false,attributes:{...attributes,_catalog_status:"archived"}};
    const updated=reconcileCatalogSeed({...source,nameRu:"New source name",attributes:{protein_pct:11,nested:{b:2,a:1}}},manual);
    expect(updated.values).toMatchObject({isActive:false,nameRu:"New source name",attributes:{protein_pct:12,_catalog_status:"archived"}});
    expect(updated.conflicts.map(conflict=>conflict.field)).toEqual(["attributes.protein_pct"]);
  });
  it("localizes presentation without deleting genuine search aliases", () => {
    expect(canonicalManufacturerLabel("--")).toBeNull();expect(canonicalManufacturerLabel("Generic")).toBeNull();
    expect(canonicalManufacturerLabel("Swaen")).toBe("The Swaen");
    const source=card("iodophor-sanitizer"),originalLength=source.aliases.length;
    expect(visibleCatalogAliases(source)).not.toContain("iodophor_no_rinse");
    expect(visibleCatalogAliases(source)).not.toContain("sanitizer");
    expect(source.aliases).toHaveLength(originalLength);
    expect(translateHopAroma("Woody")).toBe("Древесный");
  });
});

describe("standalone IBU calculator with missing alpha", () => {
  const definition = calculatorDefinitionBySlug.ibu;
  const addition = { name: "Хмель с упаковки", amountG: 20, alphaAcidPercent: "", timeMinutes: 60, use: "boil", form: "pellet" };
  it("requests the package value and preserves the known contribution", () => {
    const result = definition.calculate({ ...definition.defaults, formula: "tinseth_classic", additions: [addition, { ...addition, alphaAcidPercent: 10 }] });
    expect(result.primary.value).toBe("—");
    expect(result.primary.helper).toContain("Хмель с упаковки");
    expect(Number.parseFloat(result.stats.find(stat => stat.label === "Известная часть")!.value)).toBeGreaterThan(0);
    expect(result.stats.some(stat => stat.label === "BU:GU")).toBe(false);
  });
  it("does not require alpha for dry hopping or a formula that ignores whirlpool", () => {
    for (const use of ["dry_hop", "whirlpool"]) {
      const result = definition.calculate({ ...definition.defaults, formula: "tinseth_classic", additions: [{ ...addition, use }] });
      expect(result.primary.value).toBe("0");
      expect(result.primary.label).toBe("IBU всего");
    }
  });
});


describe("exact mass in inventory editors", () => {
  it("preserves 40 mg when switching through grams and kilograms", () => {
    const grams = convertInventoryNormalizedToUnit(40, "mg", "g")!;
    const kilograms = convertInventoryNormalizedToUnit(grams, "g", "kg")!;
    expect(grams).toBe(0.04);
    expect(kilograms).toBe(0.00004);
    expect(convertInventoryNormalizedToUnit(kilograms, "kg", "mg")).toBe(40);
    expect(getInventoryUnitInputStep("kg")).toBe(0.000001);
  });
  it("keeps the exact display measurement available to an editor", () => {
    const display = resolveInventoryMeasurementForDisplay({ type: "malt", category: "fermentable", subtype: "malt", enteredQuantity: 0.9255, enteredUnit: "kg", normalizedQuantity: 925.5, normalizedUnit: "g" });
    expect(display).toMatchObject({ quantity: 0.9255, unit: "kg" });
    expect(formatInventoryQuantityInputValue(display.quantity, display.unit)).toBe("0.9255");
  });
  it("does not infer a weight from an unspecified dry yeast package", () => {
    expect(resolveInventoryItemPackEquivalent({ technicalData: { type: "yeast", form: "dry" } })).toBeNull();
  });
});
