import React from "react";

import type { IngredientCategory } from "@/features/ingredients/contracts";
import { inventoryCategoryLabels } from "@/features/inventory/page-model";

import { AddIngredientTrigger } from "./add-ingredient-trigger";

type Props = {
  hasAnyItems?: boolean;
  hasFilters?: boolean;
  search?: string;
  category?: IngredientCategory;
  showFinished?: boolean;
};

export function InventoryEmptyState({
  hasAnyItems = false,
  hasFilters = false,
  search = "",
  category,
  showFinished = false
}: Props) {
  if (!hasAnyItems) {
    return (
      <section className="space-y-3 rounded-lg border border-dashed p-6 text-center">
        <h2 className="text-lg font-semibold">Пока нет ингредиентов</h2>
        <p className="text-sm text-zinc-600">
          Здесь будут ваши запасы солода, хмеля, дрожжей и других ингредиентов. Это база для подбора рецептов и планирования варок.
        </p>
        <div>
          <AddIngredientTrigger fullWidth className="sm:w-auto" />
        </div>
      </section>
    );
  }

  let title = "Нет результатов";
  let description = "Попробуйте изменить параметры поиска или фильтры.";

  if (search) {
    title = "По вашему запросу ничего не найдено";
    description = `Не нашли "${search}" среди текущих запасов.`;
  } else if (category) {
    title = "Для выбранной категории нет позиций";
    description = `В категории «${inventoryCategoryLabels[category]}» пока нет подходящих ингредиентов.`;
  } else if (!showFinished && !hasFilters) {
    title = "Сейчас в наличии ничего нет";
    description = "Включите «Показывать закончившиеся», чтобы увидеть позиции с нулевым остатком и быстро пополнить их.";
  } else if (showFinished) {
    title = "Даже закончившихся позиций не найдено";
    description = "Попробуйте изменить запрос или снять часть фильтров.";
  }

  return (
    <section className="space-y-2 rounded-lg border border-dashed p-6 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600">{description}</p>
    </section>
  );
}
