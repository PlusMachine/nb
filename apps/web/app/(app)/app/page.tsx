import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Calculator,
  CircleAlert,
  CircleCheck,
  Cpu,
  FlaskConical,
  Library,
  Sparkles
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { countRecipesForAuthor, listAuthorRecipeCards } from "@/features/recipes/service";
import { findBrewableOwnRecipesForUser } from "@/features/recipes/match-service";
import type { BrewableRecipeDto, OwnerRecipeCardDto } from "@/features/recipes/contracts";
import { formatRelativeTimestamp } from "@/features/recipes/format";
import { resolveBrewabilityBadge } from "@/features/recipes/brewability-badge";
import { getInventorySummaries } from "@/features/inventory/service";
import { countBrewBatchesForUser, listActiveBrewBatchesForUser } from "@/features/brew-batches/service";
import {
  brewBatchStatusBadgeClass,
  brewBatchStatusLabels,
  type ActiveBrewProgressItem
} from "@/features/brew-batches/contracts";
import { resolveBrewNudge, type BrewNudge } from "@/features/brew-batches/dashboard";
import { isNewUserDashboard } from "@/features/dashboard/onboarding";
import { BrewFromStockButton } from "@/components/recipes/brew-from-stock-button";

// Цвет текста подсказки «следующего шага» по тону.
const nudgeToneClass: Record<BrewNudge["tone"], string> = {
  action: "text-zinc-900",
  warn: "text-amber-700",
  info: "text-zinc-500"
};

// Срочные подсказки (надо действовать) — выше спокойных, чтобы «ближайшее
// действие» вело список активных варок, а не тонуло под свежесозданной.
const nudgeToneOrder: Record<BrewNudge["tone"], number> = { action: 0, warn: 1, info: 2 };

function ActiveBrewCard({ batch, nudge }: { batch: ActiveBrewProgressItem; nudge: BrewNudge }) {
  return (
    <Link
      href={`/app/brew-batches/${batch.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-300"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${brewBatchStatusBadgeClass[batch.status]}`}>
          {brewBatchStatusLabels[batch.status]}
        </span>
        {batch.hasDevice ? <Cpu className="h-4 w-4 text-zinc-400" aria-label="С устройством" /> : null}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-zinc-950 group-hover:text-zinc-700">{batch.name}</p>
        <p className="truncate text-sm text-zinc-500">{batch.recipeTitle}</p>
      </div>
      {nudge.text ? (
        <p className={`flex items-center gap-1.5 text-sm ${nudgeToneClass[nudge.tone]}`}>
          {nudge.tone === "warn" ? <CircleAlert className="h-4 w-4 shrink-0" aria-hidden /> : null}
          {nudge.text}
        </p>
      ) : null}
    </Link>
  );
}

