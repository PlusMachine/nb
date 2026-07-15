/**
 * Dev-only фикстура для e2e/feedback-fab-overlap.spec.ts: готовит и убирает
 * тестовую партию под аккаунтом dev-автологина (DEV_AUTH_EMAIL), не трогая
 * остальные данные пользователя. Тестовые партии помечаются префиксом
 * [E2E-fab-overlap] в имени — это же имя ищет --cleanup.
 *
 * Партия переводится в статус "brewing" (акт «Варочный день», см.
 * brewDayActForStatus в features/brew-batches/brew-day.ts) — на этом акте
 * страница партии показывает журнал замеров с формой «Добавить», нужной
 * тесту. Рецепт для партии выбирается с МИНИМУМОМ ингредиентов из уже
 * существующих у пользователя — короче блок склада партии под журналом,
 * значит меньше контента между формой и подвалом страницы, где как раз и
 * сидит проверяемый на перекрытие FAB.
 *
 * Запуск (из apps/web):
 *   npx tsx e2e/fixtures/feedback-fab-overlap-fixture.ts          — создать
 *   npx tsx e2e/fixtures/feedback-fab-overlap-fixture.ts --cleanup — удалить
 */
import { and, brewBatches, count, db, eq, recipeIngredients, users } from "@nb/db";
import { like } from "drizzle-orm";

import { listRecipesForAuthor } from "../../features/recipes/service";
import { createBrewBatchFromRecipe, updateBrewBatchStatus } from "../../features/brew-batches/service";

const DEFAULT_EMAIL = "qa.admin@localhost";
const NAME_PREFIX = "[E2E-fab-overlap] ";

const resolveEmail = () => (process.env.DEV_AUTH_EMAIL?.trim() || DEFAULT_EMAIL).toLowerCase();

const main = async () => {
  const email = resolveEmail();
  const user = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true, email: true } });
  if (!user) {
    console.error(`Пользователь ${email} не найден. Запустите seed:qa/seed:dev-user сначала.`);
    process.exit(1);
  }

  if (process.argv.includes("--cleanup")) {
    const batchIdArg = process.argv.find((arg) => arg.startsWith("--batch-id="))?.slice("--batch-id=".length);
    const deleted = batchIdArg
      ? await db
          .delete(brewBatches)
          .where(and(eq(brewBatches.userId, user.id), eq(brewBatches.id, batchIdArg)))
          .returning({ id: brewBatches.id })
      : await db
          .delete(brewBatches)
          .where(and(eq(brewBatches.userId, user.id), like(brewBatches.name, `${NAME_PREFIX}%`)))
          .returning({ id: brewBatches.id });
    console.log(`Удалено тестовых партий: ${deleted.length}`);
    process.exit(0);
  }

  const authored = await listRecipesForAuthor(user.id, { limit: 50 });
  if (authored.length === 0) {
    console.error(`У ${email} нет ни одного рецепта — фикстуре не из чего создать партию.`);
    process.exit(1);
  }

  // Считаем ингредиенты каждого рецепта и берём самый короткий — не хардкодим
  // конкретный id/название, состав каталога QA меняется между прогонами seed.
  let recipe = authored[0]!;
  let minIngredientCount = Number.POSITIVE_INFINITY;
  for (const candidate of authored) {
    const [row] = await db
      .select({ value: count() })
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, candidate.id));
    const ingredientCount = row?.value ?? 0;
    if (ingredientCount < minIngredientCount) {
      minIngredientCount = ingredientCount;
      recipe = candidate;
    }
    if (minIngredientCount === 0) {
      break;
    }
  }

  const created = await createBrewBatchFromRecipe(user.id, recipe.id, {
    name: `${NAME_PREFIX}${recipe.title}`
  });
  await updateBrewBatchStatus(user.id, created.id, "brewing");

  console.log(`RESULT:${JSON.stringify({ batchId: created.id })}`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
