"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@nb/ui";

import { revokeDeviceAction } from "@/app/(admin)/admin/devices/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

export function DeviceRevokeButton({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeDeviceAction(deviceId);
      if (!result.ok) {
        setError(result.error);
        show({ title: "Не удалось отвязать", description: result.error, tone: "danger" });
        return;
      }

      setOpen(false);
      setError(null);
      show({ title: `Устройство «${deviceName}» отвязано`, tone: "success" });
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant="dangerOutline" size="sm" disabled={isPending} onClick={() => setOpen(true)}>
        Отвязать
      </Button>

      <ConfirmActionDialog
        open={open}
        title={`Отвязать «${deviceName}»?`}
        description="Токен будет аннулирован — устройство перестанет подключаться к порталу, пока владелец не привяжет его заново. История телеметрии сохранится."
        confirmLabel="Отвязать"
        pendingLabel="Отвязываем…"
        pending={isPending}
        error={error}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        onConfirm={handleRevoke}
      />
    </>
  );
}
