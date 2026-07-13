"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Select } from "@nb/ui";

type AdminPaginationProps = {
  page: number;
  totalPages: number;
  // Всего записей — подпись «N записей», если передано.
  total?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  pageParam?: string;
  pageSizeParam?: string;
  className?: string;
};

const defaultPageSizeOptions = [20, 50, 100];

// Окно номеров: 1 … (page-1, page, page+1) … last.
const buildPageWindow = (page: number, totalPages: number): (number | "gap")[] => {
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const visible = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((left, right) => left - right);

  return visible.flatMap((value, index) => {
    const previous = visible[index - 1];
    return previous !== undefined && value - previous > 1 ? ["gap" as const, value] : [value];
  });
};

const pageButtonClassName = (active: boolean) =>
  `inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-muted-foreground hover:text-foreground"
  }`;

export function AdminPagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions = defaultPageSizeOptions,
  pageParam = "page",
  pageSizeParam = "pageSize",
  className = ""
}: AdminPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete(pageParam);
    } else {
      params.set(pageParam, String(nextPage));
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const handlePageSizeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(pageSizeParam, value);
    // Размер страницы меняет разбивку — остаться на старом номере значит уехать
    // в пустоту, поэтому возвращаемся на первую.
    params.delete(pageParam);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  if (totalPages <= 1 && pageSize === undefined) {
    return null;
  }

  const items = buildPageWindow(page, Math.max(1, totalPages));

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {typeof total === "number" ? <span>{total} записей</span> : null}
        {pageSize !== undefined ? (
          <Select
            aria-label="Записей на странице"
            value={String(pageSize)}
            onChange={(event) => handlePageSizeChange(event.target.value)}
            className="h-9 w-auto py-1 text-sm"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} на странице
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <nav aria-label="Страницы" className="flex flex-wrap items-center gap-1">
          {page > 1 ? (
            <Link href={buildHref(page - 1)} aria-label="Предыдущая страница" className={pageButtonClassName(false)}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden="true" className={`${pageButtonClassName(false)} pointer-events-none opacity-50`}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}

          {items.map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <Link
                key={item}
                href={buildHref(item)}
                aria-current={item === page ? "page" : undefined}
                className={pageButtonClassName(item === page)}
              >
                {item}
              </Link>
            )
          )}

          {page < totalPages ? (
            <Link href={buildHref(page + 1)} aria-label="Следующая страница" className={pageButtonClassName(false)}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden="true" className={`${pageButtonClassName(false)} pointer-events-none opacity-50`}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
