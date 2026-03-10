import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn("h-10 w-full rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400", className)}
    {...props}
  />
);
