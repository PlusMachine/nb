import React from "react";
import type { InventorySummaryDto } from "@/features/inventory/contracts";
import { inventorySummaryRows } from "@/features/inventory/page-model";

type Props = {
  summary: InventorySummaryDto;
};

export function InventorySummary({ summary }: Props) {
  const byCategoryRows = inventorySummaryRows(summary);

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Сводка по ингредиентам">
      <h2 className="text-lg font-semibold">Сводка</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Всего позиций</p>
          <p className="text-2xl font-semibold">{summary.totalItems}</p>
        </article>
        <article className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">В наличии</p>
          <p className="text-2xl font-semibold">{summary.inStockItems}</p>
        </article>
        <article className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Пустые</p>
          <p className="text-2xl font-semibold">{summary.emptyItems}</p>
        </article>
      </div>
      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs text-muted-foreground">По категориям</p>
        {byCategoryRows.length > 0 ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {byCategoryRows.map((row) => (
              <li key={row.category} className="flex justify-between gap-4">
                <span>{row.label}</span>
                <span className="font-medium">{row.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Пока нет данных по категориям.</p>
        )}
      </div>
    </section>
  );
}
