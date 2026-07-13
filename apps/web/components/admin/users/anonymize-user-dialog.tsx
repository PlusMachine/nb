"use client";

import { useEffect, useState } from "react";

import { Button, Dialog, DialogFooter, Input } from "@nb/ui";

type Props = {
  open: boolean;
  /** E-mail (или телефон) аккаунта — его администратор вводит слово в слово. */
  confirmationValue: string | null;
  pending: boolean;
  error: string | null;
  onConfirm: (confirmation: string) => void;
  onClose: () => void;
};

export function AnonymizeUserDialog({ open, confirmationValue, pending, error, onConfirm, onClose }: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      setValue("");
    }
  }, [open]);

  const matches =
    confirmationValue !== null && value.trim().toLowerCase() === confirmationValue.toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title="Удалить аккаунт?"
      hideTitle
      size="md"
      guard={{ isDirty: () => pending, onGuardedClose: () => {} }}
    >
      <div className="space-y-4 p-5">
        <h3 className="text-base font-semibold text-foreground">Удалить аккаунт?</h3>

        <p className="text-sm leading-6 text-muted-foreground">
          Аккаунт будет обезличен: e-mail, телефон, пароль, имя и привязки VK/Яндекс сотрутся навсегда —
          включая e-mail в записях журнала. Вход закроется. Рецепты, партии и записи журнала останутся, но
          будут подписаны «Удалённый пользователь».
        </p>

        {confirmationValue ? (
          <div className="grid gap-1.5">
            <label htmlFor="anonymize-confirmation" className="text-sm font-medium text-foreground">
              Введите <span className="font-mono">{confirmationValue}</span> для подтверждения
            </label>
            <Input
              id="anonymize-confirmation"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : (
          <p className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
            У аккаунта нет ни e-mail, ни телефона — подтверждать нечего, обезличивать нечего.
          </p>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground ring-1 ring-inset ring-destructive-border"
          >
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending || !matches}
          onClick={() => onConfirm(value.trim())}
        >
          {pending ? "Удаляем…" : "Удалить аккаунт"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
