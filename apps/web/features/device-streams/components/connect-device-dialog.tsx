"use client";

// =============================================================================
//  features/device-streams/components/connect-device-dialog.tsx
//  Диалог «выбрать свободный стрим-устройство → привязать к ЭТОЙ партии»
//  (§5 F2): общий для входа №1 (шаг «Ареометр уже в сусле?» после перевода в
//  «Брожение», see just-fermenting-prompt.tsx) и входа №2 (строка «Подключить
//  ареометр» на странице партии, see attach-device-control.tsx). brewBatchId —
//  фиксирован пропом, устройство выбирается из списка свободных (уже
//  отфильтрованы listAvailableStreamDevices на сервере — без активного сеанса).
// =============================================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Dialog, DialogFooter, Select, useToast } from "@nb/ui";

import { createFermentSessionAction } from "@/features/device-streams/actions";
import {
  streamHardwareKindLabels,
  type AvailableStreamDeviceDto,
  type StreamHardwareKind
} from "@/features/device-streams/contracts";

import { RetroAttachField } from "./retro-attach-field";

type Props = {
  open: boolean;
  title: string;
  brewBatchId: string;
  devices: AvailableStreamDeviceDto[];
  cancelLabel?: string;
  onClose: () => void;
  onAttached?: () => void;
};

const kindLabel = (kind: StreamHardwareKind | null): string => (kind ? streamHardwareKindLabels[kind] : "Устройство");

export function ConnectDeviceDialog({ open, title, brewBatchId, devices, cancelLabel = "Отмена", onClose, onAttached }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  // Ретро-привязка включена по умолчанию (§5): частый случай — устройство уже
  // писало показания до перевода партии в «Брожение»/до нажатия «Подключить».
  const [retroAttach, setRetroAttach] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDeviceId(devices[0]?.id ?? "");
      setRetroAttach(true);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!deviceId || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await createFermentSessionAction({ deviceId, brewBatchId, retroAttach });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      show({ title: `«${result.session.deviceName}» подключён к партии`, tone: "success" });
      router.refresh();
      if (onAttached) {
        onAttached();
      } else {
        onClose();
      }
    } finally {
      setPending(false);
    }
  };

  if (devices.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()} title={title} size="sm">
      <div className="space-y-3 p-5">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Устройство
          <Select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} · {kindLabel(device.hardwareKind)}
              </option>
            ))}
          </Select>
        </label>

        {deviceId ? <RetroAttachField deviceId={deviceId} checked={retroAttach} onCheckedChange={setRetroAttach} /> : null}

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={pending || !deviceId}>
          {pending ? "Привязываем…" : "Привязать"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
