import React from "react";

type Props = {
  defaultValue: string;
};

export function InventorySearchInput({ defaultValue }: Props) {
  return (
    <label className="flex-1 text-sm font-medium" htmlFor="inventory-search">
      Поиск
      <input
        id="inventory-search"
        name="search"
        type="search"
        defaultValue={defaultValue}
        placeholder="Например, Citra или Пилснер"
        className="mt-1 w-full rounded-md border px-3 py-2"
      />
    </label>
  );
}
