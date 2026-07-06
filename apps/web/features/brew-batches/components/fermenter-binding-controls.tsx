"use client";

// =============================================================================
//  features/brew-batches/components/fermenter-binding-controls.tsx
//  Интерактивная часть блока «Бродит в приборе» (§8.4): инлайн-пикер привязки
//  (сущностей мало — модалку не городим, см. FermenterCandidate) и кнопка
//  отвязки с подтверждением (ConfirmActionDialog, деструктив по конвенции UI).
// =============================================================================
import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@nb/ui";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { bindBatchFermenterAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import type { FermenterCandidate } from "@/features/devices/contracts";

/** Пикер «Бродит в приборе…» — выбор из приборов, чей last-known режим сейчас ферментация. */
export function FermenterPicker({
  brewBatchId,
  candidates
}: {
  brewBatchId: string;
  candidates: FermenterCandidate[];
}) {
  const [deviceId, setDeviceId] = useState(candidates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const onBind = async () => {
    if (inFlight.current || !deviceId) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await bindBatchFermenterAction(brewBatchId, deviceId);
      if (!result.ok) {
        setError(result.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">
        Бродит в приборе…
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" variant="outline" size="sm" disabled={busy || !deviceId} onClick={() => void onBind()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Привязать
      </Button>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Кнопка отвязки прибора-ферментера от партии — с подтверждением (§8.4: не молча). */
export function FermenterUnbindButton({ brewBatchId }: { brewBatchId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const onConfirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await bindBatchFermenterAction(brewBatchId, null);
      if (!result.ok) {
        setError(result.message);
      } else {
        setOpen(false);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Отвязать
      </Button>
      <ConfirmActionDialog
        open={open}
        title="Отвязать прибор?"
        description="Партия перестанет получать температуру с прибора. Уже собранная история останется у партии."
        confirmLabel="Отвязать"
        tone="danger"
        pending={busy}
        error={error}
        onConfirm={() => void onConfirm()}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setError(null);
          }
        }}
      />
    </>
  );
}
