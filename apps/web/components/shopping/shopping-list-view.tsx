import React from "react";
import Link from "next/link";
import {
  Beer,
  CircleCheck,
  Droplets,
  FlaskConical,
  Hop,
  Package,
  Plus,
  ShoppingCart,
  Wheat
} from "lucide-react";

import type { ShoppingListDto, ShoppingListGroupDto, ShoppingListLineDto } from "@/features/shopping/contracts";

type GroupMeta = { icon: React.ComponentType<{ className?: string }>; color: string; bg: string };

const groupMeta: Record<ShoppingListGroupDto["category"], GroupMeta> = {
  fermentable: { icon: Wheat, color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/15" },
  hop: { icon: Hop, color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
  yeast: { icon: FlaskConical, color: "text-violet-500 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/15" },
  water_treatment: { icon: Droplets, color: "text-sky-500 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-500/15" },
  consumable: { icon: Package, color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/15" },
  other: { icon: Package, color: "text-muted-foreground", bg: "bg-muted" }
};

const pluralize = (count: number, forms: [string, string, string]) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
};

const resolveNeededByLabel = (neededBy: ShoppingListLineDto["neededBy"]) => {
  const names = [...new Set(neededBy.map((need) => need.brewName))];
  const shown = names.slice(0, 2).join(", ");
  const rest = names.length - Math.min(2, names.length);
  const prefix = names.length === 1 ? "Для варки" : "Для варок";
  return rest > 0 ? `${prefix}: ${shown} +${rest}` : `${prefix}: ${shown}`;
};

function ShoppingLineRow({ line }: { line: ShoppingListLineDto }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:p-5">
      <div className="min-w-0 flex-1">
        <h4 className="text-[15px] font-semibold leading-snug text-foreground">
          {line.catalogHref ? (
            <Link href={line.catalogHref} className="transition-colors hover:text-muted-foreground">
              {line.ingredientDisplayName}
            </Link>
          ) : (
            line.ingredientDisplayName
          )}
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{resolveNeededByLabel(line.neededBy)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-bold tabular-nums text-foreground">{line.quantityLabel}</span>
        {line.addToStockHref ? (
          <Link
            href={line.addToStockHref}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            На склад
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function ShoppingGroup({ group }: { group: ShoppingListGroupDto }) {
  const meta = groupMeta[group.category];
  const Icon = meta.icon;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${meta.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {group.items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {group.items.map((line) => (
          <ShoppingLineRow key={line.key} line={line} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ reason }: { reason: NonNullable<ShoppingListDto["emptyReason"]> }) {
  if (reason === "all_in_stock") {
    return (
      <section className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success-subtle">
          <CircleCheck className="h-8 w-8 text-success" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Всё готово к варке</h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            Для всех запланированных варок ингредиентов на складе достаточно — докупать нечего.
          </p>
        </div>
        <Link
          href="/app/brew-batches"
          className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          <Beer className="h-4 w-4" />
          К варкам
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <ShoppingCart className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Список покупок пуст</h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          Он собирается из запланированных варок: выберите рецепт и запланируйте варку — здесь появится,
          чего не хватает на складе и сколько докупить.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/app/recipes"
          className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          <FlaskConical className="h-4 w-4" />
          К рецептам
        </Link>
        <Link
          href="/app/brew-batches"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-border hover:bg-muted"
        >
          Мои варки
        </Link>
      </div>
    </section>
  );
}

export function ShoppingListView({ list }: { list: ShoppingListDto }) {
  const brewCount = list.plannedBrews.length;

  return (
    <main className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Список покупок</h1>
          {list.emptyReason === null ? (
            <p className="text-sm text-muted-foreground">
              {list.totalItems} {pluralize(list.totalItems, ["позиция", "позиции", "позиций"])} докупить
              {" · "}
              {brewCount} {pluralize(brewCount, ["запланированная варка", "запланированные варки", "запланированных варок"])}
            </p>
          ) : null}
        </div>
      </section>

      {list.emptyReason ? (
        <EmptyState reason={list.emptyReason} />
      ) : (
        <div className="space-y-8">
          {list.groups.map((group) => (
            <ShoppingGroup key={group.category} group={group} />
          ))}
        </div>
      )}
    </main>
  );
}
