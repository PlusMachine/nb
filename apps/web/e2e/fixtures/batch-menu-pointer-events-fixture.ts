/**
 * Dev-only фикстура для e2e/batch-menu-pointer-events.spec.ts: готовит и убирает
 * тестовую партию под аккаунтом dev-автологина (DEV_AUTH_EMAIL), не трогая
 * остальные данные пользователя. Тестовые партии помечаются префиксом
 * [E2E-pointer-events] в имени — это же имя ищет --cleanup.
 *
 * Запуск (из apps/web):
 *   npx tsx e2e/fixtures/batch-menu-pointer-events-fixture.ts          — создать
 *   npx tsx e2e/fixtures/batch-menu-pointer-events-fixture.ts --cleanup — удалить
 *
 * Результат create печатается ОДНОЙ строкой вида RESULT:{"batchId":"..."} —
 * вызывающий спек парсит именно эту строку.
 */
import { and, brewBatches, db, eq, users } from "@nb/db";
import { like } from "drizzle-orm";

import { listRecipesForAuthor } from "../../features/recipes/service";
import { createBrewBatchFromRecipe } from "../../features/brew-batches/service";

const DEFAULT_EMAIL = "qa.admin@localhost";
const NAME_PREFIX = "[E2E-pointer-events] ";

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
    // Спек передаёт --batch-id=<uuid> — удаляем ТОЛЬКО свою партию: playwright.config.ts
    // гоняет несколько projects (viewport'ы) параллельно, и cleanup по одному только
    // имени-префиксу мог бы снести партию соседнего ещё бегущего прогона. Без
    // --batch-id (ручной запуск) — прежнее поведение, чистим всё по префиксу.
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

  const recipes = await listRecipesForAuthor(user.id, { limit: 1 });
  if (recipes.length === 0) {
    console.error(`У ${email} нет ни одного рецепта — фикстуре не из чего создать партию.`);
    process.exit(1);
  }

  const created = await createBrewBatchFromRecipe(user.id, recipes[0]!.id, {
    name: `${NAME_PREFIX}${recipes[0]!.title}`
  });

  console.log(`RESULT:${JSON.stringify({ batchId: created.id })}`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
