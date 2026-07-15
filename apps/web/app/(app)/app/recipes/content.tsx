import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { MyRecipesGallery } from "@/components/recipes/my-recipes-gallery";
import { RecipeEmptyState } from "@/components/recipes/recipe-empty-state";
import { RecipeTabs } from "@/components/recipes/recipe-tabs";
import { listAuthorRecipeCards } from "@/features/recipes/service";
import {
  MY_RECIPES_VIEW_COOKIE,
  parseMyRecipesQuery,
  parseMyRecipesSort,
  parseMyRecipesStatus,
  parseMyRecipesView,
  type ViewMode
} from "@/features/recipes/my-recipes-url";
import { requireUser } from "@/lib/auth";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Запомненный вид (grid/list) из cookie. `cookies()` требует активный
 * request-контекст Next (реальный рендер страницы) — вне него (например,
 * юнит-тест, вызывающий `MyRecipesContent()` напрямую) бросает исключение;
 * откатываемся к дефолту, не роняя страницу/тест ради чисто презентационной
 * персистентности.
 */
async function readInitialView(): Promise<ViewMode> {
  try {
    const cookieStore = await cookies();
    return parseMyRecipesView(cookieStore.get(MY_RECIPES_VIEW_COOKIE)?.value) ?? "grid";
  } catch {
    return "grid";
  }
}

export async function MyRecipesContent({ searchParams }: Props = {}) {
  const params = (await searchParams) ?? {};
  const brewMode = params.intent === "brew";

  const user = await requireUser();
  const recipes = await listAuthorRecipeCards(user.id);

  const initialView = await readInitialView();
  const initialQuery = parseMyRecipesQuery(params.q);
  const initialSort = parseMyRecipesSort(params.sort) ?? (brewMode ? "brewable" : "updated");
  const initialStatus = parseMyRecipesStatus(params.status) ?? "all";

  return (
    <main className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{brewMode ? "Сварить" : "Рецепты"}</h1>
        {brewMode ? (
          <Link
            href="/app/recipes"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            К рецептам
          </Link>
        ) : (
          <Link href="/app/recipes/new" className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
            Создать рецепт
          </Link>
        )}
      </section>
      {/* В brew-режиме табы не показываем: контекст «выбери рецепт для варки» не
          должен предлагать уход в «Закладки»/витрину — выход отсюда уже есть
          выше («К рецептам»). */}
      {brewMode ? null : <RecipeTabs />}
      {recipes.length === 0 ? (
        <RecipeEmptyState />
      ) : (
        <MyRecipesGallery
          // key меняется при смене режима: soft-навигация /app/recipes ↔
          // ?intent=brew переиспользует тот же инстанс страницы, и без key
          // локальный стейт галереи (поиск/сортировка/статус) и незавершённый
          // debounce-таймер пережили бы переключение режима, хотя URL уже
          // чист. key заставляет React размонтировать/смонтировать галерею
          // заново — стейт сбрасывается на новые initial-пропы, таймер гасится.
          key={brewMode ? "brew" : "manage"}
          recipes={recipes}
          preferredGravityUnit={user.preferredGravityUnit}
          intent={brewMode ? "brew" : "manage"}
          initialView={initialView}
          initialQuery={initialQuery}
          initialSort={initialSort}
          initialStatus={initialStatus}
        />
      )}
    </main>
  );
}
