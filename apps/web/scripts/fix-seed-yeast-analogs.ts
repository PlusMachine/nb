/**
 * Ф22: точечный data-fix для уже существующих сид-рецептов (`seed:public`,
 * importMeta.seedSource="demo-public-recipes") — заменяет три импортных
 * дрожжевых позиции ASP Lab на брендово-верные аналоги по первоисточникам
 * рецептов (Kölsch/Hefeweizen/Irish Ale стилей). `wit` (Belgian Witbier)
 * не трогаем — для него ASP Lab остаётся.
 *
 * Почему не полный `seed:public`: он делает `db.delete(recipes)` по тегу
 * seedSource и каскадом сносит пользовательские `recipe_saves`/`recipe_ratings`
 * на этих демо-рецептах. Здесь — только точечный UPDATE `recipe_ingredients`,
 * ограниченный строками, чьи рецепты помечены тем же seedSource, чтобы не
 * задеть пользовательские рецепты, где ASP Lab выбран осознанно.
 *
 * Идемпотентность: ищет строки со СТАРЫМ catalog id — при повторном запуске
 * таких строк уже нет, скрипт ничего не делает.
 *
 * Запуск:  npm run fix:seed-yeast-analogs
 *
 * Жёстко заблокирован в production / на нелокальной БД.
 */
import { db, eq, ingredients, inArray, recipeIngredients, recipes, sql } from "@nb/db";
import { parseServerEnv } from "@nb/shared";

import { buildCatalogIngredientLinkage } from "../features/ingredients/source-linkage";

const SEED_TAG = "demo-public-recipes";

// ---------------------------------------------------------------------------
// Dev guard (как в seed-public-recipes.ts)
// ---------------------------------------------------------------------------
const assertDevOnly = () => {
  const env = parseServerEnv(process.env);
  if (env.NODE_ENV === "production") {
    throw new Error("fix:seed-yeast-analogs заблокирован в production.");
  }
  const url = env.DATABASE_URL;
  if (!(url.includes("localhost") || url.includes("127.0.0.1") || url.includes("postgres"))) {
    throw new Error("fix:seed-yeast-analogs допускает только локальную БД (localhost/127.0.0.1/postgres).");
  }
};

// ---------------------------------------------------------------------------
// Маппинг: старый ASP Lab id → брендово-верный аналог (проверено против
// ingredients/new/yeasts_catalog_minimal_v2.json — оба liquid, dimension=volume,
// unit=ml, поэтому amountEnteredUnit/amountNormalizedUnit/measurementDimension
// не меняются). `wit` намеренно не включён — для него ASP Lab остаётся.
// ---------------------------------------------------------------------------
const YEAST_ANALOGS: Array<{ label: string; oldId: string; newId: string }> = [
  { label: "hefe (Hefeweizen Ale → Wyeast 3068 Weihenstephan Weizen)", oldId: "asp-lab-al-205-hefeweizen-ale", newId: "wyeast-3068-weihenstephan-weizen" },
  { label: "kolsch (Kölsch → White Labs WLP029 German Ale)", oldId: "asp-lab-al-513-kolsch", newId: "white-labs-wlp029-german-ale" },
  { label: "irish (Irish Ale → Wyeast 1084 Irish Ale)", oldId: "asp-lab-al-514-irish-ale", newId: "wyeast-1084-irish-ale" }
];

const main = async () => {
  assertDevOnly();

  const newIds = YEAST_ANALOGS.map((a) => a.newId);
  const catalogRows = await db.query.ingredients.findMany({ where: inArray(ingredients.id, newIds) });
  const catalogById = new Map(catalogRows.map((row) => [row.id, row]));

  let totalUpdated = 0;

  for (const analog of YEAST_ANALOGS) {
    const catalogRow = catalogById.get(analog.newId);
    if (!catalogRow) {
      throw new Error(`В каталоге нет аналога "${analog.newId}" (${analog.label}). Проверь npm run catalog:sync.`);
    }
    const displayName = buildCatalogIngredientLinkage(catalogRow).displayName;

    // Только строки сид-рецептов (importMeta.seedSource = demo-public-recipes),
    // со старым catalog id — пользовательские рецепты с осознанным ASP Lab не трогаем.
    const affectedRecipes = await db
      .select({ title: recipes.title })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
      .where(sql`
        ${recipeIngredients.ingredientCatalogItemId} = ${analog.oldId}
        and ${recipes.importMeta} ->> 'seedSource' = ${SEED_TAG}
      `);

    if (affectedRecipes.length === 0) {
      console.log(`⏭  ${analog.label}: старых строк не найдено (уже применено или нечего чинить).`);
      continue;
    }

    const result = await db
      .update(recipeIngredients)
      .set({
        ingredientCatalogItemId: analog.newId,
        ingredientDisplayNameSnapshot: displayName,
        updatedAt: new Date()
      })
      .where(sql`
        ${recipeIngredients.ingredientCatalogItemId} = ${analog.oldId}
        and ${recipeIngredients.recipeId} in (
          select ${recipes.id} from ${recipes} where ${recipes.importMeta} ->> 'seedSource' = ${SEED_TAG}
        )
      `)
      .returning({ id: recipeIngredients.id });

    totalUpdated += result.length;
    console.log(`✅  ${analog.label}: обновлено строк — ${result.length}. Рецепты: ${affectedRecipes.map((r) => `«${r.title}»`).join(", ")}.`);
  }

  console.log(`\nИтого обновлено строк recipe_ingredients: ${totalUpdated}.`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
