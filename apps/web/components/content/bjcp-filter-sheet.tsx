"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-start sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Фильтры BJCP"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-[2rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Фильтры</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
              Уточнить каталог
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-950"
            aria-label="Закрыть фильтры"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-6">
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
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Сбросить всё
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
