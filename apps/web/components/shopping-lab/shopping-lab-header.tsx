"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@nb/ui";

import { CopyListButton } from "@/components/shopping/copy-list-button";
import { TransferDialog } from "@/components/shopping/transfer-dialog";
import type { ShoppingListGroupDto, ShoppingManualItemDto } from "@/features/shopping/contracts";

import { ShoppingLabAddDialog } from "./shopping-lab-add-dialog";

/**
 * Черновик IA (лаборатория, v2): замена боевого BuySectionHeader
 * (components/shopping/buy-section-header.tsx) — тот же каркас (заголовок +
 * «куплено K» + CopyListButton + перенос на склад), плюс кнопка «Добавить
 * позицию», открывающая ShoppingLabAddDialog вместо инлайн-формы внизу
 * списка (см. shopping-lab-view.tsx). Заголовок карточки в v2 — «Список
 * покупок» (в бою и в v1 лаборатории — «Добавить на склад»).
 */
export function ShoppingLabHeader({
  groups,
  manualItems,
  checkedCount
}: {
  groups: ShoppingListGroupDto[];
  manualItems: ShoppingManualItemDto[];
  checkedCount: number;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-base font-semibold text-foreground">Список покупок</h2>
        {checkedCount > 0 ? (
          <span className="text-sm text-muted-foreground">куплено {checkedCount}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <CopyListButton groups={groups} manualItems={manualItems} />
        <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Добавить позицию
        </Button>
        <ShoppingLabAddDialog open={addOpen} onOpenChange={setAddOpen} />
        {checkedCount > 0 ? (
          <>
            <Button type="button" variant="primary" size="sm" onClick={() => setTransferOpen(true)}>
              Пополнить склад ({checkedCount})
            </Button>
            <TransferDialog
              open={transferOpen}
              onOpenChange={setTransferOpen}
              groups={groups}
              manualItems={manualItems}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
