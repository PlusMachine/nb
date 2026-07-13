"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@nb/ui";

import { UrlSearchField } from "@/components/shared/url-search-field";
import {
  adminRecipeSortLabels,
  adminRecipeSorts,
  buildAdminRecipesHref,
  defaultAdminRecipePageSize,
  defaultAdminRecipeSort,
  type AdminRecipeSort,
  type AdminRecipesQuery
} from "@/features/recipes/admin-page-model";

export function AdminRecipesToolbar({ query }: { query: AdminRecipesQuery }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <UrlSearchField
        id="admin-recipes-search"
        label="Поиск"
        value={query.q}
        basePath="/admin/recipes"
        params={{
          status: query.status === "all" ? undefined : query.status,
          sort: query.sort === defaultAdminRecipeSort ? undefined : query.sort,
          pageSize: query.pageSize === defaultAdminRecipePageSize ? undefined : String(query.pageSize)
        }}
        placeholder="Название или автор"
        className="min-w-0 flex-1 sm:max-w-sm"
      />

      <Select
        label="Сортировка"
        value={query.sort}
        onChange={(event) =>
          router.push(buildAdminRecipesHref(query, { sort: event.target.value as AdminRecipeSort }))
        }
        containerClassName="w-auto"
        className="h-9 w-auto py-1 text-sm"
      >
        {adminRecipeSorts.map((sort) => (
          <option key={sort} value={sort}>
            {adminRecipeSortLabels[sort]}
          </option>
        ))}
      </Select>
    </div>
  );
}
