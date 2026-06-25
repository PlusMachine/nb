import React from "react";
import Link from "next/link";
import { ArrowRight, Boxes, Calculator, FlaskConical, Library, Plus, Sparkles } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { listRecipesForAuthor } from "@/features/recipes/service";
import { getInventorySummaries } from "@/features/inventory/service";

export default async function AppZonePage() {
  const user = await requireUser();
  const [recipes, inventory] = await Promise.all([
    listRecipesForAuthor(user.id),
    getInventorySummaries(user.id)
  ]);

  const recipeCount = recipes.length;
  const greetingName = user.displayName?.trim() || user.email;

  const stats = [
    { label: "Рецептов", value: recipeCount, href: "/app/recipes" },
    { label: "Позиций на складе", value: inventory.inStockItems, href: "/app/ingredients" },
    { label: "Всего на складе", value: inventory.totalItems, href: "/app/ingredients" }
  ];

  const primaryActions = [
    {
      href: "/app/recipes/new",
      title: "Создать рецепт",
      description: "Соберите рецепт из структурированных ингредиентов и сразу увидите статистику.",
      icon: FlaskConical
    },
    {
      href: "/app/ingredients",
      title: "Пополнить склад",
      description: "Добавьте, что есть в наличии, — потом эти ингредиенты подставятся в рецепты.",
      icon: Boxes
    },
    {
      href: "/catalog",
      title: "Открыть каталог",
      description: "Найдите ингредиент и добавьте его на склад или прямо в рецепт.",
      icon: Library
    }
  ];

  const discoverLinks = [
    { href: "/bjcp", title: "Стили пива", description: "Справочник стилей BJCP", icon: Sparkles },
    { href: "/calculators", title: "Калькуляторы", description: "15 пивоваренных расчётов", icon: Calculator },
    { href: "/recipes", title: "Публичные рецепты", description: "Витрина опубликованных", icon: FlaskConical }
  ];

  return (
    <div className="space-y-10">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          С возвращением, {greetingName}
        </h1>
      </section>

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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">С чего начать</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {primaryActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-900 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                  <p className="flex items-center gap-1 font-semibold text-zinc-950">
                    {action.title}
                    <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </p>
                  <p className="text-sm leading-6 text-zinc-600">{action.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Полезное рядом</h2>
          <Link href="/app/recipes/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950">
            <Plus className="h-4 w-4" /> Новый рецепт
          </Link>
        </div>
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950">{link.title}</p>
                  <p className="truncate text-xs text-zinc-500">{link.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
