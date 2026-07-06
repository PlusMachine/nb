"use client";

import * as React from "react";
import * as RadixPopover from "@radix-ui/react-popover";

import { cn } from "../lib/utils";

type PopoverAlign = "start" | "center" | "end";
type PopoverSide = "top" | "bottom" | "left" | "right";

type PopoverProps = {
  /** Render-prop триггера; оборачивается в Popover.Trigger asChild. */
  trigger: (state: { open: boolean }) => React.ReactNode;
  children: React.ReactNode | ((state: { close: () => void }) => React.ReactNode);
  align?: PopoverAlign;
  side?: PopoverSide;
  /** Для commit-on-close потребителей (применить значение при закрытии). */
  onOpenChange?: (open: boolean) => void;
  /** Переопределить ширину контента, если он шире дефолтного max-w-sm. */
  contentClassName?: string;
};

export function Popover({ trigger, children, align = "center", side = "bottom", onOpenChange, contentClassName }: PopoverProps) {
  const [open, setOpenState] = React.useState(false);

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const close = React.useCallback(() => setOpen(false), [setOpen]);

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>{trigger({ open })}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className={cn(
            "z-[110] w-max max-w-sm rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg outline-none",
            contentClassName
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
