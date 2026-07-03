/**
 * Dev-only: резервирует склад под рецепты dev-пользователя, чтобы вручную
 * проверить бейдж «Резерв N» на карточках склада (/app/ingredients).
 * Использует штатный флоу: авто-аллокация под остаток + перевод в reserved.
 *
 * Запуск:  tsx scripts/reserve-dev.ts            (зарезервировать под 2 рецепта)
 *          tsx scripts/reserve-dev.ts --cleanup  (снять все активные резервы)
 */
import { and, db, eq, inArray, recipeInventoryAllocations, users } from "@nb/db";

import { listRecipesForAuthor } from "../features/recipes/service";
import {
  autoAllocateRecipeInventoryFromStock,
  reserveRecipeInventoryAllocations
} from "../features/recipes/inventory-service";

const DEFAULT_EMAIL = "dev@example.com";
const resolveEmail = () => (process.env.DEV_AUTH_EMAIL?.trim() || DEFAULT_EMAIL).toLowerCase();

const main = async () => {
  const email = resolveEmail();
  const user = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
  if (!user) {
    console.error(`Пользователь ${email} не найден. Запустите seed:sample сначала.`);
    process.exit(1);
  }

  if (process.argv.includes("--cleanup")) {
    const released = await db
      .update(recipeInventoryAllocations)
      .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(recipeInventoryAllocations.userId, user.id),
        inArray(recipeInventoryAllocations.status, ["allocated", "reserved"])
      ))
      .returning({ id: recipeInventoryAllocations.id });
    console.log(`Снято активных резервов: ${released.length}`);
    process.exit(0);
  }

  const recipes = await listRecipesForAuthor(user.id, { limit: 10 });
  if (recipes.length === 0) {
    console.error("У пользователя нет рецептов. Запустите seed:sample.");
    process.exit(1);
  }

  let reservedRecipes = 0;
  for (const recipe of recipes) {
    if (reservedRecipes >= 2) {
      break;
    }
    try {
      const coverage = await autoAllocateRecipeInventoryFromStock(user.id, recipe.id);
      await reserveRecipeInventoryAllocations(user.id, recipe.id);
      const covered = coverage.lines.filter((line) => line.status !== "short").length;
      if (covered > 0) {
        reservedRecipes += 1;
        console.log(`Зарезервировано под «${recipe.title}»: строк со складом — ${covered}`);
      }
    } catch (error) {
      console.warn(`Пропущен «${recipe.title}»: ${(error as Error).message}`);
    }
  }

  if (reservedRecipes === 0) {
    console.warn("Ни одна строка не легла на склад — резервов не создано. Проверьте, что склад наполнен (seed:sample).");
  }
  console.log(`Готово. Открой /app/ingredients под ${email}.`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
