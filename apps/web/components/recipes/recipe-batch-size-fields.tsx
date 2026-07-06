"use client";

import React from "react";

import { inventoryVolumeUnits } from "@/features/inventory/units";

type Props = {
  quantity: string;
  unit: string;
  onChange: (patch: { quantity?: string; unit?: string }) => void;
};

export function RecipeBatchSizeFields({ quantity, unit, onChange }: Props) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Объём партии</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="batch-size-quantity">Количество</label>
          <input
            id="batch-size-quantity"
            type="number"
            min={0.1}
            step="0.1"
            value={quantity}
            onChange={(event) => onChange({ quantity: event.target.value })}
            className="h-10 w-full rounded-md border border-border px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="batch-size-unit">Единица</label>
          <select
            id="batch-size-unit"
            value={unit}
            onChange={(event) => onChange({ unit: event.target.value })}
            className="h-10 w-full rounded-md border border-border px-3 text-sm"
          >
            {inventoryVolumeUnits.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}
