"use client";

import { useRouter } from "next/navigation";
import { Select } from "@nb/ui";

import { auditActionLabels, auditActions, type AuditLogFilters } from "@/features/audit/contracts";
import { buildAuditLogHref } from "@/features/audit/page-model";

export function AuditLogToolbar({ query }: { query: AuditLogFilters }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        label="Действие"
        value={query.action ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          router.push(
            buildAuditLogHref(query, {
              action: value ? (value as (typeof auditActions)[number]) : undefined,
              page: 1
            })
          );
        }}
        className="min-w-0 sm:w-72"
      >
        <option value="">Все действия</option>
        {auditActions.map((action) => (
          <option key={action} value={action}>
            {auditActionLabels[action]}
          </option>
        ))}
      </Select>

      {query.actorUserId || query.entityId ? (
        <button
          type="button"
          onClick={() => router.push("/admin/audit")}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Сбросить фильтры
        </button>
      ) : null}
    </div>
  );
}
