import React from "react";

type Props = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
};

export function InventoryArchivedToggle({ checked, onChange }: Props) {
  const controlProps = onChange
    ? {
      checked,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)
    }
    : {
      defaultChecked: checked
    };

  return (
    <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <input name="archived" type="checkbox" value="true" className="size-4" {...controlProps} />
      Показывать архивные
    </label>
  );
}
