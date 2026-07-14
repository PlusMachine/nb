"use client";

// =============================================================================
//  features/device-streams/components/batch-ferment-controls.tsx
//  Интерактивная часть блока «Брожение» на странице партии (§5 F2): строка на
//  активный сеанс с «Завершить сеанс» (без ConfirmActionDialog — действие не
//  деструктивно, данные не удаляются, устройство просто освобождается) и строка
//  «Подключить ареометр» (вход №2), открывающая ConnectDeviceDialog с выбором
//  из свободных устройств (уже отфильтрованы сервером — listAvailableStreamDevices).
// =============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radio } from "lucide-react";

import { Button, useToast } from "@nb/ui";

import { endFermentSessionAction } from "@/features/device-streams/actions";
import { streamHardwareKindLabels, type AvailableStreamDeviceDto, type StreamHardwareKind } from "@/features/device-streams/contracts";
import { formatSessionSince } from "@/features/device-streams/session-format";
import { pluralize } from "@/lib/pluralize";

import { ConnectDeviceDialog } from "./connect-device-dialog";
import { SessionBoundsControl } from "./session-bounds-control";
import { SessionTempCorridorControl } from "./session-temp-corridor-control";

export type ActiveFermentSessionView = {
  id: string;
  deviceName: string;
  deviceHardwareKind: StreamHardwareKind | null;
  startedAt: number;
  readingsCount: number;
  /** §5 F6 (M5-A) — коридор алертов и тумблер «Уведомления». */
  tempMinC: number | null;
  tempMaxC: number | null;
  alertsMuted: boolean;
};

export function ActiveSessionRow({ session }: { session: ActiveFermentSessionView }) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, setPending] = useState(false);

  const finish = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await endFermentSessionAction(session.id, "manual");
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      show({ title: `Сеанс «${session.deviceName}» завершён`, tone: "success" });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const kindLabel = session.deviceHardwareKind ? streamHardwareKindLabels[session.deviceHardwareKind] : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
        <Radio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate font-medium">{session.deviceName}</span>
        {kindLabel ? <span className="shrink-0 text-muted-foreground">· {kindLabel}</span> : null}
        <span className="shrink-0 text-muted-foreground">
          · {formatSessionSince(new Date(session.startedAt))} · {session.readingsCount}{" "}
          {pluralize(session.readingsCount, ["точка", "точки", "точек"])}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <SessionTempCorridorControl
          sessionId={session.id}
          tempMinC={session.tempMinC}
          tempMaxC={session.tempMaxC}
          alertsMuted={session.alertsMuted}
        />
        <SessionBoundsControl sessionId={session.id} startedAt={session.startedAt} endedAt={null} />
        <Button type="button" variant="outline" size="sm" onClick={() => void finish()} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Завершить сеанс
        </Button>
      </span>
    </div>
  );
}

export function AttachDeviceControl({ brewBatchId, devices }: { brewBatchId: string; devices: AvailableStreamDeviceDto[] }) {
  const [open, setOpen] = useState(false);

  if (devices.length === 0) {
    return null;
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Подключить ареометр
      </Button>
      <ConnectDeviceDialog
        open={open}
        title="Подключить ареометр"
        brewBatchId={brewBatchId}
        devices={devices}
        onClose={() => setOpen(false)}
        onAttached={() => setOpen(false)}
      />
    </>
  );
}
