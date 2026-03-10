import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export const Table = ({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
);
export const THead = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => <thead className={cn("[&_tr]:border-b", className)} {...props} />;
export const TBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
export const TR = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("border-b", className)} {...props} />;
export const TH = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => <th className={cn("h-10 px-2 text-left font-medium", className)} {...props} />;
export const TD = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => <td className={cn("p-2", className)} {...props} />;
