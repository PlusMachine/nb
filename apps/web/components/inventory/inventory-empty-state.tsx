import React from "react";
import { PackageOpen, Search, SlidersHorizontal } from "lucide-react";

import type {
  IngredientCategory,
  IngredientPickerQuickStartResultByContext,
  IngredientSubtype
} from "@/features/ingredients/contracts";
import { resolveInventoryFilterLabel } from "@/features/inventory/page-model";

import { AddIngredientTrigger } from "./add-ingredient-trigger";

type Props = {
  hasAnyItems?: boolean;
  hasFilters?: boolean;
  search?: string;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  showFinished?: boolean;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
};

export function InventoryEmptyState({
  hasAnyItems = false,
  hasFilters = false,
  search = "",
  category,
  subtype = null,
  showFinished = false,
  initialQuickStartDataByContext = null
}: Props) {
  if (!hasAnyItems) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
          <PackageOpen className="h-7 w-7 text-zinc-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900">Пока нет ингредиентов</h2>
          <p className="mx-auto max-w-sm text-sm text-zinc-500">
            Здесь будут ваши запасы солода, хмеля, дрожжей и других ингредиентов. Это база для подбора рецептов и планирования варок.
          </p>
        </div>
        <AddIngredientTrigger initialQuickStartDataByContext={initialQuickStartDataByContext} />
      </section>
    );
  }

  let title = "Нет результатов";
  let description = "Попробуйте изменить параметры поиска или фильтры.";
  let Icon = SlidersHorizontal;
  const filterLabel = resolveInventoryFilterLabel({
    category,
    subtype
  });

  if (search) {
    title = "По вашему запросу ничего не найдено";
    description = `Не нашли «${search}» среди текущих запасов.`;
    Icon = Search;
  } else if (category && !showFinished) {
    title = `Для выбран${subtype ? "ного фильтра" : "ной категории"} нет позиций в наличии`;
    description = `Включите «Показать закончившиеся», чтобы увидеть позиции с нулевым остатком ${subtype ? "в разделе" : "в категории"} «${filterLabel}».`;
  } else if (category) {
    title = `Для выбран${subtype ? "ного фильтра" : "ной категории"} нет позиций`;
    description = `${subtype ? "В разделе" : "В категории"} «${filterLabel}» пока нет подходящих ингредиентов.`;
  } else if (!showFinished && !hasFilters) {
    title = "Сейчас в наличии ничего нет";
    description = "Включите «Показать закончившиеся», чтобы увидеть позиции с нулевым остатком и быстро пополнить их.";
  } else if (showFinished) {
    title = "Даже закончившихся позиций не найдено";
    description = "Попробуйте изменить запрос или снять часть фильтров.";
  } else if (!hasFilters) {
    title = "Список пуст";
    description = "Добавьте ингредиенты на склад или снимите архивирование у существующих позиций.";
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/30 px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
        <Icon className="h-5 w-5 text-zinc-400" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
    </section>
  );
}
