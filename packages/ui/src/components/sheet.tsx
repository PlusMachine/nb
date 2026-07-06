"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "../lib/utils";

export type SheetSide = "bottom" | "right" | "left";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  side?: SheetSide;
  children: React.ReactNode;
};

/**
 * side="bottom" — всегда bottom-sheet (мобайл и десктоп).
 * side="right" — на sm+ боковая панель во всю высоту справа, на мобиле —
 * bottom-sheet (переиспользует .animate-modal-content: её CSS уже переключается
 * на modal-sheet-up ниже 640px, см. app/globals.css).
 * side="left" — боковая панель во всю высоту слева фиксированной ширины
 * (навигационные drawer'ы), одинаково на всех брейкпоинтах.
 */
export function Sheet({ open, onOpenChange, title, side = "bottom", children }: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-modal-backdrop fixed inset-0 z-[100] bg-zinc-950/50 backdrop-blur-[2px]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed z-[101] flex flex-col overflow-y-auto border-border bg-popover text-popover-foreground shadow-2xl focus:outline-none",
            side === "bottom"
              ? "animate-modal-sheet inset-x-0 bottom-0 max-h-[92vh] w-full rounded-t-2xl border-t"
              : side === "right"
                ? cn(
                    "animate-modal-content inset-x-0 bottom-0 max-h-[92vh] w-full rounded-t-2xl border-t",
                    "sm:inset-x-auto sm:inset-y-0 sm:bottom-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
                  )
                : "animate-modal-sheet-left inset-y-0 left-0 h-full w-72 max-w-[85%] border-r"
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-popover/95 px-5 py-4 backdrop-blur-sm">
            <RadixDialog.Title className="text-base font-semibold text-foreground">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Закрыть"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
