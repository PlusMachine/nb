"use client";

// =============================================================================
//  features/device-streams/components/device-ferment-panel.tsx
//  Блок «Брожение» на карточке устройства (§5 F3, вход №3 F2): график всех
//  сеансов устройства (без ручных замеров партии — их тут не может быть больше
//  одной партии сразу), состояние привязки («В партии: …» + «Завершить сеанс»
//  ИЛИ «Привязать к партии») и история сеансов списком. Данные (chartSessions/
//  history) уже собраны сервером (stream-device-view.tsx: readDeviceFermentSeries
//  + listSessionsForDevice + имена партий), здесь — только интерактив.
// =============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button, Card, useToast } from "@nb/ui";
import type { PreferredGravityUnit } from "@nb/auth";

import { endFermentSessionAction } from "@/features/device-streams/actions";
import { formatSessionPeriod } from "@/features/device-streams/session-format";
import { pluralize } from "@/lib/pluralize";

import { ConnectBatchDialog } from "./connect-batch-dialog";
import { FermentChart, type FermentChartSession } from "./ferment-chart";

export type DeviceSessionHistoryItem = {
  id: string;
  brewBatchId: string;
  brewBatchName: string;
  startedAt: number;
  endedAt: number | null;
  readingsCount: number;
};

type Props = {
  deviceId: string;
  gravityUnit: PreferredGravityUnit;
  chartSessions: FermentChartSession[];
  history: DeviceSessionHistoryItem[];
};

export function DeviceFermentPanel({ deviceId, gravityUnit, chartSessions, history }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [finishPending, setFinishPending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const activeSession = history.find((session) => session.endedAt === null) ?? null;
  const hasChartData = chartSessions.some((session) => session.points.length > 0);

  const finishActive = async () => {
    if (!activeSession || finishPending) return;
    setFinishPending(true);
    try {
      const result = await endFermentSessionAction(activeSession.id, "manual");
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      show({ title: "Сеанс завершён", tone: "success" });
      router.refresh();
    } finally {
      setFinishPending(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-semibold text-foreground">Брожение</h2>

      {hasChartData ? (
        <FermentChart sessions={chartSessions} manualMeasurements={[]} gravityUnit={gravityUnit} defaultRange="all" />
      ) : (
        <p className="text-sm text-muted-foreground">Пока нет сеансов.</p>
      )}

      {activeSession ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="text-foreground">
            В партии:{" "}
            <Link
              href={`/app/brew-batches/${activeSession.brewBatchId}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {activeSession.brewBatchName}
            </Link>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => void finishActive()} disabled={finishPending}>
            {finishPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Завершить сеанс
          </Button>
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAttachOpen(true)}>
            Привязать к партии
          </Button>
          <ConnectBatchDialog open={attachOpen} deviceId={deviceId} onClose={() => setAttachOpen(false)} onAttached={() => setAttachOpen(false)} />
        </div>
      )}

      {history.length > 0 ? (
        <ul className="divide-y divide-border text-sm">
          {history.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <Link
                href={`/app/brew-batches/${session.brewBatchId}`}
                className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline"
              >
                {session.brewBatchName}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatSessionPeriod(new Date(session.startedAt), session.endedAt !== null ? new Date(session.endedAt) : null)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {session.readingsCount} {pluralize(session.readingsCount, ["точка", "точки", "точек"])}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
