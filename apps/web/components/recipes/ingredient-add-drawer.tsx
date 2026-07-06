"use client";

import React from "react";
import { Dialog } from "@nb/ui";

export function IngredientAddDrawer({
  open,
  children,
  onClose
}: {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Редактор ингредиента рецепта"
      hideTitle
      size="sheet"
    >
      <div className="pointer-events-none flex shrink-0 justify-center pt-2 pb-1 sm:hidden" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
      </div>
      {children}
    </Dialog>
  );
}
