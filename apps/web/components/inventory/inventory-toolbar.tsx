"use client";

import React from "react";
import { useEffect, useState } from "react";

import type { IngredientType } from "@/features/ingredients/contracts";

import { InventoryArchivedToggle } from "./inventory-archived-toggle";
import { InventorySearchInput } from "./inventory-search-input";
import { InventoryTypeFilter } from "./inventory-type-filter";

type Props = {
  search: string;
  type: IngredientType | "all";
  archived: boolean;
};

export function InventoryToolbar({ search, type, archived }: Props) {
  const [selectedType, setSelectedType] = useState<IngredientType | "all">(type);
  const [showArchived, setShowArchived] = useState(archived);

  useEffect(() => {
    setSelectedType(type);
  }, [type]);

  useEffect(() => {
    setShowArchived(archived);
  }, [archived]);

  return (
    <form className="rounded-lg border p-3" method="get" aria-label="Фильтры по запасам">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <InventorySearchInput defaultValue={search} type={selectedType} archived={showArchived} />
        <InventoryTypeFilter value={selectedType} onChange={setSelectedType} />
        <InventoryArchivedToggle checked={showArchived} onChange={setShowArchived} />
        <div className="flex gap-2 md:ml-auto">
          <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white">Применить</button>
          <a href="/app/ingredients" className="rounded-md border px-3 py-2 text-sm">Сбросить</a>
        </div>
      </div>
    </form>
  );
}
