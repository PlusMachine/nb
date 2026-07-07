import React from "react";
import Link from "next/link";
import { Cpu } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { listBrewBatchesForUser } from "@/features/brew-batches/service";
import {
  brewBatchStatusBadgeClass,
  brewBatchStatusLabels,
  type BrewBatchListItem,
  type BrewBatchStatus
} from "@/features/brew-batches/contracts";
import { NewBrewButton } from "@/components/recipes/new-brew-button";

export const metadata = {
  title: "Партии"
};

// Активные партии сверху, завершённые/отменённые — ниже.
const statusOrder: BrewBatchStatus[] = ["brewing", "fermenting", "planned", "completed", "cancelled"];

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

const relevantDate = (batch: BrewBatchListItem): { label: string; value: Date } => {
  if (batch.status === "completed" && batch.completedAt) {
    return { label: "Завершена", value: batch.completedAt };
  }
  if (batch.startedAt) {
    return { label: "Начата", value: batch.startedAt };
  }
  if (batch.plannedFor) {
    return { label: "План", value: batch.plannedFor };
  }
  return { label: "Создана", value: batch.createdAt };
};

export default async function BrewBatchesPage() {
  const user = await requireUser();
  const batches = await listBrewBatchesForUser(user.id);

  const sorted = [...batches].sort((a, b) => {
    const byStatus = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
    if (byStatus !== 0) {
      return byStatus;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <main className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Партии</h1>
        <div className="flex items-center gap-4">
          <Link href="/app/recipes" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            К рецептам
          </Link>
          <NewBrewButton />
        </div>
      </section>

      {sorted.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Пока нет ни одной партии.</p>
          <NewBrewButton />
        </section>
      ) : (
        <ul className="space-y-2">
          {sorted.map((batch) => {
            const date = relevantDate(batch);
            return (
              <li key={batch.id}>
                <Link
                  href={`/app/brew-batches/${batch.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-border/70"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{batch.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{batch.recipeTitle}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {batch.hasDevice ? <Cpu className="h-4 w-4 text-muted-foreground" aria-label="С устройством" /> : null}
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {date.label} {dateFormat.format(date.value)}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${brewBatchStatusBadgeClass[batch.status]}`}>
                      {brewBatchStatusLabels[batch.status]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
