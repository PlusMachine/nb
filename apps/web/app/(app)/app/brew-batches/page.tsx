import React from "react";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { listBrewBatchesForUser } from "@/features/brew-batches/service";
import type { BrewBatchStatus } from "@/features/brew-batches/contracts";
import { BrewBatchListRow } from "@/features/brew-batches/components/brew-batch-list-row";
import { NewBrewButton } from "@/components/recipes/new-brew-button";

export const metadata = {
  title: "Партии"
};

// Активные партии сверху, завершённые/отменённые — ниже.
const statusOrder: BrewBatchStatus[] = ["brewing", "fermenting", "planned", "completed", "cancelled"];

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
          {sorted.map((batch) => (
            <BrewBatchListRow key={batch.id} batch={batch} />
          ))}
        </ul>
      )}
    </main>
  );
}
