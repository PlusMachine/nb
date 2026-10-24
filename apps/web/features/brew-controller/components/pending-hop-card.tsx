"use client";

import type { Telemetry } from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";
import { pendingHop } from "../pending-hop";

export function PendingHopCard({ telemetry, disabled, onAck }: {
  telemetry: Telemetry | null;
  disabled: boolean;
  onAck: (index: number) => void;
}) {
  const hop = pendingHop(telemetry);
  if (!hop) {
    if (!telemetry?.nextHopAlert) return null;
    return <div role="status" className="rounded-2xl border border-warning/40 bg-warning-subtle p-4">
      Пора внести хмель. Уточните название и навеску на экране устройства.
    </div>;
  }
  return <section aria-label="Внесение хмеля" className="rounded-2xl border-2 border-warning/40 bg-warning-subtle p-5">
    <p className="text-sm font-semibold">Внесите хмель</p>
    <p className="mt-1 text-xl font-semibold">{hop.name || "Хмель"} — {hop.amountG} г</p>
    {hop.count > 1 ? <p className="mt-1 text-sm">Ожидают подтверждения: {hop.count}</p> : null}
    <Button className="mt-3 min-h-12" disabled={disabled} onClick={() => onAck(hop.index)}>Внесено</Button>
  </section>;
}
