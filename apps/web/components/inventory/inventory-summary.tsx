import React from "react";
import type { InventorySummaryDto } from "@/features/inventory/contracts";
import { inventorySummaryRows } from "@/features/inventory/page-model";

type Props = {
  summary: InventorySummaryDto;
};

export function InventorySummary({ summary }: Props) {
  const byTypeRows = inventorySummaryRows(summary);

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Сводка по ингредиентам">
      <h2 className="text-lg font-semibold">Сводка</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border p-3">
          <p className="text-xs text-zinc-500">Всего позиций</p>
          <p className="text-2xl font-semibold">{summary.totalItems}</p>
        </article>
        <article className="rounded-md border p-3">
          <p className="text-xs text-zinc-500">Активные</p>
          <p className="text-2xl font-semibold">{summary.activeItems}</p>
        </article>
        <article className="rounded-md border p-3">
          <p className="text-xs text-zinc-500">Архивные</p>
          <p className="text-2xl font-semibold">{summary.archivedItems}</p>
        </article>
      </div>
      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs text-zinc-500">По типам</p>
        {byTypeRows.length > 0 ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {byTypeRows.map((row) => (
              <li key={row.type} className="flex justify-between gap-4">
                <span>{row.label}</span>
                <span className="font-medium">{row.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Пока нет данных по типам.</p>
        )}
      </div>
    </section>
  );
}
