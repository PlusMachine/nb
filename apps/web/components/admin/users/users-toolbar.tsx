"use client";

import { useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import type { UserRole } from "@nb/auth";

import { Input, Select } from "@nb/ui";
import { useDebouncedUrlSearch } from "@/components/shared/use-debounced-url-search";
import {
  adminUserSortLabels,
  adminUserSortOptions,
  adminUserStatusLabels,
  adminUserStatuses,
  buildAdminUsersHref,
  defaultAdminUserSortOption,
  userRoleLabels,
  userRoles,
  type AdminUserSortOption,
  type AdminUserStatus
} from "@/features/admin-users/contracts";

type Props = {
  basePath: string;
  q: string;
  role: UserRole | undefined;
  status: AdminUserStatus | undefined;
  sort: AdminUserSortOption;
  pageSize: number;
};

export function UsersToolbar({ basePath, q, role, status, sort, pageSize }: Props) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  const buildHref = useCallback(
    (next: {
      q?: string;
      role?: UserRole | "all";
      status?: AdminUserStatus | "all";
      sort?: AdminUserSortOption;
    }) =>
      buildAdminUsersHref(basePath, {
        q: next.q ?? q,
        role: next.role ?? role ?? "all",
        status: next.status ?? status ?? "all",
        sort: next.sort ?? sort,
        pageSize
      }),
    [basePath, pageSize, q, role, sort, status]
  );

  const buildSearchHref = useCallback((nextQ: string) => buildHref({ q: nextQ }), [buildHref]);

  const { inputValue, setInputValue, isPending: isSearchPending, onFocus, onBlur } = useDebouncedUrlSearch({
    value: q,
    buildHref: buildSearchHref
  });

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  const isPending = isSearchPending || isNavigating;
  const hasFilters =
    Boolean(inputValue.trim()) || role !== undefined || status !== undefined || sort !== defaultAdminUserSortOption;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
      <div className="grid gap-1.5">
        <label htmlFor="admin-users-search" className="text-sm font-medium text-foreground">
          Поиск
        </label>
        <div className="relative">
          <Input
            id="admin-users-search"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Имя, e-mail или телефон"
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
        label="Роль"
        value={role ?? "all"}
        onChange={(event) => navigate(buildHref({ role: event.target.value as UserRole | "all" }))}
      >
        <option value="all">Все роли</option>
        {userRoles.map((item) => (
          <option key={item} value={item}>
            {userRoleLabels[item]}
          </option>
        ))}
      </Select>

      <Select
        label="Статус"
        value={status ?? "all"}
        onChange={(event) => navigate(buildHref({ status: event.target.value as AdminUserStatus | "all" }))}
      >
        <option value="all">Все статусы</option>
        {adminUserStatuses.map((item) => (
          <option key={item} value={item}>
            {adminUserStatusLabels[item]}
          </option>
        ))}
      </Select>

      <Select
        label="Сортировка"
        value={sort}
        onChange={(event) => navigate(buildHref({ sort: event.target.value as AdminUserSortOption }))}
      >
        {adminUserSortOptions.map((item) => (
          <option key={item} value={item}>
            {adminUserSortLabels[item]}
          </option>
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
