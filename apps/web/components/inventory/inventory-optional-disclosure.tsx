"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import type { SystemCurrency } from "@/features/system/currency";

export type InventoryOptionalFieldsState = {
  priceInputMode: InventoryPriceInputMode;
  priceInputAmount: string;
  purchasedAt: string;
  freshnessDate: string;
  notes: string;
};

type InventoryOptionalDisclosureProps = {
  open: boolean;
  onToggle: () => void;
  fields: InventoryOptionalFieldsState;
  preferredCurrency: SystemCurrency;
  testId?: string;
  children?: React.ReactNode;
};

const formatSummaryDate = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) {
    return normalized;
  }

  return `${day}.${month}.${year}`;
};

export const createInitialInventoryOptionalFields = (): InventoryOptionalFieldsState => ({
  priceInputMode: "total",
  priceInputAmount: "",
  purchasedAt: "",
  freshnessDate: "",
  notes: ""
});

export const resolveInventoryOptionalDisclosureSummary = (
  fields: InventoryOptionalFieldsState,
  preferredCurrency: SystemCurrency
) => {
  const entries: string[] = [];
  const normalizedPrice = fields.priceInputAmount.trim();
  const normalizedNotes = fields.notes.trim();
  const purchasedAtLabel = formatSummaryDate(fields.purchasedAt);
  const freshnessDateLabel = formatSummaryDate(fields.freshnessDate);

  if (normalizedPrice) {
    entries.push(
      fields.priceInputMode === "per_display_unit"
        ? `Цена за ед.: ${normalizedPrice} ${preferredCurrency}`
        : `Цена: ${normalizedPrice} ${preferredCurrency}`
    );
  }

  if (purchasedAtLabel) {
    entries.push(`Покупка: ${purchasedAtLabel}`);
  }

  if (freshnessDateLabel) {
    entries.push(`Годен до: ${freshnessDateLabel}`);
  }

  if (normalizedNotes) {
    entries.push("Есть заметка");
  }

  return entries;
};

export function InventoryOptionalDisclosure({
  open,
  onToggle,
  fields,
  preferredCurrency,
  testId,
  children
}: InventoryOptionalDisclosureProps) {
  const summaryEntries = resolveInventoryOptionalDisclosureSummary(fields, preferredCurrency);

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4" data-testid={testId}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 rounded-lg text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-zinc-900">Добавить цену, дату, срок или заметку</span>
            <span className="text-xs text-zinc-500">Необязательно</span>
          </div>
          <p className="text-xs text-zinc-500">
            {summaryEntries.length > 0
              ? summaryEntries.join(" • ")
              : "Можно оставить пустым и заполнить позже."}
          </p>
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? children : null}
    </section>
  );
}
