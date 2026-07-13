"use server";

import { getBeerStyleById } from "@nb/brewing-core";
import { listArticles } from "@nb/content";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { invalidateHomeDataCache } from "@/features/home/home-data-cache";
import {
  describeRecipeBulkFailures,
  groupRecipeBulkFailures,
  type RecipeBulkFailureGroup
} from "@/features/recipes/admin-page-model";
import { deleteRecipeAsModerator, hideRecipes, unhideRecipe } from "@/features/recipes/admin-service";
import { requireRole } from "@/lib/auth";

// Модерация рецептов (/admin/recipes) — по образцу app/(admin)/admin/masters/actions.ts:
// requireRole → сервис → revalidatePath → {ok:true}|{ok:false,error}. Аудит пишет
// сервисный слой (features/recipes/admin-service.ts), он же знает, что реально изменилось.

export type AdminRecipeActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Частичный отказ — штатный исход массового скрытия: часть рецептов скрыта, часть
 * нет. Поэтому `failed` едет и в успешном варианте — иначе упавшие рецепты
 * потерялись бы за зелёным {ok:true} (тот же контракт, что у каталога).
 */
export type HideRecipesActionResult =
  | { ok: true; processed: number; failed: RecipeBulkFailureGroup[] }
  | { ok: false; error: string; failed?: RecipeBulkFailureGroup[] };

const firstZodMessage = (error: ZodError): string => error.issues[0]?.message ?? "Проверьте корректность данных.";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Рецепт не найден — возможно, страницу нужно обновить.",
  FORBIDDEN: "Недостаточно прав."
};

const mapRecipeModerationError = (error: unknown): { ok: false; error: string } => {
  // requireRole редиректит гостя/недостаточную роль — такой «редирект-как-ошибка»
  // нельзя проглатывать, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }

  if (error instanceof ZodError) {
    return { ok: false, error: firstZodMessage(error) };
  }

  if (error instanceof Error && ERROR_MESSAGES[error.message]) {
    return { ok: false, error: ERROR_MESSAGES[error.message] };
  }

  return { ok: false, error: "Не удалось выполнить операцию." };
};

type ModeratedRecipe = { slug: string; styleId: string | null };

/**
 * Страницы стилей, где рецепт живёт карточкой. `/bjcp/[slug]` держит ISR
 * (revalidate = 3600) и рендерит карточки серверно, а клиентский провайдер при
 * непустом initial сознательно не перезапрашивает — без явной ревалидации
 * скрытый рецепт остаётся на странице стиля до часа.
 *
 * Один BJCP-код может стоять у нескольких статей (21B — три подстиля), а блок
 * рецептов фильтруется именно по коду, поэтому ревалидируем все статьи с этим
 * кодом, а не одну.
 */
const resolveStylePagePaths = async (recipes: ModeratedRecipe[]): Promise<string[]> => {
  const styleCodes = new Set<string>();
  for (const recipe of recipes) {
    // Стиль у рецепта опционален — публикация без BJCP-стиля разрешена.
    const bjcpId = getBeerStyleById(recipe.styleId)?.bjcpId;
    if (bjcpId) {
      styleCodes.add(bjcpId);
    }
  }

  if (styleCodes.size === 0) {
    return [];
  }

  const articles = await listArticles();
  return articles
    .filter((article) => styleCodes.has(article.bjcpId))
    .map((article) => `/bjcp/${article.slug}`);
};

/** Публичные поверхности скрытого/возвращённого рецепта: витрина, деталка, гостевая страница пива, страница стиля, sitemap. */
const revalidatePublicRecipePages = async (recipes: ModeratedRecipe[]) => {
  revalidatePath("/admin/recipes");
  revalidatePath("/recipes");
  revalidatePath("/");
  // Лента и счётчики главной живут в процессном TTL-слоте, а не в Next-кэше:
  // revalidatePath("/") его не сбрасывает (см. features/home/home-data-cache.ts).
  invalidateHomeDataCache();
  // Карта сайта тоже под ISR — иначе скрытый рецепт остаётся в ней до часа.
  revalidatePath("/sitemap.xml");
  for (const recipe of recipes) {
    revalidatePath(`/recipes/${recipe.slug}`);
    revalidatePath(`/beer/${recipe.slug}`);
  }
  for (const path of await resolveStylePagePaths(recipes)) {
    revalidatePath(path);
  }
};

/** Скрытие: и одиночное, и массовое — один экшен (обязательная причина). */
export const hideRecipesAction = async (
  recipeIds: string[],
  reason: string
): Promise<HideRecipesActionResult> => {
  try {
    const user = await requireRole("moderator");
    const targetIds = [...new Set(recipeIds.map((id) => id.trim()).filter(Boolean))];
    if (targetIds.length === 0) {
      return { ok: false, error: "Не выбрано ни одного рецепта." };
    }

    const result = await hideRecipes({ id: user.id, email: user.email }, targetIds, reason);
    await revalidatePublicRecipePages(result.hidden);

    const failed = groupRecipeBulkFailures(result.failures);

    if (result.hidden.length === 0) {
      return {
        ok: false,
        error: failed.length > 0
          ? `Ничего не скрыто: ${describeRecipeBulkFailures(failed)}.`
          : "Ничего не скрыто.",
        failed
      };
    }

    return { ok: true, processed: result.hidden.length, failed };
  } catch (error) {
    return mapRecipeModerationError(error);
  }
};

export const unhideRecipeAction = async (recipeId: string): Promise<AdminRecipeActionResult> => {
  try {
    const user = await requireRole("moderator");
    const { slug, styleId } = await unhideRecipe({ id: user.id, email: user.email }, recipeId);
    await revalidatePublicRecipePages([{ slug, styleId }]);
    return { ok: true };
  } catch (error) {
    return mapRecipeModerationError(error);
  }
};

export const deleteRecipeAction = async (recipeId: string): Promise<AdminRecipeActionResult> => {
  try {
    const user = await requireRole("moderator");
    const { slug, styleId } = await deleteRecipeAsModerator({ id: user.id, email: user.email }, recipeId);
    await revalidatePublicRecipePages([{ slug, styleId }]);
    return { ok: true };
  } catch (error) {
    return mapRecipeModerationError(error);
  }
};
