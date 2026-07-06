"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

import { deleteEquipmentProfileAction } from "./actions";

type Props = {
  profileId: string;
  profileName: string;
};

export function DeleteEquipmentProfileButton({ profileId, profileName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive-border bg-card px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive-subtle"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Удалить
      </button>
      <ConfirmActionDialog
        open={open}
        title="Удалить профиль оборудования?"
        description={`Профиль "${profileName}" будет удален без возможности восстановления.`}
        confirmLabel="Удалить профиль"
        pending={isPending}
        error={error}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await deleteEquipmentProfileAction(profileId);
            if (result.ok) {
              setOpen(false);
              router.refresh();
              return;
            }

            setError(result.message);
          });
        }}
      />
    </>
  );
}
