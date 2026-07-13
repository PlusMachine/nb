"use client";

import { useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";

import { Input, Select } from "@nb/ui";
import { useDebouncedUrlSearch } from "@/components/shared/use-debounced-url-search";
import {
  adminCatalogSortLabels,
  adminCatalogSortOptions,
  buildAdminIngredientsHref,
  defaultAdminCatalogSortOption,
  ingredientCatalogCategoryOrder,
  ingredientCatalogStatusLabels,
  ingredientCatalogStatuses,
  type AdminCatalogSortOption,
  type IngredientCatalogStatus
} from "@/features/ingredients/admin-page-model";
import type { IngredientCategory } from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";

type Props = {
  basePath: string;
  q: string;
  category: IngredientCategory | undefined;
  status: IngredientCatalogStatus | undefined;
  sort: AdminCatalogSortOption;
  pageSize: number;
};

const searchDebounceMs = 250;

export function AdminCatalogToolbar({ basePath, q, category, status, sort, pageSize }: Props) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  const buildHref = useCallback(
    (next: {
      q?: string;
      category?: IngredientCategory | "all";
      status?: IngredientCatalogStatus | "all";
      sort?: AdminCatalogSortOption;
    }) => buildAdminIngredientsHref(basePath, {
      q: next.q ?? q,
      category: next.category ?? category ?? "all",
      status: next.status ?? status ?? "all",
      sort: next.sort ?? sort,
      pageSize
    }),
    [basePath, category, pageSize, q, sort, status]
  );

  const buildSearchHref = useCallback(
    (nextQ: string) => buildHref({ q: nextQ }),
    [buildHref]
  );

  const {
    inputValue,
    setInputValue,
    isPending: isSearchPending,
    onFocus,
    onBlur
  } = useDebouncedUrlSearch({ value: q, buildHref: buildSearchHref, debounceMs: searchDebounceMs });

  // Смена фильтра сбрасывает пагинацию на первую страницу: buildAdminIngredientsHref
  // не переносит page, поэтому достаточно навигации по новому href.
  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  const isPending = isSearchPending || isNavigating;

  const hasFilters = Boolean(inputValue.trim())
    || category !== undefined
    || status !== undefined
    || sort !== defaultAdminCatalogSortOption;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
      <div className="grid gap-1.5">
        <label htmlFor="admin-catalog-search" className="text-sm font-medium text-foreground">
          Поиск
        </label>
        <div className="relative">
          <Input
            id="admin-catalog-search"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Название, бренд, производитель, алиас"
            className="pr-10"
          />
          {isPending ? (
            <span role="status" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="sr-only">Обновляем список…</span>
            </span>
          ) : null}
        </div>
      </div>

      <Select
        label="Категория"
        value={category ?? "all"}
        onChange={(event) => {
          const value = event.target.value as IngredientCategory | "all";
          navigate(buildHref({ category: value }));
        }}
      >
        <option value="all">Все категории</option>
        {ingredientCatalogCategoryOrder.map((item) => (
          <option key={item} value={item}>{ingredientCategoryLabels[item]}</option>
        ))}
      </Select>

      <Select
        label="Статус"
        value={status ?? "all"}
        onChange={(event) => {
          const value = event.target.value as IngredientCatalogStatus | "all";
          navigate(buildHref({ status: value }));
        }}
      >
        <option value="all">Все статусы</option>
        {ingredientCatalogStatuses.map((item) => (
          <option key={item} value={item}>{ingredientCatalogStatusLabels[item]}</option>
        ))}
      </Select>

      <Select
        label="Сортировка"
        value={sort}
        onChange={(event) => {
          const value = event.target.value as AdminCatalogSortOption;
          navigate(buildHref({ sort: value }));
        }}
      >
        {adminCatalogSortOptions.map((item) => (
          <option key={item} value={item}>{adminCatalogSortLabels[item]}</option>
        ))}
      </Select>

      <Link
        href={basePath}
        aria-disabled={!hasFilters}
        className={`inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium transition-colors ${
          hasFilters
            ? "bg-card text-foreground hover:bg-accent"
            : "pointer-events-none bg-muted text-muted-foreground/60"
        }`}
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
        Сбросить
      </Link>
    </div>
  );
}
