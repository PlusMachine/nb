import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={cn("min-h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400", className)}
    {...props}
  />
);
