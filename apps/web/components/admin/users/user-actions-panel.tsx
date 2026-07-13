"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@nb/auth";

import { Button, Select, Textarea, useToast } from "@nb/ui";

import {
  anonymizeUserAction,
  blockUserAction,
  changeUserRoleAction,
  unblockUserAction
} from "@/app/(admin)/admin/users/actions";
import { AnonymizeUserDialog } from "@/components/admin/users/anonymize-user-dialog";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  BLOCK_REASON_MAX,
  BLOCK_REASON_MIN,
  anonymizeConfirmationValue,
  userRoleLabels,
  userRoles,
  type AdminUserDetail
} from "@/features/admin-users/contracts";

type Props = {
  user: AdminUserDetail;
  isSelf: boolean;
};

export function UserActionsPanel({ user, isSelf }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const [role, setRole] = useState<UserRole>(user.role);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [unblockError, setUnblockError] = useState<string | null>(null);

  const [anonymizeDialogOpen, setAnonymizeDialogOpen] = useState(false);
  const [anonymizeError, setAnonymizeError] = useState<string | null>(null);

  const anonymized = user.status === "anonymized";
  const blocked = user.status === "blocked";
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= BLOCK_REASON_MIN && trimmedReason.length <= BLOCK_REASON_MAX;

  const handleChangeRole = () => {
    startTransition(async () => {
      const result = await changeUserRoleAction(user.id, role);
      if (!result.ok) {
        setRoleError(result.error);
        show({ title: "Не удалось сменить роль", description: result.error, tone: "danger" });
        return;
      }
      setRoleDialogOpen(false);
      setRoleError(null);
      show({ title: "Роль изменена", tone: "success" });
      router.refresh();
    });
  };

  const handleBlock = () => {
    startTransition(async () => {
      const result = await blockUserAction(user.id, trimmedReason);
      if (!result.ok) {
        setBlockError(result.error);
        show({ title: "Не удалось заблокировать", description: result.error, tone: "danger" });
        return;
      }
      setBlockDialogOpen(false);
      setBlockError(null);
      setReason("");
      show({ title: "Пользователь заблокирован", tone: "success" });
      router.refresh();
    });
  };

  const handleUnblock = () => {
    startTransition(async () => {
      const result = await unblockUserAction(user.id);
      if (!result.ok) {
        setUnblockError(result.error);
        show({ title: "Не удалось разблокировать", description: result.error, tone: "danger" });
        return;
      }
      setUnblockDialogOpen(false);
      setUnblockError(null);
      show({ title: "Блокировка снята", tone: "success" });
      router.refresh();
    });
  };

  const handleAnonymize = (confirmation: string) => {
    startTransition(async () => {
      const result = await anonymizeUserAction(user.id, confirmation);
      if (!result.ok) {
        setAnonymizeError(result.error);
        show({ title: "Не удалось удалить аккаунт", description: result.error, tone: "danger" });
        return;
      }
      setAnonymizeDialogOpen(false);
      setAnonymizeError(null);
      show({ title: "Аккаунт обезличен", tone: "success" });
      router.refresh();
    });
  };

  if (anonymized) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Действия</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Аккаунт обезличен: персональные данные стёрты, вход закрыт. Действия недоступны.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Действия</h2>

      {isSelf ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Это ваш аккаунт: сменить себе роль, заблокировать или удалить себя нельзя.
        </p>
      ) : null}

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Роль"
            value={role}
            disabled={isSelf || isPending}
            onChange={(event) => setRole(event.target.value as UserRole)}
            containerClassName="min-w-48"
          >
            {userRoles.map((item) => (
              <option key={item} value={item}>
                {userRoleLabels[item]}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={isSelf || isPending || role === user.role}
            onClick={() => {
              setRoleError(null);
              setRoleDialogOpen(true);
            }}
          >
            Сменить роль
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        {blocked ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Причина блокировки: {user.blockedReason ?? "не указана"}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setUnblockError(null);
                setUnblockDialogOpen(true);
              }}
            >
              Разблокировать
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="block-reason" className="text-sm font-medium text-foreground">
              Причина блокировки
            </label>
            <Textarea
              id="block-reason"
              value={reason}
              disabled={isSelf || isPending}
              onChange={(event) => setReason(event.target.value)}
              placeholder={`Что нарушено (${BLOCK_REASON_MIN}–${BLOCK_REASON_MAX} символов)`}
              className="h-24"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="dangerOutline"
                disabled={isSelf || isPending || !reasonValid}
                onClick={() => {
                  setBlockError(null);
                  setBlockDialogOpen(true);
                }}
              >
                Заблокировать
              </Button>
              {trimmedReason.length > 0 && trimmedReason.length < BLOCK_REASON_MIN ? (
                <span className="text-xs text-muted-foreground">
                  Нужно ещё {BLOCK_REASON_MIN - trimmedReason.length} симв.
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="danger"
          disabled={isSelf || isPending}
          onClick={() => {
            setAnonymizeError(null);
            setAnonymizeDialogOpen(true);
          }}
        >
          Удалить аккаунт
        </Button>
        <span className="text-xs text-muted-foreground">Обезличивание: данные стираются, вернуть нельзя.</span>
      </div>

      <ConfirmActionDialog
        open={roleDialogOpen}
        title="Сменить роль?"
        description={`${user.displayName}: ${userRoleLabels[user.role]} → ${userRoleLabels[role]}. Новая роль действует сразу, повторный вход не нужен.`}
        confirmLabel="Сменить роль"
        pendingLabel="Меняем…"
        tone="primary"
        pending={isPending}
        error={roleError}
        onClose={() => {
          setRoleDialogOpen(false);
          setRoleError(null);
        }}
        onConfirm={handleChangeRole}
      />

      <ConfirmActionDialog
        open={blockDialogOpen}
        title="Заблокировать пользователя?"
        description="Вход закроется сразу на всех устройствах, пивоварни BrewForge отключатся. Данные сохранятся — блокировку можно снять."
        confirmLabel="Заблокировать"
        pendingLabel="Блокируем…"
        pending={isPending}
        error={blockError}
        onClose={() => {
          setBlockDialogOpen(false);
          setBlockError(null);
        }}
        onConfirm={handleBlock}
      />

      <ConfirmActionDialog
        open={unblockDialogOpen}
        title="Снять блокировку?"
        description="Пользователь снова сможет войти и пользоваться своими устройствами."
        confirmLabel="Разблокировать"
        pendingLabel="Снимаем…"
        tone="primary"
        pending={isPending}
        error={unblockError}
        onClose={() => {
          setUnblockDialogOpen(false);
          setUnblockError(null);
        }}
        onConfirm={handleUnblock}
      />

      <AnonymizeUserDialog
        open={anonymizeDialogOpen}
        confirmationValue={anonymizeConfirmationValue(user)}
        pending={isPending}
        error={anonymizeError}
        onClose={() => {
          setAnonymizeDialogOpen(false);
          setAnonymizeError(null);
        }}
        onConfirm={handleAnonymize}
      />
    </section>
  );
}
