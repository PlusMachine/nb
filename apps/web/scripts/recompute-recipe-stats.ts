/**
 * Одноразовый (но безопасно перезапускаемый) массовый пересчёт расчётных
 * статов рецептов (efficiency/OG/FG/ABV/IBU/color) через актуальный движок
 * `computeRecipeStatsSnapshot` (features/recipes/service.ts). Нужен после
 * фиксов точности расчётов (docs/recipe-stats-accuracy-fix.md, Э1/Э2/Э3):
 * статы лежат денормализованными в строках `recipes` и без этого скрипта
 * пересчитываются только при следующем сохранении рецепта пользователем.
 *
 * ПРОПУСКАЕТ кураторские рецепты витрины — у них числа авторитетные из
 * первоисточника, перезаписывать нельзя:
 *   - importMeta.seedSource === "demo-public-recipes" (see seed-public-recipes.ts)
 *   - importMeta.sourceAttribution существует (любой рецепт с атрибуцией источника)
 *
 * Остальные рецепты пересчитываются через `recomputeRecipeStats(authorId, recipeId)`
 * — тот же путь, что дергает мастер рецептов при сохранении. Один упавший
 * рецепт не прерывает прогон — ошибка копится в отчёт, в конце ненулевой
 * exit code, если были ошибки.
 *
 * Запуск:  npm run recompute:recipe-stats   (из корня)
 *
 * Жёстко заблокирован в production / на нелокальной БД.
 */
import { db } from "@nb/db";
import { parseServerEnv } from "@nb/shared";

import { recomputeRecipeStats } from "../features/recipes/service";

// ---------------------------------------------------------------------------
// Dev guard
// ---------------------------------------------------------------------------
// Хост БД, а не подстрока всего URL: схема postgres:// матчила бы любую базу.
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "postgres"]);

const assertDevOnly = () => {
  const env = parseServerEnv(process.env);
  if (env.NODE_ENV === "production") {
    throw new Error("recompute:recipe-stats заблокирован в production.");
  }
  let host = "";
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    // оставляем host пустым — упадём ниже
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(`recompute:recipe-stats допускает только локальную БД (localhost/127.0.0.1/postgres), а не "${host}".`);
  }
};

// ---------------------------------------------------------------------------
// Пропуск кураторских рецептов
// ---------------------------------------------------------------------------
const isCuratedRecipe = (importMeta: Record<string, unknown> | null): boolean => {
  if (!importMeta) {
    return false;
  }
  if (importMeta.seedSource === "demo-public-recipes") {
    return true;
  }
  if (importMeta.sourceAttribution != null) {
    return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Прогон
// ---------------------------------------------------------------------------
const run = async () => {
  assertDevOnly();

  const rows = await db.query.recipes.findMany({
    columns: {
      id: true,
      authorId: true,
      title: true,
      importMeta: true
    }
  });

  console.log(`Найдено рецептов: ${rows.length}`);

  let recomputed = 0;
  const skipped: Array<{ id: string; title: string; reason: string }> = [];
  const failed: Array<{ id: string; title: string; error: string }> = [];

  for (const row of rows) {
    const importMeta = (row.importMeta as Record<string, unknown> | null) ?? null;
    if (isCuratedRecipe(importMeta)) {
      skipped.push({ id: row.id, title: row.title, reason: "кураторский рецепт (importMeta)" });
      continue;
    }

    try {
      await recomputeRecipeStats(row.authorId, row.id);
      recomputed += 1;
    } catch (error) {
      failed.push({
        id: row.id,
        title: row.title,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  console.log(`Пересчитано: ${recomputed}`);
  console.log(`Пропущено: ${skipped.length}`);
  for (const item of skipped) {
    console.log(`  - [${item.id}] "${item.title}" — ${item.reason}`);
  }
  console.log(`Упало: ${failed.length}`);
  for (const item of failed) {
    console.log(`  - [${item.id}] "${item.title}" — ${item.error}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

run()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
