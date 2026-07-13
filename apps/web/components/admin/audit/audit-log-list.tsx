import Link from "next/link";
import { Badge } from "@nb/ui";

import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { SYSTEM_ACTOR_NAME, type AuditLogEntry } from "@/features/audit/contracts";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const entityHref = (entry: AuditLogEntry) => {
  if (!entry.entityId) {
    return null;
  }
  switch (entry.entityType) {
    case "user":
      return `/admin/users/${entry.entityId}`;
    case "recipe":
      return `/admin/recipes?q=${encodeURIComponent(entry.entityId)}`;
    case "ingredient":
      return `/admin/ingredients/${entry.entityId}`;
    case "master":
      return `/admin/masters/${entry.entityId}`;
    default:
      return null;
  }
};

const columns: AdminDataTableColumn<AuditLogEntry>[] = [
  {
    key: "createdAt",
    header: "Когда",
    cardLabel: "Когда",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (entry) => dateFormatter.format(entry.createdAt)
  },
  {
    key: "action",
    header: "Действие",
    cardLabel: "Действие",
    cell: (entry) => <Badge tone="neutral">{entry.actionLabel}</Badge>
  },
  {
    key: "actor",
    header: "Кто",
    cardLabel: "Кто",
    cell: (entry) => (
      <span className={entry.actorName === SYSTEM_ACTOR_NAME ? "text-muted-foreground" : undefined}>
        {entry.actorUserId ? (
          <Link
            href={`/admin/users/${entry.actorUserId}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {entry.actorName}
          </Link>
        ) : (
          entry.actorName
        )}
      </span>
    )
  },
  {
    key: "summary",
    header: "Что",
    cardLabel: "Что",
    cell: (entry) => {
      const href = entityHref(entry);
      const text = entry.summary ?? "—";
      return href ? (
        <Link href={href} className="underline-offset-4 hover:underline">
          {text}
        </Link>
      ) : (
        <span>{text}</span>
      );
    }
  }
];

export function AuditLogList({ items }: { items: AuditLogEntry[] }) {
  return (
    <AdminDataTable
      items={items}
      columns={columns}
      getRowId={(entry) => entry.id}
      getRowLabel={(entry) => entry.actionLabel}
      empty={<p className="text-sm text-muted-foreground">Записей нет.</p>}
    />
  );
}
