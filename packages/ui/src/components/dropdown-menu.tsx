"use client";

import * as React from "react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";

import { cn } from "../lib/utils";

export type DropdownMenuItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
  onSelect: () => void;
  disabled?: boolean;
};

type DropdownMenuProps = {
  trigger: React.ReactNode;
  items: DropdownMenuItem[];
  align?: "start" | "end";
  "aria-label"?: string;
};

export function DropdownMenu({ trigger, items, align = "start", "aria-label": ariaLabel }: DropdownMenuProps) {
  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          aria-label={ariaLabel}
          className="z-[110] min-w-[10rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground p-1 shadow-lg outline-none"
        >
          {items.map((item) => (
            <RadixDropdownMenu.Item
              key={item.key}
              disabled={item.disabled}
              onSelect={() => item.onSelect()}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                item.tone === "danger"
                  ? "text-destructive data-[highlighted]:bg-destructive-subtle"
                  : "text-foreground data-[highlighted]:bg-accent"
              )}
            >
              {item.icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span> : null}
              {item.label}
            </RadixDropdownMenu.Item>
          ))}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}
