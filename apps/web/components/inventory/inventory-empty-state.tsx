import React from "react";

import type { IngredientType } from "@/features/ingredients/contracts";
import { inventoryTypeLabels } from "@/features/inventory/page-model";

import { AddIngredientTrigger } from "./add-ingredient-trigger";

type Props = {
  hasAnyItems?: boolean;
  hasFilters?: boolean;
  search?: string;
  type?: IngredientType;
  archived?: boolean;
};

export function InventoryEmptyState({ hasAnyItems = false, hasFilters = false, search = "", type, archived = false }: Props) {
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
  } else if (type) {
    title = "Для выбранного типа нет позиций";
    description = `В фильтре «${inventoryTypeLabels[type]}» пока нет подходящих ингредиентов.`;
  } else if (archived && hasFilters) {
    title = "Нет архивных позиций";
    description = "В ваших запасах пока нет архивных ингредиентов.";
  }

  return (
    <section className="space-y-2 rounded-lg border border-dashed p-6 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600">{description}</p>
    </section>
  );
}
