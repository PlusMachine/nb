import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium leading-tight",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        success: "border-success/30 bg-success-subtle text-success-subtle-foreground",
        warning: "border-warning/30 bg-warning-subtle text-warning-subtle-foreground",
        danger: "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground",
        // Синего subtle-токена в палитре нет, поэтому info строится на --link.
        info: "border-link/30 bg-link/10 text-link"
      },
      size: {
        sm: "px-1.5 py-0.5 text-[11px]",
        md: "px-2.5 py-0.5 text-xs"
      }
    },
    defaultVariants: { tone: "neutral", size: "md" }
  }
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
