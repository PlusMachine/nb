"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "../lib/utils";

export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "size"
> & {
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, indeterminate = false, onCheckedChange, ...props },
  forwardedRef
) {
  const innerRef = React.useRef<HTMLInputElement | null>(null);

  // indeterminate существует только как DOM-свойство: HTML-атрибута у него нет,
  // поэтому его выставляем через ref после каждого рендера.
  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate, props.checked]);

  return (
    <span className={cn("relative inline-flex h-5 w-5 shrink-0", className)}>
      <input
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        type="checkbox"
        onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
        className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-input bg-card transition-colors checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary-foreground opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100">
        {indeterminate ? (
          <Minus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        ) : (
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        )}
      </span>
    </span>
  );
});
