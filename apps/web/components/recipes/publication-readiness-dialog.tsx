"use client";

import React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";

import type { buildRecipePublicationChecklist } from "@/features/recipes/publication-validation";

/**
 * Чек-лист «чего не хватает для публикации» — вынесен из recipe-designer.tsx
 * (файл, на котором сходятся несколько параллельных правок) без изменения
 * логики чек-листа, только модальная обвязка переведена на @nb/ui Dialog.
 */
export function PublicationReadinessDialog({
  open,
  checklist,
  onClose
}: {
  open: boolean;
  checklist: ReturnType<typeof buildRecipePublicationChecklist>;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title="Для публичного показа рецепта необходимо заполнить"
      hideTitle
      size="lg"
    >
      <DialogHeader>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">Для публичного показа рецепта необходимо заполнить:</h3>
          <p className="text-sm leading-6 text-muted-foreground">Публикация станет доступна, когда все обязательные пункты будут отмечены как готовые.</p>
        </div>
        <DialogCloseButton />
      </DialogHeader>

      <div className="space-y-2 p-5">
        {checklist.map((item) => (
          <div
            key={item.key}
            className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${item.isSatisfied ? "border-success/30 bg-success-subtle/70" : "border-destructive-border bg-destructive-subtle/70"}`}
          >
            <div className="flex min-w-0 items-start gap-2">
              {item.isSatisfied ? (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-medium ${item.isSatisfied ? "text-success-subtle-foreground" : "text-destructive-subtle-foreground"}`}>{item.label}</p>
                {item.message ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.message}</p> : null}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${item.isSatisfied ? "bg-success-subtle text-success-subtle-foreground" : "bg-destructive-subtle text-destructive-subtle-foreground"}`}>
              {item.statusLabel}
            </span>
          </div>
        ))}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Закрыть
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
