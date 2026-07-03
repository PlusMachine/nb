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
  fermentable: { icon: Wheat, color: "text-amber-500", bg: "bg-amber-50" },
  hop: { icon: Hop, color: "text-emerald-500", bg: "bg-emerald-50" },
  yeast: { icon: FlaskConical, color: "text-violet-500", bg: "bg-violet-50" },
  water_treatment: { icon: Droplets, color: "text-sky-500", bg: "bg-sky-50" },
  consumable: { icon: Package, color: "text-orange-500", bg: "bg-orange-50" },
  other: { icon: Package, color: "text-zinc-400", bg: "bg-zinc-100" }
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
    <li className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:p-5">
      <div className="min-w-0 flex-1">
        <h4 className="text-[15px] font-semibold leading-snug text-zinc-900">
          {line.catalogHref ? (
            <Link href={line.catalogHref} className="transition-colors hover:text-zinc-600">
              {line.ingredientDisplayName}
            </Link>
          ) : (
            line.ingredientDisplayName
          )}
        </h4>
        <p className="mt-0.5 text-xs text-zinc-400">{resolveNeededByLabel(line.neededBy)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-bold tabular-nums text-zinc-900">{line.quantityLabel}</span>
        {line.addToStockHref ? (
          <Link
            href={line.addToStockHref}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
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
        <h3 className="text-sm font-semibold text-zinc-700">{group.label}</h3>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-400">
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
      <section className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-14 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
          <CircleCheck className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-800">Всё готово к варке</h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-400">
            Для всех запланированных варок ингредиентов на складе достаточно — докупать нечего.
          </p>
        </div>
        <Link
          href="/app/brew-batches"
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          <Beer className="h-4 w-4" />
          К варкам
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-50">
        <ShoppingCart className="h-8 w-8 text-zinc-300" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-800">Список покупок пуст</h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-400">
          Он собирается из запланированных варок: выберите рецепт и запланируйте варку — здесь появится,
          чего не хватает на складе и сколько докупить.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/app/recipes"
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          <FlaskConical className="h-4 w-4" />
          К рецептам
        </Link>
        <Link
          href="/app/brew-batches"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
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
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">Список покупок</h1>
          {list.emptyReason === null ? (
            <p className="text-sm text-zinc-400">
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
