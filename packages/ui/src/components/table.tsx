import type { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export const Table = ({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn("w-full caption-bottom border-collapse text-sm text-foreground", className)} {...props} />
);

export type TableHeaderProps = HTMLAttributes<HTMLTableSectionElement> & {
  /**
   * Липкая шапка. Прилипает к ближайшему скролл-контейнеру: если таблица лежит
   * в блоке с overflow, задай ему max-height, иначе прилипать будет не к чему.
   */
  sticky?: boolean;
};

export const TableHeader = ({ className, sticky = false, ...props }: TableHeaderProps) => (
  <thead
    className={cn(
      "[&_tr]:border-b [&_tr]:border-border [&_tr:hover]:bg-transparent",
      // Safari не держит position:sticky на <thead>, поэтому дублируем на ячейки;
      // фон обязателен, иначе строки просвечивают под шапкой при прокрутке.
      sticky && "sticky top-0 z-10 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card",
      className
    )}
    {...props}
  />
);

export const TableBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
);

export const TableFooter = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tfoot className={cn("border-t border-border bg-muted/40 font-medium [&_tr]:border-0", className)} {...props} />
);

export const TableRow = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn(
      "border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
);

export const TableHead = ({ className, scope = "col", ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope={scope}
    className={cn(
      "h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-muted-foreground",
      className
    )}
    {...props}
  />
);

export const TableCell = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-3 py-2 align-middle", className)} {...props} />
);

export const TableCaption = ({ className, ...props }: HTMLAttributes<HTMLTableCaptionElement>) => (
  <caption className={cn("mt-3 text-xs text-muted-foreground", className)} {...props} />
);

export const THead = TableHeader;
export const TBody = TableBody;
export const TR = TableRow;
export const TH = TableHead;
export const TD = TableCell;
