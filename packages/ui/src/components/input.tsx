import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn("h-10 w-full rounded-md border border-input bg-card text-foreground placeholder:text-muted-foreground px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring", className)}
    {...props}
  />
);
