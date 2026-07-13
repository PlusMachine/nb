"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@nb/ui";
import { useToast } from "@nb/ui";

import { deletePushSubscriptionAction } from "@/app/(admin)/admin/push/actions";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import type { PushSubscriptionAdminRow } from "@/features/notifications/admin";

const formatDate = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export function PushSubscriptionsTable({ items }: { items: PushSubscriptionAdminRow[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<PushSubscriptionAdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    if (!target) {
      return;
    }

    const id = target.id;
    startTransition(async () => {
      const result = await deletePushSubscriptionAction(id);
      if (!result.ok) {
        setError(result.error);
        show({ title: "Не удалось удалить подписку", description: result.error, tone: "danger" });
        return;
      }

      setTarget(null);
      setError(null);
      show({ title: "Подписка удалена", tone: "success" });
      router.refresh();
    });
  };

  const columns: AdminDataTableColumn<PushSubscriptionAdminRow>[] = [
    {
      key: "user",
      header: "Пользователь",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.userName}</div>
          {row.userEmail ? <div className="truncate text-xs text-muted-foreground">{row.userEmail}</div> : null}
        </div>
      )
    },
    {
      key: "browser",
      header: "Браузер",
      headerClassName: "w-40",
      cell: (row) => <span className="text-foreground">{row.browser}</span>
    },
    {
      key: "platform",
      header: "Устройство",
      headerClassName: "w-32",
      cell: (row) => <span className="text-foreground">{row.platform}</span>
    },
    {
      key: "service",
      header: "Push-сервис",
      headerClassName: "w-56",
      cell: (row) => <span className="text-xs text-muted-foreground">{row.service}</span>
    },
    {
      key: "failures",
      header: "Ошибки доставки",
      headerClassName: "w-40",
      cell: (row) =>
        row.failureCount > 0 ? (
          <Badge tone="warning" size="sm">{row.failureCount}</Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )
    },
    {
      key: "createdAt",
      header: "Добавлена",
      headerClassName: "w-48",
      cell: (row) => <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>
    },
    {
      key: "actions",
      header: "",
      cardLabel: "",
      headerClassName: "w-32",
      cell: (row) => (
        <Button
          type="button"
          variant="dangerOutline"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setTarget(row);
            setError(null);
          }}
        >
          Удалить
        </Button>
      )
    }
  ];

  return (
    <>
      <AdminDataTable
        items={items}
        columns={columns}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.userName}
        empty={
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Подписок пока нет.
          </p>
        }
      />

      <ConfirmActionDialog
        open={target !== null}
        title="Удалить подписку?"
        description={
          target
            ? `Устройство «${target.browser} · ${target.platform}» пользователя ${target.userName} перестанет получать пуши. Подписаться заново можно из браузера.`
            : ""
        }
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        pending={isPending}
        error={error}
        onClose={() => {
          setTarget(null);
          setError(null);
        }}
        onConfirm={handleDelete}
      />
    </>
  );
}
