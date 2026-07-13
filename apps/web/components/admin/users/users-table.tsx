import Link from "next/link";

import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { UserStatusBadge } from "@/components/admin/users/user-status-badge";
import { userRoleLabels, type AdminUserListItem } from "@/features/admin-users/contracts";

const formatDate = (value: Date) => new Date(value).toLocaleDateString("ru-RU", { dateStyle: "medium" });

const columns: AdminDataTableColumn<AdminUserListItem>[] = [
  {
    key: "user",
    header: "Пользователь",
    cell: (user) => (
      <Link href={`/admin/users/${user.id}`} className="font-medium text-foreground hover:text-primary">
        {user.displayName}
      </Link>
    )
  },
  {
    key: "contacts",
    header: "Контакты",
    cell: (user) => (
      <div className="text-sm text-muted-foreground">
        {user.email ? <div className="break-all">{user.email}</div> : null}
        {user.phone ? <div>{user.phone}</div> : null}
        {!user.email && !user.phone ? <span>—</span> : null}
      </div>
    )
  },
  {
    key: "role",
    header: "Роль",
    headerClassName: "w-36",
    cell: (user) => <span className="text-sm">{userRoleLabels[user.role]}</span>
  },
  {
    key: "status",
    header: "Статус",
    headerClassName: "w-32",
    cell: (user) => <UserStatusBadge status={user.status} size="sm" />
  },
  {
    key: "activity",
    header: "Рецепты / партии",
    headerClassName: "w-32",
    cell: (user) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {user.recipesCount} / {user.batchesCount}
      </span>
    )
  },
  {
    key: "createdAt",
    header: "Регистрация",
    headerClassName: "w-32",
    cell: (user) => <span className="text-sm text-muted-foreground">{formatDate(user.createdAt)}</span>
  }
];

export function UsersTable({ items }: { items: AdminUserListItem[] }) {
  return (
    <AdminDataTable
      items={items}
      columns={columns}
      getRowId={(user) => user.id}
      getRowLabel={(user) => user.displayName}
      empty={
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Никого не нашлось.
        </p>
      }
    />
  );
}
