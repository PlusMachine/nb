import React from "react";
import Link from "next/link";

import { Badge } from "@nb/ui";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { requireContentRole } from "@/features/content/permissions";
import { countOpenFeedback } from "@/features/feedback/service";
import { listProposedIngredients } from "@/features/ingredients/service";
import { countPendingMasters } from "@/features/masters/service";
import { resolveAdminNavGroups } from "@/lib/admin-navigation";
import { hasRequiredRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Счётчики очередей: только для тех, кто эти очереди разбирает.
const loadQueueCounts = async (canModerate: boolean): Promise<Record<string, number>> => {
  if (!canModerate) {
    return {};
  }

  const [pendingMasters, openFeedback, pendingProposals] = await Promise.all([
    countPendingMasters(),
    countOpenFeedback(),
    listProposedIngredients("pending").then((rows) => rows.length)
  ]);

  return {
    "/admin/masters": pendingMasters,
    "/admin/feedback": openFeedback,
    "/admin/ingredients/moderation": pendingProposals
  };
};

export default async function AdminZonePage() {
  const user = await requireContentRole("editor");
  const groups = resolveAdminNavGroups(user.role);
  const counts = await loadQueueCounts(hasRequiredRole(user.role, "moderator"));

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Обзор" />

      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {group.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              const count = counts[item.href] ?? 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-accent"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{item.label}</span>
                      {count > 0 ? (
                        <Badge tone="warning" size="sm">
                          {count}
                        </Badge>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
