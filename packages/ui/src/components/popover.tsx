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
  portalContainer?: HTMLElement | null;
  "aria-label"?: string;
};

type AnchoredPopoverProps = React.ComponentPropsWithoutRef<typeof RadixPopover.Content> & {
  anchor: React.ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Controlled content anchored to an input without moving focus away from it. */
export function AnchoredPopover({
  anchor,
  open,
  onOpenChange,
  children,
  onOpenAutoFocus = event => event.preventDefault(),
  onCloseAutoFocus = event => event.preventDefault(),
  ...contentProps
}: AnchoredPopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Anchor asChild>{anchor}</RadixPopover.Anchor>
      <RadixPopover.Portal>
        <RadixPopover.Content {...contentProps} onOpenAutoFocus={onOpenAutoFocus} onCloseAutoFocus={onCloseAutoFocus}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export function Popover({ trigger, children, align = "center", side = "bottom", onOpenChange, contentClassName, portalContainer, "aria-label": ariaLabel }: PopoverProps) {
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
      <RadixPopover.Portal container={portalContainer}>
        <RadixPopover.Content
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={8}
          aria-label={ariaLabel}
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