function BrewableNowCard({ recipe }: { recipe: BrewableRecipeDto }) {
  const badge = resolveBrewabilityBadge(recipe);
  const readyTone = badge.qtyShort
    ? "bg-lime-50 text-lime-700 ring-lime-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return (
    <article className="group relative flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-300">
      <Link
        href={`/app/recipes/${recipe.recipeId}/edit`}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
      />
      <div className="pointer-events-none flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">{recipe.title}</p>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${readyTone}`}
          >
            <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            Можно сварить
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          {badge.qtyShort ? "Все ингредиенты есть, количества может не хватить" : "Все ингредиенты на складе"}
        </p>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="pointer-events-none inline-flex items-center gap-1 text-sm font-medium text-zinc-700 group-hover:text-zinc-950">
          Открыть рецепт
          <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
        <BrewFromStockButton recipeId={recipe.recipeId} slug={recipe.slug} recipeTitle={recipe.title} />
      </div>
    </article>
  );
}

function RecentRecipeCard({ recipe }: { recipe: OwnerRecipeCardDto }) {
  return (
    <Link
      href={`/app/recipes/${recipe.id}/edit`}
      className="group flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-300"
    >
      <p className="truncate font-semibold text-zinc-950 group-hover:text-zinc-700">{recipe.title}</p>
      <p className="truncate text-sm text-zinc-500">
        {recipe.styleName ? `${recipe.styleName} · ` : ""}
        обновлён {formatRelativeTimestamp(recipe.updatedAt)}
      </p>
    </Link>
  );
}

function SectionHeader({ title, action }: { title: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {action ? (
        <Link href={action.href} className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export default async function AppZonePage() {
  const user = await requireUser();
  const [recipeCount, inventory, activeBrews, brewable, brewBatchCount] = await Promise.all([
    countRecipesForAuthor(user.id),
    getInventorySummaries(user.id),
    listActiveBrewBatchesForUser(user.id),
    findBrewableOwnRecipesForUser({ userId: user.id }),
    countBrewBatchesForUser(user.id)
  ]);

  const now = new Date();
  const greetingName = user.displayName?.trim() || user.email || user.phone;

  const isNewUser = isNewUserDashboard({
    recipeCount,
    inventoryTotalItems: inventory.totalItems,
    activeBrewCount: activeBrews.length
  });

  // Активные варки: подсказку считаем один раз и сортируем по срочности тона.
  const rankedActiveBrews = activeBrews
    .map((batch) => ({ batch, nudge: resolveBrewNudge(batch, now) }))
    .sort((a, b) => {
      const byTone = nudgeToneOrder[a.nudge.tone] - nudgeToneOrder[b.nudge.tone];
      return byTone !== 0 ? byTone : b.batch.createdAt.getTime() - a.batch.createdAt.getTime();
    });

  // Регуляр без активных варок — дашборд иначе почти пуст: подмешиваем последние
  // рецепты. Сервис не дёргаем, если секция всё равно не покажется.
  const showRecentRecipes = !isNewUser && activeBrews.length === 0;
  const recentRecipes = showRecentRecipes ? (await listAuthorRecipeCards(user.id)).slice(0, 3) : [];

  const stats = [
    { label: "Рецептов", value: recipeCount, href: "/app/recipes" },
    { label: "В наличии", value: inventory.inStockItems, href: "/app/ingredients" },
    { label: "Варки", value: brewBatchCount, href: "/app/brew-batches" }
  ];

  const primaryActions = [
    { href: "/app/recipes/new", title: "Создать рецепт", icon: FlaskConical },
    { href: "/app/ingredients", title: "Пополнить склад", icon: Boxes },
    { href: "/catalog", title: "Открыть каталог", icon: Library }
  ];

  // Первый круг workflow — каталог → склад → рецепт — для дня-1 показываем
  // в этом порядке с номером шага, а не в порядке частоты использования.
  const onboardingSteps = [
    { href: "/catalog", title: "Открыть каталог", icon: Library },
    { href: "/app/ingredients", title: "Пополнить склад", icon: Boxes },
    { href: "/app/recipes/new", title: "Создать рецепт", icon: FlaskConical }
  ];

  const discoverLinks = [
    { href: "/bjcp", title: "Стили пива", icon: Sparkles },
    { href: "/calculators", title: "Калькуляторы", icon: Calculator },
    { href: "/recipes", title: "Рецепты сообщества", icon: FlaskConical }
  ];

  return (
    <div className="space-y-10">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          {isNewUser ? `Добро пожаловать, ${greetingName}` : `С возвращением, ${greetingName}`}
        </h1>
      </section>

      {rankedActiveBrews.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Активные варки" action={{ href: "/app/brew-batches", label: "Все варки" }} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rankedActiveBrews.map(({ batch, nudge }) => (
              <ActiveBrewCard key={batch.id} batch={batch} nudge={nudge} />
            ))}
          </div>
        </section>
      ) : null}

      {brewable.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Можно сварить сейчас" action={{ href: "/app/recipes", label: "Мои рецепты" }} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brewable.map((recipe) => (
              <BrewableNowCard key={recipe.recipeId} recipe={recipe} />
            ))}
          </div>
        </section>
      ) : null}

      {recentRecipes.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Последние рецепты" action={{ href: "/app/recipes", label: "Все рецепты" }} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentRecipes.map((recipe) => (
              <RecentRecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </section>
      ) : null}

      {isNewUser ? null : (
        <section className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
            >
              <p className="text-3xl font-semibold tabular-nums text-zinc-950">{stat.value}</p>
              <p className="mt-1 text-sm text-zinc-500">{stat.label}</p>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-3">
        {isNewUser ? <h2 className="text-sm font-semibold text-zinc-900">С чего начать</h2> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          {(isNewUser ? onboardingSteps : primaryActions).map((action, index) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group relative flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
              >
                {isNewUser ? (
                  <span className="absolute -left-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-zinc-950 text-xs font-semibold text-white ring-2 ring-white">
                    {index + 1}
                  </span>
                ) : null}
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="flex items-center gap-1 font-semibold text-zinc-950">
                  {action.title}
                  <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Полезное рядом" />
        <div className="grid gap-3 sm:grid-cols-3">
          {discoverLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-300"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-zinc-600">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="truncate text-sm font-semibold text-zinc-950">{link.title}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
