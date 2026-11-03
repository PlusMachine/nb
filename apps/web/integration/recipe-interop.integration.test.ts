import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, users, recipes, eq } from "@nb/db";
import { completeEmailSignIn } from "@nb/auth";
import { createRecipeFromCanonicalImport, createRecipesFromCanonicalImport } from "../features/recipes/interop/import-service";
import { importBeerXmlToCanonicalRecipe, importBeerXmlToCanonicalRecipes, exportRecipeToBeerXml } from "../features/recipes/interop/beerxml";
import { importBrewfatherJsonToCanonicalRecipe } from "../features/recipes/interop/brewfather-json";
import { mapRecipeToCanonical } from "../features/recipes/interop/canonical";
import { getRecipeById } from "../features/recipes/service";

let owner: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.pathname !== "/nb_qa_20261103" || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("ISOLATED_QA_DATABASE_REQUIRED");
  owner = (await completeEmailSignIn({ email: `qa.interop.${randomUUID()}@localhost` })).id;
});
afterAll(async () => { if (owner) await db.delete(users).where(eq(users.id, owner)); await pool.end(); });
const examples = ["apa_sunset_trail", "dubbel_abbey_lantern", "neipa_hazy_orbit"];
const example = (name: string, format: string) => readFileSync(new URL(`../../../ingredients/examples_for_import/${name}.checked.${format}`, import.meta.url), "utf8");

describe("import -> PostgreSQL -> BeerXML -> import", () => {
  for (const format of ["beerxml", "brewfather.json"]) for (const name of examples) it(`preserves supported recipe and ingredient fields: ${name} ${format}`, async () => {
    const input = example(name, format);
    const original = format === "beerxml" ? importBeerXmlToCanonicalRecipe(input) : importBrewfatherJsonToCanonicalRecipe(JSON.parse(input));
    const first = await createRecipeFromCanonicalImport(owner, original);
    const loaded = await getRecipeById(owner, first.id);
    const exported = exportRecipeToBeerXml(loaded);
    const imported = importBeerXmlToCanonicalRecipe(exported);
    const second = await createRecipeFromCanonicalImport(owner, imported);
    expect(second).toMatchObject({ title: first.title, batchSizeNormalizedQuantity: first.batchSizeNormalizedQuantity, boilTimeMinutes: first.boilTimeMinutes, efficiency: first.efficiency, description: first.description, publicationState: "private" });
    expect(second.processMeta).toEqual(first.processMeta);
    expect(second.ingredients).toHaveLength(first.ingredients.length);
    const lines = (recipe: typeof first) => mapRecipeToCanonical(recipe).ingredients.map(line => ({ name: line.name, type: line.type, category: line.category, amount: line.amount, unit: line.unit, stage: line.stage, timeOffset: line.timeOffset, stepMeta: line.stepMeta, hopForm: line.hopForm, yeastForm: line.yeastForm, hopAlphaAcidPct: line.hopAlphaAcidPct, yeastAttenuationPct: line.yeastAttenuationPct })).sort((a, b) => a.name.localeCompare(b.name) || a.amount - b.amount);
    expect(lines(second)).toEqual(lines(first));
  });
  it("keeps 40 mg of salts and 2.5 ml of acid through the persisted cycle", async () => {
    const canonical = importBrewfatherJsonToCanonicalRecipe({ name: "Микродозы & <кириллица>", batchSize: 20, boilTime: 60,
      miscs: [{ name: "Calcium chloride", type: "Water Agent", amount: 40, unit: "mg", use: "Mash" }, { name: "Lactic acid solution", type: "Water Agent", amount: 2.5, unit: "ml", use: "Mash" }] });
    const saved = await createRecipeFromCanonicalImport(owner, canonical);
    const again = await createRecipeFromCanonicalImport(owner, importBeerXmlToCanonicalRecipe(exportRecipeToBeerXml(saved)));
    expect(again.title).toBe(canonical.title);
    expect(again.ingredients.map(line => [line.amountEnteredQuantity, line.amountEnteredUnit, line.amountNormalizedQuantity, line.amountNormalizedUnit])).toEqual([[40, "mg", 0.04, "g"], [2.5, "ml", 2.5, "ml"]]);
  });
  it("does not partially import a collection if a later recipe has an invalid amount", async () => {
    const canonical = importBeerXmlToCanonicalRecipe(example(examples[0], "beerxml"));
    const before = await db.query.recipes.findMany({ where: eq(recipes.authorId, owner) });
    await expect(async () => createRecipesFromCanonicalImport(owner, [canonical, { ...canonical, ingredients: [{ ...canonical.ingredients[0], amount: -1 }] }])).rejects.toThrow();
    expect(await db.query.recipes.findMany({ where: eq(recipes.authorId, owner) })).toHaveLength(before.length);
  });
  it("rejects XML entities and malformed collections without writing recipes", () => {
    for (const input of ['<!DOCTYPE x [<!ENTITY test SYSTEM "file:///etc/passwd">]><RECIPES><RECIPE><NAME>&test;</NAME></RECIPE></RECIPES>', '<RECIPES><RECIPE></RECIPES>', '<ROOT><RECIPES/></ROOT>']) expect(() => importBeerXmlToCanonicalRecipes(input)).toThrow();
  });
});
