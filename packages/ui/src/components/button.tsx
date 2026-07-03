import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-zinc-900 text-white hover:bg-zinc-700",
        outline: "border border-zinc-200 bg-white hover:bg-zinc-100",
        ghost: "hover:bg-zinc-100",
        // Действие-акцент (пуск/подтверждение) и деструктив (стоп/аварийно).
        primary: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40",
        danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/40",
        dangerOutline: "border border-red-200 bg-white text-red-700 hover:bg-red-50"
      },
      // Размер задаёт паддинги/тач-таргет.
      size: {
        sm: "min-h-[36px] px-3 py-1.5 text-xs",
        md: "min-h-[44px] px-4 py-2 text-sm"
      }
    },
    defaultVariants: { variant: "default", size: "md" }
  }
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
