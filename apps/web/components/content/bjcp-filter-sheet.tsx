"use client";

import React from "react";

import { Button, Sheet } from "@nb/ui";
import type {
  BjcpAdvancedFilters,
  BjcpFilterGroup,
  BjcpFilterOptionId
} from "@/features/content/bjcp-catalog";
import { advancedFilterDefinitions } from "@/features/content/bjcp-catalog";

type Props = {
  open: boolean;
  filters: BjcpAdvancedFilters;
  onToggle: (group: BjcpFilterGroup, value: BjcpFilterOptionId) => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
};

export function BjcpFilterSheet({
  open,
  filters,
  onToggle,
  onReset,
  onApply,
  onClose
}: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Уточнить каталог"
      side="right"
    >
      <div className="space-y-6">
        {advancedFilterDefinitions.map((group) => (
          <section key={group.id} className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-950">{group.label}</h3>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const active = filters[group.id].includes(option.id);

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onToggle(group.id, option.id)}
                    className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="md" onClick={onReset}>
          Сбросить всё
        </Button>
        <Button type="button" size="md" onClick={onApply}>
          Применить
        </Button>
      </div>
    </Sheet>
  );
}
