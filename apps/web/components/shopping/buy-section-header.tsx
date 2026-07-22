"use client";

import { useState } from "react";
import { Button } from "@nb/ui";

import type { ShoppingListGroupDto, ShoppingManualItemDto } from "@/features/shopping/contracts";

import { CopyListButton } from "./copy-list-button";
import { TransferDialog } from "./transfer-dialog";

/**
 * Шапка блока «Добавить на склад» (П2): при checkedCount > 0 — рядом с
 * заголовком подпись «куплено K» (реальная информация, не слоп-подзаголовок)
 * и primary-кнопка «Пополнить склад (K)», открывающая диалог переноса.
 * Кнопка «Скопировать список» (П3) видна независимо от checkedCount — сама
 * решает, есть ли что копировать (по неотмеченным строкам).
 */
export function BuySectionHeader({
  groups,
  manualItems,
  checkedCount
}: {
  groups: ShoppingListGroupDto[];
  manualItems: ShoppingManualItemDto[];
  checkedCount: number;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-base font-semibold text-foreground">Добавить на склад</h2>
        {checkedCount > 0 ? (
          <span className="text-sm text-muted-foreground">куплено {checkedCount}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <CopyListButton groups={groups} manualItems={manualItems} />
        {checkedCount > 0 ? (
          <>
            <Button type="button" variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
              Пополнить склад ({checkedCount})
            </Button>
            <TransferDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              groups={groups}
              manualItems={manualItems}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
