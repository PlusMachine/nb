import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl border border-zinc-200 bg-white p-4 shadow-sm", className)} {...props} />
);
