"use client";

import React from "react";
import { Button } from "@nb/ui";

import { countAdminBulkFailures, type AdminBulkFailureGroup } from "@/lib/admin-bulk";

// Панель частичного отказа массовой операции: что именно не прошло и почему.
// Имена, а не id: модератору нужно узнать позиции в списке, а не сверять uuid.

export function AdminBulkFailures<Reason extends string>({
  failed,
  labels,
  resolveName,
  onDismiss
}: {
  failed: AdminBulkFailureGroup<Reason>[];
  labels: Record<Reason, string>;
  resolveName: (id: string) => string;
  onDismiss: () => void;
}) {
  if (failed.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-warning/30 bg-warning-subtle p-4 text-sm text-warning-subtle-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="font-medium">Не прошло: {countAdminBulkFailures(failed)}</p>
          <ul className="space-y-1">
            {failed.map((group) => (
              <li key={group.reason}>
                <span className="font-medium">{labels[group.reason]}</span>
                {" — "}
                {group.ids.map((id) => resolveName(id)).join(", ")}
              </li>
            ))}
          </ul>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Скрыть
        </Button>
      </div>
    </div>
  );
}
