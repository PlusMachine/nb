import React from "react";

type Props = {
  checked: boolean;
};

export function InventoryArchivedToggle({ checked }: Props) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <input name="archived" type="checkbox" value="true" defaultChecked={checked} className="size-4" />
      Показывать архивные
    </label>
  );
}
