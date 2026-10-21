"use client";

import React from "react";
import Link from "next/link";
import { Cpu } from "lucide-react";

import {
  brewBatchStatusBadgeClass,
  brewBatchStatusLabels,
  formatBrewBatchDisplayTitle,
  isSameTitle,
  type BrewBatchListItem
} from "@/features/brew-batches/contracts";
import { BatchMenu } from "@/features/brew-batches/components/batch-menu";

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

/** Строка списка партий: ссылка на деталь + меню (отмена/удаление) сбоку. */
export function BrewBatchListRow({ batch }: { batch: BrewBatchListItem }) {
  const date = relevantDate(batch);

  return (
    <li className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-border/70">
      <Link
        href={`/app/brew-batches/${batch.id}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {formatBrewBatchDisplayTitle(batch.name, batch.brewNumber)}
          </p>
          {isSameTitle(batch.name, batch.recipeTitle) ? null : (
            <p className="truncate text-sm text-muted-foreground">{batch.recipeTitle}</p>
          )}
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
      <div className="flex shrink-0 items-center border-l border-border/60 px-1.5">
        <BatchMenu brewBatchId={batch.id} status={batch.status} variant="compact" />
      </div>
    </li>
  );
}
