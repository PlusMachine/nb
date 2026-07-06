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
  group?: string | null;
  showFinished?: boolean;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
};

export function InventoryEmptyState({
  hasAnyItems = false,
  hasFilters = false,
  search = "",
  category,
  subtype = null,
  group = null,
  showFinished = false,
  initialQuickStartDataByContext = null
}: Props) {
  if (!hasAnyItems) {
    return (
      <section className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <PackageOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Пока нет ингредиентов</h2>
        <AddIngredientTrigger initialQuickStartDataByContext={initialQuickStartDataByContext} />
      </section>
    );
  }

  let title = "Нет результатов";
  let description = "Попробуйте изменить параметры поиска или фильтры.";
  let Icon = SlidersHorizontal;
  const filterLabel = resolveInventoryFilterLabel({
    category,
    subtype,
    group
  });

  if (search) {
    title = "Ничего не найдено";
    description = `Не нашли «${search}» среди текущих запасов.`;
    Icon = Search;
  } else if (category && !showFinished) {
    title = `Нет позиций в наличии`;
    description = `Включите «Показать закончившиеся», чтобы увидеть позиции с нулевым остатком в «${filterLabel}».`;
  } else if (category) {
    title = `Нет позиций`;
    description = `В «${filterLabel}» пока нет ингредиентов.`;
  } else if (!showFinished && !hasFilters) {
    title = "Сейчас в наличии ничего нет";
    description = "Включите «Показать закончившиеся», чтобы увидеть позиции с нулевым остатком.";
  } else if (showFinished) {
    title = "Ничего не найдено";
    description = "Попробуйте изменить запрос или снять часть фильтров.";
  } else if (!hasFilters) {
    title = "Список пуст";
    description = "Добавьте ингредиенты на склад или снимите архивирование у существующих позиций.";
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}
