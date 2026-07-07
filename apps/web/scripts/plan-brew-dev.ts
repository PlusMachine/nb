/**
 * Dev-only: создаёт несколько ЗАПЛАНИРОВАННЫХ варок из рецептов dev-пользователя,
 * чтобы вручную проверить страницу «Чего не хватает» (/app/shopping).
 * Тестовые варки помечаются префиксом [QA-shopping] в имени.
 *
 * Запуск:  tsx scripts/plan-brew-dev.ts            (создать 2 варки)
 *          tsx scripts/plan-brew-dev.ts --cleanup  (удалить тестовые варки)
 */
import { and, brewBatches, db, eq, users } from "@nb/db";
import { like } from "drizzle-orm";

import { listRecipesForAuthor } from "../features/recipes/service";
import { createBrewBatchFromRecipe } from "../features/brew-batches/service";

const DEFAULT_EMAIL = "dev@example.com";
const QA_PREFIX = "[QA-shopping] ";

const resolveEmail = () => (process.env.DEV_AUTH_EMAIL?.trim() || DEFAULT_EMAIL).toLowerCase();

const main = async () => {
  const email = resolveEmail();
  const user = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true, email: true } });
  if (!user) {
    console.error(`Пользователь ${email} не найден. Запустите seed:sample сначала.`);
    process.exit(1);
  }

  const cleanup = process.argv.includes("--cleanup");
  if (cleanup) {
    const deleted = await db
      .delete(brewBatches)
      .where(and(eq(brewBatches.userId, user.id), like(brewBatches.name, `${QA_PREFIX}%`)))
      .returning({ id: brewBatches.id });
    console.log(`Удалено тестовых варок: ${deleted.length}`);
    process.exit(0);
  }

  const recipes = await listRecipesForAuthor(user.id, { limit: 10 });
  if (recipes.length === 0) {
    console.error("У пользователя нет рецептов. Запустите seed:sample.");
    process.exit(1);
  }

  const target = recipes.slice(0, 6);
  for (const recipe of target) {
    const created = await createBrewBatchFromRecipe(user.id, recipe.id, {
      name: `${QA_PREFIX}${recipe.title}`
    });
    console.log(`Запланирована варка ${created.id} по рецепту «${recipe.title}»`);
  }

  console.log(`Готово. Открой /app/shopping под ${email}.`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
