"use client";
import * as React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

import { cn } from "../lib/utils";

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  label?: string;
  containerClassName?: string;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, containerClassName, label, id, ...props },
  ref
) {
  const generatedId = React.useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn("grid gap-1.5", containerClassName)}>
      {label ? (
        <label htmlFor={selectId} className="text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          id={selectId}
          ref={ref}
          className={cn(
            "h-10 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
            className
          )}
          {...props}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
    </div>
  );
});

export const SelectScaffold = () => (
  <RadixSelect.Root defaultValue="light">
    <RadixSelect.Trigger className="flex h-10 w-44 items-center justify-between rounded-md border px-3 text-sm">
      <RadixSelect.Value placeholder="Choose style" />
      <ChevronDown className="h-4 w-4" />
    </RadixSelect.Trigger>
    <RadixSelect.Portal>
      <RadixSelect.Content className="rounded-md border border-border bg-popover text-popover-foreground p-1 shadow-lg">
        <RadixSelect.Viewport>
          <RadixSelect.Item className="cursor-pointer rounded px-2 py-1 text-sm" value="light"><RadixSelect.ItemText>Light Ale</RadixSelect.ItemText></RadixSelect.Item>
          <RadixSelect.Item className="cursor-pointer rounded px-2 py-1 text-sm" value="ipa"><RadixSelect.ItemText>IPA</RadixSelect.ItemText></RadixSelect.Item>
        </RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  </RadixSelect.Root>
);
